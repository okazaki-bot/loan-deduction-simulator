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

// 源泉徴収票 各セクション定義（key = engineのpersonフィールド）
const SLIP_SECTIONS = [
  {
    sub: "収入・控除額",
    fields: [
      { key: "incomeP10", label: "支払金額（給与収入）", num: true },
      { key: "_ae10", label: "給与所得控除後の金額", computed: true },
      { key: "_j52", label: "所得控除の額の合計額", computed: true },
    ],
  },
  {
    sub: "配偶者",
    fields: [
      { key: "hasSpouseDeduction", label: "控除対象配偶者「有」", small: "配偶者控除の対象", check: true },
      { key: "spouseIncome", label: "配偶者の合計所得", small: "配偶者特別控除の判定に使用", num: true },
    ],
  },
  {
    sub: "控除対象扶養親族の数（人）",
    fields: [
      { key: "depSpecified", label: "特定扶養（19〜22歳）", num: true },
      { key: "depElderly", label: "老人扶養（70歳以上・内数）", num: true },
      { key: "depElderlyCohab", label: "うち同居老親等", num: true },
      { key: "depGeneral", label: "その他（一般）扶養", small: "16〜18・23〜69歳", num: true },
      { key: "depUnder16", label: "16歳未満の扶養親族", num: true },
    ],
  },
  {
    sub: "障害者の数（人）",
    fields: [
      { key: "disabledSpecial", label: "特別障害者（計・同居含む）", num: true },
      { key: "disabledSpecialCohab", label: "うち同居特別障害者", num: true },
      { key: "disabledGeneral", label: "一般障害者", num: true },
    ],
  },
  {
    sub: "保険料控除",
    fields: [
      { key: "socialInsurance", label: "社会保険料等の金額", num: true },
      { key: "lifeNewGeneral", label: "新生命保険料の金額", num: true },
      { key: "lifeOldGeneral", label: "旧生命保険料の金額", num: true },
      { key: "lifeNursing", label: "介護医療保険料の金額", num: true },
      { key: "pensionNew", label: "新個人年金保険料の金額", num: true },
      { key: "pensionOld", label: "旧個人年金保険料の金額", num: true },
      { key: "earthquakeInsurance", label: "地震保険料の控除額", num: true },
    ],
  },
  {
    sub: "本人の状況（該当すれば✓）",
    checks: [
      { key: "isWidow", label: "寡婦" },
      { key: "isSingleParent", label: "ひとり親" },
      { key: "isWorkingStudent", label: "勤労学生" },
      { key: "selfDisabledSpecial", label: "本人が特別障害者" },
      { key: "selfDisabledGeneral", label: "本人が一般障害者" },
      { key: "isMinor", label: "未成年（20歳未満）" },
    ],
  },
  {
    sub: "住民税・将来投影",
    fields: [
      { key: "residentFlatPref", label: "均等割額（都道府県）", num: true, def: 2000 },
      { key: "residentFlatCity", label: "均等割額（市区町村）", num: true, def: 3000 },
      { key: "incomeUpRate", label: "所得年間UP率（％）", small: "翌年以降の給与上昇率", num: true },
    ],
  },
];

function slipField(who, f) {
  const id = `${who}.${f.key}`;
  if (f.computed) {
    return el("div", { class: "fld computed" }, [
      el("label", {}, [f.label]),
      el("input", { type: "text", id, readonly: "readonly", value: "0" }),
    ]);
  }
  const input = el("input", {
    type: "number", id, step: "any",
    value: f.def != null ? String(f.def) : "",
    placeholder: "0",
  });
  const lab = el("label", {}, [f.label]);
  if (f.small) lab.appendChild(el("small", {}, [f.small]));
  return el("div", { class: "fld" }, [lab, input]);
}

function renderSlip(who, title, subtitle) {
  const body = el("div", { class: "box-grid" });
  for (const sec of SLIP_SECTIONS) {
    body.appendChild(el("div", { class: "slip-sub" }, [sec.sub]));
    if (sec.fields) {
      for (const f of sec.fields) body.appendChild(slipField(who, f));
    }
    if (sec.checks) {
      const grid = el("div", { class: "chk-grid" });
      for (const c of sec.checks) {
        grid.appendChild(el("label", { class: "chk" }, [
          el("input", { type: "checkbox", id: `${who}.${c.key}` }),
          c.label,
        ]));
      }
      body.appendChild(grid);
    }
  }
  return el("div", { class: `slip ${who}` }, [
    el("div", { class: "slip-head" }, [title]),
    subtitle ? el("div", { class: "slip-sub" }, [subtitle]) : null,
    body,
  ]);
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
  for (const sec of SLIP_SECTIONS) {
    for (const f of (sec.fields || [])) {
      if (f.computed) continue;
      if (f.check) p[f.key] = chkVal(`${who}.${f.key}`);
      else p[f.key] = numVal(`${who}.${f.key}`);
    }
    for (const c of (sec.checks || [])) p[c.key] = chkVal(`${who}.${c.key}`);
  }
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

function setComputed(who, personRes) {
  const ae = document.getElementById(`${who}._ae10`);
  const j = document.getElementById(`${who}._j52`);
  if (ae) ae.value = yen(personRes.ae10);
  if (j) j.value = yen(personRes.deductions.J52);
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
