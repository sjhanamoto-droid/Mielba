import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card } from "@/components/ui/card";
import { UserForm } from "@/features/users/user-form";

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, department: true, avatarColor: true },
  });
  if (!user) notFound();

  return (
    <div>
      <PageHeader title="スタッフを編集" subtitle={user.name} backHref="/settings/staff" />
      <PageContainer size="narrow">
        <Card className="p-4 sm:p-5">
          <UserForm user={user} />
        </Card>
      </PageContainer>
    </div>
  );
}
