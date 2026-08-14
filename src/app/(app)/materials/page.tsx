import { requireSuperAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { MaterialSitePicker, type PickerSite } from "@/features/materials/material-site-picker";

// 材料OCR登録（最高管理者専用）。現場を選んで納品書/発注書を撮影・登録する。
export default async function MaterialsPage() {
  await requireSuperAdmin();

  const sites = await db.site.findMany({
    orderBy: [{ siteStatus: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      siteStatus: true,
      customer: { select: { name: true } },
      _count: { select: { siteMaterials: true } },
    },
  });

  const pickerSites: PickerSite[] = sites.map((s) => ({
    id: s.id,
    name: s.name,
    siteStatus: s.siteStatus,
    customerName: s.customer.name,
    materialCount: s._count.siteMaterials,
  }));

  return (
    <div>
      <PageHeader title="材料登録" subtitle="納品書・発注書から材料を登録" />
      <PageContainer size="narrow">
        <p className="mb-3 text-sm text-ink-muted">
          登録する現場を選んでください。選んだ現場で伝票を撮影すると、材料名・数量・金額を自動で読み取ります。
        </p>
        <MaterialSitePicker sites={pickerSites} />
      </PageContainer>
    </div>
  );
}
