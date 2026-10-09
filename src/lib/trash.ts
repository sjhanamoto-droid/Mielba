import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { restoreBlobPaths } from "@/lib/media";

// ごみ箱（現場・日報・顧客の削除を30日間戻せるようにする）。
// 削除の直前に「その行と、一緒に消える子の行（onDelete: Cascade で消えるもの）」を丸ごと JSON に保存し、
// 戻すときは同じ ID で入れ直す。既存の検索（現場・日報を読む多数の画面）には手を入れずに済む。
// 子テーブルは Prisma のスキーマ情報（DMMF）からたどるので、テーブルを足しても自動で追従する。

export type TrashKind = "SITE" | "REPORT" | "CUSTOMER";
export const TRASH_KIND_LABEL: Record<TrashKind, string> = {
  SITE: "現場",
  REPORT: "日報",
  CUSTOMER: "顧客",
};
/** ごみ箱に置く期間（日） */
export const TRASH_KEEP_DAYS = 30;

type Row = Record<string, unknown>;
type Tx = Prisma.TransactionClient;

export type TrashSnapshot = {
  version: 1;
  /** 親→子の順に並んだ行（復元はこの順に入れ直す） */
  tables: { model: string; rows: Row[] }[];
  /** 顧客の削除で「その他」へ移した現場（戻すときに元の顧客へ戻す） */
  movedSiteIds?: string[];
};

const MODELS = Prisma.dmmf.datamodel.models;
const modelByName = new Map(MODELS.map((m) => [m.name, m]));

function delegate(client: Tx | typeof db, model: string) {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (client as unknown as Record<string, {
    findMany: (args: unknown) => Promise<Row[]>;
    createMany: (args: unknown) => Promise<unknown>;
  }>)[key];
}

/** model を親に持ち、親が消えると一緒に消える（Cascade）子の関係 */
function cascadeChildren(model: string): { child: string; fk: string }[] {
  const out: { child: string; fk: string }[] = [];
  for (const m of MODELS) {
    for (const f of m.fields) {
      if (
        f.kind === "object" &&
        f.type === model &&
        f.relationOnDelete === "Cascade" &&
        f.relationFromFields?.length === 1
      ) {
        out.push({ child: m.name, fk: f.relationFromFields[0] });
      }
    }
  }
  return out;
}

/** 依存の順（参照される側が先）。collected に含まれる model だけを並べる */
function topoOrder(collected: string[]): string[] {
  const set = new Set(collected);
  const deps = new Map<string, Set<string>>();
  for (const name of collected) {
    const m = modelByName.get(name)!;
    const d = new Set<string>();
    for (const f of m.fields) {
      if (f.kind === "object" && f.relationFromFields?.length && set.has(f.type) && f.type !== name) {
        d.add(f.type);
      }
    }
    deps.set(name, d);
  }
  const order: string[] = [];
  const done = new Set<string>();
  const visit = (n: string, stack: Set<string>) => {
    if (done.has(n) || stack.has(n)) return;
    stack.add(n);
    for (const d of deps.get(n) ?? []) visit(d, stack);
    stack.delete(n);
    done.add(n);
    order.push(n);
  };
  for (const n of collected) visit(n, new Set());
  return order;
}

/**
 * root の行と、Cascade で一緒に消える子孫の行を集める。
 * exclude に入れた model はたどらない（顧客の削除で現場を移すときなど）。
 */
export async function snapshotGraph(
  tx: Tx,
  rootModel: string,
  rootId: string,
  exclude: string[] = [],
): Promise<TrashSnapshot> {
  const skip = new Set(exclude);
  const rows = new Map<string, Map<string, Row>>();
  const add = (model: string, list: Row[]) => {
    const map = rows.get(model) ?? new Map<string, Row>();
    const fresh: Row[] = [];
    for (const r of list) {
      const id = r.id as string;
      if (!map.has(id)) {
        map.set(id, r);
        fresh.push(r);
      }
    }
    rows.set(model, map);
    return fresh;
  };

  const root = await delegate(tx, rootModel).findMany({ where: { id: rootId } });
  let frontier: { model: string; rows: Row[] }[] = [{ model: rootModel, rows: add(rootModel, root) }];
  while (frontier.length > 0) {
    const next: { model: string; rows: Row[] }[] = [];
    for (const { model, rows: parents } of frontier) {
      if (parents.length === 0) continue;
      const ids = parents.map((r) => r.id as string);
      for (const { child, fk } of cascadeChildren(model)) {
        if (skip.has(child)) continue;
        const found = await delegate(tx, child).findMany({ where: { [fk]: { in: ids } } });
        const fresh = add(child, found);
        if (fresh.length > 0) next.push({ model: child, rows: fresh });
      }
    }
    frontier = next;
  }

  const order = topoOrder([...rows.keys()]);
  return {
    version: 1,
    tables: order.map((model) => ({ model, rows: [...rows.get(model)!.values()] })),
  };
}

