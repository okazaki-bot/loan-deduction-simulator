// app.js — エントリポイント。フォーム構築 → 入力収集 → 計算 → 出力描画を配線。
import { calculate } from "./calc/engine.js";
import { buildForm, collectInput, renderOutput } from "./ui.js";

function recompute() {
  try {
    const input = collectInput();
    const result = calculate(input);
    renderOutput(result);
  } catch (e) {
    console.error(e);
    document.getElementById("output").innerHTML =
      `<p style="color:#b91c1c">計算エラー: ${e.message}</p>`;
  }
}

function init() {
  buildForm();
  document.getElementById("calc-btn").addEventListener("click", recompute);
  // 入力変更で自動再計算（debounce）
  let t;
  document.querySelector("main").addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(recompute, 250);
  });
  recompute(); // 初期描画（全0）
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
