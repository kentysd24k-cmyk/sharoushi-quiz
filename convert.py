"""pdf/配下の各年度の (回数)takuitusiki.pdf / (回数)kijyun-seitou.pdf から questions.json を生成する。

pdf/{年度}/{回数}takuitusiki.pdf 択一式問題本文
pdf/{年度}/{回数}kijyun-seitou.pdf 正答一覧(表形式)
"""

import json
import re
import sys
import traceback

import pdfplumber

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PDF_ROOT = "pdf"
OUTPUT_JSON = "questions.json"

# 年度フォルダ名 -> ファイル名の回数プレフィックス
YEARS = [
    ("R07", "57"),
    ("R06", "56"),
    ("R05", "55"),
    ("R04", "54"),
    ("R03", "53"),
]

SUBSCRIPT_MAP = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")

# 年度によっては埋め込みフォントにToUnicode情報がなく、
# pdfplumberが "(cid:NNNNN)" のプレースホルダ文字列を出力することがある。
# 実際に出現した番号を文脈から特定し、正しい文字へ復元する。
CID_FIX_MAP = {
    13432: "均",   # 男女雇用機会均等法 / 平均賃金
    7791: "娩",    # 分娩
    7728: "腿",    # 大腿骨
    20282: "杖",   # 松葉杖
    20275: "腱",   # 腱鞘炎
    7708: "鞘",    # 腱鞘炎
    7722: "遡",    # 遡って
    7638: "迂",    # 迂回
    514: "-",      # Off-JT
}
CID_RE = re.compile(r"\(cid:(\d+)\)")

# (検出キー: 空白除去後の科目見出し, 科目名として格納する正式名称)
SUBJECT_DETECT_KEYS = [
    ("労働基準法及び労働安全衛生法", "労働基準法及び労働安全衛生法"),
    ("労働者災害補償保険法", "労働者災害補償保険法（労働保険の保険料の徴収等に関する法律を含む。）"),
    ("雇用保険法", "雇用保険法（労働保険の保険料の徴収等に関する法律を含む。）"),
    ("労務管理その他の労働及び社会保険に関する一般常識", "労務管理その他の労働及び社会保険に関する一般常識"),
    ("健康保険法", "健康保険法"),
    ("厚生年金保険法", "厚生年金保険法"),
    ("国民年金法", "国民年金法"),
]

CHOICE_MAP = dict(zip("ＡＢＣＤＥ", "ABCDE"))
SUBITEM_LETTERS = "アイウエオ"

QUESTION_MARK_RE = re.compile(r"^〔問\s*(\d+)\s*〕\s*(.*)$")
PAGE_NUM_RE = re.compile(r"^\d+$")
# 1行に複数の選択肢/項目記号が詰め込まれている場合に改行を挿入する
EMBED_MARKER_RE = re.compile(r"(?<=[ 　])([ＡＢＣＤＥアイウエオ])(?=[ 　])")
CHOICE_START_RE = re.compile(r"^([ＡＢＣＤＥ])[ 　](.*)$")
SUBITEM_START_RE = re.compile(r"^([アイウエオ])[ 　](.*)$")


def fix_cid_placeholders(text):
    def repl(m):
        code = int(m.group(1))
        return CID_FIX_MAP.get(code, m.group(0))
    return CID_RE.sub(repl, text)


def extract_all_lines(pdf_path):
    lines = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines.extend(text.split("\n"))
    return lines


def clean_lines(raw_lines):
    """下付き数字/未解決グリフの正規化とノイズ行(ページ番号のみ / .indd を含む行)の除去。"""
    cleaned = []
    for line in raw_lines:
        line = line.translate(SUBSCRIPT_MAP)
        line = fix_cid_placeholders(line)
        stripped = line.strip()
        if not stripped:
            continue
        if ".indd" in stripped:
            continue
        if PAGE_NUM_RE.match(stripped):
            continue
        cleaned.append(stripped)
    return cleaned


def expand_packed_markers(lines):
    """"Ａ ... Ｂ ... Ｃ ..." のように1行に複数記号が並ぶ行を分割する。"""
    expanded = []
    for line in lines:
        parts = EMBED_MARKER_RE.sub(lambda m: "\n" + m.group(1), line).split("\n")
        expanded.extend(part for part in parts if part)
    return expanded


def detect_subject(lines, i):
    stripped_nospace = re.sub(r"\s+", "", lines[i])
    for key, canon in SUBJECT_DETECT_KEYS:
        if stripped_nospace == key:
            consumed = 1
            if i + 1 < len(lines):
                nxt = re.sub(r"\s+", "", lines[i + 1])
                if nxt.startswith("（") or nxt.startswith("("):
                    consumed = 2
            return canon, consumed
    return None, 0


def split_into_questions(lines):
    """〔問 N〕 で問題ごとに分割し、科目を付与する。"""
    questions = []
    current_subject = None
    current = None

    i = 0
    n = len(lines)
    while i < n:
        subject, consumed = detect_subject(lines, i)
        if subject:
            current_subject = subject
            i += consumed
            continue

        m = QUESTION_MARK_RE.match(lines[i])
        if m:
            if current is not None:
                questions.append(current)
            rest = m.group(2)
            current = {
                "subject": current_subject,
                "question_number": int(m.group(1)),
                "lines": [rest] if rest else [],
            }
            i += 1
            continue

        if current is not None:
            current["lines"].append(lines[i])
        i += 1

    if current is not None:
        questions.append(current)
    return questions


