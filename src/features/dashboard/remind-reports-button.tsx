"use client";

import { useState, useTransition } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/modal";
import { remindMissingReports } from "./actions";

// ダッシュボードの「日報 提出状況」カードから、未提出者へリマインド通知を送るボタン（管理者用）。
// 送信先は当日の未提出者本人のみ。任意タイミングで押せる（都度送信）。
export function RemindReportsButton({ pendingCount }: { pendingCount: number }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (pendingCount <= 0) return null;

  function send() {
    startTransition(async () => {
      const res = await remindMissingReports();
      if (res.error) {
        toast(res.error, { type: "error" });
        return;
      }
      if (!res.count) {
        toast("未提出の担当者はいませんでした（全員提出済み）");
        return;
      }
      toast(`未提出の ${res.count} 名に日報提出のリマインドを送信しました`);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-60 dark:bg-amber-600"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> 送信中...
          </>
        ) : (
          <>
            <BellRing className="h-4 w-4" /> 未提出の {pendingCount} 名に提出をリマインド
          </>
        )}
      </button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="日報の提出をリマインドしますか？"
        description={
          <>
            本日まだ日報を提出していない担当者に、
            「日報の提出をお願いします」の通知（アプリ内＋プッシュ）を送信します。
            提出済みの方には送信されません。
          </>
        }
        confirmLabel="送信する"
        onConfirm={send}
      />
    </>
  );
}
