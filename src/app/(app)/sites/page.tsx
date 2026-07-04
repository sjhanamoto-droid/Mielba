import { Plus, HardHat, Search, ChevronDown } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { ChipBar, ChipLink } from "@/components/ui/chips";
import { SiteCard } from "@/components/site-card";
import { EmptyState, Fab } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";
import { LinkButton } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";
import { SITE_STATUS_LABEL, type SiteStatus } from "@/lib/constants";

const PAGE_SIZE = 20;

const STATUS_FILTERS: { value: SiteStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "すべて" },
  { value: "SURVEY", label: SITE_STATUS_LABEL.SURVEY },
  { value: "ACTIVE", label: SITE_STATUS_LABEL.ACTIVE },
  { value: "PAST", label: SITE_STATUS_LABEL.PAST },
];

function buildHref(params: {
  status?: string;
  customer?: string;
  q?: string;
  page?: number;
}): string {
  const sp = new URLSearchParams();
  if (params.status && params.status !== "ALL") sp.set("status", params.status);
  if (params.customer) sp.set("customer", params.customer);
  if (params.q) sp.set("q", params.q);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/sites?${qs}` : "/sites";
}

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; customer?: string; q?: string; page?: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const { status, customer, q, page } = await searchParams;

  const statusValue = status && ["SURVEY", "ACTIVE", "PAST"].includes(status) ? status : undefined;
  // 「さらに表示」方式のページネーション（page * 20 件まで表示）
  const pageNum = Math.max(1, Math.min(500, Number.parseInt(page ?? "1", 10) || 1));
  const shown = pageNum * PAGE_SIZE;

  const where: Prisma.SiteWhereInput = {};
  if (statusValue) where.siteStatus = statusValue;
  if (customer) where.customerId = customer;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { address: { contains: q } },
      { projectCode: { contains: q } },
    ];
  }
  // スタッフは割当現場のみ
  if (!admin) where.assignments = { some: { userId: user.id } };

  const [sitesRaw, customers] = await Promise.all([
    db.site.findMany({
      where,
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: shown + 1, // 「さらに表示」の有無を判定するため1件多く取得
    }),
    admin
      ? db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const hasMore = sitesRaw.length > shown;
  const sites = hasMore ? sitesRaw.slice(0, shown) : sitesRaw;

  const activeCustomer = customer
    ? customers.find((c) => c.id === customer)
    : undefined;

  return (
    <div>
      <PageHeader title="現場">
        <div className="space-y-2.5">
          {/* 検索 */}
          <form action="/sites" className="relative">
            {statusValue && <input type="hidden" name="status" value={statusValue} />}
            {customer && <input type="hidden" name="customer" value={customer} />}
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="案件名・住所・コードで検索"
              className="h-11 pl-10"
            />
          </form>

          {/* ステータスフィルタ */}
          <ChipBar>
            {STATUS_FILTERS.map((f) => (
              <ChipLink
                key={f.value}
                href={buildHref({ status: f.value, customer, q })}
                active={f.value === "ALL" ? !statusValue : statusValue === f.value}
              >
                {f.label}
              </ChipLink>
            ))}
          </ChipBar>

          {/* 同一顧客フィルタ（管理者・顧客選択時に解除チップ） */}
          {admin && activeCustomer && (
            <ChipBar>
              <ChipLink href={buildHref({ status: statusValue, q })} active={false}>
                顧客フィルタを解除
              </ChipLink>
              <ChipLink href={buildHref({ status: statusValue, customer, q })} active>
                {activeCustomer.name}
              </ChipLink>
            </ChipBar>
          )}
        </div>
      </PageHeader>

      <PageContainer>
        <SearchParamToast />
        {sites.length === 0 ? (
          <EmptyState
            icon={<HardHat className="h-6 w-6" />}
            title="該当する現場がありません"
            description={
              admin
                ? "条件を変えるか、新しい現場を作成してください"
                : "管理者が現場に割り当てると表示されます"
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>a]:h-full">
              {sites.map((s) => (
                <SiteCard key={s.id} site={s} />
              ))}
            </div>
            {hasMore && (
              <LinkButton
                href={buildHref({ status: statusValue, customer, q, page: pageNum + 1 })}
                variant="outline"
                size="md"
                className="mt-4 w-full"
                scroll={false}
              >
                <ChevronDown className="h-4 w-4" />
                さらに表示
              </LinkButton>
            )}
          </>
        )}
      </PageContainer>

      {admin && <Fab href="/sites/new" label="現場を作成" icon={<Plus className="h-5 w-5" />} />}
    </div>
  );
}
