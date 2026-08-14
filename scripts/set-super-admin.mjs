// 最高管理者(SUPER_ADMIN)のブートストラップ。
// 権限「最高管理者」は最高管理者のみが付与できるため、最初の1人はこのスクリプトで用意する。
//
// 方針（冪等・非致命）:
//   - 既に SUPER_ADMIN が1人以上いれば何もしない（＝後から手動で権限変更しても上書きしない）。
//   - 1人もいなければ、指定メールのユーザーを SUPER_ADMIN に昇格する。
//   - 対象ユーザーが未作成でも、デプロイは止めない（次回デプロイで再試行される）。
//
// メールは env SUPER_ADMIN_EMAIL で上書き可。未指定時は既定（初代）を使う。
//
// 使い方（ローカル/手動）:
//   SUPER_ADMIN_EMAIL="owner@example.com" node scripts/set-super-admin.mjs

import { PrismaClient } from "@prisma/client";

const DEFAULT_EMAIL = "shigedenki01@gmail.com"; // 初代・株式会社シゲ電気
const email = (process.env.SUPER_ADMIN_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();

const prisma = new PrismaClient();
try {
  const existing = await prisma.user.count({ where: { role: "SUPER_ADMIN" } });
  if (existing > 0) {
    console.log(`[set-super-admin] 既に最高管理者が ${existing} 人います。何もしません。`);
  } else {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.warn(`[set-super-admin] 対象ユーザーが未作成です（続行）: ${email}`);
    } else {
      await prisma.user.update({ where: { email }, data: { role: "SUPER_ADMIN" } });
      console.log(`[set-super-admin] 最高管理者に設定しました: ${user.name} <${email}>（旧: ${user.role}）`);
    }
  }
} catch (e) {
  // 昇格失敗でデプロイ全体を止めない
  console.error("[set-super-admin] エラー（続行）:", e?.message ?? e);
} finally {
  await prisma.$disconnect();
}
