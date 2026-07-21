// 一回限りのスタッフ一括プロビジョニング（デプロイ時に本番DBへ作成）。
//
// 個人情報をリポジトリに残さないため、作成データは環境変数から受け取る:
//   STAFF_PROVISION_JSON     : [{ "name": "...", "email": "...", "role": "ADMIN|STAFF", "department": "..."? }, ...]
//   STAFF_PROVISION_PASSWORD : 全員共通の初期パスワード（bcrypt でハッシュ化して保存）
//   STAFF_PROVISION_COMPANY  : 会社名（任意・AppSetting.companyName に設定）
//
// STAFF_PROVISION_JSON が未設定なら何もしない（no-op）。
// メール重複はスキップするため、再実行しても重複作成しない（冪等）。
// 使い終わったら上記 env を削除すれば、以降のビルドでは no-op になる。

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const raw = process.env.STAFF_PROVISION_JSON;
if (!raw || raw.trim() === "") {
  console.log("[provision-staff] STAFF_PROVISION_JSON 未設定のためスキップします。");
  process.exit(0);
}

const password = process.env.STAFF_PROVISION_PASSWORD;
if (!password || password.length < 6) {
  console.error("[provision-staff] STAFF_PROVISION_PASSWORD が未設定/短すぎます（6文字以上）。");
  process.exit(1);
}

let users;
try {
  users = JSON.parse(raw);
  if (!Array.isArray(users)) throw new Error("配列ではありません");
} catch (e) {
  console.error("[provision-staff] STAFF_PROVISION_JSON の JSON 解析に失敗:", e?.message ?? e);
  process.exit(1);
}

const companyName = process.env.STAFF_PROVISION_COMPANY?.trim();
const prisma = new PrismaClient();

try {
  if (companyName) {
    await prisma.appSetting.upsert({
      where: { id: "singleton" },
      update: { companyName },
      create: { id: "singleton", companyName },
    });
    console.log(`[provision-staff] 会社名を設定: ${companyName}`);
  }

  let created = 0;
  let skipped = 0;
  for (const u of users) {
    const name = String(u?.name ?? "").trim();
    const email = String(u?.email ?? "").trim().toLowerCase();
    const role = u?.role === "ADMIN" ? "ADMIN" : "STAFF";
    const department = u?.department ? String(u.department).trim() : null;
    if (!name || !email) {
      console.warn("[provision-staff] name/email 欠落のためスキップ:", JSON.stringify(u));
      continue;
    }
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      skipped++;
      console.log(`  skip(既存): ${email}`);
      continue;
    }
    await prisma.user.create({
      data: {
        name,
        email,
        role,
        department,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    created++;
    console.log(`  created: ${email} (${role})`);
  }
  console.log(`[provision-staff] 完了: 作成 ${created} 件 / スキップ ${skipped} 件`);
} catch (e) {
  console.error("[provision-staff] エラー:", e?.message ?? e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
