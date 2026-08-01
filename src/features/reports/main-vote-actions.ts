"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { dayRangeForKey } from "@/lib/date";

// ───────────────────── メインの人（全員一致投票） ─────────────────────
// 「その日・その現場」の配員（SiteVisit 保持者）が各自「メインの人」を投票し、
// 全員の投票が同一になったら consensus（=そのメイン）が確定する。確定するまで
// 日報フォームに進めない。確定したメインだけが材料・在庫を入力できる。

export type MainVoteMember = {
  userId: string;
  name: string;
  vote: string | null;
};

export type MainVoteState = {
  members: MainVoteMember[];
  consensus: string | null;
  isMember: boolean;
  myVote: string | null;
};

// 全員が投票済み かつ 全て同一 userId のときだけ consensus を返す。
function computeConsensus(members: MainVoteMember[]): string | null {
  if (members.length === 0) return null;
  const first = members[0].vote;
  if (!first) return null;
  return members.every((m) => m.vote === first) ? first : null;
}

export async function getMainVoteState(
  siteId: string,
  dateKey: string,
): Promise<MainVoteState> {
  const user = await requireUser();
  const { gte, lt } = dayRangeForKey(dateKey);

  const visits = await db.siteVisit.findMany({
    where: { siteId, date: { gte, lt } },
    select: {
      userId: true,
      mainVote: true,
      user: { select: { id: true, name: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  const members: MainVoteMember[] = visits.map((v) => ({
    userId: v.userId,
    name: v.user.name,
    vote: v.mainVote,
  }));

  const mine = members.find((m) => m.userId === user.id);

  return {
    members,
    consensus: computeConsensus(members),
    isMember: Boolean(mine),
    myVote: mine?.vote ?? null,
  };
}

export async function voteMain(
  siteId: string,
  dateKey: string,
  mainUserId: string,
): Promise<MainVoteState | { error: string }> {
  const user = await requireUser();
  const { gte, lt } = dayRangeForKey(dateKey);

  // 現在ユーザーが当日その現場の配員（member）であることを確認
  const mine = await db.siteVisit.findFirst({
    where: { siteId, userId: user.id, date: { gte, lt } },
    select: { id: true },
  });
  if (!mine) return { error: "この現場の配員ではないため投票できません" };

  // 投票先は当日の配員のいずれかであること
  const target = await db.siteVisit.findFirst({
    where: { siteId, userId: mainUserId, date: { gte, lt } },
    select: { id: true },
  });
  if (!target) return { error: "投票先が不正です" };

  await db.siteVisit.updateMany({
    where: { siteId, userId: user.id, date: { gte, lt } },
    data: { mainVote: mainUserId },
  });

  revalidatePath("/reports/new");
  return getMainVoteState(siteId, dateKey);
}
