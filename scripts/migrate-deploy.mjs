// 本番（Vercel / PostgreSQL）向けマイグレーション実行スクリプト
//
// 旧方式の「毎デプロイ prisma db push」はスキーマ差分を強制適用するため
// 本番データ破壊のリスクがあった。本スクリプトは prisma migrate deploy 方式に移行する。
//
// 動作:
//   1. DB の状態を確認する
//      - User テーブルあり & _prisma_migrations なし
//        → db push で構築された既存DB。0000_baseline を「適用済み」として
//          ベースライン化（prisma migrate resolve --applied 0000_baseline）してから deploy。
//      - それ以外（空DB / すでに migrate 管理下のDB）
//        → そのまま prisma migrate deploy（未適用マイグレーションのみ適用）。
//   2. prisma migrate deploy は additive なマイグレーションのみを順に適用する。
//
// 注意: prisma/migrations/** は PostgreSQL 専用。ローカル(SQLite)では使わない。

import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

function run(cmd) {
  console.log(`[migrate-deploy] 実行: ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("[migrate-deploy] DATABASE_URL が未設定です。");
  }

  const prisma = new PrismaClient();
  let hasUserTable = false;
  let hasMigrationsTable = false;

  try {
    // to_regclass は存在しないテーブル名に対して null を返す（PostgreSQL）
    const rows = await prisma.$queryRawUnsafe(
      `SELECT
         to_regclass('public."User"')::text AS user_table,
         to_regclass('public."_prisma_migrations"')::text AS migrations_table`
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    hasUserTable = !!row?.user_table;
    hasMigrationsTable = !!row?.migrations_table;
    console.log(
      `[migrate-deploy] DB状態: User=${hasUserTable ? "あり" : "なし"} / _prisma_migrations=${hasMigrationsTable ? "あり" : "なし"}`
    );
  } catch (e) {
    console.error("[migrate-deploy] DB状態の確認に失敗しました:", e?.message ?? e);
    throw e;
  } finally {
    await prisma.$disconnect();
  }

  try {
    if (hasUserTable && !hasMigrationsTable) {
      // db push で構築済みの既存DB → ベースラインを適用済みとして記録
      console.log(
        "[migrate-deploy] 既存DB（db push 構築）を検出。0000_baseline をベースライン化します。"
      );
      run("npx prisma migrate resolve --applied 0000_baseline");
    }
    // 空DBなら 0000 から、ベースライン化済み/管理下DBなら未適用分のみ適用される
    run("npx prisma migrate deploy");
    console.log("[migrate-deploy] マイグレーション完了。");
  } catch (e) {
    console.error("[migrate-deploy] マイグレーションに失敗しました:", e?.message ?? e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[migrate-deploy] 予期しないエラー:", e);
  process.exit(1);
});
