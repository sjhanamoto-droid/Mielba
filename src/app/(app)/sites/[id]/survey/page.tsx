import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { SurveyForm } from "@/features/sites/survey-form";
import type { UploadPhoto } from "@/components/photo-uploader";
import type { PhotoKind } from "@/lib/constants";

export default async function SiteSurveyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      survey: {
        include: { photos: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  if (!site) notFound();

  const survey = site.survey;
  const photos: UploadPhoto[] = (survey?.photos ?? []).map((p) => ({
    dataUrl: p.dataUrl,
    caption: p.caption ?? "",
    kind: (p.kind as PhotoKind) ?? "SURVEY",
    isVideo: p.isVideo,
    width: p.width ?? undefined,
    height: p.height ?? undefined,
  }));

  return (
    <div>
      <PageHeader title="現調フォーマット" subtitle={site.name} backHref={`/sites/${site.id}`} />
      <PageContainer>
        <SurveyForm
          siteId={site.id}
          survey={survey ? {
            address: survey.address,
            keybox: survey.keybox,
            situationMemo: survey.situationMemo,
            relatedNote: survey.relatedNote,
          } : undefined}
          photos={photos}
        />
      </PageContainer>
    </div>
  );
}
