"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Clock, Plus, Trash2, Package, Save, Send, AlertCircle,
  HardHat, CalendarClock, History, X, CircleParking, ArrowRightLeft,
  Wallet, Receipt, TrainFront, Boxes,
} from "lucide-react";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { SectionTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { PhotoUploader, type UploaderPhoto } from "@/components/photo-uploader";
import { AiAssistPanel } from "./ai-assist-panel";
import { VoiceInputButton } from "./voice-input-button";
import type { AiExtractResult } from "./ai-actions";
import { createReport, updateReport } from "./actions";
import {
  draftKeyFor, loadDraft, clearDraft, markDraftPending, clearDraftPending,
  shouldOfferRestore, useReportAutosave, useLeaveGuard,
  type ReportDraftData, type MaterialDraftRow, type ExpenseDraftRow,
  type StoredReportDraft,
} from "./report-autosave";
import { cn, toDateInputValue } from "@/lib/utils";
import { EVENT_CATEGORY_LABEL, type EventCategory } from "@/lib/constants";

type MaterialRow = MaterialDraftRow; // { name, quantity, unit, custom }

/** 材料マスター（ページ側で MaterialMaster を取得して渡す） */
export type MaterialOption = { id: string; name: string; unit: string | null };

const CUSTOM_MATERIAL = "__custom__";

export type ReportFormData = {
  id: string;
  workDate: Date | string;
  startTime: string;
  endTime: string;
  aiDraft: string | null;
  detail: string | null;
  aiSummary: string | null;
  handover: string | null;
  handoverNone: boolean | null;
  parkingFee: number | null;
  trainFare: number | null;
  timeChangeReason: string | null;
  stockUsed: boolean | null;
  stockNote: string | null;
  materials: { name: string; quantity: string | null; unit: string | null }[];
  expenses: { label: string; amount: number }[];
  // 既存写真は {id} 参照（base64 は再送しない）
  photos: UploaderPhoto[];
};

/** あり/なし選択。未選択は "" */
type Choice = "HAS" | "NONE" | "";

function SubmitButtons() {
  const { pending } = useFormStatus();
  return (
    <div className="flex gap-2.5">
      {/* 下書きはブラウザ検証をスキップ（未入力でも保存できる） */}
      <button
        type="submit"
        name="status"
        value="DRAFT"
        formNoValidate
        disabled={pending}
        className={buttonClass({ variant: "outline", size: "lg", className: "flex-1" })}
      >
        <Save className="h-5 w-5" />
        下書き保存
      </button>
      <button
        type="submit"
        name="status"
        value="SUBMITTED"
        disabled={pending}
        className={buttonClass({ variant: "primary", size: "lg", className: "flex-1" })}
      >
        <Send className="h-5 w-5" />
        {pending ? "送信中..." : "提出する"}
      </button>
    </div>
  );
}

export function ReportForm({
  mode,
  siteId,
  siteName,
  initial,
  defaultDate,
  defaultStartTime = "08:00",
  defaultEndTime = "17:00",
  eventContext,
  materialOptions = [],
  canInputMaterials = true,
  aiEnabled = false,
}: {
  mode: "new" | "edit";
  siteId: string;
  siteName: string;
  initial?: ReportFormData;
  /** new モードの作業日初期値 "YYYY-MM-DD"（未指定は今日）。後追い入力で過去日を渡す */
  defaultDate?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  eventContext?: {
    title: string;
    category: string | null;
    startTime: string | null;
    endTime: string | null;
    allDay: boolean;
    note: string | null;
  };
  /** 材料マスター（active のみ・sortOrder 順） */
  materialOptions?: MaterialOption[];
  /** 材料・在庫を入力できるか（メインの人のみ true。既定 true） */
  canInputMaterials?: boolean;
  /** ANTHROPIC_API_KEY が設定されているか（AIで整えるボタンの表示） */
  aiEnabled?: boolean;
}) {
  // メインの人以外は材料・在庫欄をロック（表示せず送信もしない）
  const materialsLocked = canInputMaterials === false;
  const submit = mode === "edit" ? updateReport : createReport;
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const isCustomMaterial = (name: string) =>
    name !== "" && !materialOptions.some((o) => o.name === name);

  // ── フォーム state（自動保存の対象。写真は容量のため対象外） ──
  const [workDate, setWorkDate] = useState<string>(
    initial
      ? toDateInputValue(initial.workDate)
      : toDateInputValue(defaultDate ?? new Date()),
  );
  const [startTime, setStartTime] = useState<string>(initial?.startTime ?? defaultStartTime);
  const [endTime, setEndTime] = useState<string>(initial?.endTime ?? defaultEndTime);
  const [aiDraft, setAiDraft] = useState<string>(initial?.aiDraft ?? "");
  const [detail, setDetail] = useState<string>(initial?.detail ?? "");
  // aiSummary は現在 UI から生成しないが、既存日報の値を編集保存時に維持するため保持する
  const [aiSummary] = useState<string>(initial?.aiSummary ?? "");
  const [handover, setHandover] = useState<string>(initial?.handover ?? "");
  // 引き継ぎ あり/なし。編集時: handoverNone→なし / handover 非空→あり / それ以外→未選択
  const [handoverChoice, setHandoverChoice] = useState<Choice>(
    initial ? (initial.handoverNone ? "NONE" : initial.handover ? "HAS" : "") : "",
  );
  // 駐車場代 あり/なし。金額>0→あり / 0→なし / null→未選択
  const [parkingFee, setParkingFee] = useState<string>(
    initial?.parkingFee != null && initial.parkingFee > 0 ? String(initial.parkingFee) : "",
  );
  const [parkingFeeChoice, setParkingFeeChoice] = useState<Choice>(
    initial?.parkingFee != null ? (initial.parkingFee > 0 ? "HAS" : "NONE") : "",
  );
  // 電車賃 あり/なし（駐車場代と同じ扱い）
  const [trainFare, setTrainFare] = useState<string>(
    initial?.trainFare != null && initial.trainFare > 0 ? String(initial.trainFare) : "",
  );
  const [trainFareChoice, setTrainFareChoice] = useState<Choice>(
    initial?.trainFare != null ? (initial.trainFare > 0 ? "HAS" : "NONE") : "",
  );
  // 時間変更理由（8:00-17:00 以外のとき提出必須）
  const [timeChangeReason, setTimeChangeReason] = useState<string>(initial?.timeChangeReason ?? "");
  // 在庫材料の使用 あり/なし＋内容
  const [stockChoice, setStockChoice] = useState<Choice>(
    initial ? (initial.stockUsed === true ? "HAS" : initial.stockUsed === false ? "NONE" : "") : "",
  );
  const [stockNote, setStockNote] = useState<string>(initial?.stockNote ?? "");

  const [materials, setMaterials] = useState<MaterialRow[]>(
    initial?.materials?.map((m) => ({
      name: m.name,
      quantity: m.quantity ?? "",
      unit: m.unit ?? "",
      // マスタに無い既存データは自由入力扱いで初期化
      custom: isCustomMaterial(m.name),
    })) ?? [],
  );

  const [expenses, setExpenses] = useState<ExpenseDraftRow[]>(
    initial?.expenses?.map((e) => ({
      label: e.label,
      amount: e.amount != null ? String(e.amount) : "",
    })) ?? [],
  );

  // ── 自動下書き保存（Top10 #3） ──
  const draftKey = draftKeyFor(mode, siteId, workDate, initial?.id);
  const draftData: ReportDraftData = useMemo(
    () => ({
      workDate, startTime, endTime, aiDraft, detail,
      handover, handoverChoice,
      parkingFee, parkingFeeChoice, trainFare, trainFareChoice,
      timeChangeReason, stockChoice, stockNote,
      materials, expenses,
    }),
    [
      workDate, startTime, endTime, aiDraft, detail,
      handover, handoverChoice,
      parkingFee, parkingFeeChoice, trainFare, trainFareChoice,
      timeChangeReason, stockChoice, stockNote,
      materials, expenses,
    ],
  );
  const initialJsonRef = useRef<string | null>(null);
  if (initialJsonRef.current === null) {
    initialJsonRef.current = JSON.stringify(draftData);
  }

  // マウント時に24時間以内の下書きがあれば復元を提案する
  const [restoreCandidate, setRestoreCandidate] = useState<StoredReportDraft | null>(null);
  const restoreCheckedRef = useRef(false);
  useEffect(() => {
    if (restoreCheckedRef.current) return;
    restoreCheckedRef.current = true;
    const stored = loadDraft(draftKey);
    if (stored && shouldOfferRestore(stored)) {
      // 現在の内容と同一なら提案不要
      if (JSON.stringify(stored.data) !== initialJsonRef.current) {
        setRestoreCandidate(stored);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyRestore() {
    const d = restoreCandidate?.data;
    if (!d) return;
    setWorkDate(d.workDate || workDate);
    setStartTime(d.startTime || startTime);
    setEndTime(d.endTime || endTime);
    // aiDraft/expenses は第2弾、あり/なし選択・電車賃・在庫材料は第3弾で追加。
    // 古いドラフトに無くても既定値（""）で復元する。
    setAiDraft(d.aiDraft ?? "");
    setDetail(d.detail ?? "");
    setHandover(d.handover ?? "");
    setHandoverChoice((d.handoverChoice as Choice) ?? "");
    setParkingFee(d.parkingFee ?? "");
    setParkingFeeChoice((d.parkingFeeChoice as Choice) ?? "");
    setTrainFare(d.trainFare ?? "");
    setTrainFareChoice((d.trainFareChoice as Choice) ?? "");
    setTimeChangeReason(d.timeChangeReason ?? "");
    setStockChoice((d.stockChoice as Choice) ?? "");
    setStockNote(d.stockNote ?? "");
    setMaterials(Array.isArray(d.materials) ? d.materials : []);
    setExpenses(Array.isArray(d.expenses) ? d.expenses : []);
    setRestoreCandidate(null);
  }

  function discardRestore() {
    clearDraft(draftKey);
    setRestoreCandidate(null);
  }

  // 復元バナー表示中は自動保存を止める（下書きを初期値で上書きしない）
  useReportAutosave(draftKey, draftData, restoreCandidate === null);

  // 未保存の変更があれば離脱確認
  const dirty = JSON.stringify(draftData) !== initialJsonRef.current;
  useLeaveGuard(dirty);

  // 成功時は Action 側で redirect。検証エラーのみ返るのでインラインで通知する。
  async function action(formData: FormData) {
    setError(null);
    setFieldErrors({});
    markDraftPending(draftKey);
    const res = await submit(formData);
    if (res?.error) {
      // エラー復帰：pending を解除して復元候補から除外しない
      clearDraftPending(draftKey);
      setError(res.error);
      if ("fieldErrors" in res && res.fieldErrors) {
        setFieldErrors(res.fieldErrors);
      }
    }
  }

  // エラー時は先頭のエラー表示までスクロール
  useEffect(() => {
    if (!error && Object.keys(fieldErrors).length === 0) return;
    const el = formRef.current?.querySelector(".field-error, [data-form-error]");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error, fieldErrors]);

  function updateMaterial(i: number, patch: Partial<MaterialRow>) {
    setMaterials((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function updateExpense(i: number, patch: Partial<ExpenseDraftRow>) {
    setExpenses((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  // AI振り分けの結果を各項目へ反映（上書き。ただし下書きに無い＝空の項目は維持）
  function applyAiExtract(r: AiExtractResult) {
    if (r.workContent.trim()) setDetail(r.workContent);
    if (r.materials.length > 0) {
      setMaterials(
        r.materials.map((m) => ({
          name: m.name,
          quantity: m.quantity ?? "",
          unit: m.unit ?? "",
          custom: isCustomMaterial(m.name),
        })),
      );
    }
    if (r.expenses.length > 0) {
      setExpenses(r.expenses.map((e) => ({ label: e.label, amount: String(e.amount) })));
    }
    // AI が金額/引き継ぎを検出したら あり/なし選択も合わせて確定する（trainFare は対象外）
    if (r.parkingFee != null) {
      setParkingFee(r.parkingFee > 0 ? String(r.parkingFee) : "");
      setParkingFeeChoice(r.parkingFee > 0 ? "HAS" : "NONE");
    }
    if (r.handover.trim()) {
      setHandover(r.handover);
      setHandoverChoice("HAS");
    }
  }

  function onMaterialSelect(i: number, value: string) {
    if (value === CUSTOM_MATERIAL) {
      updateMaterial(i, { custom: true, name: "" });
      return;
    }
    const opt = materialOptions.find((o) => o.name === value);
    // マスタ選択時は unit を自動セット
    updateMaterial(i, {
      custom: false,
      name: value,
      unit: opt?.unit ?? "",
    });
  }

  return (
    <form ref={formRef} action={action} className="space-y-5">
      {mode === "edit" && initial && (
        <input type="hidden" name="reportId" value={initial.id} />
      )}
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="aiSummary" value={aiSummary} readOnly />
      {materialsLocked && <input type="hidden" name="materialsLocked" value="1" />}
      <input
        type="hidden"
        name="materials"
        value={
          materialsLocked
            ? "[]"
            : JSON.stringify(materials.map(({ name, quantity, unit }) => ({ name, quantity, unit })))
        }
      />
      <input
        type="hidden"
        name="expenses"
        value={JSON.stringify(expenses.map(({ label, amount }) => ({ label, amount })))}
      />

      {/* 前回の入力の復元提案（自動下書き保存） */}
      {restoreCandidate && (
        <div className="alert-info flex flex-wrap items-center gap-2">
          <History className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 font-medium">
            前回の入力を復元しますか？（自動保存された下書きがあります）
          </span>
          <span className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={applyRestore}
              className={buttonClass({ variant: "primary", size: "sm" })}
            >
              復元
            </button>
            <button
              type="button"
              onClick={discardRestore}
              className={buttonClass({ variant: "outline", size: "sm" })}
              aria-label="下書きを破棄"
            >
              <X className="h-4 w-4" />
              破棄
            </button>
          </span>
        </div>
      )}

      {/* 現場（自動入力） */}
      <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface-subtle px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <HardHat className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-ink-muted">現場（自動入力）</p>
          <p className="truncate text-sm font-bold text-ink">{siteName}</p>
        </div>
      </div>

      {/* 本日の予定（カレンダー連動）を日報の基盤として表示 */}
      {eventContext && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-brand-700">
            <CalendarClock className="h-4 w-4" />
            本日の予定（カレンダーより）
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {eventContext.category && (
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-surface">
                {EVENT_CATEGORY_LABEL[eventContext.category as EventCategory] ?? eventContext.category}
              </span>
            )}
            <span className="font-bold text-ink">{eventContext.title}</span>
            {!eventContext.allDay && eventContext.startTime && (
              <span className="tnum font-bold text-brand-700">
                {eventContext.startTime}
                {eventContext.endTime ? `〜${eventContext.endTime}` : ""}
              </span>
            )}
          </div>
          {eventContext.note && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-ink-soft">{eventContext.note}</p>
          )}
          {!eventContext.allDay && eventContext.startTime && (
            <p className="mt-1 text-[11px] text-brand-600">
              ※ 作業時間の初期値に予定の時刻を反映しています
            </p>
          )}
        </div>
      )}

      {/* 現場詳細（AI下書き） + AIサポート */}
      <div className="space-y-2.5">
        <Field
          label="現場詳細"
          hint="AIサポートの読み取り元"
          htmlFor="aiDraft"
          description="箇条書きでOK。ここに書いた内容を、AIが作業内容・材料・経費・引き継ぎへ振り分けます。"
        >
          <Textarea
            id="aiDraft"
            name="aiDraft"
            rows={5}
            placeholder="箇条書きでOK。例）1F解体／ベニヤ合板5枚使用／駐車800円／明日は配管"
            value={aiDraft}
            onChange={(e) => setAiDraft(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <VoiceInputButton
            onAppend={(t) =>
              setAiDraft((prev) => (prev.trim() ? prev.replace(/\s*$/, "") + "\n" : "") + t)
            }
          />
          <span className="text-xs text-ink-faint">
            音声で箇条書きを入力できます（キーボードのマイクも利用可）。
          </span>
        </div>
        <AiAssistPanel draft={aiDraft} onApply={applyAiExtract} aiEnabled={aiEnabled} />
      </div>

      {/* 作業内容 */}
      <Field
        label="作業内容"
        hint="提出時必須"
        htmlFor="detail"
        description="当日の作業内容・状況を記録します。下書きは空のままでも保存できます。"
        error={fieldErrors.detail}
      >
        <Textarea
          id="detail"
          name="detail"
          rows={5}
          placeholder="例）1階LDKの解体作業を実施。床下に腐食を確認したため写真共有。明日は配管の据付予定。"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </Field>

      {/* 作業日・作業時間（勤怠内包） */}
      <div className="card space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="作業日" required htmlFor="workDate" error={fieldErrors.workDate} className="min-w-0">
            <Input
              id="workDate"
              name="workDate"
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              required
            />
          </Field>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <Field label="開始時刻" required htmlFor="startTime" hint="勤怠を兼ねます" error={fieldErrors.startTime} className="min-w-0">
              <Input
                id="startTime"
                name="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </Field>
            <Field label="終了時刻" required htmlFor="endTime" error={fieldErrors.endTime} className="min-w-0">
              <Input
                id="endTime"
                name="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </Field>
          </div>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <Clock className="h-3.5 w-3.5" />
          作業時間がそのままタイムカード（勤怠）になります。
        </p>
        {/* 8:00-17:00 以外のときは理由を入力（提出時必須） */}
        {(startTime !== "08:00" || endTime !== "17:00") && (
          <Field
            htmlFor="timeChangeReason"
            error={fieldErrors.timeChangeReason}
            description="8:00〜17:00 以外の作業になった理由を入力してください。"
          >
            <label
              htmlFor="timeChangeReason"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-soft"
            >
              時間変更の理由
              <RequiredBadge />
            </label>
            <Textarea
              id="timeChangeReason"
              name="timeChangeReason"
              rows={2}
              placeholder="例）現場都合で早出。／資材待ちで残業。"
              value={timeChangeReason}
              onChange={(e) => setTimeChangeReason(e.target.value)}
            />
          </Field>
        )}
      </div>

      {/* 経費（駐車場代＝固定行 ＋ その他の経費を＋追加） */}
      <div className="space-y-3">
        <SectionTitle>
          <span className="flex items-center gap-1.5 text-ink-soft">
            <Wallet className="h-4 w-4" />
            経費
          </span>
        </SectionTitle>
        {/* 駐車場代（あり/なし＋金額） */}
        <YesNoField
          label="駐車場代"
          icon={<CircleParking className="h-4 w-4 text-ink-muted" />}
          choiceName="parkingFeeChoice"
          value={parkingFeeChoice}
          onChange={setParkingFeeChoice}
          error={fieldErrors.parkingFee}
          description="「なし」を選ぶと0円で記録します。"
        >
          <div className="relative">
            <CircleParking className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" />
            <Input
              id="parkingFee"
              name="parkingFee"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="例）800"
              className="pl-11"
              value={parkingFee}
              onChange={(e) => setParkingFee(e.target.value)}
            />
          </div>
        </YesNoField>
        {/* 電車賃（あり/なし＋金額） */}
        <YesNoField
          label="電車賃"
          icon={<TrainFront className="h-4 w-4 text-ink-muted" />}
          choiceName="trainFareChoice"
          value={trainFareChoice}
          onChange={setTrainFareChoice}
          error={fieldErrors.trainFare}
          description="「なし」を選ぶと0円で記録します。"
        >
          <div className="relative">
            <TrainFront className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" />
            <Input
              id="trainFare"
              name="trainFare"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="例）480"
              className="pl-11"
              value={trainFare}
              onChange={(e) => setTrainFare(e.target.value)}
            />
          </div>
        </YesNoField>
        {/* その他の経費（動的リスト） */}
        <DynamicSection
          title="その他の経費"
          icon={<Receipt className="h-4 w-4" />}
          hint="高速代・材料立替など（駐車場代以外）"
          emptyLabel="経費を追加"
          onAdd={() => setExpenses((p) => [...p, { label: "", amount: "" }])}
        >
          {expenses.map((e, i) => (
            <RowCard
              key={i}
              onRemove={() => setExpenses((p) => p.filter((_, idx) => idx !== i))}
              className="grid grid-cols-[1fr_7.5rem] items-start gap-2"
            >
              <Input
                aria-label="名目"
                placeholder="名目（例: 高速代）"
                value={e.label}
                onChange={(ev) => updateExpense(i, { label: ev.target.value })}
              />
              <Input
                aria-label="金額"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="金額"
                value={e.amount}
                onChange={(ev) => updateExpense(i, { amount: ev.target.value })}
              />
            </RowCard>
          ))}
        </DynamicSection>
      </div>

      {/* 使用材料・在庫材料（メインの人のみ入力可） */}
      {materialsLocked ? (
        <div className="rounded-2xl border border-line bg-surface-subtle px-4 py-3.5">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Package className="h-4 w-4 text-ink-muted" />
            材料・在庫について
          </span>
          <p className="mt-1 text-sm text-ink-muted">
            使用材料・在庫材料はメインの人が入力します。
          </p>
        </div>
      ) : (
      <>
      <DynamicSection
        title="使用材料"
        icon={<Package className="h-4 w-4" />}
        emptyLabel="使用した材料を追加"
        onAdd={() =>
          setMaterials((p) => [...p, { name: "", quantity: "", unit: "", custom: materialOptions.length === 0 }])
        }
      >
        {materials.map((m, i) => (
          <RowCard
            key={i}
            onRemove={() => setMaterials((p) => p.filter((_, idx) => idx !== i))}
            className="md:grid md:grid-cols-2 md:items-start md:gap-2 md:space-y-0"
          >
            <div className="space-y-2">
              {materialOptions.length > 0 ? (
                <>
                  <Select
                    aria-label="材料名"
                    value={m.custom ? CUSTOM_MATERIAL : m.name}
                    onChange={(e) => onMaterialSelect(i, e.target.value)}
                  >
                    <option value="">材料を選択</option>
                    {materialOptions.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name}
                        {o.unit ? `（${o.unit}）` : ""}
                      </option>
                    ))}
                    <option value={CUSTOM_MATERIAL}>その他（自由入力）</option>
                  </Select>
                  {m.custom && (
                    <Input
                      aria-label="材料名（自由入力）"
                      placeholder="材料名を入力"
                      value={m.name}
                      onChange={(e) => updateMaterial(i, { name: e.target.value })}
                    />
                  )}
                </>
              ) : (
                <Input
                  aria-label="材料名"
                  placeholder="材料名"
                  value={m.name}
                  onChange={(e) => updateMaterial(i, { name: e.target.value })}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="数量"
                placeholder="数量"
                value={m.quantity}
                onChange={(e) => updateMaterial(i, { quantity: e.target.value })}
              />
              <Input
                aria-label="単位"
                placeholder="単位（個/m 等）"
                value={m.unit}
                onChange={(e) => updateMaterial(i, { unit: e.target.value })}
              />
            </div>
          </RowCard>
        ))}
      </DynamicSection>

      {/* 在庫材料の使用（あり/なし＋内容） */}
      <YesNoField
        label="在庫材料の使用"
        icon={<Boxes className="h-4 w-4 text-ink-muted" />}
        choiceName="stockChoice"
        value={stockChoice}
        onChange={setStockChoice}
        error={fieldErrors.stockNote}
        description="弊社在庫（ストック品）を使った場合は「あり」を選び、内容を記載してください。"
      >
        <Textarea
          id="stockNote"
          name="stockNote"
          rows={3}
          placeholder="例）在庫のVVFケーブル1.6-2C を20mほど使用。"
          value={stockNote}
          onChange={(e) => setStockNote(e.target.value)}
        />
      </YesNoField>
      </>
      )}

      {/* 引き継ぎ事項（あり/なし＋次に入る人への申し送り） */}
      <YesNoField
        label="引き継ぎ事項"
        icon={<ArrowRightLeft className="h-4 w-4 text-ink-muted" />}
        choiceName="handoverChoice"
        value={handoverChoice}
        onChange={setHandoverChoice}
        error={fieldErrors.handover}
        description="次に入る人への申し送り。「なし」なら未選択のまま提出できません。"
      >
        <div className="relative">
          <ArrowRightLeft className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-ink-faint" />
          <Textarea
            id="handover"
            name="handover"
            rows={3}
            placeholder="例）3階廊下は塗装乾燥中。明日午前まで立入注意。養生は撤去済み。"
            className="pl-10"
            value={handover}
            onChange={(e) => setHandover(e.target.value)}
          />
        </div>
        <p className="text-xs text-ink-muted">
          提出すると現場の引き継ぎとして起票され、次の担当者が「確認して停止」するまで表示されます。
        </p>
      </YesNoField>

      {/* 写真 */}
      <div className="space-y-2">
        <SectionTitle>写真・動画</SectionTitle>
        <PhotoUploader name="photos" defaultKind="WORK" initial={initial?.photos ?? []} />
      </div>

      <div className="rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5 font-semibold text-ink-soft">
          <AlertCircle className="h-3.5 w-3.5" />
          提出すると関係者に共有され、配達・支給品の予定がカレンダーに反映されます。
        </span>
      </div>

      {error && (
        <div data-form-error className="alert-danger flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <SubmitButtons />
    </form>
  );
}

// ── 動的リストのセクション枠 ──
function DynamicSection({
  title,
  icon,
  emptyLabel,
  hint,
  onAdd,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  emptyLabel: string;
  hint?: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="space-y-2.5">
      <SectionTitle>
        <span className="flex items-center gap-1.5 text-ink-soft">{icon}{title}</span>
      </SectionTitle>
      {hint && <p className="px-1 text-[11px] text-ink-faint">{hint}</p>}
      {hasChildren && <div className="space-y-2.5">{children}</div>}
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong bg-surface-subtle py-3 text-sm font-semibold text-ink-muted active:scale-[0.99]"
      >
        <Plus className="h-4 w-4" />
        {emptyLabel}
      </button>
    </div>
  );
}

// ── 「必須」バッジ（提出時必須の項目に付ける） ──
function RequiredBadge() {
  return (
    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950/50 dark:text-red-300">
      必須
    </span>
  );
}

// ── あり/なし（HAS/NONE）ラジオ ＋「あり」時に children を表示する共通フィールド ──
// 送信は name={choiceName} のラジオ（checked の値をそのまま FormData に載せる）。
function YesNoField({
  label,
  icon,
  choiceName,
  value,
  onChange,
  error,
  description,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  choiceName: string;
  value: Choice;
  onChange: (v: Choice) => void;
  error?: string;
  /** 未選択・なし時に表示する補足説明 */
  description?: string;
  /** value==="HAS" のとき表示する入力欄 */
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2.5", error && "field-error")}>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
        {icon}
        {label}
        <RequiredBadge />
      </span>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
        {(["HAS", "NONE"] as const).map((v) => (
          <label
            key={v}
            className={cn(
              "flex min-h-[44px] min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors",
              value === v
                ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                : "border-line-strong bg-surface text-ink-soft",
            )}
          >
            <input
              type="radio"
              name={choiceName}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              className="sr-only"
            />
            {v === "HAS" ? "あり" : "なし"}
          </label>
        ))}
      </div>
      {value === "HAS" && children}
      {error && (
        <p role="alert" className="text-xs font-semibold text-status-danger">
          {error}
        </p>
      )}
      {description && value !== "HAS" && (
        <p className="text-xs text-ink-muted">{description}</p>
      )}
    </div>
  );
}

// ── 動的リストの1行カード ──
function RowCard({
  onRemove,
  className,
  children,
}: {
  onRemove: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative space-y-2 rounded-xl border border-line bg-surface p-3 pr-10", className)}>
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="削除"
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-ink-muted active:bg-surface-sunken"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
