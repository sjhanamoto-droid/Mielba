// 給与・原価単価（StaffPayRate）の参照。
// 単価は適用開始日つきの履歴。ある日の単価は「その日以前で最も新しい適用開始日」の行。
// 原価の計算は必ずこれを通し、「今の単価」で過去の日を計算しないこと（過去の現場原価が変わるため）。

type RateLike = { effectiveFrom: Date };

/** date 時点で有効な単価（無ければ null）。rates の並び順は問わない */
export function rateOn<T extends RateLike>(rates: T[], date: Date): T | null {
  let hit: T | null = null;
  for (const r of rates) {
    if (r.effectiveFrom.getTime() > date.getTime()) continue;
    if (!hit || r.effectiveFrom.getTime() > hit.effectiveFrom.getTime()) hit = r;
  }
  return hit;
}
