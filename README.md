# 住宅ローン控除 シミュレーター（Web版）

ライフプランアドバイザー協会の Excel ツール「ローン控除計算ツール2026v1.xlsm」を Web 化したもの。
令和8年度税制改正（2026年1月〜2030年12月入居・控除率0.7%・控除期間13年）対応。
世帯主＋配偶者（共働き）の持分・ローン按分に対応。

## 使い方（3通り）

1. **オフライン単体ファイル（一番かんたん）**
   `dist/index.html` をブラウザにドラッグ＆ドロップ（またはダブルクリック）で開くだけ。
   サーバー不要・全部入りの1ファイル。配布もこれを渡せばOK。

2. **ローカルサーバー**
   ```
   cd loan-deduction-web
   python3 -m http.server 8777
   ```
   → ブラウザで http://localhost:8777

3. **GitHub Pages / WordPress 等へ設置**
   このフォルダ一式（`index.html`, `css/`, `js/`）をそのまま置けば動く（ビルド不要の静的サイト）。
   `dist/index.html` 1ファイルを固定ページに埋め込む形でもよい。

## 入力→出力

- **入力①**: 源泉徴収票（世帯主・配偶者）… 給与収入・保険料・扶養・障害者・配偶者所得・所得UP率など
- **入力②**: 借り入れ比率 … 土地/建物/諸経費・自己資金・住宅区分(新築/既存)・子育て世帯・持分・フラット35/銀行の利用率/金利/年数
- **出力**: 住宅4種（認定/ZEH水準/省エネ基準/一般）× 13年の減税額と、夫婦合計

## 構成

```
index.html, css/style.css        画面
js/calc/                         計算エンジン（純粋関数・Nodeでも動く）
  excel.js       ROUNDDOWN/PMT/PPMT等 Excel関数の忠実再現
  constants.js   税率・控除額・借入限度額テーブル（設定シート由来）
  deductions.js  給与所得控除・生命保険料控除・所得控除合計(J52)
  amort.js       資金返済表（PPMT償却・フラット35の11年目金利切替）
  loan.js        住宅4種×13年の控除額
  engine.js      入力→減税額一覧 の統合
js/ui.js, js/app.js              フォーム構築・入力収集・描画
build.mjs                        dist/index.html（オフライン単体版）を生成
docs/calc-spec.md                Excel全数式を抽出した計算仕様書（実装の唯一の正）
docs/raw-cells/                  各シートの生セルダンプ
test/                            LibreOffice を真値としたエンジン検証（下記）
```

`dist/index.html` を作り直すには: `node build.mjs`

## 検証（重要）

計算エンジンが元 Excel と一致することを、LibreOffice headless を真値（オラクル）として自動照合済み。

- `test/oracle/run_oracle.py` … 入力を実 Excel(src.xlsx) に注入し LibreOffice で再計算して出力を読む
- `test/compare.mjs` … JS エンジンの結果とオラクルを全セル照合（許容0.5円）
- ランダム90ケース（seed 42×50＋seed 7×40）× 各120出力セル ＝ 約1万セルで **全一致**

再実行:
```
cd test
python3 gen_cases.py 42 50 oracle/random_cases.json
python3 oracle/run_oracle.py oracle/random_cases.json oracle/random_out.json
node compare.mjs oracle/random_cases.json oracle/random_out.json
```
※ 照合は Excel 完全一致モード（`applyUpRateAllYears:false`）で行う。

## 元 Excel からの意図的な変更点

- **将来収入UP率の修正**: 元 Excel は将来投影の11〜13年目でUP率が空セル参照になり効かない（配偶者側は誤セル参照）コピペ由来のバグがあった。本 Web 版は既定で **13年すべてにUP率を適用**（画面上のチェックで切替可）。UP率0のときは元 Excel と完全一致する。

## 未対応（元 Excel と同じ制約 / 今後の課題）

- 源泉徴収票の「源泉徴収税額」「住民税年税額」などの**税額表示**は未実装（本ツールの主目的である減税額の計算・検証を優先）。必要なら住民税計算エンジン(税率等/税額計算シート)を追加ポート予定。
- 所得要件の自動判定（合計所得2,000万円超は対象外 等）、特定親族特別控除、生保こども加算 は未対応。
- 政令市の住民税率調整（8%/2%）は非対応（一律 市6%/県4%）。
