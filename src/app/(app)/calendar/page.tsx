import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CalendarView, type CalendarViewMode } from "@/features/calendar/calendar-view";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { jstDateKey, dateFromKey, addDaysKey } from "@/lib/date";

// "YYYY-MM" を解釈。不正なら当月（日本時間の暦日基準）。
function parseYm(ym: string | undefined): { year: number; month: number } {
  if (ym) {
    const m = /^(\d{4})-(\d{1,2})$/.exec(ym);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      if (month >= 1 && month <= 12) return { year, month };
    }
  }
  const [y, mo] = jstDateKey().split("-").map(Number);
  return { year: y, month: mo };
}

// "YYYY-MM-DD" を解釈して正規化済みキーで返す。不正なら今日（日本時間）。
function parseDayKey(d: string | undefined): string {
  if (d && /^(\d{4})-(\d{1,2})-(\d{1,2})$/.test(d)) {
    const date = dateFromKey(d);
    if (!Number.isNaN(date.getTime())) {
      // 2月30日等のオーバーフローも Date が繰り上げてくれるので、正規化して返す
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
  }
  return jstDateKey();
}

function parseView(view: string | undefined): CalendarViewMode {
  return view === "week" || view === "day" ? view : "month";
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; view?: string; d?: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const sp = await searchParams;
  const view = parseView(sp.view);

  // ビューに応じた取得範囲 [rangeStart, rangeEnd) と、ビュー用の基準値を決める
  let rangeStart: Date;
  let rangeEnd: Date;
  let baseDayKey: string; // 週/日ビューの基準日キー "YYYY-MM-DD"
  const { year, month } = parseYm(sp.ym);

  if (view === "month") {
    // 対象月の日付範囲（[月初, 翌月初)）
    rangeStart = new Date(year, month - 1, 1);
    rangeEnd = new Date(year, month, 1);
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    baseDayKey = `${year}-${pad(month)}-01`;
  } else if (view === "week") {
    baseDayKey = parseDayKey(sp.d);
    // その週の日曜（0時）から翌週日曜まで
    const base = dateFromKey(baseDayKey);
    const weekStartKey = addDaysKey(baseDayKey, -base.getDay());
    rangeStart = dateFromKey(weekStartKey);
    rangeEnd = dateFromKey(addDaysKey(weekStartKey, 7));
  } else {
    // day
    baseDayKey = parseDayKey(sp.d);
    rangeStart = dateFromKey(baseDayKey);
    rangeEnd = dateFromKey(addDaysKey(baseDayKey, 1));
  }

  // 権限: 管理者は全件、スタッフは自分の担当現場＋自分の個人予定
  const events = await db.calendarEvent.findMany({
    where: {
      date: { gte: rangeStart, lt: rangeEnd },
      ...(admin
        ? {}
        : {
            OR: [
              { ownerId: user.id },
              { site: { assignments: { some: { userId: user.id } } } },
              { participants: { some: { userId: user.id } } },
            ],
          }),
    },
    include: {
      site: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, avatarColor: true } },
      createdBy: { select: { id: true, name: true, avatarColor: true } },
      participants: { include: { user: { select: { id: true, name: true, avatarColor: true } } } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  // 自分の現場入り（出面）。読み取り専用の予定チップとして表示する（管理者も自分の分のみ）。
  const myVisits = await db.siteVisit.findMany({
    where: { userId: user.id, date: { gte: rangeStart, lt: rangeEnd } },
    include: { site: { select: { id: true, name: true } } },
    orderBy: { date: "asc" },
  });

  // 予定追加用の現場候補（管理者は全件、スタッフは担当現場のみ）
  const sites = await db.site.findMany({
    where: admin ? {} : { assignments: { some: { userId: user.id } } },
    select: { id: true, name: true, address: true },
    orderBy: { updatedAt: "desc" },
  });

  // 担当（現場に行く人）候補：有効なユーザー一覧
  const users = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, avatarColor: true },
    orderBy: { name: "asc" },
  });

  const viewEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    date: e.date.toISOString(),
    startTime: e.startTime,
    endTime: e.endTime,
    allDay: e.allDay,
    note: e.note,
    source: e.source,
    category: e.category,
    location: e.location,
    site: e.site,
    owner: e.owner,
    createdBy: e.createdBy,
    participants: e.participants.map((p) => p.user),
  }));

  const viewVisits = myVisits.map((v) => ({
    id: v.id,
    date: v.date.toISOString(),
    site: v.site,
  }));

  return (
    <div>
      <PageHeader title="カレンダー" fluid />
      <PageContainer size="full">
        <CalendarView
          events={viewEvents}
          visits={viewVisits}
          view={view}
          year={year}
          month={month}
          baseDay={baseDayKey}
          sites={sites}
          users={users}
        />
      </PageContainer>
    </div>
  );
}
