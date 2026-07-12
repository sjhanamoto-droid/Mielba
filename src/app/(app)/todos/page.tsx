import { redirect } from "next/navigation";

// TODO 機能は非表示。直リンク／ブックマークからのアクセスはホームへ誘導する。
// （機能自体は残置。再開する場合はナビ・ダッシュボードの導線と本ページを戻す）
export default function TodosPage() {
  redirect("/");
}
