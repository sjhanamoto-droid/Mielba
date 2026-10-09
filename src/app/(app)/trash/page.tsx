import { Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { EmptyState } from "@/components/ui/misc";
import { RestoreButton } from "@/features/trash/restore-button";
import { TRASH_KEEP_DAYS, TRASH_KIND_LABEL, type TrashKind } from "@/lib/trash";
import { jstDateTimeLabel } from "@/lib/date";

// ごみ箱（管理者以上）：削除した現場・日報・顧客を30日間戻せる。
export default async function TrashPage() {
  await requireAdmin();
  const since = new Date(Date.now() - TRASH_KEEP_DAYS * 86_400_000);
  const items = await db.trashItem.findMany({
    where: { restoredAt: null, deletedAt: { gte: since } },
    orderBy: { deletedAt: "desc" },
    // 本体（snapshot）は大きいので一覧では読まない
    select: { id: true, kind: true, label: true, deletedById: true, deletedAt: true },
  });
  const userIds = Array.from(new Set(items.map((i) => i.deletedById).filter((v): v is string => !!v)));
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  return (
    <div>
      <PageHeader title="ごみ箱" subtitle={`削除してから${TRASH_KEEP_DAYS}日間は元に戻せます`} />
      <PageContainer size="narrow">
        {items.length === 0 ? (
          <EmptyState icon={<Trash2 className="h-6 w-6" />} title="ごみ箱は空です" />
        ) : (
          <ul className="space-y-3">
            {items.map((i) => {
              const kindLabel = TRASH_KIND_LABEL[i.kind as TrashKind] ?? i.kind;
              const daysLeft = Math.max(
                0,
                TRASH_KEEP_DAYS - Math.floor((Date.now() - i.deletedAt.getTime()) / 86_400_000),
              );
              return (
                <li key={i.id} className="card flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-ink-muted">{kindLabel}</p>
                    <p className="mt-0.5 break-words text-base font-bold text-ink">{i.label}</p>
                    <p className="mt-1 text-xs text-ink-muted tnum">
                      {jstDateTimeLabel(i.deletedAt)} に{i.deletedById ? `${nameOf.get(i.deletedById) ?? "（退職者）"}が` : ""}削除
                      ・あと{daysLeft}日
                    </p>
                  </div>
                  <RestoreButton trashId={i.id} label={i.label} kindLabel={kindLabel} />
                </li>
              );
            })}
          </ul>
        )}
      </PageContainer>
    </div>
  );
}
