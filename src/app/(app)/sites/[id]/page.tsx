import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Pencil, Building2, MapPin, KeyRound, HardHat, CalendarClock,
  FileText, ClipboardList, Plus, ChevronRight, Truck, PackageCheck,
  ClipboardCheck, Wallet, ScrollText, Phone, ArrowRight, Map, CalendarRange,
  UserRound, CircleParking, AlertTriangle, StickyNote, Link2,
} from "lucide-react";
import { requireUser, isAdmin, isSuperAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardLink, SectionTitle, DataList, DataRow } from "@/components/ui/card";
import { Badge, SiteStatusBadge } from "@/components/ui/badge";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { ProgressBar, SiteStageStepper } from "@/components/site-card";
import { ReportCard } from "@/components/report-card";
import { EmptyState } from "@/components/ui/misc";
import { PhotoGrid, type PhotoData } from "@/components/photo-grid";
import { PdfRow } from "@/components/pdf-row";
import { SearchParamToast } from "@/components/ui/toast";
import { getOpenHandovers, getResolvedHandovers } from "@/features/handovers/actions";
import { HandoverPanel } from "@/features/handovers/handover-panel";
import { SiteStageControl } from "@/features/sites/site-stage-control";
import { SiteSurveyActions, SiteRevertToSurvey } from "@/features/sites/site-survey-actions";
import { RelationControl } from "@/features/sites/relation-control";
import { PartnerControl } from "@/features/sites/partner-control";
import { SiteMaterialSummary } from "@/features/materials/site-material-summary";
import { SiteAnalysisCard } from "@/features/sites/site-analysis-card";
import { SiteMemoPanel, type SiteMemoAuthor, type SiteMemoRow } from "@/features/sites/site-memo-panel";
import { SiteDetailTabs } from "@/features/sites/site-detail-tabs";
import { Tabs } from "@/components/ui/tabs";
import { todayRange } from "@/lib/date";
import { fmtDate, fmtMonthDay, fmtYen } from "@/lib/utils";
import {
  PROJECT_TYPE_LABEL,
  BILLING_STATUS_LABEL,
  EVENT_SOURCE_LABEL,
  EVENT_SOURCE_COLOR,
  labelOf,
  siteStageIndex,
  hasOrderedRecord,
  type ProjectType,
  type BillingStatus,
  type EventSource,
} from "@/lib/constants";

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const superAdmin = isSuperAdmin(user); // 金額・原価など会計情報は最高管理者のみ閲覧
  const { id } = await params;

  // 「今日以降」の判定は Asia/Tokyo の暦日で行う（UTCサーバーでの前日ズレ防止）
  const { gte: today } = todayRange();

  const site = await db.site.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      survey: {
        select: {
          id: true,
          address: true,
          situationMemo: true,
          surveyedAt: true,
          // 現調で撮った写真・動画（base64 は載せず {id} 参照で渡す）
          photos: {
            select: { id: true, caption: true, kind: true, isVideo: true, width: true, height: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      partners: true,
      reports: {
        include: {
          user: { select: { name: true, avatarColor: true, avatarImage: true } },
          _count: { select: { photos: true, comments: true, materials: true } },
        },
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        take: 3,
      },
      events: {
        // 非公開の予定（最高管理者の個人予定）は現場に紐づかないが、念のため明示的に除く
        where: { date: { gte: today }, isPrivate: false },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 6,
      },
      relationsA: { include: { siteB: { select: { id: true, name: true, address: true, siteStatus: true } } } },
      relationsB: { include: { siteA: { select: { id: true, name: true, address: true, siteStatus: true } } } },
      // 現場メモ（日報以外の気づき・連絡）。新しい順。投稿者は退職等で null になりうる。
      memos: {
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          createdBy: { select: { id: true, name: true, avatarColor: true, avatarImage: true } },
        },
      },
      _count: { select: { memos: true } },
    },
  });

  if (!site) notFound();

  // 現場詳細はログイン済みなら全ユーザー閲覧可（配属の概念は廃止し当日制へ移行したため）。

  // 日報数（全件）・人工カウント（着工実績日以降のみ）・未解決引き継ぎ・現場写真・駐車場代累計
  // 人工は「着工実績日以降の日報」で数える（着工前＝現調段階はカウントしない）。actualStartDate 未設定なら 0。
  const [
    reportCount,
    manDaysCount,
    openHandovers,
    resolvedHandovers,
    sitePhotos,
    parkingAgg,
    siteMaterials,
    materialUses,
    workPhotos,
  ] = await Promise.all([
    db.dailyReport.count({ where: { siteId: site.id } }),
    // 人工は提出済み(SUBMITTED)のみ数える（勤怠・人工超過チェックと同じ基準）
    site.actualStartDate
      ? db.dailyReport.count({
          where: {
            siteId: site.id,
            status: "SUBMITTED",
            workDate: { gte: site.actualStartDate },
          },
        })
      : Promise.resolve(0),
    getOpenHandovers(site.id),
    // 確認済みの引き継ぎ（誤って停止しても戻せるよう履歴として表示する）
    getResolvedHandovers(site.id),
    db.photo.findMany({
      where: { siteId: site.id },
      select: { id: true, caption: true, kind: true, isVideo: true, width: true, height: true },
      orderBy: { createdAt: "asc" },
    }),
    db.dailyReport.aggregate({
      where: { siteId: site.id },
      _sum: { parkingFee: true },
    }),
    // 現場に登録された材料（有効のみ）。種類・数量は全員、単価/金額は最高管理者のみ描画する。
    db.siteMaterial.findMany({
      where: { siteId: site.id, active: true },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, name: true, quantity: true, unit: true, unitPrice: true, amount: true },
    }),
    // 日報の使用材料（この現場の全日報）。残量＝登録数量−使用量の算出に使う。
    db.materialUse.findMany({
      where: { report: { siteId: site.id } },
      select: { name: true, quantity: true },
    }),
    // 施工が始まってからの写真・動画（日報に付いたもの）。現調の分と分けて見せる。
    db.photo.findMany({
      where: { report: { siteId: site.id } },
      select: { id: true, caption: true, kind: true, isVideo: true, width: true, height: true },
      orderBy: { createdAt: "desc" },
      take: 60,
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
  // 現調のときに撮った写真・動画（現調記録に紐づく分）
  const surveyPhotos: PhotoData[] = site.survey?.photos ?? [];

  const mapsUrl = site.address
    ? `https://maps.google.com/?q=${encodeURIComponent(site.address)}`
    : null;
  // 最終人工 = 着工実績日以降の日報累計（manDaysCount。1日報＝1人工）。着工前は達成率を出さない。
  const hasStarted = site.actualStartDate != null;
  const manDaysPercent =
    hasStarted && site.targetManDays && site.targetManDays > 0
      ? Math.min(100, Math.round((manDaysCount / site.targetManDays) * 100))
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

  // 現場メモ: 投稿者（アバター画像＝data URL）を行ごとに重複して RSC ペイロードに載せないよう、
  // 投稿者は id→情報のマップで1回だけ渡し、行には createdById のみ持たせる。
  const memoAuthors: Record<string, SiteMemoAuthor> = {};
  const memoRows: SiteMemoRow[] = site.memos.map((m) => {
    if (m.createdBy) memoAuthors[m.createdBy.id] = m.createdBy;
    return {
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      createdById: m.createdById,
      atSurvey: m.atSurvey,
    };
  });
  const memoCount = site._count.memos;

  // AI分析（管理者のみ）: 人工超過の原因分析 と 工事完了の振り返り分析
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY);
  const isOverrun =
    hasStarted &&
    site.targetManDays != null &&
    site.targetManDays > 0 &&
    manDaysCount > site.targetManDays;
  const isCompleted = site.siteStatus === "PAST";

  // 仮登録の警告は「連絡・メモ」「現場情報」のどちらを開いていても見えるようにする
  const provisionalBanner = site.provisional ? (
    <div className="alert-warn flex items-start gap-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        この現場は<b className="font-bold">仮登録</b>です。本登録には
        住所・キーBOX・キーBOX写真・図面/工程表 が必要です。
      </span>
    </div>
  ) : null;

  // 現調／見送りの現場は、次に何をするかをタブの先頭で示す
  const stageless = site.siteStatus === "SURVEY" || site.siteStatus === "DECLINED";
  const surveyBanner =
    site.siteStatus === "SURVEY" ? (
      <SiteSurveyActions
        siteId={site.id}
        admin={admin}
        // 受注済から戻した現場は、入力済みの情報も工程も残っている
        resumed={hasOrderedRecord(site.siteStatus, site.projectStatus)}
      />
    ) : site.siteStatus === "DECLINED" && admin ? (
      <SiteRevertToSurvey siteId={site.id} />
    ) : null;

  // ───────────────── タブ①「連絡・メモ」: 現場を開いたら最初に目に入る ─────────────────
  const notesPanel = (
    <div className="space-y-5">
      {surveyBanner}
      {provisionalBanner}

      {/* 引き継ぎ事項（未確認 → 現場の常設メモ → 確認済みの履歴） */}
      <section className="space-y-2.5">
        <SectionTitle
          action={
            <Link
              href={`/sites/${site.id}/edit#handoverNote`}
              className="text-xs font-semibold text-brand-600"
            >
              {site.handoverNote ? "編集" : "追加"}
            </Link>
          }
        >
          引き継ぎ事項
        </SectionTitle>

        <HandoverPanel open={openHandovers} resolved={resolvedHandovers}>
          {site.handoverNote ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/40">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                <ClipboardCheck className="h-4 w-4" />
                前回状況・注意点・残作業
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-amber-900 dark:text-amber-100">
                {site.handoverNote}
              </p>
            </div>
          ) : (
            openHandovers.length === 0 &&
            resolvedHandovers.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center">
                <p className="text-sm font-medium text-ink-muted">引き継ぎ事項はありません</p>
                <p className="mt-1 text-xs text-ink-faint">
                  前回状況・注意点・残作業は「追加」から書けます。
                </p>
              </div>
            )
          )}
        </HandoverPanel>
      </section>

      {/* 現場メモ（日報に書くほどでない気づき・連絡をその場で残す） */}
      <section className="space-y-2.5">
        <SectionTitle
          action={
            memoCount > 0 ? (
              <span className="text-xs font-semibold text-ink-muted tnum">{memoCount}件</span>
            ) : undefined
          }
        >
          <span className="flex items-center gap-1.5">
            <StickyNote className="h-4 w-4 text-brand-600" />
            現場メモ
          </span>
        </SectionTitle>
        <SiteMemoPanel
          siteId={site.id}
          memos={memoRows}
          authors={memoAuthors}
          totalCount={memoCount}
          currentUser={{
            id: user.id,
            name: user.name,
            avatarColor: user.avatarColor,
            avatarImage: user.avatarImage,
          }}
          canManageAll={admin}
          siteInSurvey={site.siteStatus === "SURVEY"}
        />
      </section>
    </div>
  );

  // ───────────────── タブ②「現場情報」 ─────────────────
  const infoPanel = (
    <div className="space-y-5">
      {surveyBanner}
      {provisionalBanner}

      {/* ステータス */}
      <div className="flex flex-wrap items-center gap-1.5">
        <SiteStatusBadge status={site.siteStatus} />
        {site.provisional && (
          <Badge tone="warn" className="border border-amber-300 font-bold dark:border-amber-700/60">
            <AlertTriangle className="h-3 w-3" />
            仮登録
          </Badge>
        )}
        <Badge tone="neutral">{projectType}</Badge>
      </div>

      {/* PC: 左メイン(2/3) + 右レール(1/3)。スマホは縦積み */}
      <div className="lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
        {/* ===== メイン列 ===== */}
        <div className="space-y-5 lg:col-span-2">
          {/* 工程（進捗・工期） */}
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
              {!stageless && (
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
              )}
            </Card>

            {/* 工事完了のAI分析（管理者のみ・完了＝過去の現場に表示） */}
            {admin && aiEnabled && isCompleted && (
              <SiteAnalysisCard
                siteId={site.id}
                type="COMPLETION"
                initialAnalysis={site.completionAnalysis}
                initialAnalyzedAt={site.completionAnalyzedAt?.toISOString() ?? null}
              />
            )}
          </section>

          {/* 現場入り情報（ぱっと見で分かる） */}
          <section className="space-y-2.5">
            <SectionTitle>現場入り情報</SectionTitle>
            <Card className="space-y-4 p-4">
              {/* キーBOX（なし＝理由を表示 / あり＝番号を大きく表示） */}
              {site.keyboxStatus === "NONE" ? (
                <div className="rounded-xl bg-surface-sunken p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                    <KeyRound className="h-4 w-4" />
                    キーBOX
                  </p>
                  <p className="mt-1 text-lg font-bold text-ink">なし</p>
                  {site.keyboxNoneReason && (
                    <p className="mt-1 text-sm font-medium text-ink-soft">
                      理由: {site.keyboxNoneReason}
                    </p>
                  )}
                </div>
              ) : (
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
              )}

              {/* キーBOXの写真（タップで拡大）。無い場合は「撮れない理由」を表示 */}
              {keyboxPhotos.length > 0 ? (
                <PhotoGrid photos={keyboxPhotos} />
              ) : site.keyboxPhotoNoneReason ? (
                <div className="rounded-xl bg-surface-sunken p-3.5">
                  <p className="text-xs font-semibold text-ink-muted">キーBOX写真が無い理由</p>
                  <p className="mt-1 text-sm font-medium text-ink-soft">
                    {site.keyboxPhotoNoneReason}
                  </p>
                </div>
              ) : null}

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
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

          {/* 場所 */}
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

          {/* 人工（最終=着工実績日以降の日報累計 / 目標） */}
          <section className="space-y-2.5">
            <SectionTitle>人工</SectionTitle>
            <Card className="space-y-3 p-4">
              <div className="flex items-end justify-between">
                <span className="text-xs font-semibold text-ink-muted">最終 / 目標</span>
                {hasStarted ? (
                  <span className="text-2xl font-bold text-ink tnum">
                    {manDaysCount}
                    <span className="text-sm font-semibold text-ink-muted">
                      {" "}
                      / {site.targetManDays ?? "—"} 人工
                    </span>
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-ink-muted">着工前（0）</span>
                )}
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
                {hasStarted
                  ? "最終人工は着工実績日以降に提出された日報の累計です（1日報＝1人工）。"
                  : "着工実績日が未設定のため、まだ人工はカウントされません（着工実績日以降でカウント）。"}
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

            {/* 人工超過のAI分析（管理者のみ・超過中の現場に表示） */}
            {admin && aiEnabled && isOverrun && (
              <SiteAnalysisCard
                siteId={site.id}
                type="OVERRUN"
                initialAnalysis={site.overrunAnalysis}
                initialAnalyzedAt={site.overrunAnalyzedAt?.toISOString() ?? null}
              />
            )}
          </section>

          {/* 図面・工程表 */}
          {(hasDocuments || !!site.drawingNoneReason || !!site.scheduleNoneReason) && (
            <section className="space-y-2.5">
              <SectionTitle>図面・工程表</SectionTitle>
              <Card className="space-y-4 p-4">
                {drawingImages.length === 0 && drawingPdfs.length === 0 && site.drawingNoneReason && (
                  <div className="rounded-xl bg-surface-sunken p-3.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                      <FileText className="h-4 w-4" />
                      図面が無い理由
                    </p>
                    <p className="mt-1 text-sm font-medium text-ink-soft">{site.drawingNoneReason}</p>
                  </div>
                )}
                {(drawingImages.length > 0 || drawingPdfs.length > 0) && (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                      <FileText className="h-4 w-4" />
                      図面
                    </p>
                    {drawingImages.length > 0 && <PhotoGrid photos={drawingImages} />}
                    {drawingPdfs.map((p) => (
                      <PdfRow key={p.id} photoId={p.id} label={p.caption || "図面PDF"} />
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
                      <PdfRow key={p.id} photoId={p.id} label={p.caption || "工程表PDF"} />
                    ))}
                  </div>
                )}
                {scheduleImages.length === 0 && schedulePdfs.length === 0 && site.scheduleNoneReason && (
                  <div className="rounded-xl bg-surface-sunken p-3.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                      <CalendarRange className="h-4 w-4" />
                      工程表が無い理由
                    </p>
                    <p className="mt-1 text-sm font-medium text-ink-soft">{site.scheduleNoneReason}</p>
                  </div>
                )}
              </Card>
            </section>
          )}

          {/* 写真・動画（現調のときの分と、施工が始まってからの分をタブで分ける） */}
          {(surveyPhotos.length > 0 || workPhotos.length > 0) && (
            <section className="space-y-2.5">
              <SectionTitle>写真・動画</SectionTitle>
              <Tabs
                defaultId={workPhotos.length > 0 ? "work" : "survey"}
                tabs={[
                  {
                    id: "survey",
                    label: "現調",
                    count: surveyPhotos.length,
                    content:
                      surveyPhotos.length > 0 ? (
                        <PhotoGrid photos={surveyPhotos} />
                      ) : (
                        <p className="px-1 py-2 text-sm text-ink-muted">
                          現調の写真はまだありません。現調フォーマットから追加できます。
                        </p>
                      ),
                  },
                  {
                    id: "work",
                    label: "施工",
                    count: workPhotos.length,
                    content:
                      workPhotos.length > 0 ? (
                        <PhotoGrid photos={workPhotos} />
                      ) : (
                        <p className="px-1 py-2 text-sm text-ink-muted">
                          施工の写真はまだありません。日報に付けた写真がここに並びます。
                        </p>
                      ),
                  },
                ]}
              />
            </section>
          )}

          {/* 登録材料（種類・数量は全員／金額は最高管理者のみ） */}
          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-center gap-1.5">登録材料</span>
            </SectionTitle>
            <SiteMaterialSummary
              materials={siteMaterials}
              usages={materialUses}
              showAmount={superAdmin}
            />
            <p className="px-1 text-[11px] text-ink-faint">
              残 ＝ 入荷（登録数量）− 使用（日報の使用材料）。
              {superAdmin
                ? "金額（原価）は最高管理者のみ表示されます。"
                : "金額は最高管理者のみ閲覧できます。"}
            </p>
          </section>

          {/* 基本情報（事務情報なので下の方） */}
          <section className="space-y-2.5">
            <SectionTitle>基本情報</SectionTitle>
            <Card className="px-4">
              <DataList>
                <DataRow label="案件コード" value={site.projectCode} />
                <DataRow label="工事コード" value={site.constructionCode} />
                <DataRow label="種別" value={projectType} />
                <DataRow label="受注日" value={fmtDate(site.receivedDate)} />
                <DataRow label="契約書番号" value={site.contractNumber} />
                <DataRow label="作成者" value={site.createdBy?.name} />
              </DataList>
            </Card>
          </section>

          {/* 元請企業 */}
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
        </div>
        {/* ===== /メイン列 ===== */}

        {/* ===== 右レール ===== */}
        <div className="mt-5 space-y-5 lg:col-span-1 lg:mt-0">
          {/* 予定 */}
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

          {/* 現調 */}
          <section className="space-y-2.5">
            <SectionTitle
              action={
                <Link href={`/sites/${site.id}/survey`} className="text-xs font-semibold text-brand-600">
                  {site.survey ? "編集" : "登録"}
                </Link>
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
                <Link
                  href={`/sites/${site.id}/survey`}
                  className="flex items-center gap-1 text-xs font-semibold text-brand-600"
                >
                  現調フォーマットを開く
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </Card>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface/50 px-4 py-4 text-sm text-ink-muted">
                <ClipboardList className="h-4 w-4 shrink-0" />
                現調記録はまだありません
              </div>
            )}
          </section>

          {/* その他（優先度の低い情報はタブに畳む）: 協力会社 / 関連現場 / 将来フェーズ */}
          <section className="space-y-2.5">
            <SectionTitle>その他の情報</SectionTitle>
            <Tabs
              tabs={[
                {
                  id: "partners",
                  label: "協力会社",
                  count: site.partners.length,
                  content: admin ? (
                    <PartnerControl siteId={site.id} partners={site.partners} />
                  ) : site.partners.length > 0 ? (
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
                  ) : (
                    <p className="py-3 text-center text-sm text-ink-muted">協力会社の登録はありません</p>
                  ),
                },
                {
                  id: "related",
                  label: "関連現場",
                  count: related.length,
                  content: admin ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-ink-faint">同一住所・同一顧客の現場を紐づけます。</p>
                      <RelationControl siteId={site.id} related={related} candidates={relationCandidates} />
                    </div>
                  ) : related.length > 0 ? (
                    <div className="space-y-2">
                      {related.map((r) => (
                        <CardLink
                          key={r.relationId}
                          href={`/sites/${r.other.id}`}
                          className="flex items-center gap-3 p-3.5"
                        >
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
                  ) : (
                    <p className="flex items-center justify-center gap-1.5 py-3 text-sm text-ink-muted">
                      <Link2 className="h-4 w-4" />
                      関連現場はありません
                    </p>
                  ),
                },
                {
                  id: "future",
                  label: "将来フェーズ",
                  content: (
                    <div className="space-y-3">
                      {/* 金額・収支は会計情報のため最高管理者のみ閲覧できる */}
                      {superAdmin && (
                        <>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-ink-muted">
                            <Wallet className="h-4 w-4" />
                            金額・収支
                          </div>
                          <DataList>
                            <DataRow
                              label="請求ステータス"
                              value={
                                site.billingStatus
                                  ? labelOf(BILLING_STATUS_LABEL, site.billingStatus as BillingStatus)
                                  : null
                              }
                            />
                            <DataRow label="契約金額" value={null} />
                            <DataRow label="実行予算" value={null} />
                            <DataRow label="粗利" value={null} />
                          </DataList>
                        </>
                      )}
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
                        ※ これらは将来フェーズで入力・集計を有効化します（項目定義のみ）。
                      </p>
                    </div>
                  ),
                },
              ]}
            />
          </section>
        </div>
        {/* ===== /右レール ===== */}
      </div>
    </div>
  );

  // ───────────────── タブ③「日報」 ─────────────────
  const reportsPanel = (
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
              <Plus className="h-4 w-4" />
              日報を書く
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
          <LinkButton
            href={`/reports/new?siteId=${site.id}`}
            variant="outline"
            size="md"
            className="w-full"
          >
            <Plus className="h-4 w-4" />
            日報を書く
          </LinkButton>
        </>
      )}
    </section>
  );

  return (
    <div>
      <PageHeader
        title={site.name}
        subtitle={site.customer.name}
        backHref="/sites"
        right={
          /* 現場の修正は全ログインユーザー可（スタッフも現場情報を最新に保てるように） */
          <LinkButton
            href={`/sites/${site.id}/edit`}
            variant="outline"
            size="sm"
            aria-label="現場を修正"
          >
            <Pencil className="h-4 w-4" />
            <span className="hidden sm:inline">現場を修正</span>
          </LinkButton>
        }
      />
      <SearchParamToast />

      {/* 現場を開いたら必ず「連絡・メモ」から。基本情報は上部タブか横スワイプで見る */}
      <SiteDetailTabs
        defaultId="notes"
        tabs={[
          {
            id: "notes",
            label: "連絡・メモ",
            icon: <StickyNote className="h-4 w-4" />,
            count: openHandovers.length || memoCount,
            alert: openHandovers.length > 0,
            content: notesPanel,
          },
          { id: "info", label: "現場情報", icon: <Building2 className="h-4 w-4" />, content: infoPanel },
          {
            id: "reports",
            label: "日報",
            icon: <FileText className="h-4 w-4" />,
            count: reportCount,
            content: reportsPanel,
          },
        ]}
      />
    </div>
  );
}
