// ui.js — 源泉徴収票そっくりの入力フォーム構築・入力収集・減税額一覧の描画。
import { HOUSING_TYPES } from "./calc/constants.js";

// --- 小さなDOMヘルパ ---
function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return n;
}

// 源泉徴収票を帳票風グリッドで再現。各 row = セル配列。cell種類:
//  in=数値入力 / sel=選択(bool) / calc=計算値表示 / grp=小マスの束(扶養・内訳) / chk=チェック群
const SLIP_ROWS = [
  { band: true, cols: "1fr 1fr 1fr 1fr", cells: [
    { k: "in",   key: "incomeP10",     label: "支払金額" },
    { k: "calc", key: "_ae10",         label: "給与所得控除後の金額（調整控除後）" },
    { k: "calc", key: "_j52",          label: "所得控除の額の合計額" },
    { k: "calc", key: "_withholding",  label: "源泉徴収税額", hi: true },
  ]},
  { cols: "1.2fr 1.1fr 2.6fr 0.9fr 1.9fr", cells: [
    { k: "sel", key: "hasSpouseDeduction", label: "(源泉)控除対象配偶者", options: [["無", "無"], ["有", "有"]], trueVal: "有" },
    { k: "in",  key: "spouseIncome", label: "配偶者の合計所得" },
    { k: "grp", label: "控除対象扶養親族の数（人）", sub: [
      { key: "depSpecified",   label: "特定" },
      { key: "depElderly",     label: "老人" },
      { key: "depElderlyCohab",label: "内 同居老親" },
      { key: "depGeneral",     label: "その他" },
    ]},
    { k: "in",  key: "depUnder16", label: "16歳未満の扶養親族（人）" },
    { k: "grp", label: "障害者の数（人）", sub: [
      { key: "disabledSpecial",     label: "特別" },
      { key: "disabledSpecialCohab",label: "内 同居" },
      { key: "disabledGeneral",     label: "その他" },
    ]},
  ]},
  { cols: "1fr 1fr 1fr", cells: [
    { k: "in",   key: "socialInsurance",    label: "社会保険料等の金額" },
    { k: "calc", key: "_j10",               label: "生命保険料の控除額" },
    { k: "in",   key: "earthquakeInsurance",label: "地震保険料の控除額" },
  ]},
  { cols: "1fr", cells: [
    { k: "grp", label: "生命保険料の金額の内訳", sub: [
      { key: "lifeNewGeneral", label: "新生命保険料" },
      { key: "lifeOldGeneral", label: "旧生命保険料" },
      { key: "lifeNursing",    label: "介護医療保険料" },
      { key: "pensionNew",     label: "新個人年金保険料" },
      { key: "pensionOld",     label: "旧個人年金保険料" },
    ]},
  ]},
  { cols: "1fr", cells: [
    { k: "chk", label: "本人が該当する事項（✓）", items: [
      { key: "isWidow", label: "寡婦" },
      { key: "isSingleParent", label: "ひとり親" },
      { key: "isWorkingStudent", label: "勤労学生" },
      { key: "selfDisabledSpecial", label: "本人が特別障害者" },
      { key: "selfDisabledGeneral", label: "本人が一般障害者" },
      { key: "isMinor", label: "未成年（20歳未満）" },
    ]},
  ]},
  { extra: true, cols: "1fr 1fr 1fr", cells: [
    { k: "in", key: "residentFlatPref", label: "住民税 均等割（都道府県）", def: 2000 },
    { k: "in", key: "residentFlatCity", label: "住民税 均等割（市区町村）", def: 3000 },
    { k: "in", key: "incomeUpRate",     label: "所得年間UP率（％）" },
  ]},
];

// 全入力項目を走査（収集・列挙用）。calc(計算値)は含めない。
function eachField(cb) {
  for (const row of SLIP_ROWS) for (const cell of row.cells) {
    if (cell.k === "in") cb({ kind: "num", key: cell.key });
    else if (cell.k === "sel") cb({ kind: "bool", key: cell.key, trueVal: cell.trueVal });
    else if (cell.k === "grp") for (const s of cell.sub) cb({ kind: "num", key: s.key });
    else if (cell.k === "chk") for (const it of cell.items) cb({ kind: "chk", key: it.key });
  }
}

