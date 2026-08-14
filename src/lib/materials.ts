// 材料候補のユーティリティ。
// 日報の使用材料セレクトは「その現場に登録された材料(SiteMaterial)」を候補にする。
// 複数の伝票で同名材料が登録されることがあるため、名前で1件に集約する。

export type MaterialOption = { id: string; name: string; unit: string | null };

/** 同名（前後空白無視）の材料を先頭の1件に集約する。順序は維持する。 */
export function dedupeByName(materials: MaterialOption[]): MaterialOption[] {
  const seen = new Set<string>();
  const result: MaterialOption[] = [];
  for (const m of materials) {
    const key = m.name.trim();
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    result.push(m);
  }
  return result;
}
