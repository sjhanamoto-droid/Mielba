import { notFound } from "next/navigation";
import { Pencil, Building2, ChevronDown, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, DataList, DataRow, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";
import { SiteCard } from "@/components/site-card";
import {
  REGISTRATION_TYPE_LABEL,
  TRADE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  labelOf,
} from "@/lib/constants";
import { cn, fmtDate, mapSearchUrl } from "@/lib/utils";

/**
 * 顧客詳細（v0.4 簡素化）。
 * 名前・メモ・関連現場一覧を中心に表示し、その他の項目は「詳細情報」の折りたたみに退避。
 * 担当者（ContactPerson）のUIは撤去（データ・モデルは保持）。
 */
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const { id } = await params;

  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      sites: {
        orderBy: { updatedAt: "desc" },
        include: {
          customer: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      },
    },
  });
  if (!customer) notFound();

  // 詳細情報に値が1つでもあるか（無ければ折りたたみ自体を出さない）
  const detailValues = [
    customer.corporateNumber,
    customer.invoiceNumber,
    customer.industry,
    customer.capitalScale,
    customer.firstTradeDate,
    customer.headOfficeAddress,
    customer.billingAddress,
    customer.closingDay,
    customer.paymentDueTerm,
    customer.paymentMethod,
    customer.feeBearer,
  ];
  const hasDetails = detailValues.some((v) => v !== null && v !== undefined && v !== "");

  return (
    <div>
      <PageHeader
        title={customer.name}
        backHref="/customers"
        right={
          admin ? (
            <LinkButton href={`/customers/${id}/edit`} variant="ghost" size="sm">
              <Pencil className="h-4 w-4" />
              編集
            </LinkButton>
          ) : undefined
        }
      />

      <PageContainer size="narrow">
        <SearchParamToast />
        <div className="space-y-5">
          {/* 概要カード（現場詳細と同じ調子）：現場数・取引状態・会社名・メモ・本社住所 */}
          <Card className="p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-lg font-bold tnum text-ink">現場 {customer.sites.length}件</p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-sm font-bold",
                  customer.tradeStatus === "SUSPENDED"
                    ? "bg-surface-sunken text-ink-muted"
                    : "bg-brand-50 text-brand-700",
                )}
              >
                {labelOf(TRADE_STATUS_LABEL, customer.tradeStatus)}
              </span>
            </div>
            <h2
              className={cn(
                "mt-1.5 break-words font-bold leading-tight text-ink",
                customer.name.length > 10 ? "text-2xl" : "text-[1.875rem]",
              )}
            >
              {customer.name}
            </h2>
            {customer.memo && (
              <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-soft">
                {customer.memo}
              </p>
            )}
            {customer.headOfficeAddress && (
              <div className="mt-3 flex items-center gap-3 text-sm text-ink-muted">
                <a
                  href={mapSearchUrl(customer.headOfficeAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-1.5 font-medium text-brand-600"
                >
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{customer.headOfficeAddress}</span>
                </a>
              </div>
            )}
          </Card>

          {/* この顧客の現場 */}
          <section className="space-y-2.5">
            <SectionTitle
              action={
                <span className="text-sm font-semibold text-ink-muted tnum">
                  {customer.sites.length}件
                </span>
              }
            >
              この顧客の現場
            </SectionTitle>
            {customer.sites.length === 0 ? (
              <EmptyState
                icon={<Building2 className="h-6 w-6" />}
                title="現場がありません"
                description="この顧客に紐づく現場はまだ登録されていません"
              />
            ) : (
              <div className="space-y-2.5">
                {customer.sites.map((s) => (
                  <SiteCard key={s.id} site={{ ...s, createdByName: s.createdBy?.name }} />
                ))}
              </div>
            )}
          </section>

          {/* 詳細情報（折りたたみ） */}
          {hasDetails && (
            <details className="card group">
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-lg font-bold text-ink [&::-webkit-details-marker]:hidden">
                詳細情報
                <ChevronDown className="h-5 w-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-line px-4 py-1">
                <DataList>
                  <DataRow label="法人番号" value={customer.corporateNumber} />
                  <DataRow label="インボイス番号" value={customer.invoiceNumber} />
                  <DataRow label="業種" value={customer.industry} />
                  <DataRow label="資本金規模" value={customer.capitalScale} />
                  <DataRow
                    label="登録区分"
                    value={labelOf(REGISTRATION_TYPE_LABEL, customer.registrationType)}
                  />
                  <DataRow
                    label="取引ステータス"
                    value={labelOf(TRADE_STATUS_LABEL, customer.tradeStatus)}
                  />
                  <DataRow
                    label="初回取引日"
                    value={customer.firstTradeDate ? fmtDate(customer.firstTradeDate) : null}
                  />
                  <DataRow
                    label="本社住所"
                    value={
                      customer.headOfficeAddress ? (
                        <span className="whitespace-pre-wrap">{customer.headOfficeAddress}</span>
                      ) : null
                    }
                  />
                  <DataRow
                    label="請求書送付先"
                    value={
                      customer.billingAddress ? (
                        <span className="whitespace-pre-wrap">{customer.billingAddress}</span>
                      ) : null
                    }
                  />
                  <DataRow label="締め日" value={customer.closingDay} />
                  <DataRow label="支払期日" value={customer.paymentDueTerm} />
                  <DataRow
                    label="支払方法"
                    value={
                      customer.paymentMethod
                        ? labelOf(PAYMENT_METHOD_LABEL, customer.paymentMethod)
                        : null
                    }
                  />
                  <DataRow label="手数料負担" value={customer.feeBearer} />
                </DataList>
              </div>
            </details>
          )}
        </div>
      </PageContainer>
    </div>
  );
}
