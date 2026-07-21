// デフォルト顧客「その他」を常に存在させる（顧客登録に該当しない現場の受け皿）。
// デプロイ毎に冪等に実行：同名が無ければ作成、あれば何もしない。失敗してもビルドは止めない。

import { PrismaClient } from "@prisma/client";

const NAME = "その他";
const prisma = new PrismaClient();

try {
  const existing = await prisma.customer.findFirst({ where: { name: NAME } });
  if (existing) {
    console.log(`[ensure-default-customer] 既に存在: ${NAME}`);
  } else {
    await prisma.customer.create({
      data: {
        name: NAME,
        // 顧客登録に該当しない現場をまとめるための既定顧客
        memo: "顧客登録に該当しない現場の受け皿（デフォルト）",
      },
    });
    console.log(`[ensure-default-customer] 作成しました: ${NAME}`);
  }
} catch (e) {
  // 既定顧客の作成失敗でデプロイ全体を止めない（次回デプロイで再試行される）
  console.error("[ensure-default-customer] エラー（続行）:", e?.message ?? e);
} finally {
  await prisma.$disconnect();
}
