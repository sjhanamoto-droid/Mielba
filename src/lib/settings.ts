import "server-only";
import { db } from "./db";

// AppSetting シングルトン（id="singleton"）を取得。無ければ既定値で作成。
export async function getAppSettings() {
  return db.appSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}
