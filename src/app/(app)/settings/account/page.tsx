import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { AccountForm, PasswordForm } from "@/features/settings/account-form";

export default async function AccountSettingsPage() {
  const me = await requireUser();
  const user = await db.user.findUnique({
    where: { id: me.id },
    select: { name: true, email: true, department: true, avatarColor: true },
  });
  if (!user) notFound();

  return (
    <div>
      <PageHeader title="アカウント設定" backHref="/settings" />
      <PageContainer size="narrow">
        <div className="space-y-6">
          <section className="space-y-2.5">
            <SectionTitle>プロフィール</SectionTitle>
            <Card className="p-4 sm:p-5">
              <AccountForm user={user} />
            </Card>
          </section>
          <section className="space-y-2.5">
            <SectionTitle>パスワード変更</SectionTitle>
            <Card className="p-4 sm:p-5">
              <PasswordForm />
            </Card>
          </section>
        </div>
      </PageContainer>
    </div>
  );
}
