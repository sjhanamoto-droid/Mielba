import Link from "next/link";
import { Users2, Building2, UserCog, ChevronRight, Info, Package } from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { SectionTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { MaterialsManager } from "@/features/settings/materials-manager";

function SettingRow({
  href, icon, title, desc,
}: {
  href: string; icon: React.ReactNode; title: string; desc: string;
}) {
  return (
    <Link href={href} className="card tap-row flex items-center gap-3.5 p-4 transition-all hover:border-line-strong hover:shadow-float">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-ink">{title}</p>
        <p className="truncate text-xs text-ink-muted">{desc}</p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
    </Link>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const admin = isAdmin(user);
  const [staffCount, materials] = await Promise.all([
    admin ? db.user.count() : Promise.resolve(0),
    admin
      ? db.materialMaster.findMany({
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, unit: true, active: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader title="設定" />
      <PageContainer size="narrow">
        <div className="space-y-6">
          {admin && (
            <section className="space-y-2.5">
              <SectionTitle>管理者メニュー</SectionTitle>
              <div className="space-y-2.5">
                <SettingRow
                  href="/settings/staff"
                  icon={<Users2 className="h-5 w-5" />}
                  title="スタッフ管理"
                  desc={`ユーザーの追加・編集・権限設定（${staffCount}名）`}
                />
                <SettingRow
                  href="/settings/app"
                  icon={<Building2 className="h-5 w-5" />}
                  title="アプリ設定・会社情報"
                  desc="会社情報・日報の既定値など全社設定"
                />
              </div>
            </section>
          )}

          {/* 材料マスタ（管理者のみ） */}
          {admin && (
            <section className="space-y-2.5">
              <SectionTitle>
                <span className="flex items-center gap-1.5">
                  <Package className="h-4 w-4" />
                  材料マスタ
                </span>
              </SectionTitle>
              <MaterialsManager materials={materials} />
            </section>
          )}

          <section className="space-y-2.5">
            <SectionTitle>アカウント</SectionTitle>
            <SettingRow
              href="/settings/account"
              icon={<UserCog className="h-5 w-5" />}
              title="アカウント設定"
              desc="氏名・部署・アバター色・パスワードの変更"
            />
          </section>

          {/* 画面の明るさ（テーマ切替） */}
          <section className="space-y-2.5">
            <SectionTitle>画面の明るさ</SectionTitle>
            <div className="card p-4">
              <ThemeToggle />
              <p className="mt-2 text-xs text-ink-muted">
                「端末に合わせる」を選ぶと、スマホ・PCの設定に合わせて自動で切り替わります。
              </p>
            </div>
          </section>

          <section className="space-y-2.5">
            <SectionTitle>このアプリについて</SectionTitle>
            <div className="card flex items-start gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
                <Info className="h-5 w-5" />
              </span>
              <div className="text-sm">
                <p className="font-bold text-ink">Mielba（ミエルバ）</p>
                <p className="text-xs text-ink-muted">建設業向け 現場管理アプリ ・ バージョン 0.3</p>
              </div>
            </div>
          </section>
        </div>
      </PageContainer>
    </div>
  );
}
