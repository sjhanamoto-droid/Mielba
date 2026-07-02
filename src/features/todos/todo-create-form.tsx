"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X, AlertCircle } from "lucide-react";
import { createTodo } from "@/features/todos/actions";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { TODO_SCOPE_LABEL, type TodoScope } from "@/lib/constants";
import { cn } from "@/lib/utils";

type SiteOption = { id: string; name: string };
type UserOption = { id: string; name: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass({ size: "lg", className: "w-full" })}
    >
      {pending ? "作成中..." : <><Plus className="h-5 w-5" /> TODOを追加</>}
    </button>
  );
}

export function TodoCreateForm({
  sites,
  users,
  currentUserId,
  defaultScope = "SITE",
}: {
  sites: SiteOption[];
  users: UserOption[];
  currentUserId: string;
  defaultScope?: TodoScope;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<TodoScope>(defaultScope);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // シートを開くたびに初期化
  useEffect(() => {
    if (open) {
      setScope(defaultScope);
      setError(null);
    }
  }, [open, defaultScope]);

  // SITE スコープなのに選べる現場が無い場合は個人に倒す
  const scopeForForm: TodoScope = scope === "SITE" && sites.length === 0 ? "PERSONAL" : scope;

  async function action(formData: FormData) {
    setError(null);
    const result = await createTodo(formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    formRef.current?.reset();
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="TODOを追加"
        className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-14 -translate-x-1/2 items-center gap-2 rounded-full bg-brand-600 pl-4 pr-5 font-bold text-white shadow-float transition-all active:scale-95 max-w-app"
        style={{ marginLeft: "min(0px, calc((100vw - 560px) / 2))" }}
      >
        <Plus className="h-5 w-5" />
        <span className="text-sm">TODOを追加</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-app overflow-y-auto rounded-t-3xl bg-surface p-5 pb-8 animate-slide-up safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">TODOを追加</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-sunken text-ink-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form ref={formRef} action={action} className="space-y-4">
              {/* スコープ切替 */}
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-sunken p-1">
                {(["SITE", "PERSONAL"] as TodoScope[]).map((s) => {
                  const active = scopeForForm === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScope(s)}
                      className={cn(
                        "flex h-10 items-center justify-center rounded-xl text-sm font-bold transition-colors",
                        active ? "bg-surface text-brand-700 shadow-card" : "text-ink-muted",
                      )}
                    >
                      {TODO_SCOPE_LABEL[s]}
                    </button>
                  );
                })}
              </div>
              <input type="hidden" name="scope" value={scopeForForm} />

              <Field label="タイトル" required htmlFor="todo-title">
                <Input
                  id="todo-title"
                  name="title"
                  placeholder="例：階段手すりの再確認"
                  required
                  autoFocus
                />
              </Field>

              <Field label="詳細" htmlFor="todo-detail">
                <Textarea id="todo-detail" name="detail" placeholder="補足・メモ（任意）" />
              </Field>

              {scopeForForm === "SITE" && (
                <Field label="現場" required htmlFor="todo-site">
                  <Select id="todo-site" name="siteId" defaultValue="" required>
                    <option value="">現場を選択</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <Field label="担当者" htmlFor="todo-assignee">
                <Select id="todo-assignee" name="assigneeId" defaultValue={currentUserId}>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="期限" htmlFor="todo-due">
                <Input id="todo-due" name="dueDate" type="date" />
              </Field>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <SubmitButton />
            </form>
          </div>
        </div>
      )}
    </>
  );
}
