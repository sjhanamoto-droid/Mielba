# Mielba パフォーマンス改善メモ（本番 Vercel + Neon）

## 症状
ローカル(SQLite=プロセス内)は軽いが、本番(Vercel + Neon PostgreSQL)が重い。

## 根本原因（判明）
1. **リージョン不一致（最大の元凶）**: Neon DB は **Singapore(ap-southeast-1)** にあるのに、
   Vercel 関数は既定の **iad1(米ワシントン)** で動いていた。→ 全クエリが毎回**太平洋横断**（往復~200ms）。
2. **DBクエリの直列実行**: ダッシュボード等で `await db.*` を1つずつ実行（最大~11回の直列往復）。
   ローカルSQLiteでは0msでも、リモートDBでは往復回数ぶん待ち時間が積み上がる。
3. **接続**: Prisma のアプリ実行時接続をプール(pgbouncer)へ明示。

## 実施した対策
| # | 内容 | 変更 |
|---|------|------|
| ① | ホットパスのクエリを `Promise.all` で並列化 | `src/app/(app)/` の page.tsx 4ファイル |
| ② | Prisma 接続をプール接続へ | `schema.prisma`: `url=env("POSTGRES_PRISMA_URL")` / `directUrl=env("POSTGRES_URL_NON_POOLING")` |
| ③ | **関数を DB と同じ Singapore に co-locate** | `vercel.json`: `{ "regions": ["sin1"] }` |

> ③が効果最大。関数↔DB が 米↔SG(~200ms) → SG↔SG(~2ms) になり、往復コストがほぼ消える。
> さらに東京の利用者↔関数も 米(~150ms)→SG(~70ms) に短縮。①がクエリ往復回数を削減して相乗。

## データについて
**移行なし・データ保持**。Neon プロジェクトは既に Singapore のため、DB はそのまま。
デプロイ時の `vercel-build`（migrate deploy → seed-if-empty）は、既存DBに対しては
「未適用マイグレーションのみ適用・シードはスキップ」で安全に通る。

## ローカル開発（SQLite）に戻すには
`schema.prisma` を以下に戻す（`.env` は `DATABASE_URL="file:./dev.db"`）:
```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"  url = env("DATABASE_URL") }
```
（コミットするのは PostgreSQL 版。ローカル切替はコミットしない運用。）

## ロールバック
- Vercel ダッシュボードで直前のデプロイメントに **Instant Rollback**。
- もしくは `vercel.json` を削除（関数を既定リージョンへ）＋ `schema.prisma` の `url` を
  `env("DATABASE_URL")` に戻して再デプロイ。

## 将来の“完全東京化”（任意）
Neon は東京(ap-northeast-1)非対応。どうしても東京にしたい場合は
**Supabase(東京)** 等へ移せば `関数=東京 + DB=東京` が可能（Postgres+Prisma のままコード変更ほぼ不要）。
