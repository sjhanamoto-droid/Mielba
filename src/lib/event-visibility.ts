import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * 予定(CalendarEvent)を読むときの可視条件。
 *
 * 最高管理者が「他の人に表示しない」で入れた個人予定は、所有者本人の画面にだけ出す。
 * 条件を必ず AND で包むのは、呼び出し側が既に OR を持っていても取りこぼさないため
 * （スプレッドで混ぜると OR 同士が黙って上書きされ、そのまま情報漏れになる）。
 */
export function visibleEventWhere(
  viewerId: string,
  base: Prisma.CalendarEventWhereInput = {},
): Prisma.CalendarEventWhereInput {
  return { AND: [base, { OR: [{ isPrivate: false }, { ownerId: viewerId }] }] };
}
