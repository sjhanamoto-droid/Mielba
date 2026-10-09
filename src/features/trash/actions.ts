"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { restoreTrashItem } from "@/lib/trash";

/** ごみ箱から元に戻す（管理者以上） */
export async function restoreFromTrash(trashId: string): Promise<{ ok?: true; error?: string }> {
  await requireAdmin();
  const r = await restoreTrashItem(trashId);
  if ("error" in r) return { error: r.error };
  revalidatePath("/trash");
  revalidatePath("/sites");
  revalidatePath("/reports");
  revalidatePath("/customers");
  revalidatePath("/calendar");
  revalidatePath("/", "layout");
  return { ok: true };
}
