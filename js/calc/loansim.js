// 住宅ローン計算エンジン（アイローンカルク同等機能）
// 金額はすべて「円」、金利は年利（小数: 1.5% → 0.015）、期間は「ヶ月」で扱う。

/**
 * 元利均等返済の毎回返済額を計算する
 * @param {number} balance 残高（円）
 * @param {number} monthlyRate 月利
 * @param {number} n 残り回数
 * @returns {number} 毎回返済額（円・四捨五入）
 */
export function levelPayment(balance, monthlyRate, n) {
  if (n <= 0) return 0;
  if (monthlyRate === 0) return Math.round(balance / n);
  const k = Math.pow(1 + monthlyRate, n);
  return Math.round((balance * monthlyRate * k) / (k - 1));
}

/**
 * 指定回（1始まり）に適用される年利を金利セグメントから求める
 * @param {Array<{fromMonth:number, annual:number}>} rates
 */
export function rateAt(rates, month) {
  let r = rates[0].annual;
  for (const seg of rates) {
    if (month >= seg.fromMonth) r = seg.annual;
  }
  return r;
}

/**
 * ローンを1本シミュレーションする
 * @param {object} cfg
 *   principal      総借入額（円）
 *   bonusPrincipal うちボーナス返済分（円）
 *   months         返済期間（ヶ月）
 *   method         'level'（元利均等） | 'principal'（元金均等）
 *   rates          [{fromMonth: 1, annual: 0.015}, ...] fromMonthは回数（1始まり）
 *   startYear/startMonth 返済開始年月（完済時期・ボーナス月判定用）
 *   bonusMonths    ボーナス返済月 [1,7] など（カレンダー月）
 *   prepayments    [{month: 回数, amount: 円, type: 'shorten'|'reduce'}]
 *   fiveYearRule   5年ルール（元利均等のみ）：金利が変わっても返済額は5年ごとにしか見直さない
 *   rule125        125%ルール：見直し後の返済額は直前の1.25倍まで（5年ルール適用時のみ）
 *                  据置中に利息が返済額を上回った分は未払利息として繰り越し、最終回に一括精算
 * @returns {object} { rows, summary }
 */
