// GET /api/share/sites — iOSショートカットの現場選択リスト。
//
// 進行中・現調中の現場を { "現場名": "siteId", ... } の辞書JSONで返す。
// ショートカット側は「辞書のキーをリストから選択 → 選択キーで値(siteId)を取得」
// という定番パターンで現場を選ぶ（docs/shortcut-mielba-pdf.md 参照）。

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shareAuthError } from "../auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = shareAuthError(req);
  if (authError) return authError;

  const sites = await db.site.findMany({
    where: { siteStatus: { in: ["ACTIVE", "SURVEY"] } },
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
  });

  // 同名現場でも辞書キーが衝突しないよう連番を付ける
  const dict: Record<string, string> = {};
  const used = new Map<string, number>();
  for (const s of sites) {
    const base = s.name.trim() || "（名称未設定）";
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    dict[n === 1 ? base : `${base}（${n}）`] = s.id;
  }

  return NextResponse.json(dict);
}
