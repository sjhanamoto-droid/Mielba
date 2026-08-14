import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { MaterialOcrRegister } from "@/features/materials/material-ocr-register";
import { SiteMaterialList, type SiteMaterialRow } from "@/features/materials/site-material-list";

// 現場を選んだあとの材料登録画面（最高管理者専用）。撮影→OCR→確認→登録。
export default async function SiteMaterialsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  await requireSuperAdmin();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { id: true, name: true, customer: { select: { name: true } } },
  });
  if (!site) notFound();

  const materials = await db.siteMaterial.findMany({
    where: { siteId },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      quantity: true,
      unit: true,
      unitPrice: true,
      amount: true,
      documentType: true,
      supplier: true,
      active: true,
    },
  });

  return (
    <div>
      <PageHeader title="材料登録" subtitle={site.name} backHref="/materials" />
      <PageContainer size="narrow">
        <div className="space-y-6">
          <MaterialOcrRegister site={{ id: site.id, name: site.name }} />

          <section className="space-y-2.5">
            <SectionTitle>登録済みの材料</SectionTitle>
            <Card className="p-4">
              <SiteMaterialList materials={materials as SiteMaterialRow[]} />
            </Card>
          </section>
        </div>
      </PageContainer>
    </div>
  );
}
