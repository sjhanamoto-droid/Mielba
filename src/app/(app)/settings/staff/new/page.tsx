import { requireAdmin } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card } from "@/components/ui/card";
import { UserForm } from "@/features/users/user-form";

export default async function NewStaffPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="スタッフを追加" backHref="/settings/staff" />
      <PageContainer size="narrow">
        <Card className="p-4 sm:p-5">
          <UserForm />
        </Card>
      </PageContainer>
    </div>
  );
}
