import { requireAdmin } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CustomerForm } from "@/features/customers/customer-form";

export default async function NewCustomerPage() {
  await requireAdmin();

  return (
    <div>
      <PageHeader title="顧客を登録" backHref="/customers" />
      <PageContainer size="narrow">
        <CustomerForm />
      </PageContainer>
    </div>
  );
}