/** 削除の直前に呼ぶ：スナップショットをごみ箱に入れる */
export async function putInTrash(
  tx: Tx,
  input: { kind: TrashKind; label: string; snapshot: TrashSnapshot; deletedById: string },
): Promise<void> {
  await tx.trashItem.create({
    data: {
      kind: input.kind,
      label: input.label,
      snapshot: JSON.stringify(input.snapshot),
      deletedById: input.deletedById,
    },
  });
}

/** JSON から戻した値を、スキーマの型（日時）に合わせて直す */
function revive(model: string, row: Row): Row {
  const m = modelByName.get(model);
  if (!m) return row;
  const out: Row = { ...row };
  for (const f of m.fields) {
    if (f.kind === "scalar" && f.type === "DateTime" && typeof out[f.name] === "string") {
      out[f.name] = new Date(out[f.name] as string);
    }
  }
  return out;
}

/**
 * ごみ箱から戻す。同じ ID で入れ直し、写真・動画の本体も Blob のごみ箱から戻す。
 * 同じ現場・人・日の日報を作り直していた等で入れ直せないときはエラーを返す（何も変わらない）。
 */
export async function restoreTrashItem(
  trashId: string,
): Promise<{ ok: true; kind: TrashKind } | { error: string }> {
  const item = await db.trashItem.findUnique({ where: { id: trashId } });
  if (!item) return { error: "ごみ箱に見つかりません" };
  if (item.restoredAt) return { error: "すでに元に戻しています" };
  const snap = JSON.parse(item.snapshot) as TrashSnapshot;

  try {
    await db.$transaction(
      async (tx) => {
        for (const t of snap.tables) {
          if (t.rows.length === 0) continue;
          await delegate(tx, t.model).createMany({ data: t.rows.map((r) => revive(t.model, r)) });
        }
        // 顧客を戻すときは、「その他」へ移していた現場を元の顧客に戻す
        if (item.kind === "CUSTOMER" && snap.movedSiteIds?.length) {
          const customerId = snap.tables.find((t) => t.model === "Customer")?.rows[0]?.id as string;
          await tx.site.updateMany({
            where: { id: { in: snap.movedSiteIds } },
            data: { customerId },
          });
        }
        await tx.trashItem.update({ where: { id: trashId }, data: { restoredAt: new Date() } });
      },
      { timeout: 60_000 },
    );
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === "P2002") {
      return { error: "同じ内容のデータ（例：同じ現場・同じ人・同じ日の日報）が既にあるため戻せません。先にそちらを削除してください。" };
    }
    if (code === "P2003") {
      return { error: "関係するデータ（担当者や別の現場など）が既に無いため戻せません。" };
    }
    console.error("[trash] 復元エラー:", e);
    return { error: "元に戻せませんでした。時間をおいて再度お試しください。" };
  }

  // 写真・動画の本体を Blob のごみ箱から戻す（DB を戻した後。失敗しても DB の復元は有効）
  const blobPaths = snap.tables
    .filter((t) => t.model === "Photo")
    .flatMap((t) => t.rows.map((r) => r.blobPath as string | null))
    .filter((p): p is string => !!p);
  if (blobPaths.length > 0) {
    try {
      await restoreBlobPaths(blobPaths);
    } catch (e) {
      console.error("[trash] 写真・動画の復元エラー:", e);
    }
  }
  return { ok: true, kind: item.kind as TrashKind };
}

/** スナップショット内の写真・動画の本体パス（削除時に Blob もごみ箱へ移すため） */
export function snapshotBlobPaths(snap: TrashSnapshot): string[] {
  return snap.tables
    .filter((t) => t.model === "Photo")
    .flatMap((t) => t.rows.map((r) => r.blobPath as string | null))
    .filter((p): p is string => !!p);
}
