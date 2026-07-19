"use client";

// 日報フォームの自動下書き保存（localStorage）
// - 800ms デバウンスで保存（写真は容量が大きいため対象外）
// - 24時間以内の下書きがあればマウント時に復元を提案する
// - 送信直前に pending マークを付け、5分以内は復元バナーを出さない
//   （送信成功＝redirect でフォームが破棄された直後の誤提案を防ぐ）

import { useEffect, useRef } from "react";

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24時間
const PENDING_SUPPRESS_MS = 5 * 60 * 1000; // 5分
const DEBOUNCE_MS = 800;

export type MaterialDraftRow = {
  name: string;
  quantity: string;
  unit: string;
  custom: boolean;
};

// 第1弾で発注(orders)・次回工程(processes)・注意点メモ(memo)は撤去した。
// 古い保存済みドラフトにこれらが残っていても、復元時は単に無視する（後方互換）。
export type ReportDraftData = {
  workDate: string;
  startTime: string;
  endTime: string;
  detail: string;
  handover: string;
  parkingFee: string;
  materials: MaterialDraftRow[];
};

export type StoredReportDraft = {
  data: ReportDraftData;
  savedAt: number;
  pendingAt?: number;
};

/** 下書きキー（新規: siteId + 作業日 / 編集: reportId） */
export function draftKeyFor(
  mode: "new" | "edit",
  siteId: string,
  workDate: string,
  reportId?: string,
): string {
  return mode === "edit" && reportId
    ? `mielba:draft:edit:${reportId}`
    : `mielba:draft:new:${siteId}:${workDate}`;
}

/** 24時間以内の下書きを読み込む（壊れていたら null） */
export function loadDraft(key: string): StoredReportDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReportDraft;
    if (!parsed || typeof parsed !== "object" || !parsed.data) return null;
    if (typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** 復元バナーを出すべきか（送信直後 pending 5分以内は出さない） */
export function shouldOfferRestore(draft: StoredReportDraft): boolean {
  if (draft.pendingAt && Date.now() - draft.pendingAt < PENDING_SUPPRESS_MS) {
    return false;
  }
  return true;
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // localStorage 不可（プライベートモード等）は無視
  }
}

/** 送信直前に呼ぶ：pending マークを付ける */
export function markDraftPending(key: string): void {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoredReportDraft;
    parsed.pendingAt = Date.now();
    window.localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    // 無視
  }
}

/** 送信がエラーで戻ってきたら呼ぶ：pending マークを外す */
export function clearDraftPending(key: string): void {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoredReportDraft;
    delete parsed.pendingAt;
    window.localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    // 無視
  }
}

/**
 * フォーム入力を 800ms デバウンスで localStorage に自動保存する。
 * マウント直後のスナップショットは保存しない（既存の下書きを
 * 初期値で上書きして復元候補を壊さないため）。
 */
export function useReportAutosave(
  key: string,
  data: ReportDraftData,
  enabled: boolean,
): void {
  const lastSaved = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const json = JSON.stringify(data);
    // 初回はスナップショットだけ取り、保存しない
    if (lastSaved.current === null) {
      lastSaved.current = json;
      return;
    }
    if (lastSaved.current === json) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastSaved.current = json;
      try {
        window.localStorage.setItem(
          key,
          JSON.stringify({ data, savedAt: Date.now() } satisfies StoredReportDraft),
        );
      } catch {
        // 容量超過等は無視（自動保存はベストエフォート）
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, data, enabled]);
}

/** 未保存の変更がある間、離脱確認（beforeunload）を出す */
export function useLeaveGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome では returnValue の設定が必要
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
