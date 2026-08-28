/* Sohbeto Service Worker
 * Stratejiler:
 * - HTML navigations: NetworkFirst (3s timeout) → cache → offline.html
 * - Static assets (JS/CSS): StaleWhileRevalidate
 * - Images/fonts: CacheFirst (60 gün)
 *
 * Önemli: WebAPK üretiminin sağlam olması için bu SW, kayıt edildiği
 * scope ile uyumlu bir path'ten servis edilmelidir.
 * Örn: /sohbeto/sw.js  → register('/sohbeto/sw.js', { scope: '/sohbeto/' })
 */
const VERSION = "v1.0.8";
const PRECACHE = `sohbeto-precache-${VERSION}`;
const RUNTIME_HTML = `sohbeto-html-${VERSION}`;
const RUNTIME_ASSETS = `sohbeto-assets-${VERSION}`;
const RUNTIME_IMG = `sohbeto-img-${VERSION}`;

// Scope-aware: SW served from /<base>/sw.js, registration.scope is /<base>/
const SCOPE = new URL(self.registration.scope).pathname; // ör. "/sohbeto/" veya "/"

// CRITICAL: offline.html ve manifest.json'ın bu yollarda gerçekten yayında
// olduğundan emin ol. Yoksa addAll() patlar, SW install fail eder ve
// Chrome WebAPK üretmez → uygulama "ana ekrana kısayol" olarak düşer.
const PRECACHE_URLS = [SCOPE, `${SCOPE}offline.html`, `${SCOPE}manifest.json`];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // addAll yerine tek tek ekle: bir dosya 404 dönerse SW yine de
      // aktive olabilsin (install kriterini koruruz).
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "no-cache" });
            if (res && res.ok) await cache.put(url, res.clone());
          } catch (e) {
            // Sessizce geç — install fail etmesin
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![PRECACHE, RUNTIME_HTML, RUNTIME_ASSETS, RUNTIME_IMG].includes(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Uygulama açık ve ekrandayken sayfa her 5 sn'de bir "SOHBETO_ALIVE" yollar.
// Bazı tarayıcılarda client.visibilityState güvenilmez olduğu için bu kalp
// atışı, push geldiğinde "uygulama ön planda mı" kararının yedeğidir.
let lastAliveAt = 0;

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  else if (event.data === "SOHBETO_ALIVE") lastAliveAt = Date.now();
  else if (event.data === "SOHBETO_HIDDEN") lastAliveAt = 0;
});


// -------------------------------------------- REHBER ADI (IndexedDB okuma)
// Gönderen numarası bildirimde ham "+90..." olarak görünmesin: alıcının kendi
// rehberinde bu numara kayıtlıysa bildirimde kişinin adı yazılır.
function normalizeNumber(n) {
  let s = String(n || "")
    .trim()
    .replace(/[\s\-()]/g, "");
  if (!s) return "";
  s = s.replace(/^00/, "+").replace(/[^+\d]/g, "");
  let digits = s.replace(/^\+/, "");
  if (digits.startsWith("0") && digits.length === 11) digits = "90" + digits.substring(1);
  else if (digits.length === 10 && digits.startsWith("5")) digits = "90" + digits;
  else if (digits.startsWith("0090")) digits = digits.substring(2);
  return "+" + digits;
}

function contactNameFor(number) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v || "");
      }
    };
    setTimeout(() => finish(""), 1500);
    try {
      const open = indexedDB.open("EgaNetwork");
      open.onerror = () => finish("");
      open.onsuccess = () => {
        const db = open.result;
        try {
          if (!db.objectStoreNames.contains("contacts")) return finish("");
          const tx = db.transaction("contacts", "readonly");
          const req = tx.objectStore("contacts").get(number);
          req.onsuccess = () => finish(req.result?.name || "");
          req.onerror = () => finish("");
        } catch (e) {
          finish("");
        }
      };
    } catch (e) {
      finish("");
    }
  });
}

