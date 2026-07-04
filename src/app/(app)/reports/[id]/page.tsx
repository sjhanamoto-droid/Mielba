import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Clock, Package, Truck, ClipboardList, StickyNote, Sparkles, MessageSquare,
  Pencil, ChevronRight, CalendarDays, Users, Printer, ArrowRightLeft, CircleParking,
} from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { LinkButton } from "@/components/ui/button";
import { PhotoGrid } from "@/components/photo-grid";
import { SearchParamToast } from "@/components/ui/toast";
import { CommentForm } from "@/features/reports/comment-form";
import { fmtDateWithDay, fmtDate, fmtDateTime, fmtYen, workHours } from "@/lib/utils";
import { REPORT_STATUS_LABEL, type ReportStatus } from "@/lib/constants";

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
      user: { select: { id: true, name: true, avatarColor: true } },
      materials: true,
      orders: true,
      nextProcesses: true,
      // base64（dataUrl/thumbUrl）はRSCペイロードに載せない（/api/photos/[id] で配信）
      photos: {
        select: { id: true, caption: true, kind: true, isVideo: true, width: true, height: true },
        orderBy: { createdAt: "asc" },
      },
      comments: {
        include: { user: { select: { name: true, avatarColor: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!report) notFound();

  const canEdit = report.userId === user.id || isAdmin(user);
  const submitted = report.status === "SUBMITTED";

  return (
    <div>
      <PageHeader
        title="日報・勤怠"
        subtitle={report.site.name}
        backHref={`/sites/${report.site.id}/reports`}
        right={
          <span className="flex items-center gap-1">
            <LinkButton href={`/reports/${report.id}/print`} variant="ghost" size="sm">
              <Printer className="h-4 w-4" />
              PDF・印刷
            </LinkButton>
            {canEdit && (
              <LinkButton href={`/reports/${report.id}/edit`} variant="ghost" size="sm">
                <Pencil className="h-4 w-4" />
                編集
              </LinkButton>
            )}
          </span>
        }
      />

      {/* 提出・保存成功のトースト（?toast=...） */}
      <SearchParamToast />

      <PageContainer>
        <div className="space-y-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
          {/* 右レール（メタ・メモ・コメント）。デスクトップは右、モバイルは従来通り上→下の順を維持 */}
          <aside className="space-y-4 lg:order-2 lg:col-span-1">
        {/* ヘッダーカード */}
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={report.user.name} color={report.user.avatarColor} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-bold text-ink">{report.user.name}</span>
                <Badge tone={submitted ? "active" : "warn"}>
                  {REPORT_STATUS_LABEL[report.status as ReportStatus]}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">{fmtDateWithDay(report.workDate)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-surface-subtle px-3 py-2.5 text-sm">
            <Clock className="h-4 w-4 text-ink-muted" />
            <span className="font-bold tnum text-ink">
              {report.startTime} – {report.endTime}
            </span>
            <span className="text-ink-faint">実働 {workHours(report.startTime, report.endTime)}</span>
          </div>

          {/* 駐車場代 */}
          {report.parkingFee != null && (
            <div className="flex items-center gap-2 rounded-xl bg-surface-subtle px-3 py-2.5 text-sm">
              <CircleParking className="h-4 w-4 text-ink-muted" />
              <span className="text-ink-soft">駐車場代</span>
              <span className="ml-auto font-bold tnum text-ink">{fmtYen(report.parkingFee)}</span>
            </div>
          )}

          <Link
            href={`/sites/${report.site.id}`}
            className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5 active:bg-surface-subtle"
          >
            <span className="truncate text-sm font-semibold text-brand-600">{report.site.name}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
          </Link>
        </Card>
          </aside>

          {/* 主要コンテンツ */}
          <div className="space-y-4 lg:order-1 lg:col-span-2">
        {/* 現場詳細 */}
        {report.detail && (
          <section className="space-y-2">
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

        {/* 使用材料 */}
        {report.materials.length > 0 && (
          <section className="space-y-2">
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

        {/* 材料発注 */}
        {report.orders.length > 0 && (
          <section className="space-y-2">
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
          <section className="space-y-2">
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
          <section className="space-y-2">
            <SectionTitle>
              <span className="flex items-center gap-1.5"><StickyNote className="h-4 w-4" />注意点メモ</span>
            </SectionTitle>
            <div className="alert-warn rounded-2xl p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.memo}</p>
            </div>
          </section>
        )}

        {/* 引き継ぎ事項（次に入る人への申し送り） */}
        {report.handover && (
          <section className="space-y-2">
            <SectionTitle>
              <span className="flex items-center gap-1.5"><ArrowRightLeft className="h-4 w-4" />引き継ぎ事項</span>
            </SectionTitle>
            <div className="alert-warn rounded-2xl p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.handover}</p>
              <p className="mt-1.5 text-xs opacity-80">
                提出時に現場の引き継ぎとして起票され、次の担当者が確認するまで表示されます。
              </p>
            </div>
          </section>
        )}

        {/* 写真 */}
        {report.photos.length > 0 && (
          <section className="space-y-2">
            <SectionTitle>写真・動画</SectionTitle>
            <PhotoGrid photos={report.photos} />
          </section>
        )}

        {/* コメント */}
        <section className="space-y-2">
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
                  <Avatar name={c.user.name} color={c.user.avatarColor} size="sm" />
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
