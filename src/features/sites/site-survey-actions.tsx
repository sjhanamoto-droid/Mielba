"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, ArrowRight, Ban, Undo2 } from "lucide-react";
import { startOrderedSite, declineSite, revertSiteToSurvey } from "./actions";
import { Button, LinkButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/**
 * 現調の現場の行き先を決めるカード。
 *
 * 現調から戻ってきて受注が決まったら「受注済にする」で進行中に移し、工程を配線から始める。
 * 現調で書いた住所・キーBOXは現場本体へ引き継ぐ（サーバー側で実施）。
 * 受注しなかったら「見送り」に置き、完工した過去の現場と混ざらないようにする。
 */
export function SiteSurveyActions({
  siteId,
  admin,
}: {
  siteId: string;
  admin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"ordered" | "declined" | null>(null);

  function run(kind: "ordered" | "declined") {
    start(async () => {
      const r = kind === "ordered" ? await startOrderedSite(siteId) : await declineSite(siteId);
      if (r?.error) {
        toast(r.error, { type: "error" });
        return;
      }
      toast(kind === "ordered" ? "受注済にしました" : "見送りにしました");
      // 受注済にしたら、残りの項目をそのまま入力できるよう修正画面へ送る
      if (kind === "ordered") router.push(`/sites/${siteId}/edit`);
      else router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-800/60 dark:bg-violet-950/30">
      <p className="flex items-center gap-1.5 text-sm font-bold text-violet-800 dark:text-violet-200">
        <ClipboardList className="h-4 w-4" />
        現調の現場です
      </p>
      <p className="mt-1 text-xs leading-relaxed text-violet-700/90 dark:text-violet-300/80">
        見てきた内容は現調フォーマットに残してください。受注が決まったら受注済にすると、
        工程が配線から始まり、キーBOXや図面など残りの入力をお願いする状態になります。
      </p>

      <LinkButton
        href={`/sites/${siteId}/survey`}
        variant="outline"
        size="md"
        className="mt-3 w-full bg-surface"
      >
        <ClipboardList className="h-4 w-4" />
        現調フォーマットを開く
      </LinkButton>

      {admin ? (
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            size="md"
            className="flex-1"
            disabled={pending}
            onClick={() => setConfirm("ordered")}
          >
            受注済にする
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="md"
            className="bg-surface"
            disabled={pending}
            onClick={() => setConfirm("declined")}
          >
            <Ban className="h-4 w-4" />
            見送り
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-[11px] font-medium text-violet-700/80 dark:text-violet-300/70">
          受注済にするか見送るかは管理者が決めます。
        </p>
      )}

      <ConfirmDialog
        open={confirm === "ordered"}
        onClose={() => setConfirm(null)}
        title="受注済にしますか？"
        description="工程が「配線」から始まります。現調で書いた住所とキーBOXは現場情報に引き継ぎます。足りない項目があると仮登録として残るので、続けて入力画面を開きます。"
        confirmLabel="受注済にする"
        onConfirm={() => run("ordered")}
      />
      <ConfirmDialog
        open={confirm === "declined"}
        onClose={() => setConfirm(null)}
        danger
        title="見送りにしますか？"
        description="受注しなかった現場として残します。現調の記録や写真は消えません。あとで現調に戻せます。"
        confirmLabel="見送りにする"
        onConfirm={() => run("declined")}
      />
    </div>
  );
}

/** 見送りにした現場を現調に戻す（管理者のみ）。 */
export function SiteRevertToSurvey({ siteId }: { siteId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
      <p className="text-sm font-bold text-amber-800 dark:text-amber-200">見送りにした現場です</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-700/90 dark:text-amber-300/80">
        受注しなかった現場として残しています。話が戻ったら現調に戻せます。
      </p>
      <Button
        type="button"
        variant="outline"
        size="md"
        className="mt-3 w-full bg-surface"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await revertSiteToSurvey(siteId);
            if (r?.error) {
              toast(r.error, { type: "error" });
              return;
            }
            toast("現調に戻しました");
            router.refresh();
          })
        }
      >
        <Undo2 className="h-4 w-4" />
        現調に戻す
      </Button>
    </div>
  );
}
