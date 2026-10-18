import { notFound } from "next/navigation";
import { requireAdmin, isSuperAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { UserForm } from "@/features/users/user-form";
import { PayRateManager } from "@/features/users/pay-rate-manager";
import { dateFromKey, jstDateKey, storedDateKey } from "@/lib/date";
import { rateOn } from "@/lib/pay-rates";
import { laborCostForMonth, monthlyTotal } from "@/lib/labor-cost";

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireAdmin();
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, department: true, avatarColor: true, avatarImage: true },
  });
  if (!user) notFound();

  // 給与・原価単価は財務情報＝最高管理者のみ
  const superAdmin = isSuperAdmin(me);
  const todayKey = jstDateKey();
  const rates = superAdmin
    ? await db.staffPayRate.findMany({ where: { userId: id }, orderBy: { effectiveFrom: "desc" } })
    : [];
  const current = rateOn(rates, dateFromKey(todayKey));
  // 月給なら今月の見込み（月の人件費 ÷ 今月の稼働日数）
  let estimate = null;
  if (current?.payType === "MONTHLY" && current.payAmount != null) {
    const ym = todayKey.slice(0, 7);
    const { byUser } = await laborCostForMonth(ym);
    estimate = {
      monthLabel: `${Number(ym.slice(0, 4))}年${Number(ym.slice(5))}月`,
      monthlyTotal: monthlyTotal(current),
      workDays: byUser.get(id)?.workDays ?? 0,
    };
  }

  return (
    <div>
      <PageHeader title="スタッフを編集" subtitle={user.name} backHref="/settings/staff" />
      <PageContainer size="narrow">
        <SectionTitle className="mb-2.5">スタッフ情報</SectionTitle>
        <Card className="p-4 sm:p-5">
          <UserForm user={user} canAssignSuperAdmin={superAdmin} />
        </Card>

        {superAdmin && (
          <>
            <SectionTitle className="mb-2.5 mt-6">給与・原価単価</SectionTitle>
            <Card className="p-4 sm:p-5">
              <PayRateManager
                userId={user.id}
                role={user.role}
                currentId={current?.id ?? null}
                todayKey={todayKey}
                estimate={estimate}
                rates={rates.map((r) => ({
                  id: r.id,
                  payType: r.payType,
                  payAmount: r.payAmount,
                  socialInsurance: r.socialInsurance,
                  bonusMonthly: r.bonusMonthly,
                  otherCost: r.otherCost,
                  effectiveFromKey: storedDateKey(r.effectiveFrom),
                }))}
              />
            </Card>
          </>
        )}
      </PageContainer>
    </div>
  );
}
