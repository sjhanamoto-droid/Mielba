import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CustomerForm } from "@/features/customers/customer-form";
import { DeleteCustomerButton } from "@/features/customers/delete-customer-button";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const customer = await db.customer.findUnique({
    where: { id },
    include: { _count: { select: { sites: true } } },
  });
  if (!customer) notFound();

  return (
    <div>
      <PageHeader title="顧客を編集" subtitle={customer.name} backHref={`/customers/${id}`} />
      <PageContainer size="narrow">
        <div className="space-y-6">
          <CustomerForm customer={customer} />
          {/* 「その他」は現場の受け皿なので削除ボタンを出さない */}
          {customer.name !== "その他" && (
            <DeleteCustomerButton
              customerId={customer.id}
              customerName={customer.name}
              siteCount={customer._count.sites}
            />
          )}
        </div>
      </PageContainer>
    </div>
  );
}
