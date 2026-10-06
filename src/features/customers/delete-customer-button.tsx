"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteCustomer } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/**
 * 顧客の削除（危険操作）。ConfirmDialog で確認してから deleteCustomer を実行する。
 * 紐づく現場は消さず、顧客「その他」へ移す（現場・日報などは残る）。
 */
export function DeleteCustomerButton({
  customerId,
  customerName,
  siteCount,
}: {
  customerId: string;
  customerName: string;
  siteCount: number;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/30">
      <p className="text-sm font-bold text-red-700 dark:text-red-300">危険な操作</p>
      <p className="mt-1 text-xs leading-relaxed text-red-600/90 dark:text-red-300/80">
        顧客を削除します。紐づく現場は削除されず、顧客「その他」に移ります。この操作は取り消せません。
      </p>
      <Button
        type="button"
        variant="danger"
        size="md"
        className="mt-3 w-full"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        この顧客を削除
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        danger
        title="本当に削除しますか？"
        description={
          <>
            「<span className="font-bold">{customerName}</span>」を削除します。
            {siteCount > 0
              ? `紐づく現場 ${siteCount} 件は顧客「その他」に移ります（現場・日報は残ります）。`
              : ""}
            この操作は取り消せません。
          </>
        }
        confirmLabel="削除する"
        onConfirm={async () => {
          const result = await deleteCustomer(customerId);
          // 成功時はサーバー側で /customers へリダイレクトされる（ここには戻らない）
          if (result?.error) toast(result.error, { type: "error" });
        }}
      />
    </div>
  );
}
