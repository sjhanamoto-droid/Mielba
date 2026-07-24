import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Pencil, Building2, MapPin, KeyRound, HardHat, CalendarClock,
  FileText, ClipboardList, Plus, ChevronRight, Truck, PackageCheck,
  ClipboardCheck, Wallet, ScrollText, Phone, ArrowRight, Map, CalendarRange,
  UserRound, CircleParking,
} from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, CardLink, SectionTitle, DataList, DataRow } from "@/components/ui/card";
import { Badge, SiteStatusBadge } from "@/components/ui/badge";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { ProgressBar, SiteStageStepper } from "@/components/site-card";
import { ReportCard } from "@/components/report-card";
import { EmptyState } from "@/components/ui/misc";
import { PhotoGrid, type PhotoData } from "@/components/photo-grid";
import { HandoverAlert } from "@/components/handover-alert";
import { SearchParamToast } from "@/components/ui/toast";
import { getOpenHandovers } from "@/features/handovers/actions";
import { SiteStageControl } from "@/features/sites/site-stage-control";
import { RelationControl } from "@/features/sites/relation-control";
import { PartnerControl } from "@/features/sites/partner-control";
import { photoSrc } from "@/lib/photos";
import { todayRange } from "@/lib/date";
import { fmtDate, fmtMonthDay, fmtYen } from "@/lib/utils";
import {
  PROJECT_TYPE_LABEL,
  PROJECT_STATUS_LABEL,
  BILLING_STATUS_LABEL,
  EVENT_SOURCE_LABEL,
  EVENT_SOURCE_COLOR,
  labelOf,
  siteStageIndex,
  type ProjectType,
  type ProjectStatus,
  type BillingStatus,
  type EventSource,
} from "@/lib/constants";

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = isAdmin(await requireUser());
  const { id } = await params;

  // 「今日以降」の判定は Asia/Tokyo の暦日で行う（UTCサーバーでの前日ズレ防止）
  const { gte: today } = todayRange();

  const site = await db.site.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      survey: { select: { id: true, address: true, situationMemo: true, surveyedAt: true } },
      partners: true,
      reports: {
        include: {
          user: { select: { name: true, avatarColor: true } },
          _count: { select: { photos: true, comments: true, materials: true } },
        },
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        take: 3,
      },
      events: {
        where: { date: { gte: today } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 6,
      },
      relationsA: { include: { siteB: { select: { id: true, name: true, address: true, siteStatus: true } } } },
      relationsB: { include: { siteA: { select: { id: true, name: true, address: true, siteStatus: true } } } },
    },
  });

  if (!site) notFound();

  // 現場詳細はログイン済みなら全ユーザー閲覧可（配属の概念は廃止し当日制へ移行したため）。

  // 日報数・未解決引き継ぎ・現場写真（base64は載せない）・人工実績・駐車場代累計
  const [reportCount, openHandovers, sitePhotos, parkingAgg] = await Promise.all([
    db.dailyReport.count({ where: { siteId: site.id } }),
    getOpenHandovers(site.id),
    db.photo.findMany({
      where: { siteId: site.id },
      select: { id: true, caption: true, kind: true, isVideo: true, width: true, height: true },
      orderBy: { createdAt: "asc" },
    }),
    db.dailyReport.aggregate({
      where: { siteId: site.id },
      _sum: { parkingFee: true },
    }),
  ]);

  const parkingTotal = parkingAgg._sum.parkingFee ?? 0;

  // kind 別に写真を仕分け（PDF は width を持たない＝画像グリッドではなくリンクで開く）
  const isPdfLike = (p: { isVideo: boolean; width: number | null }) => !p.isVideo && p.width == null;
  const keyboxPhotos: PhotoData[] = sitePhotos.filter((p) => p.kind === "KEYBOX" && !isPdfLike(p));
  const drawingImages: PhotoData[] = sitePhotos.filter((p) => p.kind === "DRAWING" && !isPdfLike(p));
  const drawingPdfs = sitePhotos.filter((p) => p.kind === "DRAWING" && isPdfLike(p));
  const scheduleImages: PhotoData[] = sitePhotos.filter((p) => p.kind === "SCHEDULE" && !isPdfLike(p));
  const schedulePdfs = sitePhotos.filter((p) => p.kind === "SCHEDULE" && isPdfLike(p));
  const hasDocuments =
    drawingImages.length + drawingPdfs.length + scheduleImages.length + schedulePdfs.length > 0;

  const mapsUrl = site.address
    ? `https://maps.google.com/?q=${encodeURIComponent(site.address)}`
    : null;
  // 最終人工 = 提出日報の累計（reportCount。1日報＝1人工）。目標に対する達成率を出す。
  const manDaysPercent =
    site.targetManDays && site.targetManDays > 0
      ? Math.min(100, Math.round((reportCount / site.targetManDays) * 100))
      : null;

  // 関連現場を双方向から集約
  const related = [
    ...site.relationsA.map((r) => ({ relationId: r.id, note: r.note, other: r.siteB })),
    ...site.relationsB.map((r) => ({ relationId: r.id, note: r.note, other: r.siteA })),
  ];

  // 管理者向けの候補データ（関連現場候補）
  let relationCandidates: { id: string; name: string; address: string | null }[] = [];
  if (admin) {
    // 同一 customerId または同一 address の他現場（自身・既存関連は除外）
    const relatedIds = new Set(related.map((r) => r.other.id));
    const orConds: { customerId?: string; address?: string }[] = [
      { customerId: site.customerId },
    ];
    if (site.address) orConds.push({ address: site.address });

    const candidateSites = await db.site.findMany({
      where: {
        AND: [{ id: { not: site.id } }, { OR: orConds }],
      },
      select: { id: true, name: true, address: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    relationCandidates = candidateSites.filter((c) => !relatedIds.has(c.id));
  }

  const projectType = labelOf(PROJECT_TYPE_LABEL, site.projectType as ProjectType);
  const projectStatus = labelOf(PROJECT_STATUS_LABEL, site.projectStatus as ProjectStatus);

  return (
    <div>
      <PageHeader
        title={site.name}
        subtitle={site.customer.name}
        backHref="/sites"
        right={
          admin ? (
            <LinkButton href={`/sites/${site.id}/edit`} variant="ghost" size="icon" aria-label="編集">
              <Pencil className="h-5 w-5" />
            </LinkButton>
          ) : undefined
        }
      />

      <PageContainer>
       <SearchParamToast />
       <div className="space-y-5">
        {/* 未解決の引き継ぎ事項（最優先で表示） */}
        {openHandovers.length > 0 && <HandoverAlert handovers={openHandovers} />}

        {/* ステータス */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <SiteStatusBadge status={site.siteStatus} />
            <Badge tone="brand">{projectStatus}</Badge>
            <Badge tone="neutral">{projectType}</Badge>
          </div>
        </div>

        {/* === PC: 左メイン(2/3) + 右レール(1/3) の2カラム。スマホは縦積み === */}
        <div className="lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
         {/* ===== メイン列 ===== */}
         <div className="space-y-5 lg:col-span-2">

        {/* ⓪-1 現場入り情報（ぱっと見で分かる） */}
        <section className="space-y-2.5">
          <SectionTitle>現場入り情報</SectionTitle>
          <Card className="space-y-4 p-4">
            {/* キーBOX番号を大きく表示 */}
            <div className="rounded-xl bg-surface-sunken p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                <KeyRound className="h-4 w-4" />
                キーBOX番号
              </p>
              <p className="mt-1 text-3xl font-bold tracking-wider text-ink tnum">
                {site.keyboxNumber || "—"}
              </p>
              {site.keyboxPlace && (
                <p className="mt-1.5 text-sm font-medium text-ink-soft">
                  場所: {site.keyboxPlace}
                </p>
              )}
              {!site.keyboxNumber && site.keybox && (
                <p className="mt-1.5 text-xs text-ink-muted">旧キーBOXメモ: {site.keybox}</p>
              )}
            </div>

            {/* キーBOXの写真（タップで拡大） */}
            {keyboxPhotos.length > 0 && <PhotoGrid photos={keyboxPhotos} />}

            {/* 住所・現場担当者 */}
            <DataList>
              <DataRow label="住所" value={site.address} />
              <DataRow
                label="現場担当者"
                value={
                  site.siteContactName ? (
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="h-3.5 w-3.5 text-ink-muted" />
                      {site.siteContactName}
                    </span>
                  ) : null
                }
              />
            </DataList>

            {/* 大きなアクションボタン（44px以上） */}
            {(mapsUrl || site.siteContactPhone) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClass({ variant: "outline", size: "md", className: "w-full" })}
                  >
                    <Map className="h-5 w-5" />
                    地図を開く
                  </a>
                )}
                {site.siteContactPhone && (
                  <a
                    href={`tel:${site.siteContactPhone}`}
                    className={buttonClass({ size: "md", className: "w-full" })}
                  >
                    <Phone className="h-5 w-5" />
                    {site.siteContactName ? `${site.siteContactName}さんに電話` : "現場担当に電話"}
                  </a>
                )}
              </div>
            )}
          </Card>
        </section>

        {/* ⓪-2 人工（最終=日報累計 / 目標） */}
        <section className="space-y-2.5">
          <SectionTitle>人工</SectionTitle>
          <Card className="space-y-3 p-4">
            <div className="flex items-end justify-between">
              <span className="text-xs font-semibold text-ink-muted">最終 / 目標</span>
              <span className="text-2xl font-bold text-ink tnum">
                {reportCount}
                <span className="text-sm font-semibold text-ink-muted">
                  {" "}
                  / {site.targetManDays ?? "—"} 人工
                </span>
              </span>
            </div>
            {manDaysPercent !== null && (
              <div>
                <ProgressBar value={manDaysPercent} />
                <p className="mt-1 text-right text-[11px] font-semibold text-ink-muted tnum">
                  {manDaysPercent}%
                </p>
              </div>
            )}
            <p className="text-[11px] text-ink-faint">
              最終人工は提出された日報の累計から自動計算されます（1日報＝1人工）。
            </p>
            <DataList>
              <DataRow
                label="駐車場代 累計"
                value={
                  parkingTotal > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <CircleParking className="h-3.5 w-3.5 text-ink-muted" />
                      {fmtYen(parkingTotal)}
                    </span>
                  ) : null
                }
              />
            </DataList>
          </Card>
        </section>

        {/* ⓪-3 図面・工程表 */}
        {hasDocuments && (
          <section className="space-y-2.5">
            <SectionTitle>図面・工程表</SectionTitle>
            <Card className="space-y-4 p-4">
              {(drawingImages.length > 0 || drawingPdfs.length > 0) && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                    <FileText className="h-4 w-4" />
                    図面
                  </p>
                  {drawingImages.length > 0 && <PhotoGrid photos={drawingImages} />}
                  {drawingPdfs.map((p) => (
                    <a
                      key={p.id}
                      href={photoSrc(p.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-line bg-surface-subtle px-3.5 py-2.5 text-sm font-semibold text-ink hover:border-line-strong"
                    >
                      <FileText className="h-5 w-5 shrink-0 text-red-500" />
                      <span className="min-w-0 flex-1 truncate">{p.caption || "図面PDF"}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                    </a>
                  ))}
                </div>
              )}
              {(scheduleImages.length > 0 || schedulePdfs.length > 0) && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                    <CalendarRange className="h-4 w-4" />
                    工程表
                  </p>
                  {scheduleImages.length > 0 && <PhotoGrid photos={scheduleImages} />}
                  {schedulePdfs.map((p) => (
                    <a
                      key={p.id}
                      href={photoSrc(p.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-line bg-surface-subtle px-3.5 py-2.5 text-sm font-semibold text-ink hover:border-line-strong"
                    >
                      <FileText className="h-5 w-5 shrink-0 text-red-500" />
                      <span className="min-w-0 flex-1 truncate">{p.caption || "工程表PDF"}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                    </a>
                  ))}
                </div>
              )}
            </Card>
          </section>
        )}

        {/* ① 基本情報 */}
        <section className="space-y-2.5">
          <SectionTitle>基本情報</SectionTitle>
          <Card className="px-4">
            <DataList>
              <DataRow label="案件コード" value={site.projectCode} />
              <DataRow label="工事コード" value={site.constructionCode} />
              <DataRow label="種別" value={projectType} />
              <DataRow label="案件ステータス" value={projectStatus} />
              <DataRow label="受注日" value={fmtDate(site.receivedDate)} />
              <DataRow label="契約書番号" value={site.contractNumber} />
            </DataList>
          </Card>
        </section>

        {/* ② 元請企業 */}
        <section className="space-y-2.5">
          <SectionTitle>元請企業</SectionTitle>
          <CardLink href={`/customers/${site.customer.id}`} className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{site.customer.name}</p>
              <p className="text-xs text-ink-muted">顧客情報を見る</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
          </CardLink>
        </section>

        {/* ③ 場所 */}
        <section className="space-y-2.5">
          <SectionTitle>場所</SectionTitle>
          <Card className="px-4">
            <DataList>
              <DataRow
                label="住所"
                value={
                  site.address ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-ink-muted" />
                      {site.address}
                    </span>
                  ) : null
                }
              />
              <DataRow label="作業場所名" value={site.locationName} />
              <DataRow
                label="キーBOX"
                value={
                  site.keybox ? (
                    <span className="inline-flex items-center gap-1">
                      <KeyRound className="h-3.5 w-3.5 text-ink-muted" />
                      {site.keybox}
                    </span>
                  ) : null
                }
              />
              <DataRow label="現場側担当" value={site.siteContactName} />
            </DataList>
          </Card>
        </section>

        {/* ④ 協力会社（体制欄は非表示・DBフィールドは将来用に保持） */}
        <section className="space-y-2.5">
          {/* 協力会社 */}
          {admin ? (
            <PartnerControl siteId={site.id} partners={site.partners} />
          ) : (
            site.partners.length > 0 && (
              <Card className="space-y-2 p-4">
                <p className="text-xs font-semibold text-ink-muted">協力会社</p>
                <div className="space-y-2">
                  {site.partners.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <HardHat className="h-4 w-4 shrink-0 text-ink-muted" />
                      <span className="font-semibold text-ink">{p.name}</span>
                      {p.role && <span className="text-xs text-ink-muted">{p.role}</span>}
                      {p.contact && (
                        <a
                          href={`tel:${p.contact}`}
                          className="ml-auto flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-600"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {p.contact}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )
          )}

        </section>

        {/* ⑤ 工程 */}
        <section className="space-y-2.5">
          <SectionTitle>工程</SectionTitle>
          <Card className="space-y-3 p-4">
            <DataList>
              <DataRow
                label="着工"
                value={`予定 ${fmtDate(site.plannedStartDate)} ／ 実績 ${fmtDate(site.actualStartDate)}`}
              />
              <DataRow
                label="完工"
                value={`予定 ${fmtDate(site.plannedEndDate)} ／ 実績 ${fmtDate(site.actualEndDate)}`}
              />
            </DataList>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-muted">進捗</div>
              {admin ? (
                <SiteStageControl
                  siteId={site.id}
                  siteStatus={site.siteStatus}
                  projectStatus={site.projectStatus}
                />
              ) : (
                <SiteStageStepper index={siteStageIndex(site.siteStatus, site.projectStatus)} />
              )}
            </div>
          </Card>
        </section>

        {/* ⑥ 引き継ぎ事項 */}
        {site.handoverNote && (
          <section className="space-y-2.5">
            <SectionTitle>引き継ぎ事項</SectionTitle>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-800">
                <ClipboardCheck className="h-4 w-4" />
                前回状況・注意点・残作業
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-amber-900">
                {site.handoverNote}
              </p>
            </div>
          </section>
        )}

        {/* ⑦ この現場の日報 */}
        <section className="space-y-2.5">
          <SectionTitle
            action={
              reportCount > 0 ? (
                <Link href={`/sites/${site.id}/reports`} className="text-xs font-semibold text-brand-600">
                  すべて見る（{reportCount}）
                </Link>
              ) : undefined
            }
          >
            この現場の日報
          </SectionTitle>
          {site.reports.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="まだ日報がありません"
              action={
                <LinkButton href={`/reports/new?siteId=${site.id}`} size="sm">
                  <Plus className="h-4 w-4" />日報を書く
                </LinkButton>
              }
            />
          ) : (
            <>
              <div className="space-y-2.5">
                {site.reports.map((r) => (
                  <ReportCard key={r.id} report={r} showSite={false} />
                ))}
              </div>
              <LinkButton href={`/reports/new?siteId=${site.id}`} variant="outline" size="md" className="w-full">
                <Plus className="h-4 w-4" />日報を書く
              </LinkButton>
            </>
          )}
        </section>

         </div>{/* ===== /メイン列 ===== */}

         {/* ===== 右レール ===== */}
         <div className="mt-5 space-y-5 lg:col-span-1 lg:mt-0">

        {/* ⑧ 予定 */}
        <section className="space-y-2.5">
          <SectionTitle>今後の予定</SectionTitle>
          {site.events.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
              今後の予定はありません
            </div>
          ) : (
            <Card className="divide-y divide-line">
              {site.events.map((e) => {
                const color = EVENT_SOURCE_COLOR[e.source as EventSource];
                const Icon =
                  e.source === "DELIVERY" ? Truck : e.source === "SUPPLY" ? PackageCheck : CalendarClock;
                const isAuto = e.source !== "MANUAL";
                return (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${color}1a`, color }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{e.title}</p>
                      <p className="text-xs text-ink-muted">{fmtMonthDay(e.date)}</p>
                    </div>
                    <Badge tone={isAuto ? "info" : "neutral"}>
                      {labelOf(EVENT_SOURCE_LABEL, e.source as EventSource)}
                    </Badge>
                  </div>
                );
              })}
            </Card>
          )}
        </section>

        {/* ⑩ 関連現場 */}
        {admin ? (
          <section className="space-y-2.5">
            <SectionTitle>関連現場（同一住所・同一顧客）</SectionTitle>
            <RelationControl
              siteId={site.id}
              related={related}
              candidates={relationCandidates}
            />
          </section>
        ) : (
          related.length > 0 && (
            <section className="space-y-2.5">
              <SectionTitle>関連現場（同一住所）</SectionTitle>
              <div className="space-y-2">
                {related.map((r) => (
                  <CardLink key={r.relationId} href={`/sites/${r.other.id}`} className="flex items-center gap-3 p-3.5">
                    <SiteStatusBadge status={r.other.siteStatus} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{r.other.name}</p>
                      {r.other.address && (
                        <p className="truncate text-xs text-ink-muted">{r.other.address}</p>
                      )}
                      {r.note && <p className="truncate text-xs text-ink-faint">{r.note}</p>}
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </CardLink>
                ))}
              </div>
            </section>
          )
        )}

        {/* ⑪ 現調 */}
        <section className="space-y-2.5">
          <SectionTitle
            action={
              admin ? (
                <Link href={`/sites/${site.id}/survey`} className="text-xs font-semibold text-brand-600">
                  {site.survey ? "編集" : "登録"}
                </Link>
              ) : undefined
            }
          >
            現調
          </SectionTitle>
          {site.survey ? (
            <Card className="space-y-2 p-4">
              {site.survey.surveyedAt && (
                <p className="text-xs text-ink-muted">調査日: {fmtDate(site.survey.surveyedAt)}</p>
              )}
              {site.survey.address && (
                <p className="flex items-center gap-1 text-sm text-ink">
                  <MapPin className="h-3.5 w-3.5 text-ink-muted" />
                  {site.survey.address}
                </p>
              )}
              {site.survey.situationMemo && (
                <p className="line-clamp-3 text-sm leading-relaxed text-ink-soft">
                  {site.survey.situationMemo}
                </p>
              )}
              {admin && (
                <Link
                  href={`/sites/${site.id}/survey`}
                  className="flex items-center gap-1 text-xs font-semibold text-brand-600"
                >
                  現調フォーマットを開く
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </Card>
          ) : (
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface/50 px-4 py-4 text-sm text-ink-muted">
              <ClipboardList className="h-4 w-4 shrink-0" />
              現調記録はまだありません
            </div>
          )}
        </section>

        {/* ⑫ 将来フェーズ */}
        <section className="space-y-2.5">
          <SectionTitle>将来フェーズ（項目定義のみ）</SectionTitle>
          <Card className="space-y-3 p-4 opacity-90">
            <div className="flex items-center gap-1.5 text-xs font-bold text-ink-muted">
              <Wallet className="h-4 w-4" />
              金額・収支
            </div>
            <DataList>
              <DataRow label="請求ステータス" value={site.billingStatus ? labelOf(BILLING_STATUS_LABEL, site.billingStatus as BillingStatus) : null} />
              <DataRow label="契約金額" value={null} />
              <DataRow label="実行予算" value={null} />
              <DataRow label="粗利" value={null} />
            </DataList>
            <div className="flex items-center gap-1.5 pt-1 text-xs font-bold text-ink-muted">
              <ScrollText className="h-4 w-4" />
              法令・書類
            </div>
            <DataList>
              <DataRow label="建設業許可番号" value={site.constructionPermitNumber} />
              <DataRow label="施工体制台帳" value={null} />
              <DataRow label="安全書類" value={null} />
            </DataList>
            <p className="text-xs text-ink-faint">
              ※ これらは将来フェーズで入力・集計を有効化します。
            </p>
          </Card>
        </section>

         </div>{/* ===== /右レール ===== */}
        </div>{/* ===== /2カラムグリッド ===== */}
       </div>{/* /space-y-5 */}
      </PageContainer>
    </div>
  );
}
