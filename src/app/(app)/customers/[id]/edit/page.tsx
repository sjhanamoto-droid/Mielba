import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CustomerForm } from "@/features/customers/customer-form";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const customer = await db.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  return (
    <div>
      <PageHeader title="顧客を編集" subtitle={customer.name} backHref={`/customers/${id}`} />
      <PageContainer size="narrow">
        <CustomerForm customer={customer} />
      </PageContainer>
    </div>
  );
}
