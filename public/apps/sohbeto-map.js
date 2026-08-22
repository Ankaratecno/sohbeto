/* Sohbeto — Konum / Harita modülü
 * Kütüphane: Leaflet 1.9.4 (BSD-2, ücretsiz) + OpenStreetMap karoları (anahtar gerekmez).
 * Dosyalar projeye gömülü: /vendor/leaflet/* — CDN'e bağımlılık yok, çevrimdışıda da açılır
 * (karolar internet ister, ama arayüz patlamaz).
 *
 * Motor dosyalarına DOKUNMAZ. Yaptıkları:
 *  1) chatPickLocation → harita üzerinden konum seç ve gönder (mesaj biçimi aynı kalır).
 *  2) Gelen/giden "📍 Konum: lat, lng" mesajlarını harita önizlemesine dönüştürür.
 *  3) Önizlemeye tıklayınca tam ekran harita + "Yol tarifi" bağlantısı.
 */
(function () {
  'use strict';

  var BASE = (function () {
    try {
      var p = window.location.pathname;
      var i = p.indexOf('/apps/');
      return i >= 0 ? p.slice(0, i + 1) : '/';
    } catch (e) { return '/'; }
  })();
  var LEAFLET_JS = BASE + 'vendor/leaflet/leaflet.js';
  var LEAFLET_CSS = BASE + 'vendor/leaflet/leaflet.css';
  var TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var ATTR = '&copy; OpenStreetMap katkıcıları';
  var LOC_RE = /^\s*📍\s*Konum:\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

  var loading = null;
  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      try {
        if (!document.getElementById('leaflet-css')) {
          var link = document.createElement('link');
          link.id = 'leaflet-css';
          link.rel = 'stylesheet';
          link.href = LEAFLET_CSS;
          document.head.appendChild(link);
        }
        var s = document.createElement('script');
        s.src = LEAFLET_JS;
        s.onload = function () { resolve(window.L); };
        s.onerror = function () { reject(new Error('Leaflet yüklenemedi')); };
        document.head.appendChild(s);
      } catch (e) { reject(e); }
    });
    return loading;
  }

  function tileXY(lat, lon, z) {
    var n = Math.pow(2, z);
    var x = Math.floor(((lon + 180) / 360) * n);
    var rad = (lat * Math.PI) / 180;
    var y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
    return { x: x, y: y };
  }

  // ---------------------------------------------------------------- MODAL
  function ensureModal() {
    var m = document.getElementById('sohbetoMapModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'sohbetoMapModal';
    m.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#0b0f16;display:none;flex-direction:column;';
    m.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#111826;color:#fff;font:600 15px system-ui,sans-serif">' +
      '  <button type="button" id="smClose" style="background:none;border:0;color:#fff;font-size:20px;line-height:1;cursor:pointer">&#10005;</button>' +
      '  <span id="smTitle" style="flex:1">Konum</span>' +
      '</div>' +
      '<div id="smMap" style="flex:1;min-height:0;background:#0b0f16"></div>' +
      '<div id="smBar" style="display:flex;gap:10px;padding:12px 14px;background:#111826"></div>';
    document.body.appendChild(m);
    m.querySelector('#smClose').addEventListener('click', closeModal);
    return m;
  }

  var mapObj = null;
  function closeModal() {
    var m = document.getElementById('sohbetoMapModal');
    if (m) m.style.display = 'none';
    if (mapObj) { try { mapObj.remove(); } catch (e) {} mapObj = null; }
  }
  window.sohbetoCloseMap = closeModal;

  function btn(label, primary) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText =
      'flex:1;padding:12px 14px;border:0;border-radius:12px;font:600 15px system-ui,sans-serif;cursor:pointer;' +
      (primary ? 'background:#22c55e;color:#06210f' : 'background:#1f2937;color:#e5e7eb');
    return b;
  }

  function openMap(opts) {
    var m = ensureModal();
    m.style.display = 'flex';
    m.querySelector('#smTitle').textContent = opts.title || 'Konum';
    var bar = m.querySelector('#smBar');
    bar.innerHTML = '';
    return loadLeaflet().then(function (L) {
      if (mapObj) { try { mapObj.remove(); } catch (e) {} mapObj = null; }
      var lat = opts.lat, lon = opts.lon;
      mapObj = L.map('smMap', { zoomControl: true }).setView([lat, lon], opts.zoom || 16);
      L.tileLayer(TILE, { maxZoom: 19, attribution: ATTR }).addTo(mapObj);
      var icon = L.icon({
        iconUrl: BASE + 'vendor/leaflet/images/marker-icon.png',
        iconRetinaUrl: BASE + 'vendor/leaflet/images/marker-icon-2x.png',
        shadowUrl: BASE + 'vendor/leaflet/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41],
      });
      var marker = L.marker([lat, lon], { icon: icon, draggable: !!opts.pick }).addTo(mapObj);
      setTimeout(function () { try { mapObj.invalidateSize(); } catch (e) {} }, 200);

      if (opts.pick) {
        mapObj.on('click', function (e) { marker.setLatLng(e.latlng); });
        var send = btn('Bu konumu gönder', true);
        send.addEventListener('click', function () {
          var p = marker.getLatLng();
          closeModal();
          opts.onPick(p.lat, p.lng);
        });
        var cancel = btn('Vazgeç', false);
        cancel.addEventListener('click', closeModal);
        bar.appendChild(cancel);
        bar.appendChild(send);
      } else {
        var dir = btn('Yol tarifi', true);
        dir.addEventListener('click', function () {
          window.open('https://www.openstreetmap.org/directions?to=' + lat + '%2C' + lon, '_blank', 'noopener');
        });
        var close = btn('Kapat', false);
        close.addEventListener('click', closeModal);
        bar.appendChild(close);
        bar.appendChild(dir);
      }
    }).catch(function () {
      bar.innerHTML = '';
      var t = document.createElement('div');
      t.style.cssText = 'color:#e5e7eb;font:500 14px system-ui,sans-serif;padding:8px';
      t.textContent = 'Harita yüklenemedi (çevrimdışı olabilirsin).';
      bar.appendChild(t);
    });
  }
  window.sohbetoOpenMap = function (lat, lon, title) {
    openMap({ lat: Number(lat), lon: Number(lon), title: title || 'Konum' });
  };

  // ------------------------------------------------- 1) Konum seçme akışı
  function sendLocation(lat, lon) {
    var ci = document.getElementById('chatInput');
    if (!ci) return;
    ci.value = '📍 Konum: ' + Number(lat).toFixed(5) + ', ' + Number(lon).toFixed(5);
    try { window.updateSendIcon && window.updateSendIcon(); } catch (e) {}
    try { window.sendChatMsg && window.sendChatMsg(); } catch (e) {}
  }

  window.chatPickLocation = function () {
    try { window.ciClosePanels && window.ciClosePanels(); } catch (e) {}
    var fallback = { lat: 39.925, lon: 32.866 }; // Ankara
    function show(lat, lon) {
      openMap({
        lat: lat, lon: lon, zoom: 16, pick: true,
        title: 'Konumunu seç (haritaya dokun)',
        onPick: sendLocation,
      });
    }
    if (!navigator.geolocation) { show(fallback.lat, fallback.lon); return; }
    navigator.geolocation.getCurrentPosition(
      function (pos) { show(pos.coords.latitude, pos.coords.longitude); },
      function () { show(fallback.lat, fallback.lon); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  // --------------------------------- 2) Konum mesajlarını haritaya çevir
  function enhance(node) {
    try {
      var els = node.querySelectorAll ? node.querySelectorAll('.msg-text') : [];
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.__sohbetoMapDone) continue;
        var m = LOC_RE.exec(el.textContent || '');
        if (!m) continue;
        el.__sohbetoMapDone = true;
        var lat = parseFloat(m[1]), lon = parseFloat(m[2]);
        if (!isFinite(lat) || !isFinite(lon)) continue;
        var z = 15;
        var t = tileXY(lat, lon, z);
        var wrap = document.createElement('div');
        wrap.style.cssText = 'margin-top:4px;border-radius:12px;overflow:hidden;cursor:pointer;position:relative;width:220px;max-width:100%;height:130px;background:#1f2937';
        wrap.title = 'Haritada aç';
        var img = document.createElement('img');
        img.src = 'https://tile.openstreetmap.org/' + z + '/' + t.x + '/' + t.y + '.png';
        img.alt = 'Konum haritası';
        img.loading = 'lazy';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        var pin = document.createElement('div');
        pin.textContent = '📍';
        pin.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-90%);font-size:26px;text-shadow:0 2px 6px rgba(0,0,0,.5)';
        var cap = document.createElement('div');
        cap.textContent = lat.toFixed(5) + ', ' + lon.toFixed(5);
        cap.style.cssText = 'position:absolute;left:0;right:0;bottom:0;padding:4px 8px;background:rgba(0,0,0,.55);color:#fff;font:500 11px system-ui,sans-serif';
        wrap.appendChild(img); wrap.appendChild(pin); wrap.appendChild(cap);
        (function (la, lo) {
          wrap.addEventListener('click', function (ev) {
            ev.stopPropagation();
            window.sohbetoOpenMap(la, lo, 'Paylaşılan konum');
          });
        })(lat, lon);
        el.textContent = '📍 Konum';
        el.appendChild(wrap);
      }
    } catch (e) { /* noop */ }
  }

  function start() {
    enhance(document);
    try {
      var obs = new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var added = list[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            if (added[j].nodeType === 1) enhance(added[j]);
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* noop */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
