import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Pencil, Building2, MapPin, KeyRound, Users2, HardHat, CalendarClock,
  FileText, ClipboardList, Plus, ChevronRight, Truck, PackageCheck,
  ClipboardCheck, Wallet, ScrollText, Phone, ArrowRight,
} from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, CardLink, SectionTitle, DataList, DataRow } from "@/components/ui/card";
import { Badge, SiteStatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { LinkButton } from "@/components/ui/button";
import { ProgressBar } from "@/components/site-card";
import { ReportCard } from "@/components/report-card";
import { TodoItem } from "@/components/todo-item";
import { EmptyState } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";
import { createTodo } from "@/features/todos/actions";
import { SiteStatusControl } from "@/features/sites/site-status-control";
import { AssignControl } from "@/features/sites/assign-control";
import { RelationControl } from "@/features/sites/relation-control";
import { PartnerControl } from "@/features/sites/partner-control";
import { fmtDate, fmtMonthDay } from "@/lib/utils";
import {
  PROJECT_TYPE_LABEL,
  PROJECT_STATUS_LABEL,
  BILLING_STATUS_LABEL,
  EVENT_SOURCE_LABEL,
  EVENT_SOURCE_COLOR,
  labelOf,
  type ProjectType,
  type ProjectStatus,
  type BillingStatus,
  type EventSource,
} from "@/lib/constants";

// <form action> は void 返却が必要なため createTodo を薄くラップ
async function addSiteTodo(formData: FormData) {
  "use server";
  await createTodo(formData);
}

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const { id } = await params;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const site = await db.site.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      survey: { select: { id: true, address: true, situationMemo: true, surveyedAt: true } },
      partners: true,
      assignments: { include: { user: { select: { id: true, name: true, avatarColor: true } } } },
      reports: {
        include: {
          user: { select: { name: true, avatarColor: true } },
          _count: { select: { photos: true, comments: true, materials: true } },
        },
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        take: 3,
      },
      events: {
        where: { date: { gte: now } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 6,
      },
      todos: {
        include: {
          assignee: { select: { name: true } },
          site: { select: { id: true, name: true } },
        },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      },
      relationsA: { include: { siteB: { select: { id: true, name: true, address: true, siteStatus: true } } } },
      relationsB: { include: { siteA: { select: { id: true, name: true, address: true, siteStatus: true } } } },
    },
  });

  if (!site) notFound();

  // 認可: 管理者以外かつ未割当の現場は 404（id 直打ち閲覧の防止）
  if (!admin && !site.assignments.some((a) => a.user.id === user.id)) {
    notFound();
  }

  const reportCount = await db.dailyReport.count({ where: { siteId: site.id } });

  // 関連現場を双方向から集約
  const related = [
    ...site.relationsA.map((r) => ({ relationId: r.id, note: r.note, other: r.siteB })),
    ...site.relationsB.map((r) => ({ relationId: r.id, note: r.note, other: r.siteA })),
  ];

  // 管理者向けの候補データ（割当スタッフ・関連現場候補）
  let assignCandidates: { id: string; name: string; avatarColor: string }[] = [];
  let relationCandidates: { id: string; name: string; address: string | null }[] = [];
  if (admin) {
    assignCandidates = await db.user.findMany({
      where: { active: true },
      select: { id: true, name: true, avatarColor: true },
      orderBy: { name: "asc" },
    });

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
  const assignedIds = site.assignments.map((a) => a.user.id);

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
       <div className="space-y-5">
        {/* ステータス */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <SiteStatusBadge status={site.siteStatus} />
            <Badge tone="brand">{projectStatus}</Badge>
            <Badge tone="neutral">{projectType}</Badge>
          </div>
          {admin && (
            <Card className="p-4">
              <SiteStatusControl siteId={site.id} status={site.siteStatus} />
            </Card>
          )}
        </div>

        {/* === PC: 左メイン(2/3) + 右レール(1/3) の2カラム。スマホは縦積み === */}
        <div className="lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
         {/* ===== メイン列 ===== */}
         <div className="space-y-5 lg:col-span-2">

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

        {/* ④ 体制 */}
        <section className="space-y-2.5">
          <SectionTitle>体制</SectionTitle>
          <Card className="px-4">
            <DataList>
              <DataRow label="自社担当部署" value={site.departmentInCharge} />
              <DataRow label="現場責任者" value={site.siteManager} />
              <DataRow label="営業担当" value={site.salesRep} />
            </DataList>
          </Card>

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
                        <span className="ml-auto flex items-center gap-0.5 text-xs text-ink-muted">
                          <Phone className="h-3 w-3" />
                          {p.contact}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )
          )}

          {/* 職人割当 */}
          <Card className="space-y-2.5 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
              <Users2 className="h-4 w-4" />
              職人割当
            </div>
            {site.assignments.length === 0 ? (
              <p className="text-sm text-ink-muted">割り当てられた職人はいません</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {site.assignments.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-1.5 rounded-full bg-surface-sunken py-1 pl-1 pr-3"
                  >
                    <Avatar name={a.user.name} color={a.user.avatarColor} size="sm" />
                    <span className="text-sm font-medium text-ink">{a.user.name}</span>
                  </span>
                ))}
              </div>
            )}
            {admin && (
              <div className="border-t border-line pt-2.5">
                <p className="mb-2 text-xs font-semibold text-ink-muted">割当の追加・解除</p>
                <AssignControl
                  siteId={site.id}
                  candidates={assignCandidates}
                  assignedIds={assignedIds}
                />
              </div>
            )}
          </Card>
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
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-ink-muted">
                <span>進捗率</span>
                <span className="tnum text-ink-soft">{site.progressRate}%</span>
              </div>
              <ProgressBar value={site.progressRate} />
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

        {/* ⑨ TODO */}
        <section className="space-y-2.5">
          <SectionTitle>この現場のTODO</SectionTitle>
          {site.todos.length > 0 && (
            <div className="space-y-2">
              {site.todos.map((t) => (
                <TodoItem key={t.id} todo={t} showSite={false} />
              ))}
            </div>
          )}
          {/* インライン追加フォーム */}
          <form action={addSiteTodo} className="flex items-center gap-2">
            <input type="hidden" name="siteId" value={site.id} />
            <input type="hidden" name="scope" value="SITE" />
            <Input
              name="title"
              placeholder="TODOを追加…"
              className="h-11 flex-1"
              required
            />
            <button
              type="submit"
              aria-label="TODOを追加"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white active:scale-95"
            >
              <Plus className="h-5 w-5" />
            </button>
          </form>
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
