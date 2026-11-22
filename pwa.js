/* Installation is always initiated by the reader. No sync or push permissions. */
(() => {
  "use strict";
  if (!isSecureContext || !("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  const menu = document.querySelector(".menu-panel");
  if (!menu) return;
  const make = (tag, text) => Object.assign(document.createElement(tag), {textContent: text});
  const standalone = matchMedia("(display-mode: standalone)");
  const installed = () => standalone.matches || navigator.standalone === true;
  const button = make("button", "アプリとして使う");
  button.type = "button";
  button.id = "pwa-install";
  menu.insertBefore(button, document.getElementById("coverage"));
  const status = document.getElementById("pwa-status");
  const dialog = document.createElement("dialog");
  dialog.className = "pwa-help";
  const title = make("h2", "保存ボードをアプリとして使う");
  title.id = "pwa-help-title";
  dialog.setAttribute("aria-labelledby", title.id);
  const help = make("p", "");
  const mode = make("p", "");
  mode.setAttribute("role", "status");
  const close = make("button", "閉じる");
  close.type = "button";
  const install = make("button", "インストール");
  install.type = "button";
  dialog.append(title, help, mode, install, close);
  document.body.append(dialog);
  let promptEvent, ready = false, lastLoadOffline = false, receivedInstall = false;
  function render() {
    const active = installed() || receivedInstall;
    button.textContent = active ? "アプリとオフライン" : "アプリとして使う";
    install.hidden = active || !promptEvent;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    help.textContent = active ? "ホーム画面やアプリ一覧から開けます。" :
      ios ? "Safari の共有メニューから「ホーム画面に追加」を選び、「Webアプリとして開く」があればオンにします。" :
      promptEvent ? "インストールすると、ホーム画面やアプリ一覧から保存ボードを開けます。" :
      "Chrome・Edgeではアドレスバーやメニューのインストール、Safari（Mac）では「ファイル」→「Dockに追加」を探してください。";
    mode.textContent = (ready ? "オフライン用のボードをこの端末に保存済みです。" :
      "オフラインで使うには、一度このページをオンラインで開いてください。") +
      " 保存済みの本文・検索・整理は使えますが、元投稿・画像・動画の読み込みや新着の取得には通信が必要です。";
    status.hidden = navigator.onLine && !lastLoadOffline;
    status.textContent = ready || lastLoadOffline ? "通信できないため、最後に保存したボードを表示しています。画像・動画や新着には通信が必要です。" :
      "オフラインです。このページを閉じる前に、オンラインでの初回読み込みをおすすめします。";
  }
  button.addEventListener("click", () => {
    render();
    if (!dialog.open) dialog.showModal();
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => button.focus());
  install.addEventListener("click", async () => {
    if (!promptEvent) return;
    const event = promptEvent;
    promptEvent = null;
    try { await event.prompt(); await event.userChoice; } catch (_) { /* The browser decides install availability. */ }
    render();
  });
  addEventListener("beforeinstallprompt", event => { event.preventDefault(); promptEvent = event; render(); });
  addEventListener("appinstalled", () => { receivedInstall = true; promptEvent = null; render(); });
  addEventListener("online", render);
  addEventListener("offline", render);
  standalone.addEventListener?.("change", render);
  const source = new URL(location.href).searchParams.get("source");
  if (["x", "instagram", "youtube"].includes(source)) document.querySelector('[data-source="' + source + '"]')?.click();
  function requestStatus() {
    const worker = navigator.serviceWorker.controller;
    if (!worker) return;
    const channel = new MessageChannel();
    channel.port1.onmessage = event => {
      channel.port1.close();
      ready = event.data === true;
      render();
    };
    worker.postMessage("board-offline-ready", [channel.port2]);
  }
  // The offline navigation carries this marker even if Wi-Fi is still connected.
  lastLoadOffline = Boolean(document.querySelector('meta[name="saved-board-offline"]'));
  navigator.serviceWorker.addEventListener("controllerchange", requestStatus);
  navigator.serviceWorker.register("./sw.js", {scope: "./", updateViaCache: "none"})
    .then(() => navigator.serviceWorker.ready).then(requestStatus).catch(() => {});
  render();
})();
