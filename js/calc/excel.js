// excel.js — Excelの丸め・財務関数を忠実に再現する低レベルユーティリティ。
// 住宅ローン控除計算ソフト(Excel版)のポート。ここが1円でもずれると全体がずれるため、
// Excelの ROUNDDOWN/ROUNDUP/TRUNC/FLOOR/PMT/PPMT/IPMT/FV と同じ挙動にすること。

// --- 丸め系 -------------------------------------------------------------

// 桁 digits の 10^(-digits) 単位。ROUNDDOWN(1234,-3)=1000 → factor=1000。
function pow10(digits) {
  return Math.pow(10, digits);
}

// Excel ROUNDDOWN: 0方向へ切り捨て（絶対値を小さくする）。digits<0 で桁上げ単位。
export function ROUNDDOWN(x, digits) {
  const f = pow10(digits);
  return Math.sign(x) * Math.floor(Math.abs(x) * f) / f;
}

// Excel ROUNDUP: 0から離れる方向へ切り上げ。
export function ROUNDUP(x, digits) {
  const f = pow10(digits);
  return Math.sign(x) * Math.ceil(Math.abs(x) * f) / f;
}

// Excel ROUND: 四捨五入（0.5は0から離れる方向）。
export function ROUND(x, digits) {
  const f = pow10(digits);
  return Math.sign(x) * Math.round(Math.abs(x) * f) / f;
}

// Excel TRUNC(x, digits): 0方向へ切り捨て。ROUNDDOWNと同義（負値の扱いも同じ）。
export function TRUNC(x, digits = 0) {
  return ROUNDDOWN(x, digits);
}

// Excel FLOOR(x, significance): significance の倍数へ、0方向（負の有効数字なら注意）。
// 本ソフトでは FLOOR(D3*1.1, 1) の用途のみ＝1円単位で切り捨て。
export function FLOOR(x, significance) {
  if (significance === 0) return 0;
  return Math.floor(x / significance) * significance;
}

// --- 財務関数（すべて type=0: 期末払い、fv=0 を既定） ------------------
// rate は「1期あたり利率」（例: 年1.43%・月払いなら 0.0143/12）。

// Excel PMT(rate, nper, pv, fv=0, type=0): 毎期支払額（符号は Excel と同じ）。
export function PMT(rate, nper, pv, fv = 0, type = 0) {
  if (nper === 0) return 0;
  if (rate === 0) return -(pv + fv) / nper;
  const pvif = Math.pow(1 + rate, nper);
  return (-rate * (pv * pvif + fv)) / ((pvif - 1) * (1 + rate * type));
}

// Excel FV(rate, nper, pmt, pv=0, type=0)
export function FV(rate, nper, pmt, pv = 0, type = 0) {
  if (rate === 0) return -(pv + pmt * nper);
  const pvif = Math.pow(1 + rate, nper);
  return -(pv * pvif + pmt * (1 + rate * type) * (pvif - 1) / rate);
}

// Excel IPMT(rate, per, nper, pv, fv=0, type=0): per 期の利息分。
export function IPMT(rate, per, nper, pv, fv = 0, type = 0) {
  const pmt = PMT(rate, nper, pv, fv, type);
  let ipmt;
  if (per === 1) {
    ipmt = type === 1 ? 0 : -pv;
  } else {
    // 期首残高 = FV(rate, per-1, pmt, pv, type)。type=1 のときの補正込み。
    if (type === 1) {
      ipmt = FV(rate, per - 2, pmt, pv, 1) - pmt;
    } else {
      ipmt = FV(rate, per - 1, pmt, pv, 0);
    }
  }
  return ipmt * rate;
}

// Excel PPMT(rate, per, nper, pv, fv=0, type=0) = PMT - IPMT: per 期の元金分。
export function PPMT(rate, per, nper, pv, fv = 0, type = 0) {
  return PMT(rate, nper, pv, fv, type) - IPMT(rate, per, nper, pv, fv, type);
}

// --- 補助 ---------------------------------------------------------------

// Excel VLOOKUP(value, table, colIndex1based, TRUE) の近似一致（昇順の1列目に対し
// value 以下で最大の行を選ぶ）。table は行配列 [[key, c2, c3, ...], ...]。
export function vlookupApprox(value, table, colIndex1based) {
  let chosen = null;
  for (const row of table) {
    if (row[0] <= value) chosen = row;
    else break;
  }
  if (chosen == null) return 0; // value が最小キー未満（Excel は #N/A だが本表は0行始まり）
  return chosen[colIndex1based - 1];
}
