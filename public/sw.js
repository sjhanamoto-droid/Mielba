/**
 * Mielba Service Worker
 *
 * 方針（v0.4）:
 * - インストール時に静的アセット（manifest / アイコン / オフラインページ）をプリキャッシュ
 * - fetch はナビゲーションリクエストのみ network-first。
 *   オフライン等で失敗したらキャッシュ済み '/offline' を返す（無ければ簡易HTML）。
 * - /api/（写真配信・Server Action 等）は一切キャッシュしない
 * - CACHE_VERSION を上げると古いキャッシュは activate 時に破棄される
 */
const CACHE_VERSION = "mielba-v0.4.1";
const OFFLINE_URL = "/offline";

// プリキャッシュ対象（/offline は未ログイン時に取得できないことがあるため個別に best-effort）
const PRECACHE_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(PRECACHE_ASSETS);
      // /offline は認証リダイレクト等で失敗しうるので addAll と分けて best-effort で保存
      // （未ログイン時は /login へリダイレクトされるため、リダイレクト応答は保存しない）
      try {
        const res = await fetch(OFFLINE_URL, { credentials: "same-origin" });
        if (res.ok && !res.redirected) await cache.put(OFFLINE_URL, res);
      } catch {
        /* オフラインページの事前取得失敗は無視（簡易HTMLでフォールバック） */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 旧バージョンのキャッシュを破棄
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// キャッシュ済み /offline が無いときの最終フォールバック
const FALLBACK_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>オフライン | Mielba</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#f4f5f7;color:#1c1f26;text-align:center;padding:24px}
  .card{max-width:22rem}
  h1{font-size:1.25rem;margin:0 0 .5rem}
  p{font-size:.9rem;line-height:1.7;color:#555b66;margin:0}
</style></head>
<body><div class="card">
<h1>オフラインです</h1>
<p>電波の良い場所で再読み込みしてください。<br>入力途中の日報は端末に保存されています。</p>
</div></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // ナビゲーション（ページ遷移）以外は素通し。API・写真はキャッシュしない
  if (req.mode !== "navigate") return;

  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      try {
        // network-first：オンライン時は常に最新を返す（ページ自体はキャッシュしない）
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(OFFLINE_URL);
        if (cached) return cached;
        return new Response(FALLBACK_HTML, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    })(),
  );
});