function numInput(id, def) {
  return el("input", { type: "number", id, step: "any", value: def != null ? String(def) : "", placeholder: "0" });
}

function renderCell(who, cell) {
  // 小マスの束（扶養親族の数・生命保険料の内訳）
  if (cell.k === "grp") {
    const sub = el("div", { class: "sgroup", style: `grid-template-columns:repeat(${cell.sub.length},1fr)` });
    for (const s of cell.sub) {
      sub.appendChild(el("div", { class: "ssub" }, [
        el("div", { class: "ssub-label" }, [s.label]),
        numInput(`${who}.${s.key}`, s.def),
      ]));
    }
    return el("div", { class: "scell grp" }, [el("div", { class: "scell-label" }, [cell.label]), sub]);
  }
  if (cell.k === "chk") {
    const grid = el("div", { class: "schecks" });
    for (const it of cell.items) {
      grid.appendChild(el("label", { class: "schk" }, [
        el("input", { type: "checkbox", id: `${who}.${it.key}` }), it.label,
      ]));
    }
    return el("div", { class: "scell" }, [el("div", { class: "scell-label" }, [cell.label]), grid]);
  }
  let content;
  if (cell.k === "calc") {
    content = el("div", { class: "scalc" + (cell.hi ? " hi" : ""), id: `${who}.${cell.key}` }, ["0円"]);
  } else if (cell.k === "sel") {
    content = el("select", { id: `${who}.${cell.key}` });
    for (const [v, t] of cell.options) content.appendChild(el("option", { value: v }, [t]));
  } else {
    content = numInput(`${who}.${cell.key}`, cell.def);
  }
  return el("div", { class: "scell" + (cell.hi ? " hi" : "") }, [el("div", { class: "scell-label" }, [cell.label]), content]);
}

function renderSlip(who, title) {
  const grid = el("div", { class: "slip-grid" });
  for (const row of SLIP_ROWS) {
    if (row.extra) {
      grid.appendChild(el("div", { class: "slip-note" }, ["▼ シミュレーション用の追加入力（源泉徴収票にはない項目）"]));
    }
    const r = el("div", {
      class: "slip-row" + (row.band ? " band" : "") + (row.extra ? " extra" : ""),
      style: `grid-template-columns:${row.cols}`,
    });
    for (const cell of row.cells) r.appendChild(renderCell(who, cell));
    grid.appendChild(r);
  }
  return el("div", { class: `slip2 ${who}` }, [el("div", { class: "slip2-head" }, [title]), grid]);
}

// --- 借り入れ比率フォーム ---
function lf(id, label, opts = {}) {
  const wrap = el("div", { class: "lf" });
  const lab = el("label", {}, [label]);
  if (opts.small) lab.appendChild(el("small", {}, [opts.small]));
  let control;
  if (opts.select) {
    control = el("select", { id });
    for (const [val, text] of opts.select) control.appendChild(el("option", { value: val }, [text]));
    if (opts.def != null) control.value = opts.def;
  } else {
    const input = el("input", { type: "number", id, step: "any", value: opts.def != null ? String(opts.def) : "", placeholder: "0" });
    if (opts.unit) {
      control = el("div", { class: "with-unit" }, [input, el("span", { class: "u" }, [opts.unit])]);
    } else control = input;
  }
  wrap.append(lab, control);
  return wrap;
}

