"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Clock, Plus, Trash2, Package, Save, Send, AlertCircle,
  HardHat, CalendarClock, History, X, CircleParking, ArrowRightLeft,
} from "lucide-react";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { SectionTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { PhotoUploader, type UploaderPhoto } from "@/components/photo-uploader";
import { AiAssistPanel } from "./ai-assist-panel";
import { createReport, updateReport } from "./actions";
import {
  draftKeyFor, loadDraft, clearDraft, markDraftPending, clearDraftPending,
  shouldOfferRestore, useReportAutosave, useLeaveGuard,
  type ReportDraftData, type MaterialDraftRow,
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
  detail: string | null;
  aiSummary: string | null;
  handover: string | null;
  parkingFee: number | null;
  materials: { name: string; quantity: string | null; unit: string | null }[];
  // 既存写真は {id} 参照（base64 は再送しない）
  photos: UploaderPhoto[];
};

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
  defaultStartTime = "08:00",
  defaultEndTime = "17:00",
  eventContext,
  materialOptions = [],
  aiEnabled = false,
}: {
  mode: "new" | "edit";
  siteId: string;
  siteName: string;
  initial?: ReportFormData;
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
  /** ANTHROPIC_API_KEY が設定されているか（AIで整えるボタンの表示） */
  aiEnabled?: boolean;
}) {
  const submit = mode === "edit" ? updateReport : createReport;
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const isCustomMaterial = (name: string) =>
    name !== "" && !materialOptions.some((o) => o.name === name);

  // ── フォーム state（自動保存の対象。写真は容量のため対象外） ──
  const [workDate, setWorkDate] = useState<string>(
    initial ? toDateInputValue(initial.workDate) : toDateInputValue(new Date()),
  );
  const [startTime, setStartTime] = useState<string>(initial?.startTime ?? defaultStartTime);
  const [endTime, setEndTime] = useState<string>(initial?.endTime ?? defaultEndTime);
  const [detail, setDetail] = useState<string>(initial?.detail ?? "");
  const [aiSummary, setAiSummary] = useState<string>(initial?.aiSummary ?? "");
  const [handover, setHandover] = useState<string>(initial?.handover ?? "");
  const [parkingFee, setParkingFee] = useState<string>(
    initial?.parkingFee != null ? String(initial.parkingFee) : "",
  );

  const [materials, setMaterials] = useState<MaterialRow[]>(
    initial?.materials?.map((m) => ({
      name: m.name,
      quantity: m.quantity ?? "",
      unit: m.unit ?? "",
      // マスタに無い既存データは自由入力扱いで初期化
      custom: isCustomMaterial(m.name),
    })) ?? [],
  );

  // ── 自動下書き保存（Top10 #3） ──
  const draftKey = draftKeyFor(mode, siteId, workDate, initial?.id);
  const draftData: ReportDraftData = useMemo(
    () => ({
      workDate, startTime, endTime, detail, handover, parkingFee,
      materials,
    }),
    [workDate, startTime, endTime, detail, handover, parkingFee, materials],
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
    setDetail(d.detail ?? "");
    setHandover(d.handover ?? "");
    setParkingFee(d.parkingFee ?? "");
    setMaterials(Array.isArray(d.materials) ? d.materials : []);
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
      <input
        type="hidden"
        name="materials"
        value={JSON.stringify(materials.map(({ name, quantity, unit }) => ({ name, quantity, unit })))}
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
      </div>

      {/* 駐車場代（作業時間カードの下） */}
      <Field
        label="駐車場代"
        hint="円・任意"
        htmlFor="parkingFee"
        error={fieldErrors.parkingFee}
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
      </Field>

      {/* 作業内容 + AIサポート */}
      <div className="space-y-2.5">
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
        <AiAssistPanel
          detail={detail}
          hasMaterials={materials.some((m) => m.name.trim() !== "")}
          hasPhotos={(initial?.photos?.length ?? 0) > 0}
          appliedSummary={aiSummary}
          onApply={setAiSummary}
          aiEnabled={aiEnabled}
        />
      </div>

      {/* 使用材料 */}
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

      {/* 引き継ぎ事項（次に入る人への申し送り） */}
      <Field
        label="引き継ぎ事項"
        hint="任意"
        htmlFor="handover"
        description="次に入る人への申し送り。提出すると現場の引き継ぎとして起票され、次の担当者が「確認して停止」するまで表示されます。"
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
      </Field>

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
