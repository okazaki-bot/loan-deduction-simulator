// build.mjs — ES module群を1つの index.html に inline してオフライン単体ファイルを作る。
// file:// ダブルクリックで動く配布版 dist/index.html を生成。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const order = [
  "js/calc/excel.js", "js/calc/constants.js", "js/calc/deductions.js",
  "js/calc/amort.js", "js/calc/loan.js", "js/calc/engine.js",
  "js/ui.js", "js/app.js",
];

function strip(src) {
  // import文（複数行対応）を除去し、export キーワードを外す
  return src
    .replace(/import\b[\s\S]*?from\s*["'][^"']+["'];?/g, "")
    .replace(/^\s*export\s+/gm, "");
}

let bundle = "// === 自動生成バンドル（build.mjs） 編集しないこと ===\n";
for (const f of order) {
  bundle += `\n// ---- ${f} ----\n` + strip(fs.readFileSync(path.join(ROOT, f), "utf8")) + "\n";
}

const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
html = html.replace(
  /<link rel="stylesheet" href="css\/style.css">/,
  `<style>\n${css}\n</style>`
);
html = html.replace(
  /<script type="module" src="js\/app.js"><\/script>/,
  `<script>\n${bundle}\n</script>`
);

fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "dist/index.html"), html);
console.log("wrote dist/index.html", Math.round(html.length / 1024) + "KB");
