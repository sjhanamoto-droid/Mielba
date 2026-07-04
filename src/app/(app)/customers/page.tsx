import { Search, Plus, Building2, MapPin, ChevronRight, ChevronDown } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CardLink } from "@/components/ui/card";
import { Fab, EmptyState } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";
import { LinkButton } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";

const PAGE_SIZE = 20;

function buildHref(params: { q?: string; page?: number }): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/customers?${qs}` : "/customers";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const { q, page } = await searchParams;
  const query = (q ?? "").trim();

  // 「さらに表示」方式のページネーション（page * 20 件まで表示）
  const pageNum = Math.max(1, Math.min(500, Number.parseInt(page ?? "1", 10) || 1));
  const shown = pageNum * PAGE_SIZE;

  const customersRaw = await db.customer.findMany({
    where: query ? { name: { contains: query } } : undefined,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { sites: true } },
    },
    take: shown + 1, // 「さらに表示」の有無を判定するため1件多く取得
  });
  const hasMore = customersRaw.length > shown;
  const customers = hasMore ? customersRaw.slice(0, shown) : customersRaw;

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
        <SearchParamToast />
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
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {customers.map((c) => (
                <CardLink key={c.id} href={`/customers/${c.id}`} className="h-full p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[15px] font-bold leading-snug text-ink">
                        {c.name}
                      </h3>
                      {c.headOfficeAddress && (
                        <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink-muted">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{c.headOfficeAddress}</span>
                        </p>
                      )}
                      {c.memo && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                          {c.memo}
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
                  </div>
                </CardLink>
              ))}
            </div>
            {hasMore && (
              <LinkButton
                href={buildHref({ q: query || undefined, page: pageNum + 1 })}
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

      {admin && (
        <Fab href="/customers/new" label="顧客を登録" icon={<Plus className="h-5 w-5" />} />
      )}
    </div>
  );
}
