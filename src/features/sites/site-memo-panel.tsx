"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Pencil, Send, StickyNote, Trash2, X } from "lucide-react";
import { addSiteMemo, deleteSiteMemo, updateSiteMemo } from "./memo-actions";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { jstDateTimeLabel } from "@/lib/date";
import { cn } from "@/lib/utils";

// 現場メモ（現場詳細の先頭）。
// 開いてすぐ書けるよう入力欄を最上部に置き、投稿は新しい順に「誰が・いつ・何を」で並べる。
// 追加は全員、編集・削除は投稿者本人か管理者。5件を超える分は「もっと見る」で畳む。

export type SiteMemoAuthor = { id: string; name: string; avatarColor: string; avatarImage: string | null };

export type SiteMemoRow = {
  id: string;
  content: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdById: string | null;
  /** 現調のときに書いたメモ（一覧で「現調」と示す） */
  atSurvey?: boolean;
};

type MemoView = SiteMemoRow & { pending?: boolean };

const FAIL_MSG = "通信に失敗しました。もう一度お試しください。";

function tempId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `pending-${crypto.randomUUID()}`
    : `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const INITIAL_VISIBLE = 5;

export function SiteMemoPanel({
  siteId,
  memos,
  authors,
  totalCount,
  currentUser,
  canManageAll,
  siteInSurvey = false,
}: {
  siteId: string;
  /** 新しい順 */
  memos: SiteMemoRow[];
  /** 投稿者（id → 名前・アバター）。同じ人のアバター画像を行ごとに重複して送らないため別渡し */
  authors: Record<string, SiteMemoAuthor>;
  /** DB上の総件数（memos は上限件数まで） */
  totalCount: number;
  currentUser: SiteMemoAuthor;
  /** 管理者＝他人のメモも編集・削除できる */
  canManageAll: boolean;
  /** 現調中の現場か（いま残すメモに「現調」が付く。サーバー側の保存条件と揃える） */
  siteInSurvey?: boolean;
}) {
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // 行操作（編集・削除）のエラーはその行の下に出す（入力欄の下では見えないため）
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 送信直後にその場で1件目として見せる（サーバー反映後は props が置き換わる）
  const [optimisticMemos, addOptimistic] = useOptimistic<MemoView[], MemoView>(
    memos,
    (state, added) => [added, ...state],
  );

  const total = optimisticMemos.length;
  const visible = showAll ? optimisticMemos : optimisticMemos.slice(0, INITIAL_VISIBLE);
  const hiddenCount = total - visible.length;
  const notLoaded = Math.max(0, totalCount - memos.length); // 上限を超えて読み込んでいない件数
  const authorOf = (m: MemoView): SiteMemoAuthor | null =>
    m.createdById ? (m.createdById === currentUser.id ? currentUser : (authors[m.createdById] ?? null)) : null;

  function submit() {
    const content = draft.replace(/\r\n/g, "\n").trim();
    if (!content) {
      setError("メモの内容を入力してください。");
      textareaRef.current?.focus();
      return;
    }
    setError(null);
    const snapshot = draft;
    setDraft("");
    setSubmitting(true);
    startTransition(async () => {
      addOptimistic({
        id: tempId(),
        content,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: currentUser.id,
        atSurvey: siteInSurvey,
        pending: true,
      });
      try {
        const res = await addSiteMemo(siteId, content);
        if (res && "error" in res && res.error) {
          setError(res.error);
          setDraft(snapshot); // 失敗時は入力を戻す
        }
      } catch {
        setError(FAIL_MSG);
        setDraft(snapshot);
      } finally {
        setSubmitting(false);
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // PC では Ctrl/⌘+Enter で送信（スマホの改行操作は妨げない）
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  function beginEdit(m: MemoView) {
    setEditingId(m.id);
    setEditText(m.content);
    setRowError(null);
  }

  function saveEdit(id: string) {
    const content = editText.trim();
    if (!content) {
      setRowError({ id, message: "メモの内容を入力してください。" });
      return;
    }
    setBusyId(id);
    setRowError(null);
    startTransition(async () => {
      try {
        const res = await updateSiteMemo(id, content);
        if (res && "error" in res && res.error) setRowError({ id, message: res.error });
        else setEditingId(null);
      } catch {
        setRowError({ id, message: FAIL_MSG });
      } finally {
        setBusyId(null);
      }
    });
  }

  function remove(id: string) {
    setBusyId(id);
    setConfirmDeleteId(null);
    setRowError(null);
    startTransition(async () => {
      try {
        const res = await deleteSiteMemo(id);
        if (res && "error" in res && res.error) setRowError({ id, message: res.error });
      } catch {
        setRowError({ id, message: FAIL_MSG });
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <Card className="overflow-hidden">
      {/* 入力欄：開いてすぐ書ける位置 */}
      <div className="space-y-2 border-b border-line bg-brand-50/40 p-3.5">
        <label htmlFor="site-memo-input" className="flex items-center gap-1.5 text-xs font-bold text-brand-700">
          <StickyNote className="h-4 w-4" />
          気づいたことをその場でメモ
        </label>
        <Textarea
          id="site-memo-input"
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={2000}
          placeholder="例：搬入口は裏手。駐車は2台まで。施主さんは午前不在が多い"
          className="min-h-[72px] bg-surface"
          aria-invalid={error ? true : undefined}
        />
        <div className="flex items-center justify-end gap-2">
          {error && (
            <p role="alert" className="mr-auto min-w-0 text-[11px] font-semibold text-status-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className={buttonClass({ size: "md", className: "shrink-0" })}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            メモを残す
          </button>
        </div>
      </div>

      {/* 一覧：新しい順 */}
      {total === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-ink-muted">
          まだメモはありません。上の欄からすぐ残せます。
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((m) => {
            const author = authorOf(m);
            const mine = m.createdById === currentUser.id;
            // 投稿者 null: 旧「現場を修正」画面のメモから移行した分（id=legacy_…）か、投稿者が削除済み
            const isLegacy = m.id.startsWith("legacy_");
            const authorName = author?.name ?? (isLegacy ? "現場登録時のメモ" : "（不明）");
            const canManage = !m.pending && (mine || canManageAll);
            const editing = editingId === m.id;
            const busy = busyId === m.id;
            // 作成時の createdAt(DB) と updatedAt(Prisma) はミリ秒単位でずれうるので、数秒以上の差を「編集済み」とみなす
            const edited =
              new Date(m.updatedAt).getTime() - new Date(m.createdAt).getTime() > 5_000;
            return (
              <li key={m.id} className={cn("flex gap-3 px-4 py-3.5", m.pending && "opacity-60")}>
                <Avatar
                  name={author ? author.name : "メモ"}
                  color={author?.avatarColor ?? "#9ca3af"}
                  image={author?.avatarImage}
                  size="sm"
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={cn("text-sm font-bold", author ? "text-ink" : "text-ink-muted")}>
                      {authorName}
                    </span>
                    <span className="text-xs text-ink-muted tnum">
                      {m.pending ? "送信中…" : jstDateTimeLabel(m.createdAt)}
                      {edited && !m.pending && "（編集済み）"}
                    </span>
                    {m.atSurvey && <Badge tone="survey">現調</Badge>}
                  </div>

                  {editing ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        autoFocus
                        className="min-h-[80px]"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={busy}
                          className={buttonClass({ variant: "outline", size: "sm" })}
                        >
                          <X className="h-4 w-4" />
                          やめる
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(m.id)}
                          disabled={busy}
                          className={buttonClass({ size: "sm" })}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Check className="h-4 w-4" aria-hidden />
                          )}
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">
                      {m.content}
                    </p>
                  )}

                  {canManage && !editing && (
                    confirmDeleteId === m.id ? (
                      /* 誤タップ防止：その場で2段階確認 */
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                        <span className="text-xs font-semibold text-status-danger">このメモを削除しますか？</span>
                        <div className="ml-auto flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={busy}
                            className={buttonClass({ variant: "outline", size: "sm" })}
                          >
                            やめる
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(m.id)}
                            disabled={busy}
                            className={buttonClass({ variant: "danger", size: "sm" })}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                            削除する
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1.5 flex gap-1">
                        <button
                          type="button"
                          onClick={() => beginEdit(m)}
                          disabled={busy}
                          className="flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ink-muted hover:bg-surface-sunken"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(m.id)}
                          disabled={busy}
                          className="flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ink-muted hover:bg-red-50 hover:text-status-danger"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          )}
                          削除
                        </button>
                      </div>
                    )
                  )}
                  {rowError?.id === m.id && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-status-danger">
                      {rowError.message}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex min-h-[44px] w-full items-center justify-center gap-1 border-t border-line text-sm font-semibold text-brand-600 hover:bg-surface-subtle"
        >
          <ChevronDown className="h-4 w-4" />
          残り {hiddenCount} 件のメモを表示
        </button>
      )}
      {showAll && notLoaded > 0 && (
        <p className="border-t border-line px-4 py-2 text-center text-[11px] text-ink-faint">
          これより古い {notLoaded} 件は表示していません。
        </p>
      )}
    </Card>
  );
}
