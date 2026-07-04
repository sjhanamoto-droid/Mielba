import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// ── 日付ヘルパー（実行時の「今日」を基準に相対生成） ──
function day(offsetDays: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

// 軽量なSVGプレースホルダ写真（data URL）
function photo(label: string, c1: string, c2: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='320' height='240' fill='url(#g)'/><text x='50%' y='50%' fill='rgba(255,255,255,0.92)' font-family='sans-serif' font-size='22' font-weight='bold' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

async function main() {
  // 本番ビルド時など：既にデータがあれば上書きしない（SEED_ONLY_IF_EMPTY=1 のとき）
  if (process.env.SEED_ONLY_IF_EMPTY === "1") {
    const existing = await db.user.count();
    if (existing > 0) {
      console.log("既にデータが存在するためシードをスキップします。");
      return;
    }
  }

  console.log("🌱 既存データを削除中...");
  // 依存関係の末端から削除
  await db.handover.deleteMany();
  await db.materialMaster.deleteMany();
  await db.comment.deleteMany();
  await db.photo.deleteMany();
  await db.materialUse.deleteMany();
  await db.materialOrder.deleteMany();
  await db.nextProcess.deleteMany();
  await db.dailyReport.deleteMany();
  await db.calendarEvent.deleteMany();
  await db.todo.deleteMany();
  await db.survey.deleteMany();
  await db.siteRelation.deleteMany();
  await db.siteVisit.deleteMany();
  await db.siteAssignment.deleteMany();
  await db.sitePartner.deleteMany();
  await db.site.deleteMany();
  await db.contactPerson.deleteMany();
  await db.customer.deleteMany();
  await db.user.deleteMany();

  const pw = await bcrypt.hash("mielba123", 10);

  console.log("⚙️ アプリ設定（会社情報）を作成中...");
  await db.appSetting.upsert({
    where: { id: "singleton" },
    update: {
      companyName: "株式会社ミエルバ建設",
      companyAddress: "東京都新宿区西新宿1-1-1 ミエルバビル5F",
      companyPhone: "03-1234-5678",
      invoiceNumber: "T9012345678901",
      defaultStartTime: "08:00",
      defaultEndTime: "17:00",
    },
    create: {
      id: "singleton",
      companyName: "株式会社ミエルバ建設",
      companyAddress: "東京都新宿区西新宿1-1-1 ミエルバビル5F",
      companyPhone: "03-1234-5678",
      invoiceNumber: "T9012345678901",
      defaultStartTime: "08:00",
      defaultEndTime: "17:00",
    },
  });

  console.log("🧱 材料マスターを作成中...");
  await db.materialMaster.createMany({
    data: [
      { name: "石膏ボード 12.5mm", unit: "枚", sortOrder: 1 },
      { name: "クロス", unit: "m", sortOrder: 2 },
      { name: "パテ", unit: "袋", sortOrder: 3 },
      { name: "LGS 65", unit: "本", sortOrder: 4 },
      { name: "塗料（白）", unit: "缶", sortOrder: 5 },
      { name: "シーリング材", unit: "本", sortOrder: 6 },
      { name: "配管 VP20", unit: "本", sortOrder: 7 },
      { name: "電線 VVF2.0", unit: "m", sortOrder: 8 },
      { name: "断熱材", unit: "枚", sortOrder: 9 },
      { name: "ビス各種", unit: "箱", sortOrder: 10 },
      { name: "木材 2x4", unit: "本", sortOrder: 11 },
      { name: "養生シート", unit: "巻", sortOrder: 12 },
    ],
  });

  console.log("👷 ユーザーを作成中...");
  const admin = await db.user.create({
    data: { name: "田中 太郎", email: "admin@mielba.app", passwordHash: pw, role: "ADMIN", department: "工事部", avatarColor: "#1947e8" },
  });
  const sato = await db.user.create({
    data: { name: "佐藤 健", email: "sato@mielba.app", passwordHash: pw, role: "STAFF", department: "工事部", avatarColor: "#10b981" },
  });
  const suzuki = await db.user.create({
    data: { name: "鈴木 一郎", email: "suzuki@mielba.app", passwordHash: pw, role: "STAFF", department: "工事部", avatarColor: "#f98307" },
  });
  const takahashi = await db.user.create({
    data: { name: "高橋 美咲", email: "takahashi@mielba.app", passwordHash: pw, role: "STAFF", department: "内装", avatarColor: "#8b5cf6" },
  });
  const watanabe = await db.user.create({
    data: { name: "渡辺 大輔", email: "watanabe@mielba.app", passwordHash: pw, role: "STAFF", department: "設備", avatarColor: "#ef4444" },
  });

  console.log("🏢 顧客（元請企業）を作成中...");
  const c1 = await db.customer.create({
    data: {
      name: "大成住建 株式会社",
      corporateNumber: "1234567890123",
      invoiceNumber: "T1234567890123",
      industry: "総合建設業",
      capitalScale: "1億円以上",
      registrationType: "PRIME",
      tradeStatus: "CONTINUING",
      firstTradeDate: day(-720),
      headOfficeAddress: "東京都新宿区西新宿2-8-1",
      billingAddress: "東京都新宿区西新宿2-8-1 経理部",
      closingDay: "末締め",
      paymentDueTerm: "翌月末払い",
      paymentMethod: "BANK",
      feeBearer: "当社負担",
      memo: "大型案件が多い主要取引先。請求書は経理部宛に郵送必須。",
      contacts: {
        create: [
          { name: "工藤 誠", department: "工事部", position: "課長", phone: "03-1111-2222", mobile: "090-1111-2222", email: "kudo@taisei-jk.example", contactType: "SITE", isActive: true, activeFrom: day(-700) },
          { name: "西村 由美", department: "経理部", position: "主任", phone: "03-1111-3333", email: "nishimura@taisei-jk.example", contactType: "ACCOUNTING", isActive: true, activeFrom: day(-700) },
          { name: "大野 隆", department: "役員", position: "取締役", mobile: "090-1111-9999", email: "ono@taisei-jk.example", contactType: "APPROVER", isActive: true, activeFrom: day(-700) },
          { name: "前任 三郎", department: "工事部", position: "係長", contactType: "SITE", isActive: false, activeFrom: day(-700), activeTo: day(-120), note: "他部署へ異動（過去担当）" },
        ],
      },
    },
  });
  const c2 = await db.customer.create({
    data: {
      name: "みらいリフォーム 株式会社",
      corporateNumber: "2345678901234",
      invoiceNumber: "T2345678901234",
      industry: "住宅リフォーム",
      capitalScale: "1千万〜1億円",
      registrationType: "PRIME",
      tradeStatus: "CONTINUING",
      firstTradeDate: day(-400),
      headOfficeAddress: "神奈川県横浜市港北区新横浜3-1-1",
      closingDay: "20日締め",
      paymentDueTerm: "翌月15日払い",
      paymentMethod: "DENSAI",
      feeBearer: "先方負担",
      memo: "マンション改修の継続案件多数。担当の工藤さんと連携。",
      contacts: {
        create: [
          { name: "森田 浩二", department: "リフォーム事業部", position: "マネージャー", phone: "045-222-3333", mobile: "090-2222-3333", email: "morita@mirai-reform.example", contactType: "SITE", isActive: true, activeFrom: day(-390) },
          { name: "林 さやか", department: "管理部", position: "—", email: "hayashi@mirai-reform.example", contactType: "ACCOUNTING", isActive: true, activeFrom: day(-390) },
        ],
      },
    },
  });
  const c3 = await db.customer.create({
    data: {
      name: "城南建設 株式会社",
      corporateNumber: "3456789012345",
      industry: "建築工事業",
      capitalScale: "1千万〜1億円",
      registrationType: "PRIME",
      tradeStatus: "NEW",
      firstTradeDate: day(-40),
      headOfficeAddress: "東京都大田区蒲田5-13-1",
      closingDay: "末締め",
      paymentDueTerm: "翌々月末払い",
      paymentMethod: "NOTE",
      feeBearer: "当社負担",
      memo: "新規取引先。初回は現調から。手形サイトが長いので資金繰り注意。",
      contacts: {
        create: [
          { name: "斎藤 武", department: "営業部", position: "主任", mobile: "090-3333-4444", email: "saito@jonan-const.example", contactType: "SITE", isActive: true, activeFrom: day(-40) },
        ],
      },
    },
  });
  const c4 = await db.customer.create({
    data: {
      name: "田村 邸（個人施主）",
      registrationType: "OWNER",
      tradeStatus: "CONTINUING",
      industry: "個人",
      firstTradeDate: day(-200),
      headOfficeAddress: "東京都世田谷区下北沢2-10-5",
      paymentMethod: "BANK",
      memo: "個人宅の改修。施主の田村様は在宅勤務、平日昼の連絡可。",
      contacts: {
        create: [
          { name: "田村 隆弘", position: "施主", mobile: "090-4444-5555", email: "tamura@example.com", contactType: "APPROVER", isActive: true, activeFrom: day(-200) },
        ],
      },
    },
  });

  console.log("🏗 現場（案件）を作成中...");
  // ── 進行中現場（同一住所の別号室＝関連現場） ──
  const siteA1 = await db.site.create({
    data: {
      customerId: c1.id, name: "西新宿パークマンション 302号室 改修", projectCode: "P-2024-101", constructionCode: "K-101",
      projectType: "RENOVATION", projectStatus: "IN_PROGRESS", siteStatus: "ACTIVE",
      locationName: "西新宿パークマンション", address: "東京都新宿区西新宿6-12-3 302", keybox: "玄関右ボックス／番号 4823",
      siteContactName: "工藤 誠", receivedDate: day(-30), contractNumber: "C-2024-0101",
      departmentInCharge: "工事部", siteManager: "田中 太郎", salesRep: "佐藤 健",
      plannedStartDate: day(-14), plannedEndDate: day(20), actualStartDate: day(-14), progressRate: 55,
      siteContactPhone: "090-1111-2222", keyboxNumber: "4823", keyboxPlace: "玄関右ボックス", targetManDays: 45,
      handoverNote: "302号室の浴室解体まで完了。配管に一部劣化あり、設備の渡辺に共有済み。キーBOXの番号は4823。",
      contractAmount: 4800000, budgetCost: 3100000, executionBudget: 3300000,
      memo: "管理組合への作業時間連絡を毎週金曜に行うこと（9-17時厳守）。",
      partners: { create: [ { name: "山田設備工業", role: "給排水", contact: "090-5555-6666" }, { name: "クロス職人 大野", role: "内装仕上げ" } ] },
      assignments: { create: [ { userId: sato.id }, { userId: takahashi.id }, { userId: watanabe.id } ] },
    },
  });
  const siteA2 = await db.site.create({
    data: {
      customerId: c1.id, name: "西新宿パークマンション 305号室 改修", projectCode: "P-2024-102", constructionCode: "K-102",
      projectType: "RENOVATION", projectStatus: "ORDERED", siteStatus: "ACTIVE",
      locationName: "西新宿パークマンション", address: "東京都新宿区西新宿6-12-3 305", keybox: "玄関右ボックス／番号 4823",
      siteContactName: "工藤 誠", receivedDate: day(-7), departmentInCharge: "工事部", siteManager: "田中 太郎", salesRep: "佐藤 健",
      plannedStartDate: day(7), plannedEndDate: day(40), progressRate: 5,
      handoverNote: "302号室と同じ建物・別号室。キーBOXは共通。着工は302完了後を予定。",
      contractAmount: 4600000, budgetCost: 3000000,
      assignments: { create: [ { userId: sato.id } ] },
    },
  });
  const siteB = await db.site.create({
    data: {
      customerId: c2.id, name: "新横浜レジデンス 大規模修繕（B棟）", projectCode: "P-2024-210", constructionCode: "K-210",
      projectType: "RENOVATION", projectStatus: "IN_PROGRESS", siteStatus: "ACTIVE",
      locationName: "新横浜レジデンス B棟", address: "神奈川県横浜市港北区新横浜2-5-8", keybox: "管理人室にて受領",
      siteContactName: "森田 浩二", receivedDate: day(-60), contractNumber: "C-2024-0210",
      departmentInCharge: "工事部", siteManager: "鈴木 一郎", salesRep: "佐藤 健",
      plannedStartDate: day(-45), plannedEndDate: day(15), actualStartDate: day(-45), progressRate: 70,
      siteContactPhone: "090-2222-3333", keyboxPlace: "管理人室", targetManDays: 120,
      handoverNote: "外壁塗装は3面完了。残り東面と共用部。足場は来週解体予定。",
      contractAmount: 12500000, budgetCost: 8800000, executionBudget: 9200000,
      partners: { create: [ { name: "横浜塗装", role: "外壁塗装" }, { name: "足場の達人", role: "仮設足場" } ] },
      assignments: { create: [ { userId: suzuki.id }, { userId: watanabe.id } ] },
    },
  });
  const siteC = await db.site.create({
    data: {
      customerId: c4.id, name: "田村邸 キッチン・浴室リフォーム", projectCode: "P-2024-305",
      projectType: "REFORM", projectStatus: "STARTED", siteStatus: "ACTIVE",
      locationName: "田村邸", address: "東京都世田谷区下北沢2-10-5", keybox: "施主在宅のため不要（事前連絡要）",
      siteContactName: "田村 隆弘", receivedDate: day(-20), departmentInCharge: "内装", siteManager: "高橋 美咲",
      plannedStartDate: day(-3), plannedEndDate: day(25), actualStartDate: day(-3), progressRate: 20,
      siteContactPhone: "090-4444-5555", targetManDays: 20,
      handoverNote: "施主こだわり強め。キッチンの面材サンプルを次回持参すること。",
      contractAmount: 2800000, budgetCost: 1900000,
      assignments: { create: [ { userId: takahashi.id } ] },
    },
  });

  // ── 現調中の現場 ──
  const siteSurvey = await db.site.create({
    data: {
      customerId: c3.id, name: "蒲田オフィスビル 改修（現地調査）", projectType: "RENOVATION", projectStatus: "ESTIMATING", siteStatus: "SURVEY",
      locationName: "蒲田第一ビル", address: "東京都大田区蒲田5-20-7", departmentInCharge: "工事部", salesRep: "佐藤 健",
      memo: "城南建設からの初回引き合い。3階フロアの改修見積。",
      survey: { create: {
        address: "東京都大田区蒲田5-20-7 3F", keybox: "1Fテナント管理会社で鍵受領（平日10-17時）",
        situationMemo: "天井点検口から確認。空調ダクトに錆あり。床はОAフロア。電気容量は要確認（分電盤は3F北側）。",
        relatedNote: "近隣の蒲田案件は過去実績なし。", surveyedAt: day(-5),
      } },
    },
  });
  // 現調写真
  await db.survey.update({ where: { siteId: siteSurvey.id }, data: {} });
  const surveyRec = await db.survey.findUnique({ where: { siteId: siteSurvey.id } });
  if (surveyRec) {
    await db.photo.createMany({ data: [
      { surveyId: surveyRec.id, dataUrl: photo("現調① 全景", "#6366f1", "#8b5cf6"), caption: "3階フロア全景（北から）", kind: "SURVEY" },
      { surveyId: surveyRec.id, dataUrl: photo("現調② 天井", "#8b5cf6", "#a78bfa"), caption: "天井裏ダクトの錆", kind: "SURVEY" },
      { surveyId: surveyRec.id, dataUrl: photo("現調③ 分電盤", "#7c3aed", "#6366f1"), caption: "分電盤（3F北側）", kind: "SURVEY" },
    ] });
  }

  // ── 過去現場 ──
  const sitePast = await db.site.create({
    data: {
      customerId: c2.id, name: "新横浜レジデンス 大規模修繕（A棟）", projectCode: "P-2023-180", projectType: "RENOVATION",
      projectStatus: "CLOSED", siteStatus: "PAST", billingStatus: "PAID",
      locationName: "新横浜レジデンス A棟", address: "神奈川県横浜市港北区新横浜2-5-8",
      siteManager: "鈴木 一郎", plannedStartDate: day(-220), plannedEndDate: day(-130), actualStartDate: day(-220), actualEndDate: day(-128),
      progressRate: 100, handoverNote: "完工・引渡済。B棟と同一敷地。塗料はA棟と同ロットを使用。",
      contractAmount: 11800000, billedAmount: 11800000, paidAmount: 11800000,
    },
  });

  console.log("🔗 関連現場リンク（同一住所）...");
  await db.siteRelation.createMany({ data: [
    { siteAId: siteA1.id, siteBId: siteA2.id, note: "同一マンション・別号室" },
    { siteAId: siteB.id, siteBId: sitePast.id, note: "同一敷地・別棟（A棟/B棟）" },
  ] });

  console.log("📝 日報を作成中...");
  // siteA1 の日報（複数人×複数日）
  const r1 = await db.dailyReport.create({
    data: {
      siteId: siteA1.id, userId: sato.id, workDate: day(-1), startTime: "08:30", endTime: "17:30", status: "SUBMITTED", submittedAt: day(-1),
      parkingFee: 800,
      handover: "給水管の腐食箇所は追加工事の判断待ち。管理組合への連絡は済み。明日のユニット搬入は午前指定。",
      detail: "302号室の浴室解体を実施。既存ユニットバスを撤去し、配管の状態を確認。給水管に一部腐食が見られたため写真を撮影し、設備担当へ共有した。床下の防水は良好。明日は新規ユニットの搬入を予定。",
      aiSummary: "【要約】浴室ユニット撤去完了。給水管に腐食ありで設備へ共有。床下防水は良好。翌日ユニット搬入予定。",
      memo: "給水管の腐食は管理組合にも一報入れた方がよい。元請の工藤さんに電話済み。",
      materials: { create: [ { name: "養生シート", quantity: "5", unit: "巻" }, { name: "解体用ブレード", quantity: "2", unit: "枚" } ] },
      orders: { create: [ { name: "ユニットバス本体 1216サイズ", quantity: "1", supplier: "山田設備工業", deliveryDate: day(1) } ] },
      nextProcesses: { create: [ { content: "ユニットバス据付の段取り確認。電気・給排水の取り合い。", vendors: "山田設備工業, 電気・第一電工", supplyDeliveryDate: day(2) } ] },
      photos: { create: [
        { dataUrl: photo("解体後 浴室", "#0ea5e9", "#2f63f5"), caption: "ユニット撤去後の状況", kind: "WORK" },
        { dataUrl: photo("給水管 腐食", "#ef4444", "#f97316"), caption: "腐食の見られた給水管", kind: "WORK" },
        { dataUrl: photo("弊社材料 養生", "#10b981", "#22c55e"), caption: "現場に残した養生材（弊社分）", kind: "COMPANY_STOCK" },
      ] },
    },
  });
  await db.comment.createMany({ data: [
    { reportId: r1.id, userId: admin.id, body: "給水管の件、管理組合への連絡ありがとう。腐食範囲の写真をもう少し引きで撮っておいてください。追加工事になりそうなら見積もりに反映します。" },
    { reportId: r1.id, userId: sato.id, body: "了解しました。明日、引きの写真を追加で撮ります。" },
  ] });

  await db.dailyReport.create({
    data: {
      siteId: siteA1.id, userId: takahashi.id, workDate: day(-1), startTime: "09:00", endTime: "16:00", status: "SUBMITTED", submittedAt: day(-1),
      detail: "リビングのクロス下地処理。パテ処理を2回実施。明日乾燥後にクロス貼り開始予定。",
      memo: "コンセント増設の希望が施主からあった件、要確認。",
      materials: { create: [ { name: "パテ", quantity: "1", unit: "袋" } ] },
    },
  });
  await db.dailyReport.create({
    data: {
      siteId: siteA1.id, userId: watanabe.id, workDate: day(-2), startTime: "08:00", endTime: "17:00", status: "SUBMITTED", submittedAt: day(-2),
      detail: "給排水の取り合い確認と仮配管。明日の浴室解体に向けて止水処理を実施。",
      materials: { create: [ { name: "塩ビ管 VP20", quantity: "3", unit: "本" }, { name: "継手各種", quantity: "1", unit: "式" } ] },
    },
  });

  // siteB の日報
  const r4 = await db.dailyReport.create({
    data: {
      siteId: siteB.id, userId: suzuki.id, workDate: day(-1), startTime: "08:00", endTime: "17:00", status: "SUBMITTED", submittedAt: day(-1),
      parkingFee: 1200,
      handover: "足場の是正が完了するまで東面には上がらないこと。是正完了は足場業者から連絡が入る。",
      detail: "B棟東面の高圧洗浄を実施。明日からシーラー塗布。天候は晴れ、作業良好。足場の一部にぐらつきがあり足場業者へ連絡した。",
      aiSummary: "【要約】東面の高圧洗浄完了。翌日シーラー塗布へ。足場のぐらつきを業者へ連絡。",
      memo: "足場の安全確認を朝礼で再周知すること。",
      orders: { create: [ { name: "外壁塗料（弱溶剤）グレー", quantity: "4", supplier: "横浜塗装", deliveryDate: day(2) } ] },
      nextProcesses: { create: [ { content: "東面シーラー塗布後、中塗り。共用部の養生範囲を確定。", vendors: "横浜塗装", supplyDeliveryDate: day(3) } ] },
      photos: { create: [ { dataUrl: photo("B棟 東面 洗浄", "#f59e0b", "#f98307"), caption: "高圧洗浄後の東面", kind: "WORK" } ] },
    },
  });
  await db.comment.create({ data: { reportId: r4.id, userId: admin.id, body: "足場のぐらつき、安全第一で。業者の是正完了を確認してから上に上がってください。" } });

  // siteC の日報（本日分・未提出＝下書き / 一部スタッフは未提出）
  await db.dailyReport.create({
    data: {
      siteId: siteC.id, userId: takahashi.id, workDate: day(-1), startTime: "10:00", endTime: "16:30", status: "SUBMITTED", submittedAt: day(-1),
      detail: "キッチン解体前の採寸と養生。施主立会いで面材サンプルを確認。次回、追加のサンプルを持参予定。",
      memo: "施主から食洗機の位置変更の相談あり。設計に確認。",
      nextProcesses: { create: [ { content: "面材サンプル（木目3種）持参。食洗機位置の最終確認。", vendors: "メーカー・キッチンハウス", supplyDeliveryDate: day(5) } ] },
    },
  });

  console.log("📌 引き継ぎ事項を作成中...");
  await db.handover.createMany({ data: [
    // 未解決（siteA1 の日報から起票 → 次の担当者が確認する）
    { siteId: siteA1.id, reportId: r1.id, content: "給水管の腐食箇所は追加工事の判断待ち。管理組合への連絡は済み。明日のユニット搬入は午前指定。", createdById: sato.id, createdAt: day(-1) },
    // 解決済み（siteB — 足場の件は確認済み）
    { siteId: siteB.id, reportId: r4.id, content: "足場の是正が完了するまで東面には上がらないこと。是正完了は足場業者から連絡が入る。", createdById: suzuki.id, createdAt: day(-1), resolvedAt: day(0), resolvedById: admin.id },
  ] });

  console.log("📅 カレンダー予定を作成中...");
  // 日報由来の予定（配達・支給品）＋手動予定
  // ownerId = その予定で現場に行く担当（カレンダーで「誰が行くか」を可視化）。createdById = 入力者。
  await db.calendarEvent.createMany({ data: [
    { siteId: siteA1.id, title: "ユニットバス本体 配達", date: day(1), source: "DELIVERY", note: "山田設備工業より（302号室）", ownerId: watanabe.id, createdById: sato.id },
    { siteId: siteA1.id, title: "支給品納品（電気部材）", date: day(2), source: "SUPPLY", ownerId: watanabe.id, createdById: sato.id },
    { siteId: siteA1.id, title: "管理組合へ作業時間連絡", date: day(0), startTime: "09:00", allDay: false, source: "MANUAL", note: "毎週金曜の定例連絡", ownerId: sato.id, createdById: admin.id },
    { siteId: siteB.id, title: "外壁塗料 配達", date: day(2), source: "DELIVERY", note: "横浜塗装より", ownerId: suzuki.id, createdById: suzuki.id },
    { siteId: siteB.id, title: "足場解体", date: day(6), source: "MILESTONE", note: "天候次第", ownerId: suzuki.id, createdById: suzuki.id },
    { siteId: siteC.id, title: "面材サンプル持参・施主打合せ", date: day(0), startTime: "13:00", allDay: false, source: "PROCESS", ownerId: takahashi.id, createdById: takahashi.id },
    { siteId: siteC.id, title: "支給品納品（食洗機）", date: day(5), source: "SUPPLY", ownerId: takahashi.id, createdById: takahashi.id },
    { siteId: siteA2.id, title: "305号室 着工", date: day(7), source: "MILESTONE", ownerId: sato.id, createdById: admin.id },
    { siteId: siteSurvey.id, title: "蒲田ビル 現地調査（再訪）", date: day(3), startTime: "10:00", allDay: false, source: "MANUAL", note: "城南建設・斎藤様 立会", ownerId: sato.id, createdById: admin.id },
    { ownerId: admin.id, title: "月次原価会議", date: day(4), startTime: "15:00", allDay: false, source: "MANUAL", createdById: admin.id },
  ] });

  // カテゴリー・場所・複数参加者つきの予定（新カレンダー登録の例。参加者は現場入り＝日報に連動）
  await db.calendarEvent.create({
    data: {
      siteId: siteA1.id, title: "ユニットバス据付", date: day(0), startTime: "08:00", endTime: "17:00", allDay: false,
      category: "WORK", location: "東京都新宿区西新宿6-12-3 302", note: "山田設備と取り合い。搬入は午前中に完了予定。",
      source: "MANUAL", ownerId: sato.id, createdById: admin.id,
      participants: { create: [{ userId: sato.id }, { userId: watanabe.id }] },
    },
  });

  console.log("✅ TODOを作成中...");
  await db.todo.createMany({ data: [
    { siteId: siteA1.id, scope: "SITE", title: "給水管腐食の引き写真を追加撮影", detail: "追加工事見積の判断材料。引きの全景を3枚程度。", assigneeId: sato.id, createdById: admin.id, dueDate: day(0), status: "OPEN", fromReportId: r1.id },
    { siteId: siteA1.id, scope: "SITE", title: "コンセント増設の可否を施主確認", detail: "リビング南面。施主希望。", assigneeId: takahashi.id, createdById: takahashi.id, dueDate: day(1), status: "OPEN" },
    { siteId: siteA1.id, scope: "SITE", title: "管理組合へ来週分の作業時間を連絡", assigneeId: admin.id, createdById: admin.id, dueDate: day(-1), status: "IN_PROGRESS" },
    { siteId: siteB.id, scope: "SITE", title: "足場のぐらつき是正完了を確認", detail: "安全確認。是正前は上に上がらない。", assigneeId: suzuki.id, createdById: admin.id, dueDate: day(0), status: "OPEN", fromReportId: r4.id },
    { siteId: siteB.id, scope: "SITE", title: "共用部の養生範囲を管理人と確定", assigneeId: suzuki.id, createdById: suzuki.id, dueDate: day(2), status: "OPEN" },
    { siteId: siteC.id, scope: "SITE", title: "キッチン面材サンプル（木目3種）を手配", assigneeId: takahashi.id, createdById: takahashi.id, dueDate: day(-1), status: "OPEN" },
    { siteId: siteC.id, scope: "SITE", title: "食洗機の位置変更を設計に確認", assigneeId: takahashi.id, createdById: takahashi.id, dueDate: day(1), status: "OPEN" },
    { siteId: siteSurvey.id, scope: "SITE", title: "蒲田ビルの電気容量を再確認", detail: "分電盤3F北側。増設要否の判断。", assigneeId: sato.id, createdById: admin.id, dueDate: day(2), status: "OPEN" },
    { scope: "PERSONAL", title: "安全パトロール報告書を提出", assigneeId: admin.id, createdById: admin.id, dueDate: day(0), status: "OPEN" },
    { scope: "PERSONAL", title: "工具のメンテナンス（インパクト）", assigneeId: sato.id, createdById: sato.id, status: "DONE" },
    { siteId: siteA2.id, scope: "SITE", title: "305号室の着工前打合せを設定", assigneeId: admin.id, createdById: admin.id, dueDate: day(5), status: "OPEN" },
  ] });

  console.log("🚶 現場入り（出面）を作成中...");
  await db.siteVisit.createMany({
    data: [
      // 今日（day 0）— 日報はまだ未記入 →「日報を書く」状態
      { siteId: siteA1.id, userId: sato.id, date: day(0), createdById: admin.id },
      { siteId: siteA1.id, userId: watanabe.id, date: day(0), createdById: admin.id },
      { siteId: siteB.id, userId: suzuki.id, date: day(0), createdById: admin.id },
      { siteId: siteC.id, userId: takahashi.id, date: day(0), createdById: takahashi.id },
      // 昨日（day -1）— 既存の日報と整合
      { siteId: siteA1.id, userId: sato.id, date: day(-1), createdById: admin.id },
      { siteId: siteA1.id, userId: takahashi.id, date: day(-1), createdById: admin.id },
      { siteId: siteC.id, userId: takahashi.id, date: day(-1), createdById: takahashi.id },
      { siteId: siteB.id, userId: suzuki.id, date: day(-1), createdById: admin.id },
      // 一昨日（day -2）
      { siteId: siteA1.id, userId: watanabe.id, date: day(-2), createdById: admin.id },
      // 明日（day 1）— 配員計画の例
      { siteId: siteA2.id, userId: sato.id, date: day(1), createdById: admin.id },
      { siteId: siteB.id, userId: suzuki.id, date: day(1), createdById: admin.id },
    ],
  });

  console.log("\n✅ シード完了！");
  console.log("────────────────────────────");
  console.log("ログイン情報（パスワードは全員共通）:");
  console.log("  管理者 : admin@mielba.app  / mielba123");
  console.log("  スタッフ: sato@mielba.app   / mielba123");
  console.log("  スタッフ: suzuki@mielba.app / mielba123");
  console.log("  スタッフ: takahashi@mielba.app / mielba123");
  console.log("────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
