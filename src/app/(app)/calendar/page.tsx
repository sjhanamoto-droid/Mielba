import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CalendarView, type CalendarViewMode } from "@/features/calendar/calendar-view";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";

// "YYYY-MM" を解釈。不正なら当月。
function parseYm(ym: string | undefined): { year: number; month: number } {
  const now = new Date();
  if (ym) {
    const m = /^(\d{4})-(\d{1,2})$/.exec(ym);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      if (month >= 1 && month <= 12) return { year, month };
    }
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// "YYYY-MM-DD" を解釈（ローカル日付）。不正なら今日。
function parseDay(d: string | undefined): Date {
  if (d) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(d);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return new Date(year, month - 1, day);
      }
    }
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
  let baseDay: Date; // 週/日ビューの基準日
  const { year, month } = parseYm(sp.ym);

  if (view === "month") {
    // 対象月の日付範囲（[月初, 翌月初)）
    rangeStart = new Date(year, month - 1, 1);
    rangeEnd = new Date(year, month, 1);
    baseDay = rangeStart;
  } else if (view === "week") {
    baseDay = parseDay(sp.d);
    // その週の日曜（0時）から翌週日曜まで
    const weekStart = new Date(baseDay);
    weekStart.setDate(baseDay.getDate() - baseDay.getDay());
    rangeStart = weekStart;
    rangeEnd = new Date(weekStart);
    rangeEnd.setDate(weekStart.getDate() + 7);
  } else {
    // day
    baseDay = parseDay(sp.d);
    rangeStart = new Date(baseDay);
    rangeEnd = new Date(baseDay);
    rangeEnd.setDate(baseDay.getDate() + 1);
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

  // 基準日を "YYYY-MM-DD"（ローカル）でクライアントへ渡す
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const baseDayKey = `${baseDay.getFullYear()}-${pad(baseDay.getMonth() + 1)}-${pad(baseDay.getDate())}`;

  return (
    <div>
      <PageHeader title="カレンダー" fluid />
      <PageContainer size="full">
        <CalendarView
          events={viewEvents}
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
