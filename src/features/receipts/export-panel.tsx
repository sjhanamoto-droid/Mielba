"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { yen } from "@/lib/receipts";
import { cancelExport, exportReceipts } from "./actions";

function download(exportId: string) {
  // attachment で返るので画面はそのまま、ファイルだけ保存される
  window.location.href = `/api/receipts/exports/${exportId}`;
}

/** 「未出力（確認済み）N件をCSVに出力」ボタン */
export function ExportButton({ count, total, nextSeq }: { count: number; total: number; nextSeq: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="w-full md:w-auto"
        disabled={count === 0}
        onClick={() => setOpen(true)}
      >
        <FileSpreadsheet className="h-5 w-5" />
        MF用CSVを出力（{count}件）
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`第${nextSeq}回としてCSVを出力します`}
        confirmLabel="出力する"
        description={
          <>
            確認済みでまだ出力していない <b>{count}件・{yen(total)}</b> を、マネーフォワードの仕訳インポート用CSVにします。
            <br />
            出力したものは「出力済み（第{nextSeq}回）」になり、次からは出力されません。
            <br />
            CSVは下の「出力の履歴」から何度でもダウンロードし直せます。
          </>
        }
        onConfirm={async () => {
          const r = await exportReceipts();
          if ("error" in r) {
            toast(r.error, { type: "error" });
            return;
          }
          download(r.exportId);
          toast(`${r.count}件をCSVに出力しました`);
          router.refresh();
        }}
      />
    </>
  );
}

export type ExportRow = {
  id: string;
  seq: number;
  count: number;
  totalAmount: number;
  createdAtLabel: string;
  createdByName: string | null;
};

/** 出力の履歴（再ダウンロード・取り消し） */
export function ExportHistory({ rows }: { rows: ExportRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [cancelTarget, setCancelTarget] = useState<ExportRow | null>(null);

  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">まだ出力していません。</p>;
  }
  return (
    <>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink">
                第{r.seq}回
                <span className="ml-2 text-sm font-normal text-ink-muted tnum">{r.createdAtLabel}</span>
              </p>
              <p className="text-sm text-ink-soft tnum">
                {r.count}件・{yen(r.totalAmount)}
                {r.createdByName ? `・${r.createdByName}` : ""}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => download(r.id)}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCancelTarget(r)}>
              <Undo2 className="h-4 w-4" /> 取り消す
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        danger
        title={cancelTarget ? `第${cancelTarget.seq}回の出力を取り消しますか？` : ""}
        confirmLabel="取り消す"
        description={
          <>
            この回の {cancelTarget?.count}件 が「未出力」に戻り、次の出力にもう一度含まれます。
            <br />
            <b>マネーフォワードに取り込み済みの場合は、MF側の仕訳も削除してください</b>（タグ「領収書読取 第{cancelTarget?.seq}回」で探せます）。
          </>
        }
        onConfirm={async () => {
          if (!cancelTarget) return;
          const r = await cancelExport(cancelTarget.id);
          if (r.error) {
            toast(r.error, { type: "error" });
            return;
          }
          toast(`第${cancelTarget.seq}回の出力を取り消しました`);
          router.refresh();
        }}
      />
    </>
  );
}
