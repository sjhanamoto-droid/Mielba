"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { confirmSiteRegistration } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/**
 * 仮登録→本登録（管理者以上）。図面・キーBOX番号などが無い現場もあるため、
 * 必須項目が揃っていなくても確認のうえ本登録にできる。
 */
export function ConfirmRegistrationButton({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <>
      <Button type="button" size="sm" className="mt-2" onClick={() => setOpen(true)}>
        <BadgeCheck className="h-4 w-4" aria-hidden />
        本登録にする
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="本登録にしますか？"
        description={
          <>
            「<span className="font-bold">{siteName}</span>」を本登録にします。
            図面・キーBOXなど未入力の項目があっても本登録として扱い、仮登録の通知も止まります。
          </>
        }
        confirmLabel="本登録にする"
        onConfirm={async () => {
          const r = await confirmSiteRegistration(siteId);
          if (r.error) toast(r.error, { type: "error" });
          else toast("本登録にしました");
          setOpen(false);
        }}
      />
    </>
  );
}
