"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check, MapPin, User as UserIcon } from "lucide-react";
import { toggleTodoDone, cycleTodoStatus } from "@/features/todos/actions";
import { cn, dueLabel, isOverdue } from "@/lib/utils";
import {
  TODO_STATUS_LABEL,
  TODO_STATUS_COLOR,
  STATUS_TOKEN,
  type TodoStatus,
} from "@/lib/constants";

export type TodoItemData = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  scope: string;
  dueDate: Date | string | null;
  site?: { id: string; name: string } | null;
  assignee?: { name: string } | null;
};

export function TodoItem({
  todo,
  showSite = true,
}: {
  todo: TodoItemData;
  showSite?: boolean;
}) {
  const [pending, start] = useTransition();
  const done = todo.status === "DONE";
  const overdue = !done && isOverdue(todo.dueDate);
  const statusColor = STATUS_TOKEN[TODO_STATUS_COLOR[todo.status as TodoStatus] ?? "warn"];

  return (
    <div
      className={cn(
        "card flex items-start gap-3 p-3.5 transition-opacity",
        done && "opacity-60",
        pending && "opacity-50",
      )}
    >
      <button
        onClick={() => start(() => toggleTodoDone(todo.id))}
        aria-label={done ? "未完了に戻す" : "完了にする"}
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-line-strong bg-surface active:border-brand-500",
        )}
      >
        {done && <Check className="h-4 w-4" strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold leading-snug text-ink", done && "line-through")}>
          {todo.title}
        </p>
        {todo.detail && (
          <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{todo.detail}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-muted">
          {showSite && todo.site && (
            <Link
              href={`/sites/${todo.site.id}`}
              className="flex items-center gap-0.5 font-medium text-brand-600"
            >
              <MapPin className="h-3 w-3" />
              <span className="max-w-[140px] truncate">{todo.site.name}</span>
            </Link>
          )}
          {todo.assignee && (
            <span className="flex items-center gap-0.5">
              <UserIcon className="h-3 w-3" />
              {todo.assignee.name}
            </span>
          )}
          {todo.dueDate && (
            <span className={cn("font-semibold", overdue ? "text-status-danger" : "text-ink-muted")}>
              {dueLabel(todo.dueDate)}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => start(() => cycleTodoStatus(todo.id))}
        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
        style={{ backgroundColor: `${statusColor}1a`, color: statusColor }}
      >
        {TODO_STATUS_LABEL[todo.status as TodoStatus]}
      </button>
    </div>
  );
}