function renderLoan() {
  return el("div", { class: "loan-grid" }, [
    el("div", { class: "loan-sub" }, ["物件・資金"]),
    lf("loan.landPrice", "土地金額", { unit: "円" }),
    lf("loan.buildingPrice", "建物金額（税抜）", { unit: "円" }),
    lf("loan.miscCost", "諸経費", { unit: "円" }),
    lf("loan.selfFundHead", "自己資金（世帯主）", { unit: "円" }),
    lf("loan.selfFundSpouse", "自己資金（配偶者）", { unit: "円" }),
    lf("loan.ownershipHead", "持分比率（世帯主）", { small: "0〜1。配偶者＝1−この値", def: 1, unit: "" }),

    el("div", { class: "loan-sub" }, ["住宅の区分"]),
    lf("loan.isNew", "住宅区分", { select: [["新築", "新築"], ["既存", "既存（中古・買取再販以外）"]], def: "新築" }),
    lf("loan.isChildcare", "子育て・若者夫婦世帯", { small: "19歳未満の子 or 夫婦いずれか40歳未満", select: [["×", "×（該当なし）"], ["○", "○（該当）"]], def: "×" }),

    el("div", { class: "loan-sub" }, ["フラット35 / 銀行の借り方"]),
    lf("loan.headFlatShare", "世帯主 フラット35利用率", { small: "0〜1（残りは銀行）", def: 1, unit: "" }),
    lf("loan.headBonusShare", "世帯主 ボーナス返済割合", { def: 0, unit: "" }),
    lf("loan.spouseFlatShare", "配偶者 フラット35利用率", { def: 1, unit: "" }),
    lf("loan.spouseBonusShare", "配偶者 ボーナス返済割合", { def: 0, unit: "" }),

    el("div", { class: "loan-sub" }, ["金利・返済年数（世帯主・配偶者 共通）"]),
    lf("loan.flatRate", "フラット金利（当初10年）", { def: 1.43, unit: "％" }),
    lf("loan.flatRate11", "フラット金利（11年〜）", { def: 1.43, unit: "％" }),
    lf("loan.flatYears", "フラット返済年数", { def: 35, unit: "年" }),
    lf("loan.bankRate", "銀行 金利", { def: 2, unit: "％" }),
    lf("loan.bankYears", "銀行 返済年数", { def: 20, unit: "年" }),
  ]);
}

// --- 入力収集 ---
function numVal(id) {
  const e = document.getElementById(id);
  if (!e) return 0;
  const v = parseFloat(e.value);
  return isNaN(v) ? 0 : v;
}
function chkVal(id) {
  const e = document.getElementById(id);
  return !!(e && e.checked);
}
function selVal(id) {
  const e = document.getElementById(id);
  return e ? e.value : "";
}

function collectPerson(who) {
  const p = {};
  eachField((f) => {
    if (f.kind === "num") p[f.key] = numVal(`${who}.${f.key}`);
    else if (f.kind === "bool") p[f.key] = selVal(`${who}.${f.key}`) === f.trueVal;
    else if (f.kind === "chk") p[f.key] = chkVal(`${who}.${f.key}`);
  });
  return p;
}

export function collectInput() {
  return {
    head: collectPerson("head"),
    spouse: collectPerson("spouse"),
    loan: {
      landPrice: numVal("loan.landPrice"),
      buildingPrice: numVal("loan.buildingPrice"),
      miscCost: numVal("loan.miscCost"),
      selfFundHead: numVal("loan.selfFundHead"),
      selfFundSpouse: numVal("loan.selfFundSpouse"),
      ownershipHead: numVal("loan.ownershipHead"),
      isNew: selVal("loan.isNew") === "新築",
      isChildcare: selVal("loan.isChildcare") === "○",
      headFlatShare: numVal("loan.headFlatShare"),
      headBonusShare: numVal("loan.headBonusShare"),
      spouseFlatShare: numVal("loan.spouseFlatShare"),
      spouseBonusShare: numVal("loan.spouseBonusShare"),
      flatRate: numVal("loan.flatRate"),
      flatRate11: numVal("loan.flatRate11"),
      flatYears: numVal("loan.flatYears"),
      bankRate: numVal("loan.bankRate"),
      bankYears: numVal("loan.bankYears"),
    },
    options: { applyUpRateAllYears: chkVal("opt-uprate-fix") },
  };
}

// --- 描画 ---
export function buildForm() {
  document.getElementById("slips").append(
    renderSlip("head", "世帯主（ご主人）の源泉徴収票"),
    renderSlip("spouse", "配偶者（奥様）の源泉徴収票"),
  );
  document.getElementById("loan").appendChild(renderLoan());
}

