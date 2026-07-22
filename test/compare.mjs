// compare.mjs — JS計算エンジンの結果を LibreOffice オラクル(out.json)と照合する。
// 使い方: node compare.mjs oracle/cases.json oracle/out.json
// 注意: 照合は Excel完全一致モード(applyUpRateAllYears=false)で行う。
import fs from "node:fs";
import { calculate } from "../js/calc/engine.js";

const [, , casesPath, outPath] = process.argv;
const spec = JSON.parse(fs.readFileSync(casesPath, "utf8"));
const oracle = JSON.parse(fs.readFileSync(outPath, "utf8"));

// セル参照入力 → engine入力 への変換表
const PERSON_MAP = {
  P10: "incomeP10", B20: "socialInsurance", AN20: "earthquakeInsurance",
  L25: "lifeNewGeneral", Z25: "lifeOldGeneral", AN25: "lifeNursing",
  BB25: "pensionNew", BP25: "pensionOld", AO31: "spouseIncome",
  AB16: "depSpecified", AM16: "depElderly", AI16: "depElderlyCohab",
  AT16: "depGeneral", BB16: "depUnder16", BF16: "disabledSpecialCohab",
  BJ16: "disabledSpecial", BN16: "disabledGeneral", O61: "residentFlatPref",
  O62: "residentFlatCity", AB63: "incomeUpRate",
};
const PERSON_FLAG = { B16: "hasSpouseDeduction", B51: "isMinor", Q51: "selfDisabledSpecial",
  T51: "selfDisabledGeneral", W51: "isWidow", Z51: "isSingleParent", AC51: "isWorkingStudent" };
// 配偶者列(+78列相当)の実セル → 世帯主セル
const SPOUSE_CELL = {
  CP10: "P10", CB20: "B20", DN20: "AN20", CL25: "L25", CZ25: "Z25", DN25: "AN25",
  EB25: "BB25", EP25: "BP25", DO31: "AO31", DB16: "AB16", DM16: "AM16", DI16: "AI16",
  DT16: "AT16", EB16: "BB16", EF16: "BF16", EJ16: "BJ16", EN16: "BN16",
  CN61: "O61", CN62: "O62", DA63: "AB63",
  CB16: "B16", CB51: "B51", CQ51: "Q51", CT51: "T51", CW51: "W51", CZ51: "Z51", DC51: "AC51",
};
const LOAN_MAP = {
  D2: "landPrice", D3: "buildingPrice", D5: "miscCost", D7: "selfFundHead", D8: "selfFundSpouse",
  F14: "ownershipHead", F23: "headFlatShare", G23: "headBonusShare",
  L23: "spouseFlatShare", M23: "spouseBonusShare",
  D24: "flatRate", D25: "flatRate11", E24: "flatYears", D27: "bankRate", E27: "bankYears",
};

function toEngineInput(inputs) {
  const head = {}, spouse = {}, loan = {};
  for (const [ref, val] of Object.entries(inputs)) {
    const [sheet, cell] = ref.split("!");
    if (sheet === "源泉徴収票") {
      if (PERSON_MAP[cell]) head[PERSON_MAP[cell]] = val;
      else if (PERSON_FLAG[cell]) head[PERSON_FLAG[cell]] = val === "○";
      else if (SPOUSE_CELL[cell]) {
        const hc = SPOUSE_CELL[cell];
        if (PERSON_MAP[hc]) spouse[PERSON_MAP[hc]] = val;
        else if (PERSON_FLAG[hc]) spouse[PERSON_FLAG[hc]] = val === "○";
      } else throw new Error("unmapped 源泉 cell: " + cell);
    } else if (sheet === "借り入れ比率") {
      if (cell === "D11") loan.isNew = (val === "新築");
      else if (cell === "D12") loan.isChildcare = (val === "○");
      else if (LOAN_MAP[cell]) loan[LOAN_MAP[cell]] = val;
      else throw new Error("unmapped 借入 cell: " + cell);
    } else throw new Error("unmapped sheet: " + sheet);
  }
  return { head, spouse, loan, options: { applyUpRateAllYears: false } };
}

// engine結果 → オラクル出力セル への写像（減税額一覧表 全8列×13年+合計 を網羅）
const COL = {
  E: ["head", "認定住宅"], I: ["head", "ZEH水準"], M: ["head", "省エネ基準"], Q: ["head", "一般住宅"],
  U: ["spouse", "認定住宅"], Y: ["spouse", "ZEH水準"], AC: ["spouse", "省エネ基準"], AG: ["spouse", "一般住宅"],
};
function toOutputs(r) {
  const sm = r.summary;
  const o = {
    "源泉徴収票!AE10": r.head.ae10,
    "源泉徴収票!AT10": r.head.deductions.J52,
    "源泉徴収票!DE10": r.spouse.ae10,
    "源泉徴収票!DT10": r.spouse.deductions.J52,
    "源泉徴収票!BI10": r.head.withholdingTax,
    "源泉徴収票!EI10": r.spouse.withholdingTax,
    "借り入れ比率!J3": sm["認定住宅"].coupleTotal,
    "借り入れ比率!J4": sm["ZEH水準"].coupleTotal,
    "借り入れ比率!J5": sm["省エネ基準"].coupleTotal,
    "借り入れ比率!J6": sm["一般住宅"].coupleTotal,
  };
  for (const [col, [who, house]] of Object.entries(COL)) {
    const res = r[who].byHousing[house];
    for (let row = 9; row <= 21; row++) {
      o[`減税額一覧表!${col}${row}`] = res.yearly[row - 9].AG;
    }
    o[`減税額一覧表!${col}22`] = res.total;
  }
  return o;
}

const TOL = 0.5; // 0.5円まで許容（Excelの浮動小数と一致）
let pass = 0, fail = 0;
for (const c of spec.cases) {
  const input = toEngineInput(c.inputs);
  const got = toOutputs(calculate(input));
  const exp = oracle[c.id];
  const diffs = [];
  for (const ref of spec.outputs) {
    const g = got[ref], e = exp[ref] ?? 0;
    if (g === undefined) { diffs.push(`${ref}: JS未計算`); continue; }
    if (Math.abs((g || 0) - (e || 0)) > TOL) {
      diffs.push(`${ref}: JS=${round(g)} vs Excel=${round(e)} (Δ${round((g||0)-(e||0))})`);
    }
  }
  if (diffs.length === 0) { pass++; console.log(`✅ ${c.id}`); }
  else { fail++; console.log(`❌ ${c.id}`); diffs.forEach(d => console.log("   " + d)); }
}
function round(x) { return Math.round(x * 100) / 100; }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
