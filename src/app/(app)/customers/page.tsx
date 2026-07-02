import { Search, Plus, Building2, MapPin, Users, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CardLink } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Fab, EmptyState } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";
import {
  REGISTRATION_TYPE_LABEL,
  TRADE_STATUS_LABEL,
  TRADE_STATUS_COLOR,
  type RegistrationType,
  type TradeStatus,
} from "@/lib/constants";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const customers = await db.customer.findMany({
    where: query ? { name: { contains: query } } : undefined,
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          sites: true,
          contacts: { where: { isActive: true } },
        },
      },
    },
  });

  return (
    <div>
      <PageHeader title="顧客" subtitle="元請企業マスター">
        <form action="/customers" className="relative md:max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            name="q"
            type="search"
            defaultValue={query}
            placeholder="会社名で検索"
            className="h-11 pl-10"
          />
        </form>
      </PageHeader>

      <PageContainer>
        {customers.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title={query ? "該当する顧客がありません" : "顧客が登録されていません"}
            description={
              query
                ? "検索条件を変えてお試しください"
                : admin
                  ? "右下のボタンから登録できます"
                  : "管理者が顧客を登録すると表示されます"
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {customers.map((c) => {
            const reg = c.registrationType as RegistrationType;
            const trade = c.tradeStatus as TradeStatus;
            return (
              <CardLink key={c.id} href={`/customers/${c.id}`} className="h-full p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">
                        {REGISTRATION_TYPE_LABEL[reg] ?? c.registrationType}
                      </Badge>
                      <Badge tone={TRADE_STATUS_COLOR[trade] as "info" | "active" | "past"}>
                        {TRADE_STATUS_LABEL[trade] ?? c.tradeStatus}
                      </Badge>
                    </div>
                    <h3 className="truncate text-[15px] font-bold leading-snug text-ink">
                      {c.name}
                    </h3>
                    {c.headOfficeAddress && (
                      <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink-muted">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{c.headOfficeAddress}</span>
                      </p>
                    )}
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-faint" />
                </div>

                <div className="mt-3 flex items-center gap-4 border-t border-line pt-2.5 text-xs font-medium text-ink-muted">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    現場 {c._count.sites}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    担当者 {c._count.contacts}
                  </span>
                </div>
              </CardLink>
            );
          })}
          </div>
        )}
      </PageContainer>

      {admin && (
        <Fab href="/customers/new" label="顧客を登録" icon={<Plus className="h-5 w-5" />} />
      )}
    </div>
  );
}
