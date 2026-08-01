#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tổng kết bake-off cú viết P3 sau khi người chấm điền xong phiếu.

Cách dùng:
  python3 score_bakeoff.py phieu_cham_thuy.csv phieu_cham_minh.csv ...
    [--cu-viet-ngay 600]

Mỗi phiếu = 1 người chấm (bản sao phieu_cham.csv đã điền cột diem 1-5,
sai_du_kien đánh "x" nếu bản đó sai/bịa dữ kiện so với bài gốc).
Đáp án bản nào của model nào đọc từ ket_qua_tho.json (cùng thư mục).

In báo cáo ra màn hình + ghi bao_cao_bakeoff.md.
"""

import csv
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))

TEN_MODEL = {
    "haiku": "Haiku 4.5 (đương kim)",
    "deepseek": "DeepSeek V4-Flash",
    "gpt5mini": "GPT-5 Mini",
}


def main():
    args = sys.argv[1:]
    cu_viet_ngay = 600
    if "--cu-viet-ngay" in args:
        i = args.index("--cu-viet-ngay")
        cu_viet_ngay = int(args[i + 1])
        del args[i:i + 2]
    if not args:
        sys.exit("Cần ít nhất 1 phiếu chấm đã điền: python3 score_bakeoff.py phieu.csv ...")

    with open(os.path.join(BASE, "ket_qua_tho.json"), encoding="utf-8") as f:
        kq = json.load(f)
    dap_an = kq["dap_an"]

    # ===== Gom điểm người chấm =====
    diem = {}        # model -> [điểm...]
    sai_dk = {}      # model -> số lần bị đánh dấu sai dữ kiện
    so_ban = {}      # model -> số bản được chấm
    thang = {}       # model -> số bài thắng (điểm cao nhất trong bài, chia đều khi hòa)
    bo_trong = 0

    for path in args:
        theo_bai = {}
        with open(path, encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                bai_so = str(row["bai_so"]).strip()
                ban = (row["ban"] or "").strip().upper()
                model = dap_an.get(bai_so, {}).get(ban)
                if not model:
                    continue
                d_raw = (row.get("diem") or "").strip().replace(",", ".")
                if not d_raw:
                    bo_trong += 1
                    continue
                try:
                    d = float(d_raw)
                except ValueError:
                    bo_trong += 1
                    continue
                diem.setdefault(model, []).append(d)
                so_ban[model] = so_ban.get(model, 0) + 1
                if (row.get("sai_du_kien") or "").strip():
                    sai_dk[model] = sai_dk.get(model, 0) + 1
                theo_bai.setdefault(bai_so, []).append((model, d))
        for bai_so, cap in theo_bai.items():
            max_d = max(d for _, d in cap)
            winners = [m for m, d in cap if d == max_d]
            for m in winners:
                thang[m] = thang.get(m, 0) + 1.0 / len(winners)

    # ===== Số liệu máy (từ run_bakeoff) =====
    may = {}
    for key, r in kq["calls"].items():
        prov = key.rsplit(":", 1)[1]
        m = may.setdefault(prov, {"n": 0, "loi": 0, "tu_choi": 0, "viet": 0,
                                  "dat_tu": 0, "in": 0, "out": 0, "secs": 0.0})
        m["n"] += 1
        m["in"] += r.get("in_tok", 0)
        m["out"] += r.get("out_tok", 0)
        m["secs"] += r.get("secs", 0)
        if not r.get("ok"):
            m["loi"] += 1
        elif not r.get("is_news"):
            m["tu_choi"] += 1
        else:
            m["viet"] += 1
            if r.get("dat_chuan_tu"):
                m["dat_tu"] += 1

    GIA = {"deepseek": (0.14, 0.28), "gpt5mini": (0.25, 2.00)}
    HAIKU_PER_BAI = 0.008

    out = []
    out.append("# Báo cáo bake-off cú viết P3\n")
    out.append("Người chấm: %d phiếu. Ô bỏ trống/không hợp lệ: %d.\n" % (len(args), bo_trong))
    out.append("| Model | Bản được chấm | Điểm TB | Thắng bài | Sai dữ kiện | Đạt chuẩn từ (máy) | $/bài | $/ngày (%d cú) |" % cu_viet_ngay)
    out.append("|---|---|---|---|---|---|---|---|")

    models = [m for m in ("haiku", "deepseek", "gpt5mini") if m in diem or m in may]
    for m in models:
        ds = diem.get(m, [])
        tb = sum(ds) / len(ds) if ds else 0
        n_ban = so_ban.get(m, 0)
        sdk = sai_dk.get(m, 0)
        th = thang.get(m, 0)
        if m == "haiku":
            dat_tu_txt = "— (bản production)"
            cost_bai = HAIKU_PER_BAI
        else:
            mm = may.get(m, {})
            dat_tu_txt = "%d/%d" % (mm.get("dat_tu", 0), mm.get("viet", 0)) if mm.get("viet") else "0"
            gi, go = GIA[m]
            cost_bai = (mm.get("in", 0) / 1e6 * gi + mm.get("out", 0) / 1e6 * go) / max(1, mm.get("n", 1))
        out.append("| %s | %d | %.2f | %.1f | %d (%.0f%%) | %s | $%.5f | $%.2f |" % (
            TEN_MODEL.get(m, m), n_ban, tb, th, sdk,
            100.0 * sdk / n_ban if n_ban else 0, dat_tu_txt,
            cost_bai, cost_bai * cu_viet_ngay))

    out.append("\n## Số liệu máy (không cần người chấm)\n")
    for m, mm in may.items():
        out.append("- **%s**: %d bài — lỗi API/JSON %d, từ chối viết %d, viết %d, TB %.1fs/bài, token %d in / %d out"
                   % (TEN_MODEL.get(m, m), mm["n"], mm["loi"], mm["tu_choi"], mm["viet"],
                      mm["secs"] / max(1, mm["n"]), mm["in"], mm["out"]))

    out.append("\n## Cách đọc\n")
    out.append("- **Điểm TB + Thắng bài**: chất lượng văn theo người đọc mù — quan trọng nhất.")
    out.append("- **Sai dữ kiện**: lỗi chết người với trang tin — model rẻ mà bịa số liệu thì loại thẳng.")
    out.append("- **Đạt chuẩn từ**: kỷ luật số từ 12-18 tiêu đề / 100-120 tổng; kém thì tốn cú retry, đội chi phí thật.")
    out.append("- Muốn thay Haiku ở cú viết: ứng viên cần điểm TB ≥ Haiku - 0.3, sai dữ kiện ≤ Haiku, và đạt chuẩn từ ≥ 80%.")
    out.append("- Theo luật của sếp: kết quả này chỉ là HỒ SƠ ĐỀ XUẤT — đổi model production phải có release note được duyệt.")

    bao_cao = "\n".join(out)
    print(bao_cao)
    with open(os.path.join(BASE, "bao_cao_bakeoff.md"), "w", encoding="utf-8") as f:
        f.write(bao_cao + "\n")
    print("\nĐã ghi bao_cao_bakeoff.md")


if __name__ == "__main__":
    main()
