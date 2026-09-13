import { notFound } from "next/navigation";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { SiteForm } from "@/features/sites/site-form";
import type { UploadPhoto } from "@/components/photo-uploader";
import type { PhotoKind } from "@/lib/constants";

export default async function EditSitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user); // 受注済 → 現調に戻す操作は管理者のみ
  const { id } = await params;

  const [site, customers, sitePhotos, surveyPhotoRows] = await Promise.all([
    db.site.findUnique({ where: { id } }),
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // 既存写真は {id} 参照のみ渡す（base64 を RSC ペイロードに載せない）
    db.photo.findMany({
      where: { siteId: id },
      select: { id: true, caption: true, kind: true, isVideo: true, width: true },
      orderBy: { createdAt: "asc" },
    }),
    // 現調の写真・動画（現調記録に紐づく分）。現調の現場の修正画面で編集できる。
    db.photo.findMany({
      where: { survey: { siteId: id } },
      select: { id: true, caption: true, kind: true, isVideo: true, width: true, height: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!site) notFound();
  // 現場の編集は全ログインユーザー可（スタッフも現場情報を最新に保てるように）

  const surveyPhotos: UploadPhoto[] = surveyPhotoRows.map((p) => ({
    id: p.id,
    caption: p.caption ?? "",
    kind: (p.kind as PhotoKind) ?? "SURVEY",
    isVideo: p.isVideo,
    width: p.width ?? undefined,
    height: p.height ?? undefined,
  }));

  return (
    <div>
      <PageHeader title="現場を編集" subtitle={site.name} backHref={`/sites/${site.id}`} />
      <PageContainer size="narrow">
        <SiteForm
          customers={customers}
          site={site}
          sitePhotos={sitePhotos}
          surveyPhotos={surveyPhotos}
          admin={admin}
        />
      </PageContainer>
    </div>
  );
}
