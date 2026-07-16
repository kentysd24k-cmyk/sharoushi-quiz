"use strict";

// index.html / style.css / app.js / manifest.json / questions.json / icons/* の
// いずれかを変更したら、このバージョンを必ず上げること。
// sw.js自体のバイト列が変わらないとブラウザは更新を検知せず、
// 古いキャッシュが無期限に配信され続けてしまう。
const CACHE_VERSION = "v15";
const CACHE_NAME = `srquiz-cache-${CACHE_VERSION}`;
// questions.json / articles.json はここに含めない。network-first で実行時にキャッシュされるため、
// install時の事前キャッシュ対象から外し、install失敗の主因(大容量フェッチの失敗)を排除する。
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./vendor/chart.umd.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // cache.addAll() は1つでも失敗すると全体が失敗する(iOSホーム画面アプリで
        // 起動不能になる主因)。個別にキャッシュし、失敗したファイルはスキップする。
        Promise.all(
          APP_SHELL.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(`[sw] precache failed, skipping: ${url}`, err);
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        // 現バージョン以外のキャッシュ(旧バージョンすべて)を確実に削除する。
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// questions.json / articles.json は内容が頻繁に更新されるため、
// index.html はPWAの入口(iOSホーム画面アプリの起動先)であり、古いキャッシュに
// 固定されると起動不能になり得るため、いずれもキャッシュファーストではなく
// network-first(オンライン時は常に最新を取得し、オフライン時のみキャッシュに
// フォールバック)で配信する。
function isNetworkFirst(req) {
  if (req.mode === "navigate") return true;
  const pathname = new URL(req.url).pathname;
  return (
    pathname.endsWith("/questions.json") ||
    pathname.endsWith("/articles.json") ||
    pathname.endsWith("/index.html")
  );
}

function networkFirst(req) {
  return fetch(req)
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      }
      return res;
    })
    .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")));
}

function cacheFirst(req) {
  return caches.match(req).then((cached) => {
    if (cached) return cached;

    return fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => {
        if (req.mode === "navigate") return caches.match("./index.html");
        return undefined;
      });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(isNetworkFirst(req) ? networkFirst(req) : cacheFirst(req));
});
