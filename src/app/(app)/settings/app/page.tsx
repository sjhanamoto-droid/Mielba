import { requireAdmin } from "@/lib/session";
import { getAppSettings } from "@/lib/settings";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card } from "@/components/ui/card";
import { AppSettingsForm } from "@/features/settings/app-settings-form";

export default async function AppSettingsPage() {
  await requireAdmin();
  const settings = await getAppSettings();

  return (
    <div>
      <PageHeader title="アプリ設定・会社情報" backHref="/settings" />
      <PageContainer size="narrow">
        <Card className="p-4 sm:p-5">
          <AppSettingsForm settings={settings} />
        </Card>
      </PageContainer>
    </div>
  );
}