// ------------------------------------------------------------------ WEB PUSH
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: "Sohbeto", body: event.data ? event.data.text() : "" };
  }
  const isCall = payload.kind === "call";
  let title = payload.title || "Sohbeto";
  // Sağdaki büyük ikon: gönderenin profil fotoğrafı (varsa), yoksa uygulama simgesi.
  // Sol üstteki küçük simge (badge): tek renk uygulama simgemiz.
  const largeIcon = payload.icon || `${SCOPE}icons/icon-192.png`;
  // Gönderen başına ayrı etiket: farklı kişiler birbirinin bildirimini ezmesin,
  // aynı kişinin mesajları ise tek kartta sayaçla birikir.
  const sender = String(payload.data?.from || payload.data?.phone || payload.title || "genel");
  const tag = payload.tag || (isCall ? "sohbeto-call" : `sohbeto-msg-${sender}`);

  event.waitUntil(
    (async () => {
      // ---- ÖN PLAN KONTROLÜ ----
      // Uygulama ekranda açık ve görünürken sistem bildirimi GÖSTERİLMEZ.
      // Bunun yerine olay açık sekmeye iletilir; uygulama kendi iç bildirimini
      // (mesaj balonu / gelen arama ekranı) gösterir. Böylece kullanıcı
      // uygulamanın içindeyken çift bildirim/çift zil yaşamaz.
      try {
        const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const scopeHref = new URL(SCOPE, self.location.origin).href;
        const alive = Date.now() - lastAliveAt < 20000; // sayfadan gelen kalp atışı
        const foreground = clientsList.filter(
          (c) => c.url.startsWith(scopeHref) && (c.visibilityState === "visible" || c.focused || alive),
        );
        if (foreground.length) {
          for (const c of foreground) {
            c.postMessage({
              type: "SOHBETO_PUSH_FOREGROUND",
              kind: payload.kind || "message",
              title: payload.title || "",
              body: payload.body || "",
              data: payload.data || {},
            });
          }
          return; // sistem bildirimi yok
        }
      } catch (e) {
        /* noop → normal bildirim akışına devam */
      }


      let count = 1;
      let body = payload.body || "";


      // Gövde/başlıkta geçen ham numarayı rehberdeki adla değiştir.
      try {
        const fromRaw = payload.data?.from || payload.data?.phone || "";
        const from = normalizeNumber(fromRaw);
        if (from && from !== "+") {
          const name = await contactNameFor(from);
          if (name) {
            const variants = [from, from.replace(/^\+/, ""), String(fromRaw)];
            for (const v of variants) {
              if (!v) continue;
              const rx = new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
              body = body.replace(rx, name);
              title = title.replace(rx, name);
            }
          }
        }
      } catch (e) {
        /* noop */
      }

      if (!isCall) {
        try {
          const shown = await self.registration.getNotifications({ tag });
          const prev = shown.length ? shown[shown.length - 1].data?.count || 1 : 0;
          count = prev + 1;
        } catch (e) {
          /* noop */
        }
        if (count > 1) body = `${body} (${count} yeni mesaj)`;
      }


      const options = {
        body,
        icon: largeIcon,
        badge: `${SCOPE}icons/badge-96.png`,
        ...(payload.image ? { image: payload.image } : {}),
        tag,
        renotify: true,
        silent: false,
        requireInteraction: isCall,
        // Sohbeto imzası: mesaj = kısa "ta-tap", arama = uzun ısrarlı nabız
        vibrate: isCall ? [0, 400, 200, 400, 200, 400, 200, 400] : [0, 40, 70, 90],
        timestamp: Date.now(),
        data: { url: payload.url || SCOPE, count, ...(payload.data || {}) },
        actions: isCall
          ? [
              { action: "accept", title: "Cevapla" },
              { action: "decline", title: "Reddet" },
            ]
          : [{ action: "open", title: "Aç" }],
      };
      await self.registration.showNotification(title, options);

      // Uygulama simgesi üzerindeki sayı baloncuğu (destekleyen cihazlarda).
      try {
        if (!isCall && self.navigator?.setAppBadge) {
          const all = await self.registration.getNotifications();
          const total = all.reduce((n, x) => n + (x.data?.count || 1), 0);
          await self.navigator.setAppBadge(total);
        }
      } catch (e) {
        /* noop */
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  try {
    if (self.navigator?.clearAppBadge) void self.navigator.clearAppBadge();
  } catch (e) {
    /* noop */
  }
  const data = event.notification.data || {};
  // Soğuk açılışta (uygulama kapalıyken) gönderen bilgisi adres satırıyla taşınır,
  // böylece uygulama açılır açılmaz doğrudan o kişinin sohbeti/araması açılır.
  const target = new URL(data.url || SCOPE, self.location.origin);
  if (data.from) target.searchParams.set("from", data.from);
  if (data.kind) target.searchParams.set("kind", data.kind);
  target.searchParams.set("act", event.action || "open");
  const targetUrl = target.href;
  if (event.action === "decline") return;
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url.startsWith(new URL(SCOPE, self.location.origin).href)) {
          client.postMessage({ type: "SOHBETO_PUSH_CLICK", action: event.action || "open", data });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })(),
  );
});

const isImage = (req) =>
  req.destination === "image" ||
  /\.(png|jpg|jpeg|gif|webp|svg|avif|ico)$/i.test(new URL(req.url).pathname);
const isFont = (req) =>
  req.destination === "font" || /\.(woff2?|ttf|otf|eot)$/i.test(new URL(req.url).pathname);
const isAsset = (req) =>
  ["script", "style", "worker"].includes(req.destination) ||
  /\.(js|mjs|css)$/i.test(new URL(req.url).pathname);

async function networkFirst(request, cacheName, timeoutMs = 3000) {
  const cache = await caches.open(cacheName);
  try {
    const network = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);
    if (network && network.ok) cache.put(request, network.clone());
    return network;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await caches.match(`${SCOPE}offline.html`);
      if (offline) return offline;
    }
    throw e;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

async function cacheFirst(request, cacheName, maxAgeDays = 60) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    const dateHeader = cached.headers.get("date");
    if (dateHeader) {
      const age = (Date.now() - new Date(dateHeader).getTime()) / 86400000;
      if (age < maxAgeDays) return cached;
    } else {
      return cached;
    }
  }
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, RUNTIME_HTML, 3000));
    return;
  }
  if (isImage(req) || isFont(req)) {
    event.respondWith(cacheFirst(req, RUNTIME_IMG, 60));
    return;
  }
  if (isAsset(req)) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_ASSETS));
    return;
  }
});
