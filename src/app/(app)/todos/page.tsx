import { CheckSquare, AlertTriangle, CalendarDays, ListTodo, CheckCircle2 } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { TodoItem } from "@/components/todo-item";
import { EmptyState } from "@/components/ui/misc";
import { ChipBar, ChipLink } from "@/components/ui/chips";
import { TodoCreateForm } from "@/features/todos/todo-create-form";
import { isOverdue, isToday } from "@/lib/utils";
import { type TodoScope } from "@/lib/constants";

type View = "mine" | "site" | "personal" | "all";

const VIEWS: { key: View; label: string }[] = [
  { key: "mine", label: "自分宛" },
  { key: "site", label: "現場" },
  { key: "personal", label: "個人" },
  { key: "all", label: "すべて" },
];

export default async function TodosPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const sp = await searchParams;
  const view: View = (["mine", "site", "personal", "all"] as const).includes(
    sp.view as View,
  )
    ? (sp.view as View)
    : "mine";

  // ── フィルタ条件の組み立て ──
  const where: Prisma.TodoWhereInput = {};
  if (view === "mine") {
    where.assigneeId = user.id;
  } else if (view === "site") {
    where.scope = "SITE";
    if (!admin) where.assigneeId = user.id;
  } else if (view === "personal") {
    where.scope = "PERSONAL";
    if (!admin) where.assigneeId = user.id;
  } else {
    // all：管理者は全件、スタッフは自分宛のみ
    if (!admin) where.assigneeId = user.id;
  }

  const todos = await db.todo.findMany({
    where,
    include: {
      site: { select: { id: true, name: true } },
      assignee: { select: { name: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  // ── 状態でグルーピング ──
  const overdue = todos.filter((t) => t.status !== "DONE" && isOverdue(t.dueDate));
  const todayTodos = todos.filter(
    (t) => t.status !== "DONE" && !isOverdue(t.dueDate) && t.dueDate && isToday(t.dueDate),
  );
  const open = todos.filter(
    (t) =>
      t.status !== "DONE" &&
      !isOverdue(t.dueDate) &&
      !(t.dueDate && isToday(t.dueDate)),
  );
  // 完了は無制限描画を避けるため直近20件のみ表示（dueDate asc, createdAt desc 順の先頭から）
  const done = todos.filter((t) => t.status === "DONE").slice(0, 20);

  // 作成フォーム用の候補
  const [sites, users] = await Promise.all([
    db.site.findMany({
      where: admin ? {} : { assignments: { some: { userId: user.id } } },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const defaultScope: TodoScope = view === "personal" ? "PERSONAL" : "SITE";
  const isEmpty = todos.length === 0;

  return (
    <div>
      <PageHeader title="TODO">
        <ChipBar>
          {VIEWS.map((v) => (
            <ChipLink
              key={v.key}
              href={`/todos?view=${v.key}`}
              active={view === v.key}
            >
              {v.label}
            </ChipLink>
          ))}
        </ChipBar>
      </PageHeader>

      <PageContainer className="space-y-5 pb-28">
        {isEmpty ? (
          <EmptyState
            icon={<CheckSquare className="h-6 w-6" />}
            title="TODOはありません"
            description="右下のボタンから新しいTODOを追加できます"
          />
        ) : (
          <>
            {overdue.length > 0 && (
              <Section
                icon={<AlertTriangle className="h-4 w-4" />}
                title="期限切れ"
                count={overdue.length}
                tone="danger"
              >
                {overdue.map((t) => (
                  <TodoItem key={t.id} todo={t} />
                ))}
              </Section>
            )}

            {todayTodos.length > 0 && (
              <Section
                icon={<CalendarDays className="h-4 w-4" />}
                title="今日"
                count={todayTodos.length}
                tone="brand"
              >
                {todayTodos.map((t) => (
                  <TodoItem key={t.id} todo={t} />
                ))}
              </Section>
            )}

            {open.length > 0 && (
              <Section
                icon={<ListTodo className="h-4 w-4" />}
                title="未対応・対応中"
                count={open.length}
                tone="ink"
              >
                {open.map((t) => (
                  <TodoItem key={t.id} todo={t} />
                ))}
              </Section>
            )}

            {done.length > 0 && (
              <Section
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="完了"
                count={done.length}
                tone="muted"
              >
                {done.map((t) => (
                  <TodoItem key={t.id} todo={t} />
                ))}
              </Section>
            )}
          </>
        )}
      </PageContainer>

      <TodoCreateForm
        sites={sites}
        users={users}
        currentUserId={user.id}
        defaultScope={defaultScope}
      />
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  tone: "danger" | "brand" | "ink" | "muted";
  children: React.ReactNode;
}) {
  const toneClass: Record<string, string> = {
    danger: "text-status-danger",
    brand: "text-brand-600",
    ink: "text-ink-soft",
    muted: "text-ink-faint",
  };
  return (
    <section className={tone === "muted" ? "space-y-2 opacity-70" : "space-y-2"}>
      <div
        className={`flex items-center gap-1.5 px-0.5 text-xs font-bold ${toneClass[tone]}`}
      >
        {icon}
        <span>{title}</span>
        <span className="text-ink-faint">{count}</span>
      </div>
      <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">{children}</div>
    </section>
  );
}
