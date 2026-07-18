#!/usr/bin/env python3
# gen_cases.py — 検証用のランダムケースを生成（seed固定で再現可能）。
import json, random, sys

random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 42)
N = int(sys.argv[2]) if len(sys.argv) > 2 else 50

# 全出力セル: 減税額一覧表 8列×13年 + 合計8 + 源泉AE/AT(2人) + 借入J3-6
COLS_HEAD = {"認定": "E", "ZEH": "I", "省エネ": "M", "一般": "Q"}
COLS_SPOUSE = {"認定": "U", "ZEH": "Y", "省エネ": "AC", "一般": "AG"}
outputs = ["源泉徴収票!AE10", "源泉徴収票!AT10", "源泉徴収票!DE10", "源泉徴収票!DT10"]
for col in list(COLS_HEAD.values()) + list(COLS_SPOUSE.values()):
    for row in range(9, 22):  # 9..21 = 1..13年目
        outputs.append(f"減税額一覧表!{col}{row}")
    outputs.append(f"減税額一覧表!{col}22")  # 合計
for j in range(3, 7):
    outputs.append(f"借り入れ比率!J{j}")


def rnd_person(prefix, with_spouse_ded):
    """prefix: 世帯主='' 用のセル群を返す（呼び出し側で配偶者列に読み替える）。"""
    p = {}
    p["P10"] = random.choice([0, 1500000, 3000000, 4500000, 6000000, 8000000, 12000000, 20000000])
    p["B20"] = random.randint(0, 20) * 50000
    p["AN20"] = random.choice([0, 0, 25000, 50000])
    p["L25"] = random.choice([0, 0, 30000, 80000, 120000])   # 新生保
    p["Z25"] = random.choice([0, 0, 40000, 100000])          # 旧生保
    p["AN25"] = random.choice([0, 0, 40000, 90000])          # 介護医療
    p["BB25"] = random.choice([0, 0, 50000])                 # 新年金
    p["BP25"] = random.choice([0, 0, 60000])                 # 旧年金
    if with_spouse_ded:
        p["B16"] = "○"
    else:
        p["AO31"] = random.choice([0, 0, 300000, 600000, 900000, 1100000, 1300000])
    p["AB16"] = random.choice([0, 0, 1])       # 特定扶養
    p["AM16"] = random.choice([0, 0, 1])       # 老人扶養(内)
    p["AI16"] = 0                              # 同居老親(内) ≤ AM16
    if p["AM16"] and random.random() < 0.5:
        p["AI16"] = 1
    p["AT16"] = random.choice([0, 0, 1, 2])    # 一般扶養
    p["BB16"] = random.choice([0, 0, 1])       # 16歳未満
    # 障害者: BJ16(特別計) >= BF16(同居特別)
    p["BN16"] = random.choice([0, 0, 1])       # 一般障害
    bj = random.choice([0, 0, 1])
    p["BJ16"] = bj
    p["BF16"] = 1 if (bj and random.random() < 0.5) else 0
    for flag in ["W51", "Z51", "AC51", "Q51", "T51"]:
        if random.random() < 0.12:
            p[flag] = "○"
    p["AB63"] = random.choice([0, 0, 1, 2, 3, 5])  # UP率
    return p


HEAD_TO_SPOUSE = {
    "P10": "CP10", "B20": "CB20", "AN20": "DN20", "L25": "CL25", "Z25": "CZ25",
    "AN25": "DN25", "BB25": "EB25", "BP25": "EP25", "AO31": "DO31", "B16": "CB16",
    "AB16": "DB16", "AM16": "DM16", "AI16": "DI16", "AT16": "DT16", "BB16": "EB16",
    "BN16": "EN16", "BJ16": "EJ16", "BF16": "EF16", "W51": "CW51", "Z51": "CZ51",
    "AC51": "DC51", "Q51": "CQ51", "T51": "CT51", "AB63": "DA63",
}

cases = []
for i in range(N):
    inp = {}
    head_sd = random.random() < 0.3
    head = rnd_person("", head_sd)
    for k, v in head.items():
        inp[f"源泉徴収票!{k}"] = v
    # 配偶者（半数は収入なし＝単独）
    if random.random() < 0.6:
        sp_sd = random.random() < 0.2
        sp = rnd_person("", sp_sd)
        for k, v in sp.items():
            inp[f"源泉徴収票!{HEAD_TO_SPOUSE[k]}"] = v
    # 借り入れ比率
    inp["借り入れ比率!D2"] = random.choice([0, 10000000, 20000000])
    inp["借り入れ比率!D3"] = random.choice([15000000, 25000000, 30000000, 40000000, 55000000])
    inp["借り入れ比率!D5"] = random.choice([0, 2000000, 3000000])
    inp["借り入れ比率!D7"] = random.choice([0, 0, 3000000])
    inp["借り入れ比率!D8"] = random.choice([0, 0, 1000000])
    inp["借り入れ比率!D11"] = random.choice(["新築", "既存"])
    inp["借り入れ比率!D12"] = random.choice(["○", "×"])
    inp["借り入れ比率!F14"] = random.choice([1, 1, 0.5, 0.6, 0.7])
    inp["借り入れ比率!F23"] = random.choice([1, 1, 0.5, 0])   # フラット利用率(世帯主)
    inp["借り入れ比率!G23"] = random.choice([0, 0, 0.2])       # ボーナス割合(世帯主)
    inp["借り入れ比率!L23"] = random.choice([1, 1, 0.5, 0])   # フラット利用率(配偶者)
    inp["借り入れ比率!M23"] = random.choice([0, 0, 0.3])       # ボーナス割合(配偶者)
    inp["借り入れ比率!D24"] = random.choice([1.0, 1.43, 1.8])  # フラット当初金利
    inp["借り入れ比率!D25"] = random.choice([1.43, 2.0, 2.5])  # フラット11年〜金利
    inp["借り入れ比率!E24"] = random.choice([35, 20, 10, 15])  # フラット年数(10=切替なし)
    inp["借り入れ比率!D27"] = random.choice([0.5, 2.0, 3.0])   # 銀行金利
    inp["借り入れ比率!E27"] = random.choice([20, 35, 8])       # 銀行年数
    cases.append({"id": f"r{i:03d}", "inputs": inp})

json.dump({"outputs": outputs, "cases": cases}, open(sys.argv[3] if len(sys.argv) > 3 else "oracle/random_cases.json", "w"), ensure_ascii=False)
print(f"generated {len(cases)} cases, {len(outputs)} outputs each")
