// deductions.js — 給与所得控除・生命保険料控除・所得税の所得控除合計(所得控除!J52)。
// 住宅ローン控除の13年計算はこの J52（源泉!AT10）と給与所得控除だけを使う。

import { ROUNDDOWN, ROUNDUP, vlookupApprox } from "./excel.js";
import {
  JINTEKI, haiguushaKoujo, kisoKoujoShotokuzei,
  HAIGUUSHA_TOKUBETSU_TABLE,
} from "./constants.js";

// 給与所得控除後の金額(源泉!AE10 / 各住宅シート AY)。令和7年改正式。
// AE10 = MAX(income - 給与所得控除, 0)。給与所得控除は下記の階段。
export function kyuyoDeductionSubtrahend(income) {
  if (income < 1900000) return Math.min(Math.max(income, 0), 650000);
  if (income < 3600000) return income - ROUNDDOWN(income / 4000, 0) * 2800 + 80000;
  if (income < 6600000) return income - ROUNDDOWN(income / 4000, 0) * 3200 + 440000;
  if (income < 8500000) return income * 0.1 + 1100000;
  return 1950000;
}

export function kyuyoShotoku(income) {
  return Math.max(income - kyuyoDeductionSubtrahend(income), 0);
}

// --- 生命保険料控除（所得税ベース） ------------------------------------
// 新契約の段階（所得税）: ≤20000 全額 / ~40000 CEIL(x/2)+10000 / ~80000 CEIL(x/4)+20000 / >80000 40000
function seihoNewSyo(x) {
  if (x <= 20000) return x;
  if (x <= 40000) return ROUNDUP(x / 2, 0) + 10000;
  if (x <= 80000) return ROUNDUP(x / 4, 0) + 20000;
  return 40000;
}
// 旧契約の段階（所得税）: ≤25000 全額 / ~50000 CEIL(x/2)+12500 / ~100000 CEIL(x/4)+25000 / >100000 50000
function seihoOldSyo(x) {
  if (x <= 25000) return x;
  if (x <= 50000) return ROUNDUP(x / 2, 0) + 12500;
  if (x <= 100000) return ROUNDUP(x / 4, 0) + 25000;
  return 50000;
}

// 所得税の生命保険料控除額（設定!O56 相当）。
// ins = { lifeNewGeneral, lifeOldGeneral, pensionNew, pensionOld, lifeNursing }
export function seimeihokenControlSyo(ins) {
  // 一般生保: 新(C12)=lifeNewGeneral, 旧(B12)=lifeOldGeneral
  const newG = seihoNewSyo(ins.lifeNewGeneral);
  const oldG = seihoOldSyo(ins.lifeOldGeneral);
  const combG = Math.min(newG + oldG, 40000);        // N44
  const o53 = Math.max(oldG, combG);                  // O53 = MAX(旧, 新旧計)
  // 個人年金: 新(C14)=pensionNew, 旧(B14)=pensionOld
  const newP = seihoNewSyo(ins.pensionNew);
  const oldP = seihoOldSyo(ins.pensionOld);
  const combP = Math.min(newP + oldP, 40000);         // N45
  const o54 = Math.max(oldP, combP);                  // O54
  // 介護医療: 新式のみ(D12)=lifeNursing
  const o55 = seihoNewSyo(ins.lifeNursing);           // O55 = L46
  return Math.min(120000, o53 + o54 + o55);           // O56
}

// --- 所得税の所得控除合計（所得控除!J52） ------------------------------
// p は person 入力（engine.js の PersonInput）。ae10 は kyuyoShotoku(p.incomeP10)。
export function incomeTaxDeductions(p, ae10) {
  // 人的控除フラグ（基本入力シート）
  const d5 = (p.isSingleParent && ae10 <= 5000000) ? 1 : 0; // ひとり親(源泉!I80)
  const d6 = (p.isWidow && ae10 <= 5000000) ? 1 : 0;        // 寡婦(源泉!I79)
  const d9 = (p.isWorkingStudent && ae10 <= 5000000) ? 1 : 0; // 勤労学生(源泉!I81)
  const d7 = p.selfDisabledGeneral ? 1 : 0; // 本人が一般障害(源泉!T51)
  const d8 = p.selfDisabledSpecial ? 1 : 0; // 本人が特別障害(源泉!Q51)

  // 被扶養者の障害区分人数（所得控除!D31/D32/D33）
  const d31 = p.disabledGeneral;                       // 一般障害(源泉!BN16)
  const d32 = p.disabledSpecial - p.disabledSpecialCohab; // 特別障害(源泉!BJ16-BF16)
  const d33 = p.disabledSpecialCohab;                  // 同居特別障害(源泉!BF16)

  const J2 = p.socialInsurance; // 社会保険料控除
  const J10 = seimeihokenControlSyo(p);                 // 生命保険料控除
  const J16 = p.earthquakeInsurance;                    // 地震保険料控除
  const J27 = d5 * JINTEKI.hitorioya.syo + d6 * JINTEKI.kafu.syo; // ひとり親+寡婦
  const J29 =
    d9 * JINTEKI.kinroGakusei.syo +
    d7 * JINTEKI.shougaiIppan.syo +
    d8 * JINTEKI.shougaiTokubetsu.syo +
    d31 * JINTEKI.shougaiIppan.syo +
    d32 * JINTEKI.shougaiTokubetsu.syo +
    d33 * JINTEKI.shougaiDoukyo.syo; // 勤労学生・障害者控除

  const J35 = p.hasSpouseDeduction ? haiguushaKoujo(ae10, true) : 0; // 配偶者控除
  let J38 = 0; // 配偶者特別控除
  if (!p.hasSpouseDeduction && ae10 <= 10000000) {
    const col = ae10 <= 9000000 ? 2 : ae10 <= 9500000 ? 3 : 4; // 所得税列 B/C/D
    J38 = vlookupApprox(p.spouseIncome, HAIGUUSHA_TOKUBETSU_TABLE, col);
  }

  // 扶養控除（所得控除!J42）
  const f44 = Math.max(p.depElderly - p.depElderlyCohab, 0); // 老人扶養(同居除く)
  const f45 = Math.max(p.depElderlyCohab, 0);                // 同居老親
  const f46 = Math.max(p.depSpecified, 0);                   // 特定扶養
  const f47 = Math.max(p.depGeneral, 0);                     // 一般扶養
  const J42 =
    f44 * JINTEKI.fuyoRoujin.syo +
    f45 * JINTEKI.fuyoDoukyoRoushin.syo +
    f46 * JINTEKI.fuyoTokutei.syo +
    f47 * JINTEKI.fuyoIppan.syo;

  const J50 = kisoKoujoShotokuzei(ae10); // 基礎控除

  const J52 = J2 + J10 + J16 + J27 + J29 + J35 + J38 + J42 + J50;
  return { J2, J10, J16, J27, J29, J35, J38, J42, J50, J52, ae10 };
}