export function simulateLoan(cfg) {
  let {
    principal,
    bonusPrincipal = 0,
    months,
    method = 'level',
    rates = [{ fromMonth: 1, annual: 0.01 }],
    startYear = new Date().getFullYear(),
    startMonth = 1,
    bonusMonths = [],
    prepayments = [],
    fiveYearRule = false,
    rule125 = true,
  } = cfg;

  const useFive = fiveYearRule && method === 'level';
  const REVIEW = 60; // 見直し間隔（ヶ月）
  // 5年ルールの見直し：新返済額を125%で頭打ち。頭打ちになったかも返す
  const review = (prevPay, newPay) => {
    const cap = Math.floor(prevPay * 1.25);
    return rule125 && newPay > cap ? { pay: cap, capped: true } : { pay: newPay, capped: false };
  };

  // ボーナス返済月が未指定ならボーナス分は毎月分に合算する
  if (bonusMonths.length === 0) bonusPrincipal = 0;
  const monthlyPrincipalTotal = principal - bonusPrincipal;

  // ---- ボーナス分を先に半年賦として計算 ----
  const bonusSchedule = new Map(); // 回数 -> {payment, principal, interest, balance}
  const bonusBalanceAt = new Array(months + 1).fill(bonusPrincipal); // 各回終了時点のボーナス分残高
  const bonusUnpaidAt = new Array(months + 1).fill(0); // 各回終了時点のボーナス分未払利息
  let bonusTotalPaid = 0;
  if (bonusPrincipal > 0 && bonusMonths.length > 0) {
    // ボーナス支払が発生する回数（ローン回数ベース）の一覧
    const bonusHits = [];
    for (let m = 1; m <= months; m++) {
      const calMonth = ((startMonth - 1 + (m - 1)) % 12) + 1;
      if (bonusMonths.includes(calMonth)) bonusHits.push(m);
    }
    if (bonusHits.length > 0) {
      let bal = bonusPrincipal;
      let unpaid = 0;
      const nb = bonusHits.length;
      // 半年賦の1回あたり利率 = 年利/2（段階金利は各時点の利率を使用）
      const halfPay = (b, halfRate, remain) => {
        if (halfRate === 0) return Math.round(b / remain);
        const k = Math.pow(1 + halfRate, remain);
        return Math.round((b * halfRate * k) / (k - 1));
      };
      let pay = null;
      let prevRate = null;
      let prevWin = 0;
      let bCapped = false; // 前回の見直しで125%上限に当たったか
      for (let i = 0; i < nb; i++) {
        const m = bonusHits[i];
        const annual = rateAt(rates, m);
        const halfRate = annual / 2;
        const win = Math.floor((m - 1) / REVIEW);
        if (pay === null) {
          pay = halfPay(bal, halfRate, nb - i);
          prevRate = annual;
        } else if (useFive) {
          // 5年の区切りで、金利が変わったか前回125%で頭打ちだった場合に見直す
          if (win !== prevWin && (annual !== prevRate || bCapped)) {
            const rv = review(pay, halfPay(bal, halfRate, nb - i));
            pay = rv.pay;
            bCapped = rv.capped;
            prevRate = annual;
          }
        } else if (annual !== prevRate) {
          // 金利変更時は残回数で再計算（元利均等ベース）
          pay = halfPay(bal, halfRate, nb - i);
          prevRate = annual;
        }
        prevWin = win;
        const interest = Math.floor(bal * halfRate);
        const unpaidBefore = unpaid;
        let payment = pay;
        let prin;
        const avail = pay - interest;
        if (avail < 0) {
          unpaid += -avail;
          prin = 0;
        } else {
          const pu = Math.min(unpaid, avail);
          unpaid -= pu;
          prin = avail - pu;
        }
        if (i === nb - 1 || prin >= bal) {
          // 最終精算：残元金＋利息＋未払利息
          prin = bal;
          payment = bal + interest + unpaidBefore;
          unpaid = 0;
        }
        bal -= prin;
        bonusTotalPaid += payment;
        bonusSchedule.set(m, { payment, principal: prin, interest, balance: bal });
        for (let j = m; j <= months; j++) {
          bonusBalanceAt[j] = bal;
          bonusUnpaidAt[j] = unpaid;
        }
        if (bal <= 0) break;
      }
    }
  }

  // ---- 毎月分のシミュレーション ----
  const prepayMap = new Map();
  for (const p of prepayments) {
    if (!p || !p.amount || p.amount <= 0) continue;
    const list = prepayMap.get(p.month) || [];
    list.push(p);
    prepayMap.set(p.month, list);
  }

  const rows = [];
  let balance = monthlyPrincipalTotal;
  let payment = null; // 元利均等の毎回返済額
  let fixedPrincipal = null; // 元金均等の毎回元金
  let prevAnnual = null;
  let reviewRate = null; // 5年ルール：直近の返済額見直しに使った金利
  let capped = false; // 5年ルール：前回の見直しで125%上限に当たったか
  let unpaid = 0; // 未払利息（毎月分）
  let maxUnpaid = 0;
  let totalPaid = 0;
  let totalPrepaid = 0;
  let totalInterest = 0;
  let lastMonth = 0;

  for (let m = 1; m <= months && (balance > 0 || unpaid > 0); m++) {
    const annual = rateAt(rates, m);
    const mr = annual / 12;
    const remaining = months - m + 1;

    let reviewed = false;
    if (method === 'level') {
      if (payment === null) {
        payment = levelPayment(balance, mr, remaining);
        reviewRate = annual;
      } else if (useFive) {
        // 6年目・11年目…の初回だけ見直す。金利が前回見直しから変わったか、
        // 前回125%上限で頭打ちだった場合に再計算（どちらでもなければ据え置き）
        if ((m - 1) % REVIEW === 0 && (annual !== reviewRate || capped)) {
          const rv = review(payment, levelPayment(balance, mr, remaining));
          payment = rv.pay;
          capped = rv.capped;
          reviewRate = annual;
          reviewed = true;
        }
      } else if (annual !== prevAnnual) {
        payment = levelPayment(balance, mr, remaining);
      }
    } else {
      if (fixedPrincipal === null) {
        fixedPrincipal = Math.round(monthlyPrincipalTotal / months);
      }
    }
    prevAnnual = annual;

    const interest = Math.floor(balance * mr);
    const unpaidBefore = unpaid;
    let prin, pay;
    if (method === 'level') {
      pay = payment;
      const avail = payment - interest;
      if (avail < 0) {
        // 利息が返済額を上回る → 差額は未払利息として繰り越し
        unpaid += -avail;
        prin = 0;
      } else {
        // 未払利息があれば元金より先に充当
        const pu = Math.min(unpaid, avail);
        unpaid -= pu;
        prin = avail - pu;
      }
    } else {
      prin = fixedPrincipal;
      pay = prin + interest;
    }
    if (m === months || prin >= balance) {
      // 最終精算：残元金＋当月利息＋未払利息を一括
      prin = balance;
      pay = balance + interest + unpaidBefore;
      unpaid = 0;
    }
    balance -= prin;
    totalPaid += pay;
    totalInterest += interest;

    // 繰上げ返済（当該回の返済後に実行）。未払利息があれば先に充当
    let prepaidThis = 0;
    let prepayType = null;
    const preps = prepayMap.get(m);
    if (preps && (balance > 0 || unpaid > 0)) {
      for (const p of preps) {
        const toUnpaid = Math.min(unpaid, p.amount);
        unpaid -= toUnpaid;
        const amt = Math.min(p.amount - toUnpaid, balance);
        balance -= amt;
        prepaidThis += toUnpaid + amt;
        totalPrepaid += toUnpaid + amt;
        prepayType = p.type;
        if (balance > 0 && p.type === 'reduce') {
          // 返済額軽減: 期間は維持し返済額を再計算
          if (method === 'level') {
            payment = levelPayment(balance, mr, months - m);
            reviewRate = annual;
            capped = false;
          } else {
            fixedPrincipal = Math.round(balance / (months - m));
          }
        }
        // 期間短縮: 返済額を維持 → ループが早く終わる
      }
    }

    const bonus = bonusSchedule.get(m) || null;
    const calMonthIdx = startMonth - 1 + (m - 1);
    rows.push({
      no: m,
      year: startYear + Math.floor(calMonthIdx / 12),
      month: (calMonthIdx % 12) + 1,
      rate: annual,
      payment: pay,
      principal: prin,
      interest,
      prepaid: prepaidThis,
      prepayType,
      bonusPayment: bonus ? bonus.payment : 0,
      bonusPrincipal: bonus ? bonus.principal : 0,
      bonusInterest: bonus ? bonus.interest : 0,
      balance: balance + bonusBalanceAt[m],
      monthlyBalance: balance,
      unpaidInterest: unpaid + bonusUnpaidAt[m],
      reviewed,
    });
    maxUnpaid = Math.max(maxUnpaid, unpaid + bonusUnpaidAt[m]);
    lastMonth = m;
  }

  // ボーナス分利息合計
  let bonusInterestTotal = 0;
  for (const b of bonusSchedule.values()) bonusInterestTotal += b.interest;

  const firstRow = rows[0] || { payment: 0 };
  const grandTotal = totalPaid + totalPrepaid + bonusTotalPaid;
  const endIdx = startMonth - 1 + (lastMonth - 1);

  return {
    rows,
    summary: {
      principal,
      bonusPrincipal,
      months: lastMonth,
      plannedMonths: months,
      firstPayment: firstRow.payment,
      totalPaid: grandTotal,
      totalInterest: totalInterest + bonusInterestTotal,
      totalPrepaid,
      endYear: startYear + Math.floor(endIdx / 12),
      endMonth: (endIdx % 12) + 1,
      fiveYearRule: useFive,
      maxUnpaid,
      finalPayment: rows.length ? rows[rows.length - 1].payment + rows[rows.length - 1].bonusPayment : 0,
    },
  };
}

