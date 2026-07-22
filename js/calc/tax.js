// tax.js — 現在の源泉徴収税額（所得税・復興込）の計算。元Excel「税額計算!L25」(=源泉!BI10)。
// 住宅ローン控除を差し引く前の、現在の年間所得税額を表す。
// 丸め順が住宅シートのBQと異なる（速算を先に100円切捨てL9→×1.021→100円切捨て）ため専用に実装。

import { ROUNDDOWN, TRUNC } from "./excel.js";

// ae10 = 給与所得控除後の金額(源泉!AE10), j52 = 所得控除合計 所得税(所得控除!J52)
export function withholdingIncomeTax(ae10, j52) {
  const diff = ae10 - j52;
  const L7 = diff <= 0 ? 0 : TRUNC(diff, -3); // 課税標準額（1000円未満切捨て）
  const base = ROUNDDOWN(L7, -3);             // 速算の基（L7と同値）
  const speed = Math.max(
    base * 0.05,
    base * 0.10 - 97500,
    base * 0.20 - 427500,
    base * 0.23 - 636000,
    base * 0.33 - 1536000,
    base * 0.40 - 2796000,
    base * 0.45 - 4796000
  );
  const L9 = ROUNDDOWN(speed, -2);   // 算出税額（100円未満切捨て）
  const L24 = ROUNDDOWN(L9, 0);      // 各種税額控除後（本ソフトでは控除0）
  const L25 = ROUNDDOWN(L24 * 1.021, -2); // 復興特別所得税込み（100円未満切捨て）
  return L25;
}
