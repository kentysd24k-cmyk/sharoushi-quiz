"use strict";

// index.html / style.css / app.js / manifest.json / questions.json / icons/* の
// いずれかを変更したら、このバージョンを必ず上げること。
// sw.js自体のバイト列が変わらないとブラウザは更新を検知せず、
// 古いキャッシュが無期限に配信され続けてしまう。
const CACHE_VERSION = "v10";
const CACHE_NAME = `srquiz-cache-${CACHE_VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./questions.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// questions.json は「解説の追記」等で内容が頻繁に更新されるため、
// キャッシュファーストではなく network-first(オンライン時は常に最新を取得し、
// オフライン時のみキャッシュにフォールバック)で配信する。
function isQuestionsJson(req) {
  return new URL(req.url).pathname.endsWith("/questions.json");
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
    .catch(() => caches.match(req));
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

  event.respondWith(isQuestionsJson(req) ? networkFirst(req) : cacheFirst(req));
});
