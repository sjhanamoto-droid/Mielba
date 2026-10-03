// 日本の祝日（国民の祝日に関する法律）を年ごとに計算する。外部データに頼らずクライアントでも使える。
//
// - 固定日の祝日、ハッピーマンデー（第n月曜）、春分・秋分（天文計算の近似式）
// - 振替休日：祝日が日曜なら、その後の最初の「祝日でない日」が休み
// - 国民の休日：祝日と祝日に挟まれた平日が休み（9月の連休など）
// 2020・2021年の五輪特例（海の日・スポーツの日・山の日の移動）も反映する。
// キーは "YYYY-MM-DD"（アプリ全体の日付キーと同じ形式）。

const cache = new Map<number, Map<string, string>>();

function key(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** その月の第 n 月曜日の日付 */
function nthMonday(y: number, m: number, n: number): number {
  const first = new Date(y, m - 1, 1).getDay(); // 0=日
  const firstMonday = 1 + ((8 - first) % 7);
  return firstMonday + (n - 1) * 7;
}

/** 春分日（1980〜2099年の近似式） */
function vernalEquinox(y: number): number {
  return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

/** 秋分日（1980〜2099年の近似式） */
function autumnalEquinox(y: number): number {
  return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

function buildYear(y: number): Map<string, string> {
  const h = new Map<string, string>();
  const add = (m: number, d: number, name: string) => h.set(key(y, m, d), name);

  add(1, 1, "元日");
  add(1, nthMonday(y, 1, 2), "成人の日");
  add(2, 11, "建国記念の日");
  if (y >= 2020) add(2, 23, "天皇誕生日");
  add(3, vernalEquinox(y), "春分の日");
  add(4, 29, "昭和の日");
  add(5, 3, "憲法記念日");
  add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");

  // 五輪特例（2020・2021年）
  if (y === 2020) {
    add(7, 23, "海の日");
    add(7, 24, "スポーツの日");
    add(8, 10, "山の日");
  } else if (y === 2021) {
    add(7, 22, "海の日");
    add(7, 23, "スポーツの日");
    add(8, 8, "山の日");
  } else {
    add(7, nthMonday(y, 7, 3), "海の日");
    add(8, 11, "山の日");
    add(10, nthMonday(y, 10, 2), "スポーツの日");
  }

  add(9, nthMonday(y, 9, 3), "敬老の日");
  add(9, autumnalEquinox(y), "秋分の日");
  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");

  // 国民の休日：前後が祝日の平日（日曜は除く）
  const fixed = Array.from(h.keys()).sort();
  for (const k of fixed) {
    const d = new Date(`${k}T00:00:00`);
    const next2 = new Date(d);
    next2.setDate(d.getDate() + 2);
    const mid = new Date(d);
    mid.setDate(d.getDate() + 1);
    const midKey = key(mid.getFullYear(), mid.getMonth() + 1, mid.getDate());
    const next2Key = key(next2.getFullYear(), next2.getMonth() + 1, next2.getDate());
    if (h.has(next2Key) && !h.has(midKey) && mid.getDay() !== 0) {
      h.set(midKey, "国民の休日");
    }
  }

  // 振替休日：日曜の祝日の後、最初の祝日でない日
  for (const k of Array.from(h.keys()).sort()) {
    const d = new Date(`${k}T00:00:00`);
    if (d.getDay() !== 0) continue;
    const sub = new Date(d);
    do {
      sub.setDate(sub.getDate() + 1);
    } while (h.has(key(sub.getFullYear(), sub.getMonth() + 1, sub.getDate())));
    if (sub.getFullYear() === y) {
      h.set(key(y, sub.getMonth() + 1, sub.getDate()), "振替休日");
    }
  }

  return h;
}

function yearMap(y: number): Map<string, string> {
  let m = cache.get(y);
  if (!m) {
    m = buildYear(y);
    cache.set(y, m);
  }
  return m;
}

/** "YYYY-MM-DD" の日が祝日なら名前を、そうでなければ null を返す */
export function holidayName(dateKey: string): string | null {
  const y = Number(dateKey.slice(0, 4));
  if (!Number.isFinite(y)) return null;
  return yearMap(y).get(dateKey) ?? null;
}

/**
 * 日付の文字色（祝日・日曜＝赤、土曜＝青、平日＝null）。
 * 祝日は土曜でも赤にする。
 */
export function dayTone(dateKey: string, dow: number): "holiday" | "sunday" | "saturday" | null {
  if (holidayName(dateKey)) return "holiday";
  if (dow === 0) return "sunday";
  if (dow === 6) return "saturday";
  return null;
}
