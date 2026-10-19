import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, IdCard } from "lucide-react";
import { requireAdmin, isSuperAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { UserForm } from "@/features/users/user-form";

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireAdmin();
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, department: true, avatarColor: true, avatarImage: true },
  });
  if (!user) notFound();

  // 給与・人件費は財務情報＝最高管理者のみ（スタッフページで管理する）
  const superAdmin = isSuperAdmin(me);

  return (
    <div>
      <PageHeader title="スタッフを編集" subtitle={user.name} backHref="/settings/staff" />
      <PageContainer size="narrow">
        <SectionTitle className="mb-2.5">スタッフ情報</SectionTitle>
        <Card className="p-4 sm:p-5">
          <UserForm user={user} canAssignSuperAdmin={superAdmin} />
        </Card>

        {superAdmin && (
          <Link
            href={`/staff/${user.id}?tab=pay`}
            className="card mt-4 flex items-center gap-3 px-4 py-3.5 tap-row"
          >
            <IdCard className="h-5 w-5 shrink-0 text-brand-600" />
            <span className="flex-1 text-sm font-bold text-ink">給与・人件費はスタッフページで管理します</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
          </Link>
        )}
      </PageContainer>
    </div>
  );
}
