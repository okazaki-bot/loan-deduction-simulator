// loan.js — 各住宅シート(認定住宅/ZEH水準/省エネ基準/一般住宅)の13年分控除額計算。
// 1人・1住宅種別ぶん。所得税から控除(W)＋住民税から控除(AB)＝年控除額(AG)を13年合計。

import { ROUNDDOWN } from "./excel.js";
import { kyuyoDeductionSubtrahend } from "./deductions.js";
import {
  loanLimitManyen, loanPeriodYears,
  DEDUCTION_RATE, RESIDENT_DEDUCTION_RATE, RESIDENT_DEDUCTION_CAP, RECOVERY_TAX_RATE,
} from "./constants.js";

// 所得税の速算（復興特別所得税込み）。base = ROUNDDOWN(課税所得, -3)。各住宅シート BQ。
function incomeTaxWithRecovery(taxableIncome) {
  const base = ROUNDDOWN(taxableIncome, -3);
  const tax = Math.max(
    base * 0.05,
    base * 0.10 - 97500,
    base * 0.20 - 427500,
    base * 0.23 - 636000,
    base * 0.33 - 1536000,
    base * 0.40 - 2796000,
    base * 0.45 - 4796000
  );
  return ROUNDDOWN(tax * RECOVERY_TAX_RATE, -2);
}

// 1人・1住宅種別の13年控除額。
// args:
//   income        : 初年度の給与収入(源泉!P10 / CP10)
//   bd            : 所得控除合計(源泉!AT10 = 所得控除!J52)。13年間固定。
//   balances      : 13年分の年末ローン残高(円)[13]
//   housingType, isNew, isChildcare : 借入限度額・控除期間の決定
//   upRatePct     : 所得年間UP率(%)
//   applyUpRateAllYears : true=13年全部にUP率適用(修正版) / false=Excel完全一致(11-13年目はUP率0)
export function housing13Years(args) {
  const { income, bd, balances, housingType, isNew, isChildcare, upRatePct, applyUpRateAllYears } = args;
  const limitManyen = loanLimitManyen(housingType, isNew, isChildcare);
  const period = loanPeriodYears(housingType, isNew);
  const limitYen = limitManyen * 10000; // D80

  const yearly = [];
  let prevAT = 0;
  for (let n = 1; n <= 13; n++) {
    // 投影収入 AT
    let AT;
    if (n === 1) {
      AT = income;
    } else if (n === 2) {
      AT = income * (upRatePct / 100 + 1);
    } else {
      // Excel完全一致では11-13年目(n>=11)はUP率0（空セル参照バグ）。修正版は全年UP率。
      const rate = (!applyUpRateAllYears && n >= 11) ? 0 : upRatePct;
      AT = prevAT * (1 + rate / 100);
    }
    prevAT = AT;

    const F = balances[n - 1];
    const M = Math.min(F, limitYen);              // 残高上限額
    const R = (n <= period) ? M * DEDUCTION_RATE : 0; // 控除可能額
    const AY = kyuyoDeductionSubtrahend(AT);      // 給与所得控除
    const BI = Math.max(0, AT - AY - bd);         // 課税所得額
    const BQ = incomeTaxWithRecovery(BI);         // 所得税(復興込)
    const W = BQ > R ? R : BQ;                    // 所得税から控除 = min(BQ,R)
    const BT = R - W;                             // 引き切れなかった額
    const AB = Math.max(0, Math.min(RESIDENT_DEDUCTION_CAP, BI * RESIDENT_DEDUCTION_RATE, BT)); // 住民税から控除
    const AG = W + AB;                            // 年控除額
    yearly.push({ n, F, M, R, AT, AY, BI, BQ, W, BT, AB, AG });
  }
  const total = yearly.reduce((s, y) => s + y.AG, 0);
  return { limitManyen, period, yearly, total };
}
