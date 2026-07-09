"""explanations/*.json を questions.json にマージする。

explanations/ 配下の各JSONファイルは { "R07-01": {explanation, choices_explanation,
reference, key_point, explanation_status}, ... } の形式。
questions.json の対応する id に解説フィールドを追加/更新する。
まだ解説が無い問題には空のプレースホルダを設定し、アプリ側で「解説準備中」と
判定できるようにする。
"""

import glob
import json
import sys

QUESTIONS_JSON = "questions.json"
EXPLANATIONS_GLOB = "explanations/*.json"

def empty_explanation():
    return {
        "explanation": None,
        "choices_explanation": {},
        "reference": [],
        "key_point": None,
        "explanation_status": None,
    }


def load_explanations():
    merged = {}
    for path in sorted(glob.glob(EXPLANATIONS_GLOB)):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for qid, entry in data.items():
            if qid in merged:
                print(f"警告: id={qid} が複数ファイルに存在します（{path} で上書き）", file=sys.stderr)
            merged[qid] = entry
    return merged


def main():
    with open(QUESTIONS_JSON, encoding="utf-8") as f:
        questions = json.load(f)

    explanations = load_explanations()

    applied = 0
    for q in questions:
        entry = explanations.get(q["id"])
        if entry:
            q["explanation"] = entry["explanation"]
            q["choices_explanation"] = entry["choices_explanation"]
            q["reference"] = entry["reference"]
            q["key_point"] = entry["key_point"]
            q["explanation_status"] = entry["explanation_status"]
            applied += 1
        else:
            for key, default in empty_explanation().items():
                q.setdefault(key, default)

    with open(QUESTIONS_JSON, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    with_explanation = sum(1 for q in questions if q.get("explanation"))
    print(f"解説を適用した問題: {applied}件")
    print(f"解説あり: {with_explanation} / {len(questions)}問")


if __name__ == "__main__":
    main()
