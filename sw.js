/* Saved Board. Cache only the same-origin app and the last successful board. */
"use strict";
const CACHE = "saved-board-pwa-v1";
const ROOT = new URL(self.registration.scope);
const INDEX = new URL("index.html", ROOT).href;
const ASSETS = new Set(["manifest.webmanifest", "pwa.js", "apple-touch-icon.png",
  "pwa-icon-192.png", "pwa-icon-512.png", "pwa-icon-maskable.png"].map(p => new URL(p, ROOT).href));
const OFFLINE = '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>保存ボード</title><h1>保存ボードを開けません</h1><p>オフライン用のデータがまだありません。ネットに接続してもう一度開いてください。</p></html>';
const fresh = (url, signal) => fetch(url, {cache: "reload", signal, redirect: "error"});
function valid(response, type) {
  return response.ok && response.status === 200 &&
    (response.headers.get("content-type") || "").includes(type);
}
async function board(response) {
  if (!valid(response, "text/html")) return false;
  const text = await response.text();
  return /<\/html>\s*$/.test(text) && text.includes('name="saved-board-pwa"') &&
    ["data", "instagram-data", "youtube-data"].every(id => text.includes('id="' + id + '"'));
}
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fresh(INDEX);
    if (!(await board(response.clone()))) throw new Error("Board snapshot unavailable");
    await Promise.all([...ASSETS].map(async url => {
      const asset = await fresh(url);
      if (!asset.ok || asset.status !== 200) throw new Error("PWA asset unavailable");
      await cache.put(url, asset);
    }));
    // Commit the snapshot only after a complete install. A failed refresh never erases it.
    await cache.put(INDEX, response);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(x => x.startsWith("saved-board-pwa-") && x !== CACHE).map(x => caches.delete(x)));
    await self.clients.claim();
  })());
});
async function loadBoard() {
  const cache = await caches.open(CACHE);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 6500);
  try {
    const response = await fresh(INDEX, abort.signal);
    if (await board(response.clone())) {
      try { await cache.put(INDEX, response.clone()); } catch (_) { /* Storage pressure must not block the live board. */ }
      return response;
    }
  } catch (_) { /* Offline, timed out, redirected, or invalid. Use the last valid board. */ }
  finally { clearTimeout(timer); }
  const saved = await cache.match(INDEX);
  if (saved) {
    const html = (await saved.text()).replace('<meta name="saved-board-pwa" content="1">', '<meta name="saved-board-pwa" content="1"><meta name="saved-board-offline" content="1">');
    return new Response(html, {status: 200, headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"
    }});
  }
  return new Response(OFFLINE, {status: 503, headers: {"Content-Type": "text/html; charset=utf-8"}});
}
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate" && url.origin === ROOT.origin &&
      (url.pathname === ROOT.pathname || url.pathname === new URL(INDEX).pathname)) {
    event.respondWith(loadBoard());
  } else if (ASSETS.has(url.href)) {
    event.respondWith((async () => {
      try {
        const live = await fetch(event.request);
        if (live.ok && live.status === 200) return live;
      } catch (_) { /* Continue to cached copy. */ }
      return (await caches.match(url.href, {cacheName: CACHE})) || Response.error();
    })());
  }
});
self.addEventListener("message", event => {
  if (event.data === "board-offline-ready" && event.ports[0]) {
    event.waitUntil((async () => {
      const cached = await caches.match(INDEX, {cacheName: CACHE});
      event.ports[0].postMessage(Boolean(cached));
    })());
  }
});
