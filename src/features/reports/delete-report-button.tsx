"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteReport } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/**
 * 日報の削除（管理者以上のみ表示）。ConfirmDialog で確認してから deleteReport を実行する。
 * 写真・経費・コメントなど日報に紐づくデータも消える（取り消し不可）。
 */
export function DeleteReportButton({ reportId, label }: { reportId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/30">
      <p className="text-sm font-bold text-red-700 dark:text-red-300">管理者メニュー</p>
      <p className="mt-1 text-xs leading-relaxed text-red-600/90 dark:text-red-300/80">
        日報を削除すると、写真・経費・材料・コメントなども一緒に消えます。この操作は取り消せません。
      </p>
      <Button
        type="button"
        variant="danger"
        size="md"
        className="mt-3 w-full"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        この日報を削除
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        danger
        title="日報を削除しますか？"
        description={
          <>
            「<span className="font-bold">{label}</span>」の日報を削除します。
            写真・経費・材料・コメントなども全て消えます。この操作は取り消せません。
          </>
        }
        confirmLabel="削除する"
        onConfirm={async () => {
          const result = await deleteReport(reportId);
          // 成功時はサーバー側で現場の日報一覧へリダイレクトされる（ここには戻らない）
          if (result?.error) toast(result.error, { type: "error" });
        }}
      />
    </div>
  );
}
