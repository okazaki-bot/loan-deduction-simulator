#!/usr/bin/env python3
# run_oracle.py — 入力ケース群を base.xlsx に注入し、LibreOffice headless で再計算して
# 出力セルを読む「真値オラクル」。使い方:
#   python3 run_oracle.py cases.json out.json
# cases.json = { "outputs": ["源泉徴収票!AE10", ...],
#                "cases": [ {"id":"c1", "inputs": {"源泉徴収票!P10":5000000, ...}}, ... ] }
import json, os, sys, shutil, subprocess, glob

BASE = os.path.dirname(os.path.abspath(__file__))
SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
PROFILE = os.path.join(os.path.dirname(BASE), "profile")
SRC_XLSX = os.path.join(BASE, "src.xlsx")

import openpyxl

def split_ref(ref):
    sheet, cell = ref.split("!")
    return sheet, cell

def main():
    cases_path, out_path = sys.argv[1], sys.argv[2]
    spec = json.load(open(cases_path))
    outputs = spec["outputs"]
    cases = spec["cases"]

    work = os.path.join(BASE, "work")
    if os.path.exists(work):
        shutil.rmtree(work)
    os.makedirs(work)

    # 各ケースの入力を注入した xlsx を生成
    for c in cases:
        wb = openpyxl.load_workbook(SRC_XLSX, data_only=False)
        for ref, val in c["inputs"].items():
            sheet, cell = split_ref(ref)
            wb[sheet][cell] = val
        wb.save(os.path.join(work, c["id"] + ".xlsx"))

    # まとめて再計算変換（recalc プロファイルで常に再計算）
    files = [os.path.join(work, c["id"] + ".xlsx") for c in cases]
    outdir = os.path.join(work, "recalc")
    os.makedirs(outdir, exist_ok=True)
    cmd = [SOFFICE, "--headless", "--invisible", "--norestore",
           "-env:UserInstallation=file://" + PROFILE,
           "--convert-to", "xlsx", "--outdir", outdir] + files
    subprocess.run(cmd, check=True, capture_output=True)

    # 出力読み取り
    results = {}
    for c in cases:
        wb = openpyxl.load_workbook(os.path.join(outdir, c["id"] + ".xlsx"), data_only=True)
        vals = {}
        for ref in outputs:
            sheet, cell = split_ref(ref)
            vals[ref] = wb[sheet][cell].value
        results[c["id"]] = vals

    json.dump(results, open(out_path, "w"), ensure_ascii=False, indent=2)
    print("wrote", out_path, "cases:", len(cases))

if __name__ == "__main__":
    main()
