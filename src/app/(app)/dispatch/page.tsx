import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { jstDateKey, dateFromKey, dayRangeForKey, addDaysKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { DispatchBoard, DispatchDateNav, type ReportStatus } from "@/features/visits/dispatch-board";
import { fmtDateWithDay } from "@/lib/utils";

// ?d=YYYY-MM-DD を解釈。不正なら「今日」（日本時間の暦日）。
function parseDayKey(s: string | undefined): string {
  if (s && /^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const d = dateFromKey(s);
    if (!Number.isNaN(d.getTime())) return s;
  }
  return jstDateKey();
}

export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const dateStr = parseDayKey(sp.d);
  const range = dayRangeForKey(dateStr);
  const todayStr = jstDateKey();

  const [sites, reports, allUsers] = await Promise.all([
    db.site.findMany({
      where: { siteStatus: "ACTIVE" },
      include: {
        customer: { select: { name: true } },
        visits: {
          where: { date: range },
          include: { user: { select: { id: true, name: true, avatarColor: true, avatarImage: true, active: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    // 当日の日報（未打刻/下書き/提出済のドット表示用）
    db.dailyReport.findMany({
      where: { workDate: range },
      select: { siteId: true, userId: true, status: true },
    }),
    // 配員編集シートの候補（管理者・スタッフ両方。有効ユーザーのみ）
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true, avatarColor: true, avatarImage: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const statusByKey = new Map<string, ReportStatus>(
    reports.map((r) => [
      `${r.siteId}_${r.userId}`,
      (r.status === "SUBMITTED" ? "submitted" : "draft") as ReportStatus,
    ]),
  );

  const unsortedRows = sites.map((s) => {
    // その日の現場入り(visits)からその日の訪問者を構築（有効ユーザーのみ）
    const activeVisits = s.visits.filter((v) => v.user.active);
    const visitors = activeVisits.map((v) => ({
      id: v.user.id,
      name: v.user.name,
      avatarColor: v.user.avatarColor,
      avatarImage: v.user.avatarImage,
    }));
    // メインの人（全員一致投票）の確定状況。管理者の代理確定UIに使う。
    const firstVote = activeVisits[0]?.mainVote ?? null;
    const mainUserId =
      activeVisits.length > 0 && firstVote && activeVisits.every((v) => v.mainVote === firstVote)
        ? firstVote
        : null;
    return {
      id: s.id,
      name: s.name,
      customerName: s.customer?.name ?? null,
      staff: visitors,
      visitedIds: visitors.map((u) => u.id),
      mainUserId,
      reportStatusByUserId: Object.fromEntries(
        visitors.map((u) => [u.id, statusByKey.get(`${s.id}_${u.id}`) ?? ("none" as ReportStatus)]),
      ),
    };
  });

  // 配員がいる現場（現場入り1名以上）を上に。残りは元の並び（updatedAt 降順）を維持。
  // ※サーバー側で並べるので、編集中にトグルしても順番が急に入れ替わらない（再読込で反映）。
  const rows = [...unsortedRows].sort(
    (a, b) => Number(b.visitedIds.length > 0) - Number(a.visitedIds.length > 0),
  );

  return (
    <div>
      <PageHeader title="配員（現場入り）" subtitle="その日に誰がどの現場へ行くか" backHref="/" />
      <PageContainer>
        {/* 日付ナビ（クライアント側で isPending 表示） */}
        <DispatchDateNav
          prevKey={addDaysKey(dateStr, -1)}
          nextKey={addDaysKey(dateStr, 1)}
          isToday={dateStr === todayStr}
          label={fmtDateWithDay(dateFromKey(dateStr))}
        />

        <DispatchBoard key={dateStr} sites={rows} dateStr={dateStr} allUsers={allUsers} />
      </PageContainer>
    </div>
  );
}
