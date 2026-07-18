// engine.js — 入力(源泉徴収票2人分＋借り入れ比率)から減税額一覧表・夫婦合計までを計算する
// 統合オーケストレータ。UIとNode検証(oracle照合)の両方から呼ばれる純粋関数。

import { FLOOR } from "./excel.js";
import { kyuyoShotoku, incomeTaxDeductions } from "./deductions.js";
import { yearEndBalances } from "./amort.js";
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

export function defaultLoan() {
  return {
    landPrice: 0,        // 土地金額(D2)
    buildingPrice: 0,    // 建物金額 税抜(D3)
    miscCost: 0,         // 諸経費(D5)
    selfFundHead: 0,     // 自己資金 世帯主(D7)
    selfFundSpouse: 0,   // 自己資金 配偶者(D8)
    isNew: true,         // 住宅区分 新築=true/既存=false(D11)
    isChildcare: false,  // 子育て・若者夫婦世帯(D12)
    ownershipHead: 1,    // 持分比率 世帯主(F14) 0..1（配偶者=1-これ）
    headFlatShare: 1,    // 世帯主フラット35利用率(F23)
    headBonusShare: 0,   // 世帯主ボーナス割合(G23)
    spouseFlatShare: 1,  // 配偶者フラット35利用率(L23)
    spouseBonusShare: 0, // 配偶者ボーナス割合(M23)
    flatRate: 1.43,      // フラット金利 当初10年(D24)
    flatRate11: 1.43,    // フラット金利 11年〜(D25)
    flatYears: 35,       // フラット返済年数(E24)
    bankRate: 2,         // 銀行金利(D27)
    bankYears: 20,       // 銀行返済年数(E27)
  };
}

// 借入金額を世帯主/配偶者・フラット/銀行・月々/ボーナスに按分し、各人のローンパラメータを返す。
function splitLoan(loan) {
  const d4 = FLOOR(loan.buildingPrice * 1.1, 1);   // 建物税込
  const d6 = loan.landPrice + d4 + loan.miscCost;  // 合計
  const d9 = loan.selfFundHead + loan.selfFundSpouse; // 自己資金合計
  const d10 = d6 - d9;                             // 借入金額
  const headBorrow = d10 * loan.ownershipHead;
  const spouseBorrow = d10 * (1 - loan.ownershipHead);

  const mkParams = (borrow, flatShare, bonusShare) => ({
    flatMonthlyPrincipal: borrow * flatShare * (1 - bonusShare),
    flatBonusPrincipal: borrow * flatShare * bonusShare,
    bankMonthlyPrincipal: borrow * (1 - flatShare),
    bankBonusPrincipal: 0, // 銀行ボーナス割合(G26/M26)は既定0
    flatYears: loan.flatYears,
    flatRate: loan.flatRate,
    flatRate11: loan.flatRate11,
    bankYears: loan.bankYears,
    bankRate: loan.bankRate,
  });

  return {
    totals: { d4, d6, d9, d10, headBorrow, spouseBorrow },
    head: mkParams(headBorrow, loan.headFlatShare, loan.headBonusShare),
    spouse: mkParams(spouseBorrow, loan.spouseFlatShare, loan.spouseBonusShare),
  };
}

// 1人分: 給与所得後・所得控除合計・13年ローン残高・住宅4種の13年控除を計算。
function computePerson(person, loanParams, isNew, isChildcare, applyUpRateAllYears) {
  const ae10 = kyuyoShotoku(person.incomeP10);
  const ded = incomeTaxDeductions(person, ae10);
  const balances = yearEndBalances(loanParams);
  const byHousing = {};
  for (const h of HOUSING_TYPES) {
    byHousing[h] = housing13Years({
      income: person.incomeP10,
      bd: ded.J52,
      balances,
      housingType: h,
      isNew,
      isChildcare,
      upRatePct: person.incomeUpRate,
      applyUpRateAllYears,
    });
  }
  return { ae10, deductions: ded, balances, byHousing };
}

// メインエントリ。input = { head, spouse, loan, options:{applyUpRateAllYears} }
export function calculate(input) {
  const head = { ...defaultPerson(), ...(input.head || {}) };
  const spouse = { ...defaultPerson(), ...(input.spouse || {}) };
  const loan = { ...defaultLoan(), ...(input.loan || {}) };
  const applyUpRateAllYears = input.options?.applyUpRateAllYears ?? true; // 既定=修正版

  const split = splitLoan(loan);
  const headRes = computePerson(head, split.head, loan.isNew, loan.isChildcare, applyUpRateAllYears);
  const spouseRes = computePerson(spouse, split.spouse, loan.isNew, loan.isChildcare, applyUpRateAllYears);

  // 減税額一覧表 + 夫婦合計
  const summary = {};
  for (const h of HOUSING_TYPES) {
    const headTotal = headRes.byHousing[h].total;
    const spouseTotal = spouseRes.byHousing[h].total;
    summary[h] = {
      head: headRes.byHousing[h],
      spouse: spouseRes.byHousing[h],
      coupleTotal: headTotal + spouseTotal, // 借り入れ比率!J3..J6
    };
  }

  return { loanSplit: split.totals, head: headRes, spouse: spouseRes, summary };
}
