"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Clock, Plus, Trash2, Package, Truck, ClipboardList, Save, Send, AlertCircle, HardHat, CalendarClock,
} from "lucide-react";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SectionTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { PhotoUploader } from "@/components/photo-uploader";
import { AiAssistPanel } from "./ai-assist-panel";
import { createReport, updateReport } from "./actions";
import { cn, toDateInputValue } from "@/lib/utils";
import { EVENT_CATEGORY_LABEL, type PhotoKind, type EventCategory } from "@/lib/constants";

type MaterialRow = { name: string; quantity: string; unit: string };
type OrderRow = { name: string; quantity: string; supplier: string; deliveryDate: string };
type ProcessRow = { content: string; vendors: string; supplyDeliveryDate: string };
type PhotoInit = {
  dataUrl: string;
  caption: string;
  kind: PhotoKind;
  isVideo: boolean;
  width?: number;
  height?: number;
};

export type ReportFormData = {
  id: string;
  workDate: Date | string;
  startTime: string;
  endTime: string;
  detail: string | null;
  aiSummary: string | null;
  memo: string | null;
  materials: { name: string; quantity: string | null; unit: string | null }[];
  orders: {
    name: string;
    quantity: string | null;
    supplier: string | null;
    deliveryDate: Date | string | null;
  }[];
  nextProcesses: {
    content: string | null;
    vendors: string | null;
    supplyDeliveryDate: Date | string | null;
  }[];
  photos: PhotoInit[];
};

