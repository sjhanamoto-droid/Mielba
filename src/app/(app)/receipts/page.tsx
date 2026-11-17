import Link from "next/link";
import { AlertTriangle, ChevronRight, FileText, ReceiptText } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { ChipBar, ChipLink } from "@/components/ui/chips";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { jstDateKey, jstDateTimeLabel } from "@/lib/date";
import {
  accountLabel,
  monthLabel,
  receiptView,
  RECEIPT_VIEW_LABEL,
  shortDateLabel,
  yen,
  type ReceiptView,
} from "@/lib/receipts";
import { ReceiptUploader } from "@/features/receipts/receipt-uploader";
import { ExportButton, ExportHistory, type ExportRow } from "@/features/receipts/export-panel";

// 領収書読み取り（管理者以上）：領収書を読み取り、確認して、MF会計の仕訳インポート用CSVに出す。
// 一覧は「領収書に書かれた日付」の月ごと。どこまで出力したかを一目で分かるようにする。

type Filter = "all" | "todo" | "ready" | "exported";
const FILTER_LABEL: Record<Filter, string> = {
  all: "すべて",
  todo: "要確認",
  ready: "確認済み・未出力",
  exported: "出力済み",
};
const VIEW_TONE: Record<ReceiptView, "info" | "danger" | "warn" | "active" | "past"> = {
  reading: "info",
  failed: "danger",
  review: "warn",
  ready: "active",
  exported: "past",
};

