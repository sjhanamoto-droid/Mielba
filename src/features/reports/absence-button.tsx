"use client";

import { useState } from "react";
import { UserX } from "lucide-react";
import { submitAbsence } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ABSENCE_REASONS, ABSENCE_REASON_LABEL, type AbsenceReason } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * 日報の「現場不参加」。休み・行かなかった日に、理由を選んで日報の代わりに提出する。
 * 提出すると稼働時間・人工に入らず、その日の現場入り（配員）からも外れる。
 */
export function AbsenceButton({
  siteId,
  dateKey,
  targetUserId,
}: {
  siteId: string;
  dateKey: string;
  targetUserId?: string; // 管理者が他人の日報を不参加にするとき
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AbsenceReason | null>(null);
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full border-line-strong text-ink-soft"
        onClick={() => setOpen(true)}
      >
        <UserX className="h-5 w-5" aria-hidden />
        現場不参加（休み・行かなかった）
      </Button>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <UserX className="h-5 w-5 text-ink-muted" aria-hidden />
        <p className="text-base font-bold text-ink">現場不参加</p>
      </div>
      <p className="text-xs leading-relaxed text-ink-muted">
        理由を選んで提出すると、この日の日報の代わりになります。稼働時間には入らず、この日の現場入りからも外れます。
      </p>
      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink-soft">理由</p>
        <div className="flex flex-wrap gap-2">
          {ABSENCE_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              aria-pressed={reason === r}
              className={cn(
                "h-10 rounded-full border px-4 text-sm font-bold transition-colors",
                reason === r
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-line bg-surface text-ink-soft active:bg-surface-sunken",
              )}
            >
              {ABSENCE_REASON_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setReason(null);
          }}
        >
          やめる
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={!reason}
          onClick={() => setConfirming(true)}
        >
          不参加で提出
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="現場不参加で提出しますか？"
        description={
          reason ? (
            <>
              理由「<span className="font-bold">{ABSENCE_REASON_LABEL[reason]}</span>」で提出します。
              この日は稼働時間に入らず、現場入りからも外れます。
            </>
          ) : undefined
        }
        confirmLabel="提出する"
        onConfirm={async () => {
          if (!reason) return;
          const r = await submitAbsence(siteId, dateKey, reason, targetUserId);
          // 成功時はサーバー側で日報詳細へリダイレクトされる
          if (r?.error) {
            toast(r.error, { type: "error" });
            setConfirming(false);
          }
        }}
      />
    </div>
  );
}
