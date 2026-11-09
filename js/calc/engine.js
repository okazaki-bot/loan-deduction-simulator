// engine.js — 入力(源泉徴収票2人分＋借り入れ比率)から減税額一覧表・夫婦合計までを計算する
// 統合オーケストレータ。UIとNode検証(oracle照合)の両方から呼ばれる純粋関数。

import { kyuyoShotoku, incomeTaxDeductions } from "./deductions.js";
import { withholdingIncomeTax } from "./tax.js";
import { yearEndBalances, buildVariableRates } from "./loansim.js";
import { housing13Years } from "./loan.js";
import { HOUSING_TYPES } from "./constants.js";

// person入力の既定値。UI/呼び出し側は必要なものだけ渡せばよい。
export function defaultPerson() {
  return {
    incomeP10: 0,
    hasSpouseDeduction: false, // 控除対象配偶者「有」(源泉!B16="○")
    socialInsurance: 0,        // 社会保険料等(源泉!B20)
    earthquakeInsurance: 0,    // 地震保険料控除額 所得税(源泉!AN20)
    lifeNewGeneral: 0,         // 新生命保険料(源泉!L25)
    lifeOldGeneral: 0,         // 旧生命保険料(源泉!Z25)
    lifeNursing: 0,            // 介護医療保険料(源泉!AN25)
    pensionNew: 0,             // 新個人年金(源泉!BB25)
    pensionOld: 0,             // 旧個人年金(源泉!BP25)
    spouseIncome: 0,           // 配偶者の合計所得(源泉!AO31)
    depSpecified: 0,           // 特定扶養(源泉!AB16)
    depElderly: 0,             // 老人扶養 内(源泉!AM16)
    depElderlyCohab: 0,        // 同居老親 内(源泉!AI16)
    depGeneral: 0,             // 一般扶養(源泉!AT16)
    depUnder16: 0,             // 16歳未満(源泉!BB16)
    disabledSpecialCohab: 0,   // 同居特別障害(源泉!BF16)
    disabledSpecial: 0,        // 特別障害 計(源泉!BJ16)
    disabledGeneral: 0,        // 一般障害(源泉!BN16)
    isMinor: false,            // 未成年(源泉!B51)
    selfDisabledSpecial: false,// 本人が特別障害(源泉!Q51)
    selfDisabledGeneral: false,// 本人が一般障害(源泉!T51)
    isWidow: false,            // 寡婦(源泉!W51)
    isSingleParent: false,     // ひとり親(源泉!Z51)
    isWorkingStudent: false,   // 勤労学生(源泉!AC51)
    residentFlatPref: 2000,    // 均等割 都道府県(源泉!O61)
    residentFlatCity: 3000,    // 均等割 市区町村(源泉!O62)
    incomeUpRate: 0,           // 所得年間UP率 %(源泉!AB63)
    gradeArea: "1級地",         // 級地(基本入力!C19)
  };
}

// 物件の区分（世帯主・配偶者で共通）。借入限度額・控除期間の決定に使う。
export function defaultProperty() {
  return { isNew: true, isChildcare: false };
}

// 1人分のローンプラン（標準的なローン計算サイト方式・ペアローン）。
export function defaultLoanPlan() {
  return {
    principalManyen: 0,     // 借入金額（万円）
    years: 35,              // 返済期間（年）
    extraMonths: 0,         // 端数（ヶ月）
    method: "level",        // 'level'=元利均等 / 'principal'=元金均等
    rateType: "fixed",      // 'fixed'=固定/段階 / 'variable'=変動
    fixedRates: [{ fromYear: 1, pct: 1.0 }], // 固定/段階（当初＋N年目から…）
    varInitPct: 0.5,        // 変動: 当初金利
    varEveryYears: 5,       // 変動: 何年ごとに見直し
    varStepPct: 0.25,       // 変動: 1回あたり上昇幅
    varCapPct: "",          // 変動: 上限（空=なし）
    bonusManyen: 0,         // うちボーナス返済分（万円）
    bonusM1: 6,             // ボーナス月1
    bonusM2: 12,            // ボーナス月2
    fiveYearRule: false,    // 5年ルール（元利均等のみ）
    rule125: true,          // 125%ルール（5年ルール適用時）
  };
}

