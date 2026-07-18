// constants.js — Excel「設定」シート等の定数テーブル。令和7/8年度改正反映版。
// 出典: docs/calc-spec.md および docs/raw-cells/設定.txt（実セルの数値そのまま）。

// 人的控除額（所得税ベース D列）。設定シート C=住民税/D=所得税。
// 本ソフトの住宅ローン控除計算は所得税ベース(J52)のみ使用するが、住民税側も後で使う。
export const JINTEKI = {
  hitorioya:        { juu: 300000, syo: 350000 }, // ひとり親 設定C19/D19
  kafu:             { juu: 260000, syo: 270000 }, // 寡婦 C20/D20
  kinroGakusei:     { juu: 260000, syo: 270000 }, // 勤労学生 C21/D21
  fuyoIppan:        { juu: 330000, syo: 380000 }, // 一般扶養 C24/D24
  fuyoTokutei:      { juu: 450000, syo: 630000 }, // 特定扶養 C25/D25
  fuyoRoujin:       { juu: 380000, syo: 480000 }, // 老人扶養 C26/D26
  fuyoDoukyoRoushin:{ juu: 450000, syo: 580000 }, // 同居老親 C27/D27
  shougaiIppan:     { juu: 260000, syo: 270000 }, // 一般障害者 C41/D41
  shougaiTokubetsu: { juu: 300000, syo: 400000 }, // 特別障害者 C42/D42
  shougaiDoukyo:    { juu: 530000, syo: 750000 }, // 同居特別障害者 C43/D43
};

// 基礎控除（住民税は一律430,000）。設定!B37。
export const KISO_JUUMINZEI = 430000;

// 配偶者控除（所得税/住民税）: 本人の給与所得後金額(AE10)で段階。所得控除!D35/J35。
// 老人控除対象配偶者の上乗せは本ソフト非対応。
export function haiguushaKoujo(ae10, syo) {
  if (ae10 <= 9000000) return syo ? 380000 : 330000;
  if (ae10 <= 9500000) return syo ? 260000 : 220000;
  if (ae10 <= 10000000) return syo ? 130000 : 110000;
  return 0;
}

// 基礎控除（所得税）: 給与所得後金額(AE10)で段階。令和7年改正の加算含む。所得控除!J50。
export function kisoKoujoShotokuzei(ae10) {
  if (ae10 <= 1320000) return 950000;
  if (ae10 <= 3360000) return 880000;
  if (ae10 <= 4890000) return 680000;
  if (ae10 <= 6550000) return 630000;
  if (ae10 <= 23500000) return 580000;
  if (ae10 <= 24000000) return 480000;
  if (ae10 <= 24500000) return 320000;
  if (ae10 <= 25000000) return 160000;
  return 0;
}

// 配偶者特別控除テーブル 設定!A50:G60。
// 各行 [配偶者所得下限, 所900万以下(B), 所950万(C), 所1000万(D), 住900万(E), 住950万(F), 住1000万(G)]
export const HAIGUUSHA_TOKUBETSU_TABLE = [
  [0,       0,      0,      0,      0,      0,      0],
  [580001,  380000, 260000, 130000, 330000, 220000, 110000],
  [950001,  360000, 240000, 120000, 330000, 220000, 110000],
  [1000001, 310000, 210000, 110000, 310000, 210000, 110000],
  [1050001, 260000, 180000, 90000,  260000, 180000, 90000],
  [1100001, 210000, 140000, 70000,  210000, 140000, 70000],
  [1150001, 160000, 110000, 60000,  160000, 110000, 60000],
  [1200001, 110000, 80000,  40000,  110000, 80000,  40000],
  [1250001, 60000,  40000,  20000,  60000,  40000,  20000],
  [1300001, 30000,  20000,  10000,  30000,  20000,  10000],
  [1330001, 0,      0,      0,      0,      0,      0],
];

// 住宅ローン控除の借入限度額(万円)と控除期間(年)。各住宅シート D79/D81。
// 借り入れ比率!D11(新築/既存)・D12(子育て○/×)で決定。令和8年度改正。
export const HOUSING_TYPES = ["認定住宅", "ZEH水準", "省エネ基準", "一般住宅"];

export function loanLimitManyen(housingType, isNew, isChildcare) {
  switch (housingType) {
    case "認定住宅":
      return isNew ? (isChildcare ? 5000 : 4500) : (isChildcare ? 4500 : 3500);
    case "ZEH水準":
      return isChildcare ? 4500 : 3500;
    case "省エネ基準":
      return isChildcare ? 3000 : 2000;
    case "一般住宅":
      return isNew ? 0 : 2000; // 新築の一般住宅は対象外
    default:
      throw new Error("unknown housing type: " + housingType);
  }
}

export function loanPeriodYears(housingType, isNew) {
  if (housingType === "一般住宅") return isNew ? 0 : 10; // 既存の一般は10年
  return 13;
}

// 控除率・住民税控除
export const DEDUCTION_RATE = 0.007;     // D78 控除率 0.7%
export const RESIDENT_DEDUCTION_RATE = 0.05; // L78 住民税控除率 5%
export const RESIDENT_DEDUCTION_CAP = 97500; // T78 住民税控除限度額(円)
export const RECOVERY_TAX_RATE = 1.021;  // 復興特別所得税
