"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { restoreFromTrash } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export function RestoreButton({ trashId, label, kindLabel }: { trashId: string; label: string; kindLabel: string }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RotateCcw className="h-4 w-4" aria-hidden />
        元に戻す
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${kindLabel}を元に戻しますか？`}
        description={
          <>
            「<span className="font-bold">{label}</span>」を、削除する前の状態に戻します。
          </>
        }
        confirmLabel="元に戻す"
        onConfirm={async () => {
          const r = await restoreFromTrash(trashId);
          if (r.error) toast(r.error, { type: "error" });
          else toast(`${kindLabel}を元に戻しました`);
          setOpen(false);
        }}
      />
    </>
  );
}
