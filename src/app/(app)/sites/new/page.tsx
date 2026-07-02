import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import { SiteForm } from "@/features/sites/site-form";

export default async function NewSitePage() {
  await requireAdmin();
  const customers = await db.customer.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <PageHeader title="現場を作成" backHref="/sites" />
      <PageContainer size="narrow">
        {customers.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title="先に顧客（元請企業）を登録してください"
            description="現場は元請企業に紐づきます"
            action={<LinkButton href="/customers/new" size="sm">顧客を登録</LinkButton>}
          />
        ) : (
          <SiteForm customers={customers} />
        )}
      </PageContainer>
    </div>
  );
}
