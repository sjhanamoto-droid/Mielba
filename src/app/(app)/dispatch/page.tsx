import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { DispatchBoard } from "@/features/visits/dispatch-board";
import { fmtDateWithDay } from "@/lib/utils";

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseDay(s: string | undefined): Date {
  if (s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const date = parseDay(sp.d);
  const dateStr = dayKey(date);
  const todayStr = dayKey(new Date());

  const prev = new Date(date);
  prev.setDate(date.getDate() - 1);
  const next = new Date(date);
  next.setDate(date.getDate() + 1);

  const sites = await db.site.findMany({
    where: { siteStatus: "ACTIVE" },
    include: {
      customer: { select: { name: true } },
      assignments: {
        include: { user: { select: { id: true, name: true, avatarColor: true, active: true } } },
      },
      visits: { where: { date } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows = sites.map((s) => ({
    id: s.id,
    name: s.name,
    customerName: s.customer?.name ?? null,
    staff: s.assignments
      .filter((a) => a.user.active)
      .map((a) => ({ id: a.user.id, name: a.user.name, avatarColor: a.user.avatarColor })),
    visitedIds: s.visits.map((v) => v.userId),
  }));

  return (
    <div>
      <PageHeader title="配員（現場入り）" subtitle="その日に誰がどの現場へ行くか" backHref="/" />
      <PageContainer>
        {/* 日付ナビ */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link
            href={`/dispatch?d=${dayKey(prev)}`}
            aria-label="前の日"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-surface-sunken"
          >
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <div className="text-center">
            <p className="text-base font-bold text-ink tnum md:text-lg">{fmtDateWithDay(date)}</p>
            {dateStr !== todayStr && (
              <Link href="/dispatch" className="text-xs font-semibold text-brand-600">
                今日に戻る
              </Link>
            )}
          </div>
          <Link
            href={`/dispatch?d=${dayKey(next)}`}
            aria-label="次の日"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-surface-sunken"
          >
            <ChevronRight className="h-6 w-6" />
          </Link>
        </div>

        <DispatchBoard key={dateStr} sites={rows} dateStr={dateStr} />
      </PageContainer>
    </div>
  );
}
