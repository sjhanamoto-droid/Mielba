import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { SiteForm } from "@/features/sites/site-form";

export default async function EditSitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [site, customers, sitePhotos] = await Promise.all([
    db.site.findUnique({ where: { id } }),
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // 既存写真は {id} 参照のみ渡す（base64 を RSC ペイロードに載せない）
    db.photo.findMany({
      where: { siteId: id },
      select: { id: true, caption: true, kind: true, isVideo: true, width: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!site) notFound();

  return (
    <div>
      <PageHeader title="現場を編集" subtitle={site.name} backHref={`/sites/${site.id}`} />
      <PageContainer size="narrow">
        <SiteForm customers={customers} site={site} sitePhotos={sitePhotos} />
      </PageContainer>
    </div>
  );
}
