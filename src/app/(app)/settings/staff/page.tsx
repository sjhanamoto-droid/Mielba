import Link from "next/link";
import { Pencil, UserPlus, FileText, Mail } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { StaffRowActions } from "@/features/users/staff-actions";
import { ROLE_LABEL, type Role } from "@/lib/constants";

export default async function StaffListPage() {
  const me = await requireAdmin();

  const users = await db.user.findMany({
    include: { _count: { select: { reports: true } } },
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="スタッフ管理"
        subtitle="ユーザーの追加・編集・権限設定"
        backHref="/settings"
        right={
          <LinkButton href="/settings/staff/new" size="sm">
            <UserPlus className="h-4 w-4" />追加
          </LinkButton>
        }
      />
      <PageContainer>
        <div className="space-y-2.5">
          {users.map((u) => {
            const isSelf = u.id === me.id;
            const canDelete = u._count.reports === 0 && !isSelf;
            return (
              <div
                key={u.id}
                className={`card flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap ${!u.active ? "opacity-60" : ""}`}
              >
                <Avatar name={u.name} color={u.avatarColor} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[15px] font-bold text-ink">{u.name}</span>
                    <Badge tone={u.role === "ADMIN" ? "brand" : "neutral"}>
                      {ROLE_LABEL[u.role as Role]}
                    </Badge>
                    {isSelf && <Badge tone="info">あなた</Badge>}
                    {!u.active && <Badge tone="danger">無効</Badge>}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-muted">
                    <Mail className="h-3 w-3 shrink-0" />{u.email}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-faint">
                    {u.department && <span>{u.department}</span>}
                    <span className="flex items-center gap-0.5">
                      <FileText className="h-3 w-3" />日報 {u._count.reports} 件
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/settings/staff/${u.id}/edit`}
                    aria-label="編集"
                    className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-brand-600 hover:bg-brand-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />編集
                  </Link>
                  <StaffRowActions id={u.id} active={u.active} canDelete={canDelete} />
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 px-1 text-xs text-ink-faint">
          ※ 日報などの記録があるスタッフは「無効化」で対応します（記録は保持されログインのみ不可になります）。記録が無いスタッフのみ完全削除できます。
        </p>
      </PageContainer>
    </div>
  );
}