/**
 * 変動金利（当初＋N年ごとに+Y%、上限）を返済期間ぶんの金利セグメントに展開する。
 * loan-calc-web/js/app.js の buildVariableRates と同一ロジック。
 * @returns {Array<{fromMonth:number, annual:number}>}
 */
export function buildVariableRates(initPct, everyYears, stepPct, capPct, termYears) {
  const every = Math.max(1, everyYears || 1);
  const cap = (capPct === '' || capPct == null || isNaN(capPct)) ? Infinity : capPct;
  const rates = [];
  for (let k = 0; k * every < termYears; k++) {
    let pct = initPct + k * (stepPct || 0);
    const capped = pct >= cap;
    if (capped) pct = cap;
    rates.push({ fromMonth: k * every * 12 + 1, annual: pct / 100 });
    if (capped || (stepPct || 0) <= 0) break;
  }
  if (rates.length === 0) rates.push({ fromMonth: 1, annual: (initPct || 0) / 100 });
  return rates;
}

/**
 * ローン設定から「各年末（経過12ヶ月ごと）の残高」を13年分返す（住宅ローン控除用）。
 * 残高は simulateLoan の rows[].balance（毎月分＋ボーナス分の合計残高）。
 * n年目末 = 12n回目返済後の残高。完済済み（行が無い月）は0。
 * @returns {number[]} 長さ13（index0=1年目末）
 */
export function yearEndBalances(cfg) {
  const { rows } = simulateLoan(cfg);
  const balByMonth = new Array((cfg.months || 0) + 1).fill(0);
  for (const r of rows) balByMonth[r.no] = r.balance;
  const out = [];
  for (let n = 1; n <= 13; n++) {
    const m = 12 * n;
    out.push(m < balByMonth.length ? balByMonth[m] : 0);
  }
  return out;
}
