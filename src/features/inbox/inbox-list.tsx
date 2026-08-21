"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText, ChevronRight, Trash2, X, Loader2, HardHat, FolderInput,
  CalendarRange,
} from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Select, Input } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { assignInboxFile, deleteInboxFile } from "./actions";

export type InboxItem = {
  id: string;
  fileName: string;
  senderName: string;
  receivedLabel: string; // 受信日時（サーバー整形済み）
};

export type InboxSiteOption = { id: string; name: string };

/**
 * 受信ボックスの一覧＋振り分けシート。
 * 各行: PDFファイル名・送信者・受信日時。「内容を見る」→ アプリ内PDFビューア、
 * 「振り分け」→ 現場＋種別（図面/工程表）を選んで登録、削除 → 誤送信の破棄。
 */
export function InboxList({
  items,
  sites,
}: {
  items: InboxItem[];
  sites: InboxSiteOption[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // 振り分けシートの対象アイテム（null=閉）
  const [target, setTarget] = useState<InboxItem | null>(null);
  const [siteId, setSiteId] = useState("");
  const [kind, setKind] = useState<"DRAWING" | "SCHEDULE">("DRAWING");
  const [caption, setCaption] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<InboxItem | null>(null);

  function openAssign(item: InboxItem) {
    setTarget(item);
    setSiteId("");
    setKind("DRAWING");
    setCaption(item.fileName.replace(/\.pdf$/i, ""));
  }

  function submitAssign() {
    if (!target || pending) return;
    if (!siteId) {
      toast("現場を選択してください", { type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await assignInboxFile({
        photoId: target.id,
        siteId,
        kind,
        caption,
      });
      if (res.error) {
        toast(res.error, { type: "error" });
        return;
      }
      toast("現場に振り分けました");
      setTarget(null);
      router.refresh();
    });
  }

  function submitDelete() {
    const item = confirmDelete;
    if (!item) return;
    startTransition(async () => {
      const res = await deleteInboxFile(item.id);
      if (res.error) {
        toast(res.error, { type: "error" });
        return;
      }
      toast("削除しました");
      router.refresh();
    });
  }

  return (
    <>
      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.id} className="card space-y-2.5 p-4">
            <div className="flex items-start gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500 dark:bg-red-950/40">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-bold leading-snug text-ink">
                  {item.fileName}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {item.senderName} ・ {item.receivedLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDelete(item)}
                disabled={pending}
                aria-label={`${item.fileName} を削除`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted active:bg-surface-sunken"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/photos/${item.id}`}
                className={buttonClass({ variant: "outline", size: "md", className: "flex-1" })}
              >
                <FileText className="h-4 w-4" />
                内容を見る
              </Link>
              <button
                type="button"
                onClick={() => openAssign(item)}
                disabled={pending}
                className={buttonClass({ variant: "primary", size: "md", className: "flex-1" })}
              >
                <FolderInput className="h-4 w-4" />
                現場に振り分け
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 振り分けシート */}
      {target && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in"
          onClick={() => !pending && setTarget(null)}
        >
          <div
            className="w-full max-w-app rounded-t-3xl bg-surface p-5 pb-8 animate-slide-up safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-ink">現場に振り分け</h2>
                <p className="truncate text-xs text-ink-muted">{target.fileName}</p>
              </div>
              <button
                onClick={() => !pending && setTarget(null)}
                aria-label="閉じる"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="inbox-site" className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
                  <HardHat className="h-4 w-4" />
                  現場
                </label>
                <Select
                  id="inbox-site"
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                >
                  <option value="">現場を選択</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <span className="text-sm font-semibold text-ink-soft">種別</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: "DRAWING", label: "図面", icon: FileText },
                      { v: "SCHEDULE", label: "工程表", icon: CalendarRange },
                    ] as const
                  ).map(({ v, label, icon: Icon }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setKind(v)}
                      aria-pressed={kind === v}
                      className={cn(
                        "flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors",
                        kind === v
                          ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                          : "border-line-strong bg-surface text-ink-soft",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="inbox-caption" className="text-sm font-semibold text-ink-soft">
                  表示名（任意）
                </label>
                <Input
                  id="inbox-caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="例）1階平面図"
                />
              </div>

              <button
                type="button"
                onClick={submitAssign}
                disabled={pending}
                className={buttonClass({ variant: "primary", size: "lg", className: "w-full" })}
              >
                {pending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
                この現場に登録する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認 */}
      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        danger
        title="このファイルを削除しますか？"
        description={
          confirmDelete ? (
            <>
              「<span className="font-bold">{confirmDelete.fileName}</span>
              」を受信ボックスから削除します。元に戻せません。
            </>
          ) : null
        }
        confirmLabel="削除する"
        onConfirm={submitDelete}
      />
    </>
  );
}
