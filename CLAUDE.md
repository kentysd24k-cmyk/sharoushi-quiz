# sharoushi-quiz

社労士試験 択一式過去問クイズ(PWA)。`index.html` / `style.css` / `app.js` / `manifest.json` / `vendor/chart.umd.min.js` / `questions.json` / `icons/*` を Service Worker (`sw.js`) でキャッシュし、オフラインでも動作する。

## Service Worker のキャッシュ戦略【重要】

`sw.js` の配信戦略はリソースによって異なる。

- **network-first**(オンライン時は常に最新を取得し、オフライン時のみキャッシュにフォールバック): `questions.json`、ナビゲーションリクエスト(`index.html` = PWAの入口)
- **cache-first**: それ以外の `APP_SHELL`(`style.css` / `app.js` / `manifest.json` / `vendor/chart.umd.min.js` / `icons/*`)

`questions.json` と `index.html` が network-first なのは、iOSホーム画面PWAが古いキャッシュに固定されて起動不能になる事故を防ぐため(詳細はコミット履歴参照)。`questions.json`(1MB超)は install 時のプリキャッシュ対象からも除外している。cache.addAll() は1ファイルでも失敗すると全体が失敗し、大容量ファイルのフェッチ失敗がSWのインストールごと失敗させる主因になっていた。

ブラウザは **`sw.js` 自体のバイト列が変わったときだけ** 新しいService Workerの更新を検知する。

**そのため、cache-first で配信されるファイル(`style.css` / `app.js` / `manifest.json` / `vendor/` 配下 / `icons/` 配下)のいずれかを1文字でも変更したら、`sw.js` の `CACHE_VERSION` を必ずインクリメントすること。**(`questions.json` と `index.html` は network-first のため理論上は不要だが、更新トースト通知([`app.js`](app.js)の`watchForServiceWorkerUpdate`)を確実に発火させるため、アプリファイルを変更した際は慣習として毎回上げてよい。)

`CACHE_VERSION` を上げ忘れると、cache-first対象ファイルについては `sw.js` のバイト列が変化しないため更新が一切検知されず、ユーザーには古いキャッシュが無期限に配信され続ける。

更新の反映自体(`skipWaiting` / `clients.claim` による新SWの即時有効化、旧キャッシュの自動削除)は `sw.js` 側で実装済みなので、`CACHE_VERSION` さえ上げれば自動的に伝播する。

```js
// sw.js
const CACHE_VERSION = "v12"; // ← ファイルを変更したらここをインクリメント
```

## vendor/ について

`vendor/chart.umd.min.js` は分析画面のグラフ描画に使う Chart.js(jsDelivr CDN経由で取得したUMDビルド)をリポジトリ内に保存したもの。CDN直リンクではなく自ホストにしているのは、オフラインでも分析画面が使えるようにするため(Service Workerで他のアプリ本体ファイルと同様にプリキャッシュしている)。Chart.jsを更新する場合は該当ファイルを差し替え、`CACHE_VERSION` を上げること。

## デプロイについて

- ホスティングは **Cloudflare Pages**。GitHubリポジトリ(`main`ブランチ)と連携しており、`git push` するだけで自動的に再デプロイされる(ビルドコマンドなし、公開ディレクトリはリポジトリ直下)。
- GitHubリポジトリは意図的に **Private** にしている。`questions.json` に試験問題の本文が含まれるため、リポジトリ自体は非公開にし、デプロイ済みの静的サイトのみを公開する方針。
- `index.html` に `<meta name="robots" content="noindex, nofollow">` を設定済み。検索エンジンにインデックスされないようにするためで、削除しないこと。
- `pdf/`(試験PDF原本)は `.gitignore` で除外している。
- **`.assetsignore` は絶対に消さないこと。** Cloudflareの静的アセットデプロイ(`wrangler deploy`)は `.gitignore` を見ない。`.assetsignore` が無いと `.git/` フォルダの中身までそのまま公開URLから閲覧可能になり、Privateリポジトリの意味がなくなる(実際に事故が発生し復旧した経緯がある)。新しく除外したいファイル/フォルダができたら `.gitignore` と `.assetsignore` の両方に追記すること。