function SubmitButtons() {
  const { pending } = useFormStatus();
  return (
    <div className="flex gap-2.5">
      <button
        type="submit"
        name="status"
        value="DRAFT"
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
}) {
  const submit = mode === "edit" ? updateReport : createReport;
  const [error, setError] = useState<string | null>(null);
  // 成功時は Action 側で redirect。検証エラーのみ返るのでインライン赤バナーで通知する。
  async function action(formData: FormData) {
    setError(null);
    const res = await submit(formData);
    if (res?.error) {
      setError(res.error);
    }
  }

  // 現場詳細・AI要約はフォームの state で制御し、AIサポートへ props で渡す
  const [detail, setDetail] = useState<string>(initial?.detail ?? "");
  const [aiSummary, setAiSummary] = useState<string>(initial?.aiSummary ?? "");

  const [materials, setMaterials] = useState<MaterialRow[]>(
    initial?.materials?.map((m) => ({
      name: m.name,
      quantity: m.quantity ?? "",
      unit: m.unit ?? "",
    })) ?? [],
  );
  const [orders, setOrders] = useState<OrderRow[]>(
    initial?.orders?.map((o) => ({
      name: o.name,
      quantity: o.quantity ?? "",
      supplier: o.supplier ?? "",
      deliveryDate: toDateInputValue(o.deliveryDate),
    })) ?? [],
  );
  const [processes, setProcesses] = useState<ProcessRow[]>(
    initial?.nextProcesses?.map((p) => ({
      content: p.content ?? "",
      vendors: p.vendors ?? "",
      supplyDeliveryDate: toDateInputValue(p.supplyDeliveryDate),
    })) ?? [],
  );

  const defaultDate = initial ? toDateInputValue(initial.workDate) : toDateInputValue(new Date());

  return (
    <form action={action} className="space-y-5">
      {mode === "edit" && initial && (
        <input type="hidden" name="reportId" value={initial.id} />
      )}
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="aiSummary" value={aiSummary} readOnly />
      <input type="hidden" name="materials" value={JSON.stringify(materials)} />
      <input type="hidden" name="orders" value={JSON.stringify(orders)} />
      <input type="hidden" name="nextProcesses" value={JSON.stringify(processes)} />

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
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-brand-700">
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
          <Field label="作業日" required htmlFor="workDate">
            <Input id="workDate" name="workDate" type="date" defaultValue={defaultDate} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="開始時刻" required htmlFor="startTime" hint="勤怠を兼ねます">
              <Input
                id="startTime"
                name="startTime"
                type="time"
                defaultValue={initial?.startTime ?? defaultStartTime}
                required
              />
            </Field>
            <Field label="終了時刻" required htmlFor="endTime">
              <Input
                id="endTime"
                name="endTime"
                type="time"
                defaultValue={initial?.endTime ?? defaultEndTime}
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

      {/* 現場詳細 + AIサポート */}
      <div className="space-y-2.5">
        <Field label="現場詳細" required htmlFor="detail" description="当日の作業内容・状況を記録します。">
          <Textarea
            id="detail"
            name="detail"
            rows={5}
            placeholder="例）1階LDKの解体作業を実施。床下に腐食を確認したため写真共有。明日は配管の据付予定。"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            required
          />
        </Field>
        <AiAssistPanel
          detail={detail}
          hasMaterials={materials.some((m) => m.name.trim() !== "")}
          hasPhotos={(initial?.photos?.length ?? 0) > 0}
          appliedSummary={aiSummary}
          onApply={setAiSummary}
        />
      </div>

      {/* 使用材料 */}
      <DynamicSection
        title="使用材料"
        icon={<Package className="h-4 w-4" />}
        emptyLabel="使用した材料を追加"
        onAdd={() => setMaterials((p) => [...p, { name: "", quantity: "", unit: "" }])}
      >
        {materials.map((m, i) => (
          <RowCard
            key={i}
            onRemove={() => setMaterials((p) => p.filter((_, idx) => idx !== i))}
            className="md:grid md:grid-cols-2 md:items-start md:gap-2 md:space-y-0"
          >
            <Input
              aria-label="材料名"
              placeholder="材料名"
              value={m.name}
              onChange={(e) =>
                setMaterials((p) => p.map((r, idx) => (idx === i ? { ...r, name: e.target.value } : r)))
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="数量"
                placeholder="数量"
                value={m.quantity}
                onChange={(e) =>
                  setMaterials((p) => p.map((r, idx) => (idx === i ? { ...r, quantity: e.target.value } : r)))
                }
              />
              <Input
                aria-label="単位"
                placeholder="単位（個/m 等）"
                value={m.unit}
                onChange={(e) =>
                  setMaterials((p) => p.map((r, idx) => (idx === i ? { ...r, unit: e.target.value } : r)))
                }
              />
            </div>
          </RowCard>
        ))}
      </DynamicSection>

      {/* 注意点メモ */}
      <Field label="注意点メモ" htmlFor="memo" description="申し送り・現場の注意点など。">
        <Textarea
          id="memo"
          name="memo"
          rows={3}
          placeholder="例）キーBOXの暗証番号変更あり。次回入場時は元請に確認。"
          defaultValue={initial?.memo ?? ""}
        />
      </Field>

      {/* 材料発注 → 配達予定日 */}
      <DynamicSection
        title="材料発注"
        icon={<Truck className="h-4 w-4" />}
        emptyLabel="発注する材料を追加"
        hint="配達予定日は提出時にカレンダーへ反映されます。"
        onAdd={() =>
          setOrders((p) => [...p, { name: "", quantity: "", supplier: "", deliveryDate: "" }])
        }
      >
        {orders.map((o, i) => (
          <RowCard
            key={i}
            onRemove={() => setOrders((p) => p.filter((_, idx) => idx !== i))}
            className="md:grid md:grid-cols-3 md:items-start md:gap-2 md:space-y-0"
          >
            <Input
              aria-label="発注する材料名"
              placeholder="材料名"
              value={o.name}
              onChange={(e) =>
                setOrders((p) => p.map((r, idx) => (idx === i ? { ...r, name: e.target.value } : r)))
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="発注数量"
                placeholder="数量"
                value={o.quantity}
                onChange={(e) =>
                  setOrders((p) => p.map((r, idx) => (idx === i ? { ...r, quantity: e.target.value } : r)))
                }
              />
              <Input
                aria-label="仕入先"
                placeholder="仕入先"
                value={o.supplier}
                onChange={(e) =>
                  setOrders((p) => p.map((r, idx) => (idx === i ? { ...r, supplier: e.target.value } : r)))
                }
              />
            </div>
            <Field label="配達予定日" hint="任意">
              <Input
                type="date"
                value={o.deliveryDate}
                onChange={(e) =>
                  setOrders((p) => p.map((r, idx) => (idx === i ? { ...r, deliveryDate: e.target.value } : r)))
                }
              />
            </Field>
          </RowCard>
        ))}
      </DynamicSection>

      {/* 次回工程打合せ → 業者・支給品納品日 */}
      <DynamicSection
        title="次回工程打合せ"
        icon={<ClipboardList className="h-4 w-4" />}
        emptyLabel="次回工程を追加"
        hint="支給品納品日は提出時にカレンダーへ反映されます。"
        onAdd={() =>
          setProcesses((p) => [...p, { content: "", vendors: "", supplyDeliveryDate: "" }])
        }
      >
        {processes.map((p, i) => (
          <RowCard
            key={i}
            onRemove={() => setProcesses((arr) => arr.filter((_, idx) => idx !== i))}
            className="md:grid md:grid-cols-2 md:items-start md:gap-2 md:space-y-0"
          >
            <Textarea
              aria-label="打合せ内容・次回作業"
              rows={2}
              placeholder="打合せ内容・次回作業"
              value={p.content}
              onChange={(e) =>
                setProcesses((arr) => arr.map((r, idx) => (idx === i ? { ...r, content: e.target.value } : r)))
              }
              className="md:col-span-2"
            />
            <Input
              aria-label="絡む業者"
              placeholder="絡む業者（複数はカンマ区切り）"
              value={p.vendors}
              onChange={(e) =>
                setProcesses((arr) => arr.map((r, idx) => (idx === i ? { ...r, vendors: e.target.value } : r)))
              }
            />
            <Field label="支給品納品日" hint="任意">
              <Input
                type="date"
                value={p.supplyDeliveryDate}
                onChange={(e) =>
                  setProcesses((arr) =>
                    arr.map((r, idx) => (idx === i ? { ...r, supplyDeliveryDate: e.target.value } : r)),
                  )
                }
              />
            </Field>
          </RowCard>
        ))}
      </DynamicSection>

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
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
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