const yen = (x) => Math.round(x).toLocaleString("ja-JP") + "円";

export function renderOutput(result) {
  const out = document.getElementById("output");
  out.innerHTML = "";

  // 計算された給与所得控除後・所得控除合計をスリップへ反映
  setComputed("head", result.head);
  setComputed("spouse", result.spouse);

  // 夫婦合計カード
  const cards = el("div", { class: "summary-cards" });
  for (const h of HOUSING_TYPES) {
    cards.appendChild(el("div", { class: "card" }, [
      el("div", { class: "card-h" }, [h]),
      el("div", { class: "card-v" }, [yen(result.summary[h].coupleTotal)]),
      el("div", { class: "card-sub" }, ["夫婦合計・13年"]),
    ]));
  }
  out.appendChild(el("h3", { class: "selected-note", html: "住宅の区分ごとの<b>13年間の減税額（夫婦合計）</b>" }));
  out.appendChild(cards);

  // 明細テーブル
  out.appendChild(buildDetailTable(result));

  out.appendChild(el("p", { class: "selected-note", html:
    `世帯主 給与所得控除後: <b>${yen(result.head.ae10)}</b> ／ 所得控除合計: <b>${yen(result.head.deductions.J52)}</b>　　` +
    `配偶者 給与所得控除後: <b>${yen(result.spouse.ae10)}</b> ／ 所得控除合計: <b>${yen(result.spouse.deductions.J52)}</b>`
  }));
}

function setBox(id, text) {
  const e = document.getElementById(id);
  if (!e) return;
  if (e.tagName === "INPUT") e.value = text;
  else e.textContent = text;
}
function setComputed(who, personRes) {
  // 収入0の人は非課税で税額・減税額も0のため、表示だけ0円にする（紛らわしい基礎控除の
  // 95万円などを見せない）。計算エンジンの値は変更していない（結果には影響なし）。
  const income = numVal(`${who}.incomeP10`);
  const z = income > 0;
  setBox(`${who}._ae10`, z ? yen(personRes.ae10) : "0円");
  setBox(`${who}._j52`, z ? yen(personRes.deductions.J52) : "0円");
  setBox(`${who}._withholding`, z ? yen(personRes.withholdingTax) : "0円");
  setBox(`${who}._j10`, yen(personRes.deductions.J10)); // 生命保険料控除（収入に依存しない）
}

function buildDetailTable(result) {
  const thead = el("thead", {}, [
    el("tr", {}, [
      el("th", { rowspan: "2", class: "rowlabel" }, ["年"]),
      el("th", { colspan: "4", class: "grp-head" }, ["世帯主"]),
      el("th", { colspan: "4", class: "grp-spouse" }, ["配偶者"]),
    ]),
    el("tr", {}, [
      ...HOUSING_TYPES.map((h) => el("th", {}, [h])),
      ...HOUSING_TYPES.map((h) => el("th", {}, [h])),
    ]),
  ]);
  const tbody = el("tbody");
  for (let n = 0; n < 13; n++) {
    tbody.appendChild(el("tr", {}, [
      el("td", { class: "rowlabel" }, [`${n + 1}年目`]),
      ...HOUSING_TYPES.map((h) => el("td", {}, [yen(result.head.byHousing[h].yearly[n].AG)])),
      ...HOUSING_TYPES.map((h) => el("td", {}, [yen(result.spouse.byHousing[h].yearly[n].AG)])),
    ]));
  }
  tbody.appendChild(el("tr", { class: "total" }, [
    el("td", { class: "rowlabel" }, ["合計"]),
    ...HOUSING_TYPES.map((h) => el("td", {}, [yen(result.head.byHousing[h].total)])),
    ...HOUSING_TYPES.map((h) => el("td", {}, [yen(result.spouse.byHousing[h].total)])),
  ]));
  return el("div", { class: "result-table-wrap" }, [el("table", { class: "result" }, [thead, tbody])]);
}