function matches(view: ReceiptView, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "todo") return view === "review" || view === "failed" || view === "reading";
  return view === f;
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; f?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const now = Date.now();

  // 件数や月の一覧のために、全件の軽い情報だけ先に読む（週50枚程度なので数年分でも軽い）
  const [all, exports] = await Promise.all([
    db.receipt.findMany({
      select: {
        id: true,
        status: true,
        receiptDate: true,
        totalAmount: true,
        exportId: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
    db.receiptExport.findMany({
      orderBy: { seq: "desc" },
      take: 12,
      select: { id: true, seq: true, count: true, totalAmount: true, createdAt: true, createdById: true },
    }),
  ]);

  const views = new Map(all.map((r) => [r.id, receiptView(r, now)]));
  const ready = all.filter((r) => views.get(r.id) === "ready" && r.receiptDate);
  const readyTotal = ready.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
  const todoList = all.filter((r) => matches(views.get(r.id)!, "todo"));
  const todoCount = todoList.length;
  // 「順番に確認する」の最初の1件（確認画面の前へ／次へと同じ並び：日付順・日付なしは最後）
  const firstTodoId =
    todoList
      .slice()
      .sort((a, b) => {
        if (a.receiptDate !== b.receiptDate) {
          if (!a.receiptDate) return 1;
          if (!b.receiptDate) return -1;
          return a.receiptDate < b.receiptDate ? -1 : 1;
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      })[0]?.id ?? null;
  const lastExport = exports[0] ?? null;
  // 出力済みの中で一番新しい日付。これより前の日付の未出力は「遅れて出てきた」もの
  const exportedMaxDate = all
    .filter((r) => r.exportId && r.receiptDate)
    .reduce<string | null>((m, r) => (m && m > r.receiptDate! ? m : r.receiptDate), null);

  // 月ごとの集計（領収書の日付で）
  type MonthStat = { count: number; total: number; pending: number };
  const months = new Map<string, MonthStat>();
  let undated = 0;
  for (const r of all) {
    if (!r.receiptDate) {
      undated++;
      continue;
    }
    const ym = r.receiptDate.slice(0, 7);
    const s = months.get(ym) ?? { count: 0, total: 0, pending: 0 };
    s.count++;
    s.total += r.totalAmount ?? 0;
    if (views.get(r.id) !== "exported") s.pending++;
    months.set(ym, s);
  }
  const monthKeys = [...months.keys()].sort().reverse();
  const thisMonth = jstDateKey().slice(0, 7);

  const filter: Filter = (["all", "todo", "ready", "exported"] as const).includes(sp.f as Filter)
    ? (sp.f as Filter)
    : "all";
  let month = sp.m ?? "";
  if (month !== "all" && month !== "none" && !months.has(month)) {
    month = months.has(thisMonth) ? thisMonth : (monthKeys[0] ?? (undated > 0 ? "none" : thisMonth));
  }

  const href = (m: string, f: Filter) => {
    const q = new URLSearchParams();
    q.set("m", m);
    if (f !== "all") q.set("f", f);
    return `/receipts?${q.toString()}`;
  };

  const ids = all
    .filter((r) =>
      month === "all" ? true : month === "none" ? !r.receiptDate : r.receiptDate?.startsWith(month),
    )
    .filter((r) => matches(views.get(r.id)!, filter))
    .map((r) => r.id);

  const rows = ids.length
    ? await db.receipt.findMany({
        where: { id: { in: ids } },
        orderBy: [{ receiptDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          status: true,
          receiptDate: true,
          vendor: true,
          totalAmount: true,
          description: true,
          mimeType: true,
          thumbUrl: true,
          exportId: true,
          updatedAt: true,
          ocrError: true,
          export: { select: { seq: true } },
          lines: { orderBy: { sortOrder: "asc" }, select: { account: true, subAccount: true, amount: true } },
        },
      })
    : [];

  // 重複の疑い：同じ日付・同じ金額の領収書が別にある
  const sameKey = new Map<string, number>();
  for (const r of all) {
    if (r.receiptDate && r.totalAmount != null) {
      const k = `${r.receiptDate}|${r.totalAmount}`;
      sameKey.set(k, (sameKey.get(k) ?? 0) + 1);
    }
  }

  const userIds = Array.from(new Set(exports.map((e) => e.createdById).filter((v): v is string => !!v)));
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const exportRows: ExportRow[] = exports.map((e) => ({
    id: e.id,
    seq: e.seq,
    count: e.count,
    totalAmount: e.totalAmount,
    createdAtLabel: jstDateTimeLabel(e.createdAt),
    createdByName: e.createdById ? (nameOf.get(e.createdById) ?? null) : null,
  }));

  const listTotal = rows.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
  const listTitle =
    month === "all" ? "すべての月" : month === "none" ? "日付が読めなかったもの" : monthLabel(month);

  return (
    <div>
      <PageHeader title="領収書読み取り" subtitle="領収書を読み取って、マネーフォワード用のCSVに出力" />
      <PageContainer className="space-y-5">
        <ReceiptUploader />

        {/* どこまで出力したか */}
        <section className="card p-4 md:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="space-y-1.5">
              <p className="text-sm text-ink-soft">
                {lastExport ? (
                  <>
                    前回の出力：<b className="text-ink">第{lastExport.seq}回</b>
                    <span className="tnum">（{jstDateTimeLabel(lastExport.createdAt)}・{lastExport.count}件・{yen(lastExport.totalAmount)}）</span>
                  </>
                ) : (
                  "まだ一度も出力していません"
                )}
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <Link href={href("all", "ready")} className="text-lg font-bold text-ink hover:underline">
                  未出力 <span className="tnum text-brand-700">{ready.length}件</span>
                  <span className="ml-1 text-sm font-semibold text-ink-soft tnum">{yen(readyTotal)}</span>
                </Link>
                <Link
                  href={href("all", "todo")}
                  className={cn("text-lg font-bold hover:underline", todoCount > 0 ? "text-amber-700" : "text-ink-muted")}
                >
                  要確認 <span className="tnum">{todoCount}件</span>
                </Link>
              </div>
              {todoCount > 0 && firstTodoId && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Link href={`/receipts/${firstTodoId}`} className={buttonClass({ variant: "accent", size: "sm" })}>
                    要確認を順番に確認する（{todoCount}件）
                  </Link>
                  <span className="text-xs text-ink-muted">前へ／次へで1枚ずつ確認できます</span>
                </div>
              )}
            </div>
            <ExportButton count={ready.length} total={readyTotal} nextSeq={(lastExport?.seq ?? 0) + 1} />
          </div>
        </section>

        {/* 月ごとの一覧（領収書の日付で） */}
        <section>
          <ChipBar>
            {undated > 0 && (
              <ChipLink href={href("none", filter)} active={month === "none"}>
                日付不明 {undated}
              </ChipLink>
            )}
            {monthKeys.map((ym) => {
              const s = months.get(ym)!;
              return (
                <ChipLink key={ym} href={href(ym, filter)} active={month === ym}>
                  {monthLabel(ym)}
                  {s.pending > 0 && (
                    <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-white tnum">{s.pending}</span>
                  )}
                </ChipLink>
              );
            })}
            <ChipLink href={href("all", filter)} active={month === "all"}>
              すべての月
            </ChipLink>
          </ChipBar>
          <div className="mt-2">
            <ChipBar>
              {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
                <ChipLink key={f} href={href(month, f)} active={filter === f}>
                  {FILTER_LABEL[f]}
                </ChipLink>
              ))}
            </ChipBar>
          </div>

          <div className="mt-4 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-ink">{listTitle}</h2>
            <p className="text-sm text-ink-muted tnum">
              {rows.length}件・{yen(listTotal)}
            </p>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              className="mt-3"
              icon={<ReceiptText className="h-6 w-6" />}
              title="該当する領収書はありません"
              description="上から写真を入れると、自動で読み取ってここに並びます。"
            />
          ) : (
            <ul className="card mt-3 divide-y divide-line overflow-hidden">
              {rows.map((r) => {
                const view = views.get(r.id)!;
                const sum = r.lines.reduce((s, l) => s + l.amount, 0);
                const warnings: string[] = [];
                if (view === "review" || view === "ready") {
                  if (!r.receiptDate) warnings.push("日付なし");
                  if (r.totalAmount != null && r.lines.length > 0 && sum !== r.totalAmount) warnings.push("合計が合わない");
                }
                if (r.receiptDate && r.totalAmount != null && (sameKey.get(`${r.receiptDate}|${r.totalAmount}`) ?? 0) > 1) {
                  warnings.push("同じ日・同じ金額あり");
                }
                if (view !== "exported" && r.receiptDate && exportedMaxDate && r.receiptDate <= exportedMaxDate) {
                  warnings.push("出力済みの期間の日付");
                }
                const accounts = Array.from(new Set(r.lines.map((l) => accountLabel(l.account, l.subAccount)))).join("、");
                return (
                  <li key={r.id}>
                    <Link href={`/receipts/${r.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-surface-subtle md:px-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-sunken">
                        {r.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/receipts/${r.id}?v=thumb`} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <FileText className="h-6 w-6 text-ink-muted" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-semibold text-ink-soft tnum">
                            {r.receiptDate ? shortDateLabel(r.receiptDate) : "日付不明"}
                          </span>
                          <Badge tone={VIEW_TONE[view]}>
                            {view === "exported" && r.export ? `出力済み 第${r.export.seq}回` : RECEIPT_VIEW_LABEL[view]}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate font-bold text-ink">
                          {r.vendor ?? (view === "reading" ? "読み取り中…" : "店名なし")}
                        </p>
                        <p className="truncate text-xs text-ink-muted">
                          {[accounts, r.description].filter(Boolean).join("　")}
                        </p>
                        {warnings.length > 0 && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" /> {warnings.join("・")}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold text-ink tnum">{r.totalAmount != null ? yen(r.totalAmount) : "—"}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-4 md:p-5">
          <h2 className="mb-1 text-base font-bold text-ink">出力の履歴</h2>
          <p className="mb-2 text-xs text-ink-muted">
            CSVはマネーフォワードの「仕訳帳 → インポート」から取り込めます。各回のタグ「領収書読取 第N回」がMF側に付きます。
          </p>
          <ExportHistory rows={exportRows} />
        </section>
      </PageContainer>
    </div>
  );
}
