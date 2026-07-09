# sharoushi-quiz

社労士試験 択一式過去問クイズ(PWA)。`index.html` / `style.css` / `app.js` / `manifest.json` / `questions.json` / `icons/*` を Service Worker (`sw.js`) でキャッシュし、オフラインでも動作する。

## Service Worker のキャッシュ更新について【重要】

`sw.js` はアプリ本体一式 (`APP_SHELL`) をキャッシュファースト戦略で配信している。ブラウザは **`sw.js` 自体のバイト列が変わったときだけ** 新しいService Workerの更新を検知する。

**そのため、以下のいずれかのファイルを1文字でも変更したら、`sw.js` の `CACHE_VERSION` を必ずインクリメントすること。**

- `index.html`
- `style.css`
- `app.js`
- `manifest.json`
- `questions.json`
- `icons/` 配下のファイル

`CACHE_VERSION` を上げ忘れると、`sw.js` のバイト列が変化しないため更新が一切検知されず、ユーザーには古いキャッシュが無期限に配信され続ける(オフラインはもちろん、オンライン時でもキャッシュファーストのため新しい内容が反映されない)。

更新の反映自体(`skipWaiting` / `clients.claim` による新SWの即時有効化、旧キャッシュの自動削除)は `sw.js` 側で実装済みなので、`CACHE_VERSION` さえ上げれば自動的に伝播する。

```js
// sw.js
const CACHE_VERSION = "v2"; // ← ファイルを変更したらここをインクリメント
```

## デプロイについて

- ホスティングは **Cloudflare Pages**。GitHubリポジトリ(`main`ブランチ)と連携しており、`git push` するだけで自動的に再デプロイされる(ビルドコマンドなし、公開ディレクトリはリポジトリ直下)。
- GitHubリポジトリは意図的に **Private** にしている。`questions.json` に試験問題の本文が含まれるため、リポジトリ自体は非公開にし、デプロイ済みの静的サイトのみを公開する方針。
- `index.html` に `<meta name="robots" content="noindex, nofollow">` を設定済み。検索エンジンにインデックスされないようにするためで、削除しないこと。
- `pdf/`(試験PDF原本)は `.gitignore` で除外している。
- **`.assetsignore` は絶対に消さないこと。** Cloudflareの静的アセットデプロイ(`wrangler deploy`)は `.gitignore` を見ない。`.assetsignore` が無いと `.git/` フォルダの中身までそのまま公開URLから閲覧可能になり、Privateリポジトリの意味がなくなる(実際に事故が発生し復旧した経緯がある)。新しく除外したいファイル/フォルダができたら `.gitignore` と `.assetsignore` の両方に追記すること。