def segment_question(q_lines):
    """設問本文 / ア〜オの記述(sub_items) / Ａ〜Ｅの選択肢(choices) に分ける。"""
    stem_parts = []
    sub_items = []  # [{"label": "ア", "text": "..."}]
    choice_parts = {}  # "A" -> [text, ...]
    choice_order = []
    mode = "stem"

    for line in q_lines:
        m_choice = CHOICE_START_RE.match(line)
        m_sub = SUBITEM_START_RE.match(line)
        if m_choice:
            mode = "choice"
            key = CHOICE_MAP[m_choice.group(1)]
            if key not in choice_parts:
                choice_parts[key] = []
                choice_order.append(key)
            choice_parts[key].append(m_choice.group(2))
        elif m_sub:
            mode = "sub"
            sub_items.append({"label": m_sub.group(1), "parts": [m_sub.group(2)]})
        elif mode == "stem":
            stem_parts.append(line)
        elif mode == "sub":
            sub_items[-1]["parts"].append(line)
        elif mode == "choice":
            choice_parts[choice_order[-1]].append(line)

    question_text = "".join(stem_parts).strip()
    sub_items_out = [
        {"label": item["label"], "text": "".join(item["parts"]).strip()}
        for item in sub_items
    ]
    choices = {key: "".join(choice_parts[key]).strip() for key in "ABCDE" if key in choice_parts}

    return question_text, sub_items_out, choices


def parse_answers(pdf_path):
    """正答PDFの表から科目ごとの択一式1〜10問の正答(A〜E)を読み取る。

    年度によっては、1科目分の10問の正答が複数の行に分割して
    (例: 前半5問と後半5問) 記載されている場合があるため、
    10マス分のバッファを埋めきったところで1科目分として確定させる。
    """
    with pdfplumber.open(pdf_path) as pdf:
        table = pdf.pages[0].extract_tables()[0]

    groups = []
    buffer = [None] * 10
    for row in table[2:]:
        taku_cells = [cell.strip() if cell else None for cell in row[7:17]]
        if all(cell is None for cell in taku_cells):
            continue
        for i, cell in enumerate(taku_cells):
            if cell is not None:
                buffer[i] = cell
        if all(v is not None for v in buffer):
            groups.append(buffer)
            buffer = [None] * 10
    return groups


def find_unresolved_cids(results):
    warnings = []
    for q in results:
        blob = q["question_text"] + "".join(s["text"] for s in q["sub_items"]) + "".join(q["choices"].values())
        for m in set(CID_RE.findall(blob)):
            warnings.append(f"id={q['id']} に未解決のグリフ (cid:{m}) が残っています")
    return warnings


def build_questions_for_year(year, num):
    takuitsu_pdf = f"{PDF_ROOT}/{year}/{num}takuitusiki.pdf"
    seitou_pdf = f"{PDF_ROOT}/{year}/{num}kijyun-seitou.pdf"

    raw_lines = extract_all_lines(takuitsu_pdf)
    cleaned = clean_lines(raw_lines)
    expanded = expand_packed_markers(cleaned)
    parsed = split_into_questions(expanded)

    answer_groups = parse_answers(seitou_pdf)

    results = []
    group_index_by_subject = {}
    next_group_idx = 0

    for idx, q in enumerate(parsed, start=1):
        subject = q["subject"]
        if subject not in group_index_by_subject:
            group_index_by_subject[subject] = next_group_idx
            next_group_idx += 1
        group_idx = group_index_by_subject[subject]
        pos = q["question_number"] - 1

        answer = None
        if 0 <= group_idx < len(answer_groups) and 0 <= pos < len(answer_groups[group_idx]):
            answer = answer_groups[group_idx][pos]

        question_text, sub_items, choices = segment_question(q["lines"])

        results.append({
            "id": f"{year}-{idx:02d}",
            "year": year,
            "subject": subject,
            "question_number": q["question_number"],
            "question_text": question_text,
            "sub_items": sub_items,
            "choices": choices,
            "answer": answer,
        })

    return results


def main():
    all_questions = []
    year_reports = []

    for year, num in YEARS:
        try:
            results = build_questions_for_year(year, num)
        except Exception as exc:
            year_reports.append({
                "year": year,
                "error": f"{type(exc).__name__}: {exc}",
                "traceback": traceback.format_exc(),
            })
            continue

        missing = [q for q in results if not q["answer"]]
        cid_warnings = find_unresolved_cids(results)
        year_reports.append({
            "year": year,
            "count": len(results),
            "missing": missing,
            "cid_warnings": cid_warnings,
        })
        all_questions.extend(results)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)

    print(f"=== 変換結果 (全{len(YEARS)}年度) ===")
    for report in year_reports:
        year = report["year"]
        if "error" in report:
            print(f"\n[{year}] 変換失敗")
            print(f"  原因: {report['error']}")
            print("  詳細:")
            for line in report["traceback"].splitlines():
                print(f"    {line}")
            continue

        print(f"\n[{year}] 抽出問題数: {report['count']}")
        if report["missing"]:
            print(f"  正答が取得できなかった問題: {len(report['missing'])}件")
            for q in report["missing"]:
                print(f"    id={q['id']} subject={q['subject']} question_number={q['question_number']}")
        else:
            print("  正答が取得できなかった問題: なし")

        if report["cid_warnings"]:
            print(f"  未解決グリフの警告: {len(report['cid_warnings'])}件")
            for w in report["cid_warnings"]:
                print(f"    {w}")

    ok_years = [r for r in year_reports if "error" not in r]
    print(f"\n=== 合計: {len(all_questions)}問 ({len(ok_years)}/{len(YEARS)}年度 成功) ===")


if __name__ == "__main__":
    main()
