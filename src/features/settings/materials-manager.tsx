"use client";

import { useRef, useState, useTransition } from "react";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";
import {
  createMaterial,
  updateMaterial,
  toggleMaterial,
  deleteMaterial,
  moveMaterial,
} from "@/features/materials/actions";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type MaterialRow = {
  id: string;
  name: string;
  unit: string | null;
  active: boolean;
};

/**
 * 材料マスタの管理UI（設定画面・管理者のみ）。
 * 追加 / 名称・単位の編集 / 有効・無効トグル / 上下ボタンで並び替え / 削除（使用実績が無い場合）。
 * サーバーアクション側の revalidatePath("/settings") で一覧が更新される。
 */
export function MaterialsManager({ materials }: { materials: MaterialRow[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MaterialRow | null>(null);
  const addFormRef = useRef<HTMLFormElement>(null);

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>, successMessage?: string) {
    startTransition(async () => {
      const result = await fn();
      if (result?.error) {
        toast(result.error, { type: "error" });
        return;
      }
      if (successMessage) toast(successMessage);
    });
  }

  function startEdit(m: MaterialRow) {
    setEditingId(m.id);
    setEditName(m.name);
    setEditUnit(m.unit ?? "");
  }

  function saveEdit(id: string) {
    const fd = new FormData();
    fd.set("name", editName);
    fd.set("unit", editUnit);
    startTransition(async () => {
      const result = await updateMaterial(id, fd);
      if (result?.error) {
        toast(result.error, { type: "error" });
        return;
      }
      setEditingId(null);
      toast("保存しました");
    });
  }

  return (
    <div className="space-y-2.5">
      <p className="px-1 text-xs text-ink-muted">
        スタッフが日報で選択する材料のリストです。使わなくなった材料は「無効」に切り替えると選択肢に出なくなります。
      </p>

      {/* 一覧 */}
      {materials.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface/50 px-4 py-6 text-center text-sm text-ink-muted">
          材料がまだ登録されていません
        </div>
      ) : (
        <div className={cn("card divide-y divide-line", pending && "opacity-70")}>
          {materials.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 px-3.5 py-2.5">
              {editingId === m.id ? (
                <>
                  <div className="grid min-w-0 flex-1 grid-cols-[1fr_5rem] gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      aria-label="材料名"
                      className="h-10"
                    />
                    <Input
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value)}
                      aria-label="単位"
                      placeholder="単位"
                      className="h-10"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => saveEdit(m.id)}
                    disabled={pending}
                    aria-label="保存"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white active:scale-95"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    disabled={pending}
                    aria-label="キャンセル"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line-strong text-ink-muted active:scale-95"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  {/* 並び替え */}
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => run(() => moveMaterial(m.id, "up"))}
                      disabled={pending || i === 0}
                      aria-label={`${m.name}を上へ移動`}
                      className="flex h-6 w-8 items-center justify-center rounded text-ink-muted disabled:opacity-30 active:scale-95"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => run(() => moveMaterial(m.id, "down"))}
                      disabled={pending || i === materials.length - 1}
                      aria-label={`${m.name}を下へ移動`}
                      className="flex h-6 w-8 items-center justify-center rounded text-ink-muted disabled:opacity-30 active:scale-95"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>

                  {/* 名称・単位 */}
                  <div className={cn("min-w-0 flex-1", !m.active && "opacity-50")}>
                    <p className="truncate text-sm font-semibold text-ink">{m.name}</p>
                    {m.unit && <p className="text-xs text-ink-muted">単位: {m.unit}</p>}
                  </div>

                  {/* 有効/無効トグル */}
                  <button
                    type="button"
                    onClick={() =>
                      run(() => toggleMaterial(m.id), m.active ? "無効にしました" : "有効にしました")
                    }
                    disabled={pending}
                    role="switch"
                    aria-checked={m.active}
                    aria-label={`${m.name}を${m.active ? "無効" : "有効"}にする`}
                    className={cn(
                      "flex h-10 shrink-0 items-center justify-center rounded-full px-3 text-xs font-bold transition-colors active:scale-95",
                      m.active
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-surface-sunken text-ink-muted",
                    )}
                  >
                    {m.active ? "有効" : "無効"}
                  </button>

                  {/* 編集・削除 */}
                  <button
                    type="button"
                    onClick={() => startEdit(m)}
                    disabled={pending}
                    aria-label={`${m.name}を編集`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken active:scale-95"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(m)}
                    disabled={pending}
                    aria-label={`${m.name}を削除`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-status-danger hover:bg-red-50 active:scale-95 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 追加フォーム */}
      <form
        ref={addFormRef}
        action={(formData: FormData) => {
          startTransition(async () => {
            const result = await createMaterial(formData);
            if (result?.error) {
              toast(result.error, { type: "error" });
              return;
            }
            addFormRef.current?.reset();
            toast("材料を追加しました");
          });
        }}
        className="space-y-2 rounded-xl border border-dashed border-line-strong bg-surface/50 p-3"
      >
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Input name="name" placeholder="材料名（例: 石膏ボード）" aria-label="材料名" required />
          <Input name="unit" placeholder="単位" aria-label="単位" />
        </div>
        <Button type="submit" disabled={pending} className="w-full" size="md">
          <Plus className="h-4 w-4" />
          材料を追加
        </Button>
      </form>

      {/* 削除の二重確認 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        danger
        title="材料を削除しますか？"
        description={
          deleteTarget ? (
            <>
              「<span className="font-bold">{deleteTarget.name}</span>」を削除します。
              日報で使用されている材料は削除できません（その場合は無効化してください）。
            </>
          ) : null
        }
        confirmLabel="削除する"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const result = await deleteMaterial(deleteTarget.id);
          if (result?.error) {
            toast(result.error, { type: "error" });
            return;
          }
          toast("材料を削除しました");
        }}
      />
    </div>
  );
}
