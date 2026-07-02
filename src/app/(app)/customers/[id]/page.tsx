import { notFound } from "next/navigation";
import {
  Pencil, Phone, Mail, Building2, UserPlus, ArrowRightLeft, Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, DataList, DataRow, SectionTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { SiteCard } from "@/components/site-card";
import { addContact, setContactInactive } from "@/features/customers/actions";
import {
  REGISTRATION_TYPE_LABEL,
  TRADE_STATUS_LABEL,
  TRADE_STATUS_COLOR,
  PAYMENT_METHOD_LABEL,
  CONTACT_TYPE_LABEL,
  labelOf,
  type RegistrationType,
  type TradeStatus,
  type ContactType,
} from "@/lib/constants";
import { fmtDate } from "@/lib/utils";

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
      contacts: { orderBy: { createdAt: "asc" } },
      sites: {
        orderBy: { updatedAt: "desc" },
        include: { customer: { select: { name: true } } },
      },
    },
  });
  if (!customer) notFound();

  const reg = customer.registrationType as RegistrationType;
  const trade = customer.tradeStatus as TradeStatus;
  const activeContacts = customer.contacts.filter((c) => c.isActive);
  const pastContacts = customer.contacts.filter((c) => !c.isActive);
  const hasBilling =
    customer.closingDay ||
    customer.paymentDueTerm ||
    customer.paymentMethod ||
    customer.feeBearer;

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
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="brand">
            {REGISTRATION_TYPE_LABEL[reg] ?? customer.registrationType}
          </Badge>
          <Badge tone={TRADE_STATUS_COLOR[trade] as "info" | "active" | "past"}>
            {TRADE_STATUS_LABEL[trade] ?? customer.tradeStatus}
          </Badge>
        </div>
      </PageHeader>

      <PageContainer className="lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
        {/* 左カラム：基本情報・住所・入金請求条件 */}
        <div className="space-y-5 lg:col-span-2">
        {/* 基本情報 */}
        <section className="space-y-2.5">
          <SectionTitle>基本情報</SectionTitle>
          <Card className="px-4 py-1">
            <DataList>
              <DataRow label="会社名" value={customer.name} />
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
            </DataList>
          </Card>
        </section>

        {/* 住所 */}
        <section className="space-y-2.5">
          <SectionTitle>住所</SectionTitle>
          <Card className="px-4 py-1">
            <DataList>
              <DataRow
                label="本社"
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
            </DataList>
          </Card>
        </section>

        {/* 入金・請求条件 */}
        {hasBilling && (
          <section className="space-y-2.5">
            <SectionTitle>入金・請求条件</SectionTitle>
            <Card className="px-4 py-1">
              <DataList>
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
            </Card>
          </section>
        )}
        </div>

        {/* 右レール：担当者・メモ・関連現場 */}
        <div className="space-y-5 lg:col-span-1">
        {/* 担当者 */}
        <section className="space-y-2.5">
          <SectionTitle>担当者（現役 {activeContacts.length}名）</SectionTitle>
          {activeContacts.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
              現役の担当者が登録されていません
            </div>
          ) : (
            <div className="space-y-2">
              {activeContacts.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">
                          {labelOf(CONTACT_TYPE_LABEL, c.contactType as ContactType)}
                        </Badge>
                        <span className="text-sm font-bold text-ink">{c.name}</span>
                      </div>
                      {(c.department || c.position) && (
                        <p className="text-xs text-ink-muted">
                          {[c.department, c.position].filter(Boolean).join(" / ")}
                        </p>
                      )}
                      <div className="mt-2 space-y-1">
                        {c.phone && (
                          <a
                            href={`tel:${c.phone}`}
                            className="flex items-center gap-1.5 text-sm font-medium text-brand-600"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {c.phone}
                          </a>
                        )}
                        {c.mobile && (
                          <a
                            href={`tel:${c.mobile}`}
                            className="flex items-center gap-1.5 text-sm font-medium text-brand-600"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {c.mobile}
                            <span className="text-xs font-normal text-ink-faint">携帯</span>
                          </a>
                        )}
                        {c.email && (
                          <a
                            href={`mailto:${c.email}`}
                            className="flex items-center gap-1.5 break-all text-sm font-medium text-brand-600"
                          >
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            {c.email}
                          </a>
                        )}
                      </div>
                      {c.note && (
                        <p className="mt-2 whitespace-pre-wrap text-xs text-ink-soft">{c.note}</p>
                      )}
                    </div>
                    {admin && (
                      <form action={setContactInactive} className="shrink-0">
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className={buttonClass({ variant: "outline", size: "sm" })}
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          異動
                        </button>
                      </form>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* 担当者追加（管理者のみ） */}
          {admin && (
            <Card className="p-4">
              <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink-soft">
                <UserPlus className="h-4 w-4" />
                担当者を追加
              </p>
              <form action={addContact} className="space-y-3">
                <input type="hidden" name="customerId" value={customer.id} />
                <Field label="担当者名" required htmlFor="contact-name">
                  <Input id="contact-name" name="name" placeholder="山田 太郎" required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="部署" htmlFor="contact-department">
                    <Input id="contact-department" name="department" placeholder="工事部" />
                  </Field>
                  <Field label="役職" htmlFor="contact-position">
                    <Input id="contact-position" name="position" placeholder="課長" />
                  </Field>
                </div>
                <Field label="区分" htmlFor="contact-type">
                  <Select id="contact-type" name="contactType" defaultValue="SITE">
                    {(Object.keys(CONTACT_TYPE_LABEL) as ContactType[]).map((k) => (
                      <option key={k} value={k}>
                        {CONTACT_TYPE_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="電話" htmlFor="contact-phone">
                    <Input id="contact-phone" name="phone" type="tel" inputMode="tel" placeholder="03-1234-5678" />
                  </Field>
                  <Field label="携帯" htmlFor="contact-mobile">
                    <Input id="contact-mobile" name="mobile" type="tel" inputMode="tel" placeholder="090-1234-5678" />
                  </Field>
                </div>
                <Field label="メール" htmlFor="contact-email">
                  <Input id="contact-email" name="email" type="email" inputMode="email" placeholder="taro@example.com" />
                </Field>
                <Field label="メモ" htmlFor="contact-note">
                  <Input id="contact-note" name="note" placeholder="補足など" />
                </Field>
                <button
                  type="submit"
                  className={buttonClass({ variant: "secondary", className: "w-full" })}
                >
                  <UserPlus className="h-4 w-4" />
                  担当者を追加
                </button>
              </form>
            </Card>
          )}

          {/* 異動・過去担当 */}
          {pastContacts.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="px-1 text-xs font-semibold text-ink-faint">異動・過去担当</p>
              {pastContacts.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-line bg-surface-subtle px-4 py-3 text-ink-faint"
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-xs">
                      {labelOf(CONTACT_TYPE_LABEL, c.contactType as ContactType)}
                    </span>
                    {(c.department || c.position) && (
                      <span className="text-xs">
                        {[c.department, c.position].filter(Boolean).join(" / ")}
                      </span>
                    )}
                  </div>
                  {c.activeTo && (
                    <p className="mt-0.5 text-xs">〜 {fmtDate(c.activeTo)} まで</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* メモ */}
        {customer.memo && (
          <section className="space-y-2.5">
            <SectionTitle>メモ</SectionTitle>
            <Card className="p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {customer.memo}
              </p>
            </Card>
          </section>
        )}

        {/* この顧客の現場 */}
        <section className="space-y-2.5">
          <SectionTitle
            action={
              <span className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
                <Users className="h-3.5 w-3.5" />
                {customer.sites.length} 件
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
                <SiteCard key={s.id} site={s} />
              ))}
            </div>
          )}
        </section>
        </div>
      </PageContainer>
    </div>
  );
}
