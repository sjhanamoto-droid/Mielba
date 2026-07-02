"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

const todoSchema = z
  .object({
    title: z.string().min(1, "タイトルを入力してください"),
    detail: z.string().optional(),
    scope: z.enum(["SITE", "PERSONAL"]),
    siteId: z.string().optional(),
    assigneeId: z.string().optional(),
    dueDate: z.string().optional(),
  })
  .refine((d) => d.scope !== "SITE" || !!d.siteId, {
    message: "現場を選択してください",
    path: ["siteId"],
  });

function revalidateTodo(siteId?: string | null) {
  revalidatePath("/todos");
  revalidatePath("/");
  if (siteId) revalidatePath(`/sites/${siteId}`);
}

export async function createTodo(formData: FormData) {
  const user = await requireUser();
  const parsed = todoSchema.safeParse({
    title: formData.get("title"),
    detail: formData.get("detail") || undefined,
    scope: formData.get("scope") || "SITE",
    siteId: formData.get("siteId") || undefined,
    assigneeId: formData.get("assigneeId") || undefined,
    dueDate: formData.get("dueDate") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }
  const d = parsed.data;
  // scope==="SITE" のときは .refine により siteId 必須が保証されている
  const siteId = d.scope === "SITE" ? d.siteId : null;
  await db.todo.create({
    data: {
      title: d.title,
      detail: d.detail || null,
      scope: d.scope,
      siteId: siteId,
      assigneeId: d.assigneeId || user.id,
      createdById: user.id,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      status: "OPEN",
    },
  });
  revalidateTodo(siteId);
  return { ok: true };
}

export async function setTodoStatus(id: string, status: string) {
  await requireUser();
  if (!["OPEN", "IN_PROGRESS", "DONE"].includes(status)) return;
  const todo = await db.todo.update({
    where: { id },
    data: { status },
    select: { siteId: true },
  });
  revalidateTodo(todo.siteId);
}

// OPEN → IN_PROGRESS → DONE → OPEN と巡回
export async function cycleTodoStatus(id: string) {
  await requireUser();
  const todo = await db.todo.findUnique({ where: { id }, select: { status: true, siteId: true } });
  if (!todo) return;
  const next = todo.status === "OPEN" ? "IN_PROGRESS" : todo.status === "IN_PROGRESS" ? "DONE" : "OPEN";
  await db.todo.update({ where: { id }, data: { status: next } });
  revalidateTodo(todo.siteId);
}

export async function toggleTodoDone(id: string) {
  await requireUser();
  const todo = await db.todo.findUnique({ where: { id }, select: { status: true, siteId: true } });
  if (!todo) return;
  const next = todo.status === "DONE" ? "OPEN" : "DONE";
  await db.todo.update({ where: { id }, data: { status: next } });
  revalidateTodo(todo.siteId);
}

export async function deleteTodo(id: string) {
  await requireUser();
  const todo = await db.todo.delete({ where: { id }, select: { siteId: true } });
  revalidateTodo(todo.siteId);
}
