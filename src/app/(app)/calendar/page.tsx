import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CalendarView, type CalendarViewMode } from "@/features/calendar/calendar-view";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { jstDateKey, dateFromKey, addDaysKey } from "@/lib/date";
import { isNonWorkEventCategory } from "@/lib/constants";

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
  await requireUser(); // 認証ゲート（未ログインはここでリダイレクト）
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
  // 互いに独立した4クエリを1波で並列取得（本番PostgreSQLの往復回数を削減）
  const [events, allVisits, sites, users] = await Promise.all([
    db.calendarEvent.findMany({
      // 担当という区別は廃止。全員が全現場の予定を見られる。
      where: { date: { gte: rangeStart, lt: rangeEnd } },
      include: {
        site: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, avatarColor: true } },
        createdBy: { select: { id: true, name: true, avatarColor: true } },
        participants: { include: { user: { select: { id: true, name: true, avatarColor: true } } } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    // 現場入り（配員・自己申告）を全員ぶん取得。現場×日でまとめ、誰が行くかを共有表示する。
    // （以前は自分の分だけ表示していたため、配員で他の人を追加してもカレンダーに出なかった）
    db.siteVisit.findMany({
      where: { date: { gte: rangeStart, lt: rangeEnd } },
      include: {
        site: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, avatarColor: true } },
      },
      orderBy: { date: "asc" },
    }),
    // 予定追加用の現場候補：全員に全現場を表示（担当でなくても、登録済みの現場は誰でも選べる）
    db.site.findMany({
      select: { id: true, name: true, address: true },
      orderBy: { updatedAt: "desc" },
    }),
    // 担当（現場に行く人）候補：有効なユーザー一覧
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true, avatarColor: true },
      orderBy: { name: "asc" },
    }),
  ]);

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

  // 現場予定(CalendarEvent)に参加者として既に出ている人は「現場入り」から除外し、重複表示を防ぐ。
  // 手動の現場予定は参加者ぶんの現場入り(SiteVisit)も作るため、そのままだと予定と現場入りで二重に出る。
  // 「休み」「その他」の予定は現場入りを作らないので除外対象にしない（write 側の条件と揃える）。
  const eventPeopleBySiteDay = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.siteId || isNonWorkEventCategory(e.category)) continue;
    const k = `${e.siteId}|${jstDateKey(e.date)}`;
    let set = eventPeopleBySiteDay.get(k);
    if (!set) {
      set = new Set<string>();
      eventPeopleBySiteDay.set(k, set);
    }
    for (const p of e.participants) set.add(p.user.id);
  }

  // 現場×日でまとめる（同じ現場に複数人 → 1件の「現場入り」に集約）。現場予定に出ている人は除く。
  const visitGroups = new Map<
    string,
    {
      id: string;
      date: string;
      site: { id: string; name: string };
      visitors: { id: string; name: string; avatarColor: string }[];
    }
  >();
  for (const v of allVisits) {
    const k = `${v.siteId}|${jstDateKey(v.date)}`;
    if (eventPeopleBySiteDay.get(k)?.has(v.userId)) continue;
    let g = visitGroups.get(k);
    if (!g) {
      g = { id: k, date: v.date.toISOString(), site: v.site, visitors: [] };
      visitGroups.set(k, g);
    }
    g.visitors.push(v.user);
  }
  const viewVisits = [...visitGroups.values()].map((g) => ({
    ...g,
    visitors: g.visitors.slice().sort((a, b) => a.name.localeCompare(b.name, "ja")),
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