// ローンプラン → simulateLoan の cfg（繰上返済は非対応なので prepayments は空）。
function planToCfg(plan) {
  const principal = Math.round((plan.principalManyen || 0) * 10000);
  const months = Math.round((plan.years || 0) * 12 + (plan.extraMonths || 0));
  let rates;
  if (plan.rateType === "variable") {
    rates = buildVariableRates(
      plan.varInitPct || 0, plan.varEveryYears || 5, plan.varStepPct || 0,
      plan.varCapPct === "" || plan.varCapPct == null ? "" : Number(plan.varCapPct),
      Math.max(1, Math.ceil(months / 12)),
    );
  } else {
    rates = (plan.fixedRates && plan.fixedRates.length ? plan.fixedRates : [{ fromYear: 1, pct: 0 }])
      .map((seg, i) => ({
        fromMonth: i === 0 ? 1 : ((Number(seg.fromYear) || 1) - 1) * 12 + 1,
        annual: (Number(seg.pct) || 0) / 100,
      }))
      .sort((a, b) => a.fromMonth - b.fromMonth);
  }
  const bonusPrincipal = Math.round((plan.bonusManyen || 0) * 10000);
  const bonusMonths = bonusPrincipal > 0
    ? [...new Set([Number(plan.bonusM1) || 6, Number(plan.bonusM2) || 12])]
    : [];
  return {
    principal, bonusPrincipal, months, method: plan.method || "level", rates,
    startYear: 1, startMonth: 1, bonusMonths, prepayments: [],
    fiveYearRule: !!plan.fiveYearRule && plan.method === "level",
    rule125: plan.rule125 !== false,
  };
}

// 1人分: 給与所得後・所得控除合計・源泉徴収税額・13年ローン残高・住宅4種の13年控除。
function computePerson(person, plan, prop, applyUpRateAllYears) {
  const ae10 = kyuyoShotoku(person.incomeP10);
  const ded = incomeTaxDeductions(person, ae10);
  const withholdingTax = withholdingIncomeTax(ae10, ded.J52); // 現在の源泉徴収税額(源泉!BI10)
  const balances = yearEndBalances(planToCfg(plan));
  const byHousing = {};
  for (const h of HOUSING_TYPES) {
    byHousing[h] = housing13Years({
      income: person.incomeP10,
      bd: ded.J52,
      balances,
      housingType: h,
      isNew: prop.isNew,
      isChildcare: prop.isChildcare,
      upRatePct: person.incomeUpRate,
      applyUpRateAllYears,
    });
  }
  return { ae10, deductions: ded, withholdingTax, balances, byHousing };
}

// メインエントリ。input = { head, spouse, loanHead, loanSpouse, property, options }
export function calculate(input) {
  const head = { ...defaultPerson(), ...(input.head || {}) };
  const spouse = { ...defaultPerson(), ...(input.spouse || {}) };
  const loanHead = { ...defaultLoanPlan(), ...(input.loanHead || {}) };
  const loanSpouse = { ...defaultLoanPlan(), ...(input.loanSpouse || {}) };
  const property = { ...defaultProperty(), ...(input.property || {}) };
  const applyUpRateAllYears = input.options?.applyUpRateAllYears ?? true; // 既定=修正版

  const headRes = computePerson(head, loanHead, property, applyUpRateAllYears);
  const spouseRes = computePerson(spouse, loanSpouse, property, applyUpRateAllYears);

  // 減税額一覧表 + 夫婦合計
  const summary = {};
  for (const h of HOUSING_TYPES) {
    summary[h] = {
      head: headRes.byHousing[h],
      spouse: spouseRes.byHousing[h],
      coupleTotal: headRes.byHousing[h].total + spouseRes.byHousing[h].total,
    };
  }

  return { head: headRes, spouse: spouseRes, summary };
}
