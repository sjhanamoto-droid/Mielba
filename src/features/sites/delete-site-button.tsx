"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteSite } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/**
 * 現場の削除（危険操作）。ConfirmDialog で二重確認してから deleteSite を実行する。
 * ステータスや日報の有無に関わらず削除でき、紐づくデータも全て消える（取り消し不可）。
 */
export function DeleteSiteButton({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/30">
      <p className="text-sm font-bold text-red-700 dark:text-red-300">危険な操作</p>
      <p className="mt-1 text-xs leading-relaxed text-red-600/90 dark:text-red-300/80">
        現場を削除すると、日報・現調記録・写真・予定・TODO・材料など紐づくデータが
        全て完全に削除されます。この操作は取り消せません。
      </p>
      <Button
        type="button"
        variant="danger"
        size="md"
        className="mt-3 w-full"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        この現場を削除
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        danger
        title="本当に削除しますか？"
        description={
          <>
            「<span className="font-bold">{siteName}</span>」を完全に削除します。
            日報・写真・予定など、この現場の全てのデータが消えます。
            この操作は取り消せません。
          </>
        }
        confirmLabel="削除する"
        onConfirm={async () => {
          const result = await deleteSite(siteId);
          // 成功時はサーバー側で /sites へリダイレクトされる（ここには戻らない）
          if (result && "error" in result && result.error) {
            toast(result.error, { type: "error" });
          }
        }}
      />
    </div>
  );
}
