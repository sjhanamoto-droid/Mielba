import { Inbox } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { EmptyState } from "@/components/ui/misc";
import { InboxList, type InboxItem } from "@/features/inbox/inbox-list";
import { fmtDateTime } from "@/lib/utils";

// 受信ボックス: LINEのMielbaボットに転送されたPDF（図面・工程表）が届く場所。
// ここから現場＋種別（図面/工程表）を選んで振り分けると、現場詳細に表示される。
export default async function InboxPage() {
  await requireUser();

  const [photos, sites] = await Promise.all([
    db.photo.findMany({
      where: { kind: "INBOX" },
      select: { id: true, fileName: true, lineSenderName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    db.site.findMany({
      where: { siteStatus: { in: ["ACTIVE", "SURVEY"] } },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const items: InboxItem[] = photos.map((p) => ({
    id: p.id,
    fileName: p.fileName || "ファイル.pdf",
    senderName: p.lineSenderName || "不明",
    receivedLabel: fmtDateTime(p.createdAt),
  }));

  return (
    <div>
      <PageHeader
        title="受信ボックス"
        subtitle="LINEで届いたPDFを現場へ振り分け"
        backHref="/menu"
      />
      <PageContainer size="narrow">
        {items.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              icon={<Inbox className="h-6 w-6" />}
              title="受信したファイルはありません"
              description="LINEのMielbaボットにPDF（図面・工程表）を転送すると、ここに届きます。"
            />
            <div className="card space-y-1.5 p-4 text-sm text-ink-soft">
              <p className="font-bold text-ink">使い方</p>
              <p>1. LINEで届いたPDFを長押し →「転送」→ Mielbaボットのトークへ送る</p>
              <p>2. この受信ボックスに自動で取り込まれる</p>
              <p>3. 「現場に振り分け」で現場と種別（図面/工程表）を選ぶと現場詳細に表示される</p>
              <p className="pt-1 text-xs text-ink-muted">
                ※ 初回のみ、ボットに社内の合言葉を送って登録が必要です。
              </p>
            </div>
          </div>
        ) : (
          <InboxList items={items} sites={sites} />
        )}
      </PageContainer>
    </div>
  );
}
