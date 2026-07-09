# 社労士 過去問クイズ

社会保険労務士試験の択一式過去問(R03〜R07、計350問)を解けるPWA(Progressive Web App)です。フレームワーク不使用のHTML/CSS/JavaScriptのみで構成されています。

## 機能

- 年度(R03〜R07) × 科目 で絞り込んだ出題
- 全科目ランダム出題
- 一問一答形式、解答後に解説(問題文・各肢の解説・根拠法令・覚えるポイント)を表示
- 間違えた問題だけを解き直せる復習モード
- 学習履歴・正答率をブラウザのlocalStorageに保存(科目別・全体)
- オフライン対応(Service Workerによるキャッシュ)

## ローカルでの動作確認

`fetch`でのデータ読み込みとService Workerを使うため、`file://`では動作しません。簡易HTTPサーバーを起動してください。

```
python -m http.server 8000
```

`http://localhost:8000/` にアクセスします。

## ファイル構成

| ファイル/フォルダ | 役割 |
|---|---|
| `index.html` / `style.css` / `app.js` | アプリ本体 |
| `manifest.json` / `sw.js` | PWA設定・オフラインキャッシュ |
| `questions.json` | 問題データ(全350問) |
| `convert.py` | 試験PDFから`questions.json`を生成するスクリプト |
| `explanations/` | 解説データのソース(年度・科目単位のJSON) |
| `apply_explanations.py` | `explanations/`の内容を`questions.json`にマージするスクリプト |

`pdf/`(試験問題・正答のPDF原本)は容量と著作権の観点からリポジトリに含めていません。`convert.py`を実行するには別途PDFを用意する必要があります。

## 注意

問題文・選択肢は社会保険労務士試験の過去問を基にしています。解説の一部はAI生成のドラフトであり、内容の正確性を保証するものではありません(`explanation_status`が`"draft"`のものは未レビューです)。学習の参考としてご利用の上、正確な内容は公式の参考書等でご確認ください。
