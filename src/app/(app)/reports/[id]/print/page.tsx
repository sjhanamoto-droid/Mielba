import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getAppSettings } from "@/lib/settings";
import { photoSrc } from "@/lib/photos";
import { fmtDate, fmtDateWithDay, fmtYen, workHours } from "@/lib/utils";
import { PHOTO_KIND_LABEL, REPORT_STATUS_LABEL, type PhotoKind, type ReportStatus } from "@/lib/constants";
import { PrintToolbar } from "./print-button";

// 日報のA4印刷・PDF帳票（Top10 #7）
// 白黒印刷でも読めるよう、罫線と太字でメリハリを付けたレイアウト。
export default async function ReportPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const report = await db.dailyReport.findUnique({
    where: { id },
    include: {
      site: {
        select: {
          id: true,
          name: true,
          address: true,
          locationName: true,
          customer: { select: { name: true } },
        },
      },
      user: { select: { name: true } },
      materials: true,
      orders: true,
      nextProcesses: true,
      // base64 は載せない（/api/photos/[id] で参照する）
      photos: {
        select: { id: true, caption: true, kind: true, isVideo: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!report) notFound();

  const settings = await getAppSettings();
  // 動画は印刷不可のため写真のみ掲載する
  const printablePhotos = report.photos.filter((p) => !p.isVideo);

  const th = "border border-slate-400 bg-slate-100 px-2 py-1.5 text-left text-[11px] font-bold";
  const td = "border border-slate-400 px-2 py-1.5 text-[12px]";
  const sectionTitle = "mt-5 mb-1.5 border-l-4 border-slate-800 pl-2 text-[13px] font-bold";

  return (
    <div className="min-h-dvh bg-surface-subtle px-3 py-4 print:bg-white print:p-0">
      {/* アプリのナビ（サイドバー・ボトムナビ）とレイアウト余白を印刷時に無効化 */}
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          aside, nav { display: none !important; }
          [class*="md:pl-"] { padding-left: 0 !important; }
          .pb-nav { padding-bottom: 0 !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <PrintToolbar reportId={report.id} />

      {/* ── A4用紙 ── */}
      <div className="mx-auto max-w-[210mm] bg-white p-8 text-slate-900 shadow-card print:max-w-none print:p-0 print:shadow-none">
        {/* ヘッダー：帳票名と自社情報 */}
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-wide">作業日報</h1>
            <p className="mt-1 text-[12px]">
              作業日：<span className="font-bold">{fmtDateWithDay(report.workDate)}</span>
              <span className="ml-3 text-[11px]">
                （{REPORT_STATUS_LABEL[report.status as ReportStatus] ?? report.status}
                {report.submittedAt ? ` / 提出 ${fmtDate(report.submittedAt)}` : ""}）
              </span>
            </p>
          </div>
          <div className="text-right text-[11px] leading-relaxed">
            <p className="text-[13px] font-bold">{settings.companyName ?? ""}</p>
            {settings.companyAddress && <p>{settings.companyAddress}</p>}
            {settings.companyPhone && <p>TEL: {settings.companyPhone}</p>}
          </div>
        </div>

        {/* 宛先・現場・作業者 */}
        <table className="mt-3 w-full border-collapse">
          <tbody>
            <tr>
              <th className={`${th} w-24`}>宛先（顧客）</th>
              <td className={td}>
                {report.site.customer ? `${report.site.customer.name} 御中` : "—"}
              </td>
              <th className={`${th} w-24`}>作業者</th>
              <td className={`${td} w-40`}>{report.user.name}</td>
            </tr>
            <tr>
              <th className={th}>現場名</th>
              <td className={td}>{report.site.name}</td>
              <th className={th}>作業時間</th>
              <td className={`${td} tnum`}>
                {report.startTime} 〜 {report.endTime}
                <span className="ml-1 text-[11px]">
                  （実働 {workHours(report.startTime, report.endTime)}）
                </span>
              </td>
            </tr>
            <tr>
              <th className={th}>現場住所</th>
              <td className={td}>
                {report.site.address ?? report.site.locationName ?? "—"}
              </td>
              <th className={th}>駐車場代</th>
              <td className={`${td} tnum`}>
                {report.parkingFee != null ? fmtYen(report.parkingFee) : "—"}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 作業内容 */}
        <h2 className={sectionTitle}>作業内容</h2>
        <div className="min-h-[72px] whitespace-pre-wrap border border-slate-400 px-3 py-2 text-[12px] leading-relaxed">
          {report.detail ?? ""}
        </div>

        {/* AI要約 */}
        {report.aiSummary && (
          <>
            <h2 className={sectionTitle}>要約</h2>
            <div className="whitespace-pre-wrap border border-slate-400 px-3 py-2 text-[12px] leading-relaxed">
              {report.aiSummary}
            </div>
          </>
        )}

        {/* 使用材料 */}
        {report.materials.length > 0 && (
          <div style={{ breakInside: "avoid" }}>
            <h2 className={sectionTitle}>使用材料</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>材料名</th>
                  <th className={`${th} w-24`}>数量</th>
                  <th className={`${th} w-24`}>単位</th>
                </tr>
              </thead>
              <tbody>
                {report.materials.map((m) => (
                  <tr key={m.id}>
                    <td className={td}>{m.name}</td>
                    <td className={`${td} tnum`}>{m.quantity ?? ""}</td>
                    <td className={td}>{m.unit ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 材料発注 */}
        {report.orders.length > 0 && (
          <div style={{ breakInside: "avoid" }}>
            <h2 className={sectionTitle}>材料発注</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>材料名</th>
                  <th className={`${th} w-20`}>数量</th>
                  <th className={th}>仕入先</th>
                  <th className={`${th} w-28`}>配達予定日</th>
                </tr>
              </thead>
              <tbody>
                {report.orders.map((o) => (
                  <tr key={o.id}>
                    <td className={td}>{o.name}</td>
                    <td className={`${td} tnum`}>{o.quantity ?? ""}</td>
                    <td className={td}>{o.supplier ?? ""}</td>
                    <td className={`${td} tnum`}>{o.deliveryDate ? fmtDate(o.deliveryDate) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 次回工程打合せ */}
        {report.nextProcesses.length > 0 && (
          <div style={{ breakInside: "avoid" }}>
            <h2 className={sectionTitle}>次回工程打合せ</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>内容</th>
                  <th className={`${th} w-40`}>絡む業者</th>
                  <th className={`${th} w-28`}>支給品納品日</th>
                </tr>
              </thead>
              <tbody>
                {report.nextProcesses.map((p) => (
                  <tr key={p.id}>
                    <td className={`${td} whitespace-pre-wrap`}>{p.content ?? ""}</td>
                    <td className={td}>{p.vendors ?? ""}</td>
                    <td className={`${td} tnum`}>
                      {p.supplyDeliveryDate ? fmtDate(p.supplyDeliveryDate) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 注意点メモ */}
        {report.memo && (
          <div style={{ breakInside: "avoid" }}>
            <h2 className={sectionTitle}>注意点メモ</h2>
            <div className="whitespace-pre-wrap border border-slate-400 px-3 py-2 text-[12px] leading-relaxed">
              {report.memo}
            </div>
          </div>
        )}

        {/* 引き継ぎ事項 */}
        {report.handover && (
          <div style={{ breakInside: "avoid" }}>
            <h2 className={sectionTitle}>引き継ぎ事項（次の担当者への申し送り）</h2>
            <div className="whitespace-pre-wrap border border-slate-400 px-3 py-2 text-[12px] leading-relaxed">
              {report.handover}
            </div>
          </div>
        )}

        {/* 写真（2列×3段 ≒ 6枚/頁） */}
        {printablePhotos.length > 0 && (
          <>
            <h2 className={sectionTitle}>現場写真（{printablePhotos.length}枚）</h2>
            <div className="grid grid-cols-2 gap-3">
              {printablePhotos.map((p, i) => (
                <figure
                  key={p.id}
                  className="border border-slate-400 p-1.5"
                  style={{ breakInside: "avoid" }}
                >
                  {/* 印刷前に確実に読み込むため lazy にしない */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoSrc(p.id)}
                    alt={p.caption ?? `写真${i + 1}`}
                    className="h-[62mm] w-full bg-slate-100 object-contain"
                  />
                  <figcaption className="mt-1 text-[10px] leading-snug">
                    <span className="mr-1 border border-slate-400 px-1 py-0.5 font-bold">
                      {PHOTO_KIND_LABEL[p.kind as PhotoKind] ?? p.kind}
                    </span>
                    {p.caption ?? ""}
                  </figcaption>
                </figure>
              ))}
            </div>
          </>
        )}

        {/* 押印欄 */}
        <div className="mt-8 flex justify-end gap-4" style={{ breakInside: "avoid" }}>
          {["担当者", "確認者"].map((label) => (
            <div key={label} className="w-28 border border-slate-400 text-center">
              <p className="border-b border-slate-400 bg-slate-100 py-1 text-[11px] font-bold">
                {label}
              </p>
              <div className="h-20" />
            </div>
          ))}
        </div>

        <p className="mt-4 text-right text-[10px] text-slate-500">
          Mielba 作業日報 — 出力日 {fmtDate(new Date())}
        </p>
      </div>
    </div>
  );
}
