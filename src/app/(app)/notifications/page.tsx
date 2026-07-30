import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { listNotifications } from "@/features/notifications/actions";
import { NotificationList } from "@/features/notifications/notification-list";

// 通知センター：自分の通知を新しい順で表示する。
// 未読の強調・タップで遷移＆既読化・「すべて既読」は NotificationList（クライアント）が担う。
export default async function NotificationsPage() {
  await requireUser();
  const notifications = await listNotifications();

  return (
    <div>
      <PageHeader title="通知" subtitle="現場・日報のお知らせ" />
      <PageContainer size="narrow">
        <NotificationList initial={notifications} />
      </PageContainer>
    </div>
  );
}
