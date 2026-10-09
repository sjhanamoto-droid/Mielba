import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Clock, Package, Truck, ClipboardList, StickyNote, Sparkles, MessageSquare,
  Pencil, ChevronRight, CalendarDays, Users, Printer, ArrowRightLeft, CircleParking, Wallet,
  TrainFront, Boxes, HardHat,
} from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { PhotoGrid } from "@/components/photo-grid";
import { SearchParamToast } from "@/components/ui/toast";
import { CommentForm } from "@/features/reports/comment-form";
import { DeleteReportButton } from "@/features/reports/delete-report-button";
import { fmtDateWithDay, fmtDate, fmtDateTime, fmtYen, workHours } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  REPORT_STATUS_LABEL,
  ABSENCE_REASON_LABEL,
  type ReportStatus,
  type AbsenceReason,
} from "@/lib/constants";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const report = await db.dailyReport.findUnique({
    where: { id },
    include: {
      site: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, avatarColor: true, avatarImage: true } },
      materials: true,
      stockUses: true,
      expenses: { orderBy: { sortOrder: "asc" } },
      orders: true,
      nextProcesses: true,
      // base64（dataUrl/thumbUrl）はRSCペイロードに載せない（/api/photos/[id] で配信）
      photos: {
        select: { id: true, caption: true, kind: true, isVideo: true, width: true, height: true },
        orderBy: { createdAt: "asc" },
      },
      comments: {
        include: { user: { select: { name: true, avatarColor: true, avatarImage: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!report) notFound();

  const canEdit = report.userId === user.id || isAdmin(user);
  const submitted = report.status === "SUBMITTED";

  // 経費（駐車場代＋電車賃＋その他の経費）。合計は全ての和。
  const hasExpenses =
    report.parkingFee != null || report.trainFare != null || report.expenses.length > 0;
  const expenseTotal =
    (report.parkingFee ?? 0) +
    (report.trainFare ?? 0) +
    report.expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageHeader
        title="日報・勤怠"
        subtitle={report.site.name}
        backHref={`/sites/${report.site.id}/reports`}
        right={
          <LinkButton href={`/reports/${report.id}/print`} variant="ghost" size="sm">
            <Printer className="h-4 w-4" />
            PDF・印刷
          </LinkButton>
        }
      />

      {/* 提出・保存成功のトースト（?toast=...） */}
      <SearchParamToast />

      <PageContainer>
        <div className="space-y-5 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
          {/* 右レール（概要カード）。デスクトップは右、モバイルは先頭 */}
          <aside className="space-y-4 lg:order-2 lg:col-span-1">
        {/* 概要カード（現場詳細と同じ調子：日付と状態 → 現場名を大きく → 時間・担当 → 次の操作） */}
        <div className="card p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-bold tnum text-ink">{fmtDateWithDay(report.workDate)}</p>
            <span
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-sm font-bold",
                submitted
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
              )}
            >
              {REPORT_STATUS_LABEL[report.status as ReportStatus]}
            </span>
          </div>
          <h1
            className={cn(
              "mt-1.5 break-words font-bold leading-tight text-ink",
              report.site.name.length > 10 ? "text-2xl" : "text-[1.875rem]",
            )}
          >
            {report.site.name}
          </h1>
          {report.absent ? (
            // 現場不参加：時間は持たない（稼働に入らない）
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1 text-sm font-bold text-ink-soft">
              現場不参加
              {report.absenceReason &&
                `・${ABSENCE_REASON_LABEL[report.absenceReason as AbsenceReason] ?? report.absenceReason}`}
              {report.absenceNote && `（${report.absenceNote}）`}
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-[15px] text-ink-soft">
              <Clock className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              <span className="font-semibold tnum text-ink">
                {report.startTime} – {report.endTime}
              </span>
              <span>実働 {workHours(report.startTime, report.endTime)}</span>
            </p>
          )}

          {/* 次回の作業日（メインの人が提出時に入れたもの） */}
          {report.nextWorkChoice && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft">
              <CalendarDays className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              次回の作業日：
              <span className="font-semibold text-ink">
                {report.nextWorkChoice === "DATE" && report.nextWorkDate
                  ? fmtDateWithDay(report.nextWorkDate)
                  : report.nextWorkChoice === "UNDECIDED"
                    ? `未定${report.nextCheckDate ? `（${fmtDateWithDay(report.nextCheckDate)}までに確認）` : ""}`
                    : "次回なし"}
              </span>
            </p>
          )}
          <div className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
            <Avatar name={report.user.name} color={report.user.avatarColor} image={report.user.avatarImage} size="sm" />
            <span className="min-w-0 truncate">{report.user.name}</span>
          </div>

          {canEdit && (
            <LinkButton href={`/reports/${report.id}/edit`} size="lg" className="relative mt-4 w-full">
              <Pencil className="h-5 w-5" aria-hidden />
              編集する
              <ChevronRight className="absolute right-4 h-5 w-5" aria-hidden />
            </LinkButton>
          )}
          <Link
            href={`/sites/${report.site.id}`}
            className={buttonClass({
              variant: "outline",
              className: cn("w-full border-brand-200 text-brand-700 dark:border-brand-800", canEdit ? "mt-2" : "mt-4"),
            })}
          >
            <HardHat className="h-[18px] w-[18px]" aria-hidden />
            現場を見る
          </Link>
        </div>
        {isAdmin(user) && (
          <DeleteReportButton
            reportId={report.id}
            label={`${fmtDateWithDay(report.workDate)}・${report.site.name}・${report.user.name}`}
          />
        )}
          </aside>

          {/* 主要コンテンツ */}
          <div className="space-y-5 lg:order-1 lg:col-span-2">
        {/* 引き継ぎ事項（次に入る人への申し送り）。日報を開いたとき概要カードのすぐ下に必ず出す。
            内容が無くても枠は出す（「無い」のか「見落とし」なのかを判断できるように）。 */}
        <section className="space-y-2.5">
          <SectionTitle
            action={
              canEdit ? (
                <Link
                  href={`/reports/${report.id}/edit#handover`}
                  className="text-sm font-semibold text-brand-600"
                >
                  {report.handover ? "編集" : "追加"}
                </Link>
              ) : undefined
            }
          >
            <span className="flex items-center gap-1.5">
              <ArrowRightLeft className="h-4 w-4" />
              引き継ぎ事項
            </span>
          </SectionTitle>

          {report.handover ? (
            <div className="alert-warn rounded-2xl p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.handover}</p>
              <p className="mt-1.5 text-xs opacity-80">
                提出時に現場の引き継ぎとして起票され、次の担当者が確認するまで表示されます。
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center">
              <p className="text-sm font-medium text-ink-muted">
                {report.handoverNone ? "引き継ぎなし" : "引き継ぎ事項はありません"}
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                {report.handoverNone
                  ? "担当者が「引き継ぎなし」と記録しています。"
                  : "次に入る人への申し送りは記録されていません。"}
              </p>
            </div>
          )}
        </section>

        {/* 現場詳細 */}
        {report.detail && (
          <section className="space-y-2.5">
            <SectionTitle>現場詳細</SectionTitle>
            <Card className="p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{report.detail}</p>
            </Card>
          </section>
        )}

        {/* AI要約 */}
        {report.aiSummary && (
          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-brand-700">
              <Sparkles className="h-4 w-4" />
              AI要約
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {report.aiSummary}
            </p>
          </div>
        )}

        {/* 作業時間の変更理由（8:00-17:00 以外のとき） */}
        {report.timeChangeReason && (
          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />作業時間の変更理由</span>
            </SectionTitle>
            <Card className="p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{report.timeChangeReason}</p>
            </Card>
          </section>
        )}

        {/* 使用材料 */}
        {report.materials.length > 0 && (
          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-center gap-1.5"><Package className="h-4 w-4" />使用材料</span>
            </SectionTitle>
            <Card className="divide-y divide-line p-0">
              {report.materials.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="truncate text-sm font-medium text-ink">{m.name}</span>
                  {(m.quantity || m.unit) && (
                    <span className="shrink-0 text-sm tnum text-ink-soft">
                      {m.quantity}
                      {m.unit && <span className="text-ink-muted"> {m.unit}</span>}
                    </span>
                  )}
                </div>
              ))}
            </Card>
          </section>
        )}

        {/* 在庫材料の使用（あり/なし＋内容） */}
        {report.stockUsed != null && (
          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-center gap-1.5"><Boxes className="h-4 w-4" />在庫材料の使用</span>
            </SectionTitle>
            <Card className="p-4">
              {report.stockUsed ? (
                <>
                  <Badge tone="active">使用あり</Badge>
                  {report.stockUses.length > 0 && (
                    <div className="mt-2 divide-y divide-line rounded-xl border border-line">
                      {report.stockUses.map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="truncate text-sm font-medium text-ink">{m.name}</span>
                          {(m.quantity || m.unit) && (
                            <span className="shrink-0 text-sm tnum text-ink-soft">
                              {m.quantity}
                              {m.unit && <span className="text-ink-muted"> {m.unit}</span>}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {report.stockNote && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                      {report.stockNote}
                    </p>
                  )}
                </>
              ) : (
                <Badge tone="neutral">使用なし</Badge>
              )}
            </Card>
          </section>
        )}

        {/* 経費（駐車場代＋電車賃＋その他） */}
        {hasExpenses && (
          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-center gap-1.5"><Wallet className="h-4 w-4" />経費</span>
            </SectionTitle>
            <Card className="p-0">
              <div className="divide-y divide-line">
                {report.parkingFee != null && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <CircleParking className="h-4 w-4 text-ink-muted" />
                      駐車場代
                      {report.parkingFee === 0 && <span className="text-xs text-ink-faint">（なし）</span>}
                    </span>
                    <span className="shrink-0 text-sm tnum text-ink-soft">{fmtYen(report.parkingFee)}</span>
                  </div>
                )}
                {report.trainFare != null && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <TrainFront className="h-4 w-4 text-ink-muted" />
                      電車賃
                      {report.trainFare === 0 && <span className="text-xs text-ink-faint">（なし）</span>}
                    </span>
                    <span className="shrink-0 text-sm tnum text-ink-soft">{fmtYen(report.trainFare)}</span>
                  </div>
                )}
                {report.expenses.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="truncate text-sm font-medium text-ink">{e.label}</span>
                    <span className="shrink-0 text-sm tnum text-ink-soft">{fmtYen(e.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-subtle px-4 py-3">
                <span className="text-sm font-semibold text-ink-soft">合計</span>
                <span className="shrink-0 text-sm font-bold tnum text-ink">{fmtYen(expenseTotal)}</span>
              </div>
            </Card>
          </section>
        )}

        {/* 材料発注 */}
        {report.orders.length > 0 && (
          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-center gap-1.5"><Truck className="h-4 w-4" />材料発注</span>
            </SectionTitle>
            <Card className="divide-y divide-line p-0">
              {report.orders.map((o) => (
                <div key={o.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-ink">{o.name}</span>
                    {o.quantity && <span className="shrink-0 text-sm tnum text-ink-soft">{o.quantity}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                    {o.supplier && <span>仕入先: {o.supplier}</span>}
                    {o.deliveryDate && (
                      <span className="flex items-center gap-1 font-medium text-accent-600">
                        <CalendarDays className="h-3.5 w-3.5" />
                        配達 {fmtDate(o.deliveryDate)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}

        {/* 次回工程打合せ */}
        {report.nextProcesses.length > 0 && (
          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-center gap-1.5"><ClipboardList className="h-4 w-4" />次回工程打合せ</span>
            </SectionTitle>
            <Card className="divide-y divide-line p-0">
              {report.nextProcesses.map((p) => (
                <div key={p.id} className="px-4 py-3">
                  {p.content && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{p.content}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                    {p.vendors && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {p.vendors}
                      </span>
                    )}
                    {p.supplyDeliveryDate && (
                      <span className="flex items-center gap-1 font-medium text-violet-600">
                        <CalendarDays className="h-3.5 w-3.5" />
                        支給品納品 {fmtDate(p.supplyDeliveryDate)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}

        {/* 注意点メモ */}
        {report.memo && (
          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-center gap-1.5"><StickyNote className="h-4 w-4" />注意点メモ</span>
            </SectionTitle>
            <div className="alert-warn rounded-2xl p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.memo}</p>
            </div>
          </section>
        )}

        {/* 写真 */}
        {report.photos.length > 0 && (
          <section className="space-y-2.5">
            <SectionTitle>写真・動画</SectionTitle>
            <PhotoGrid photos={report.photos} />
          </section>
        )}

        {/* コメント */}
        <section className="space-y-2.5">
          <SectionTitle>
            <span className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              コメント {report.comments.length > 0 && `(${report.comments.length})`}
            </span>
          </SectionTitle>

          {report.comments.length > 0 && (
            <div className="space-y-2.5">
              {report.comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <Avatar name={c.user.name} color={c.user.avatarColor} image={c.user.avatarImage} size="sm" />
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-line bg-surface px-3 py-2">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-xs font-bold text-ink">{c.user.name}</span>
                      <span className="shrink-0 text-[11px] text-ink-faint">{fmtDateTime(c.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                      {c.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <CommentForm reportId={report.id} />
        </section>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
