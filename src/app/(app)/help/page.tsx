import Link from "next/link";
import { Lightbulb, LifeBuoy, PenLine, Settings, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { USAGE_TIPS } from "@/lib/constants";

// 使い方・ヒント。ホーム（PC のみ表示）から移し、スマホ/iPad はメニューからここへ。
export default async function HelpPage() {
  await requireUser();

  return (
    <div>
      <PageHeader title="使い方・ヒント" subtitle="Mielba をもっとスムーズに" backHref="/" />
      <PageContainer size="narrow">
        <div className="space-y-5">
          {/* 使い方のヒント */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 px-1">
              <Lightbulb className="h-4 w-4 text-accent-500" aria-hidden />
              <h2 className="text-sm font-bold text-ink-soft">使い方のヒント</h2>
            </div>
            <Card className="divide-y divide-line">
              {USAGE_TIPS.map((t, i) => (
                <div key={i} className="flex items-start gap-2.5 px-4 py-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  <p className="text-sm font-medium leading-relaxed text-ink-soft">{t}</p>
                </div>
              ))}
            </Card>
          </section>

          {/* サポート・設定 */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 px-1">
              <LifeBuoy className="h-4 w-4 text-emerald-500" aria-hidden />
              <h2 className="text-sm font-bold text-ink-soft">サポート・設定</h2>
            </div>
            <Card className="divide-y divide-line">
              <Link href="/settings" className="flex items-center gap-3 px-4 py-3 tap-row">
                <IconBadge icon={Settings} tone="emerald" size="sm" />
                <span className="flex-1 text-sm font-semibold text-ink">アプリの設定</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
              </Link>
              <Link href="/settings/account" className="flex items-center gap-3 px-4 py-3 tap-row">
                <IconBadge icon={PenLine} tone="teal" size="sm" />
                <span className="flex-1 text-sm font-semibold text-ink">アカウント・表示</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
              </Link>
            </Card>
            <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
              パスワードを忘れた場合や不具合があるときは、管理者（事務所）へご連絡ください。
            </p>
          </section>
        </div>
      </PageContainer>
    </div>
  );
}
