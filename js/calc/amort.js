// amort.js — 資金返済表のポート。ローンを「フラット月々/フラットボーナス/銀行月々/
// 銀行ボーナス」の4系列に分け、各年末(12n月・2n期)の元金残高を求め合算する。
// フラット35は11年目(月々=121回目/ボーナス=21期目)で金利を切り替える（Excel実装どおり）。

import { PPMT } from "./excel.js";

// 元金残高の系列を返す。balances[k] = k期(回)返済後の残高。
// switchAfter=null なら金利切替なし。termPeriods を超える回は返済額0（完済）。
function amortize(pv, rateInit, nperInit, rateSwitch, nperSwitch, switchAfter, maxPeriod) {
  const balances = new Array(maxPeriod + 1).fill(0);
  balances[0] = pv;
  if (pv === 0) return balances; // 借入なしなら全期0
  const termPeriods = nperInit; // 完済まで（初期スケジュールの総回数）
  let bal = pv;
  let principalAtSwitch = 0;
  for (let k = 1; k <= maxPeriod; k++) {
    if (switchAfter != null && k === switchAfter + 1) {
      principalAtSwitch = balances[switchAfter]; // 切替時点の残高(C11/C14)
    }
    let ppmt;
    if (k > termPeriods) {
      ppmt = 0; // 完済後
    } else if (switchAfter == null || k <= switchAfter) {
      ppmt = PPMT(rateInit, k, nperInit, pv);
    } else {
      ppmt = PPMT(rateSwitch, k - switchAfter, nperSwitch, principalAtSwitch);
    }
    // Excelの元金残り D = D_prev - B, B = -PPMT なので D = D_prev + PPMT。
    // 自作PPMTはExcel同様に負値(支払は流出)を返すため、加算で残高が減少する。
    bal = bal + ppmt;
    balances[k] = bal;
  }
  return balances;
}

// person の1人分ローンパラメータから、13年分の年末残高(円)を返す（長さ13、index0=1年目）。
// lp: {
//   flatMonthlyPrincipal, flatBonusPrincipal, flatYears, flatRate, flatRate11,
//   bankMonthlyPrincipal, bankBonusPrincipal, bankYears, bankRate }  (金利は%)
export function yearEndBalances(lp) {
  const YEARS = 13;
  const MONTHS = YEARS * 12;   // 156
  const BONUSES = YEARS * 2;   // 26

  // フラット月々（121回目で金利切替）
  const flatM = amortize(
    lp.flatMonthlyPrincipal,
    lp.flatRate / 100 / 12, lp.flatYears * 12,
    lp.flatRate11 / 100 / 12, (lp.flatYears - 10) * 12,
    120, MONTHS
  );
  // フラットボーナス（21期目で金利切替）
  const flatB = amortize(
    lp.flatBonusPrincipal,
    lp.flatRate / 100 / 2, lp.flatYears * 2,
    lp.flatRate11 / 100 / 2, (lp.flatYears - 10) * 2,
    20, BONUSES
  );
  // 銀行月々（金利切替なし）
  const bankM = amortize(
    lp.bankMonthlyPrincipal,
    lp.bankRate / 100 / 12, lp.bankYears * 12,
    0, 0, null, MONTHS
  );
  // 銀行ボーナス（金利切替なし）
  const bankB = amortize(
    lp.bankBonusPrincipal,
    lp.bankRate / 100 / 2, lp.bankYears * 2,
    0, 0, null, BONUSES
  );

  const out = [];
  for (let n = 1; n <= YEARS; n++) {
    out.push(flatM[12 * n] + flatB[2 * n] + bankM[12 * n] + bankB[2 * n]);
  }
  return out;
}
