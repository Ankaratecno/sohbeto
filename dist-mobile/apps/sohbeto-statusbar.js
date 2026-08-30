/* =====================================================================
   SOHBETO STATUS BAR — Cihazın üst durum çubuğu (saat/pil) rengini
   uygulamanın o anki temasına göre boyar.
   • Ana akış (Sohbetler/Kişiler/Gruplar/Ayarlar) → tema arka planı
   • Sohbet ekranı → seçili sohbet duvar kağıdının üst şerit rengi
   Motor dosyalarına dokunmaz; sadece parent pencereye renk bildirir.
   ===================================================================== */
(function () {
  'use strict';

  var last = null;
  var cache = {};

  function cssVar(name) {
    try {
      return (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim();
    } catch (e) { return ''; }
  }

  function toRGB(color) {
    try {
      var d = document.createElement('span');
      d.style.color = color;
      d.style.display = 'none';
      document.body.appendChild(d);
      var c = getComputedStyle(d).color;
      d.remove();
      var m = c.match(/(\d+(?:\.\d+)?)/g);
      if (!m) return null;
      return [+m[0], +m[1], +m[2]];
    } catch (e) { return null; }
  }

  function isDark(color) {
    var rgb = toRGB(color);
    if (!rgb) return false;
    var l = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return l < 0.6;
  }

  // Duvar kağıdının ÜST şeridinin ortalama rengini bul (durum çubuğu oraya oturur)
  function sampleTop(url, cb) {
    if (cache[url] !== undefined) return cb(cache[url]);
    var img = new Image();
    img.onload = function () {
      try {
        var w = 24, h = 6;
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d');
        var srcH = Math.max(1, Math.round(img.naturalHeight * 0.06));
        ctx.drawImage(img, 0, 0, img.naturalWidth, srcH, 0, 0, w, h);
        var d = ctx.getImageData(0, 0, w, h).data;
        var r = 0, g = 0, b = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        var col = 'rgb(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ')';
        cache[url] = col;
        cb(col);
      } catch (e) { cache[url] = null; cb(null); }
    };
    img.onerror = function () { cache[url] = null; cb(null); };
    img.src = url;
  }

  // Uygulamanın o anki zemin rengi: gece modunda --app-bg, gündüz temada --bg-white.
  function themeBg() {
    var v = cssVar('--app-bg') || cssVar('--bg-white');
    if (!v || v.indexOf('var(') === 0) v = cssVar('--bg-white');
    return v || '#ffffff';
  }

  function chatIsOpen() {
    var el = document.getElementById('screen-chat');
    return !!(el && el.classList.contains('active') && !el.classList.contains('hidden-screen'));
  }

  function wallpaperURL() {
    var bg = cssVar('--oo-chat-bg');
    var m = bg && bg.match(/url\(["']?([^"')]+)["']?\)/);
    if (!m) return null;
    try { return new URL(m[1], document.baseURI).href; } catch (e) { return m[1]; }
  }

  function send(color) {
    if (!color || color === last) return;
    last = color;
    var dark = isDark(color);
    try {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', color);
    } catch (e) {}
    document.documentElement.style.setProperty('--oo-statusbar', color);
    document.body.classList.toggle('oo-statusbar-dark', dark);
    try {
      window.parent.postMessage({ type: 'sohbeto:theme-color', color: color, dark: dark }, '*');
    } catch (e) {}
  }

  function tick() {
    if (chatIsOpen()) {
      var url = wallpaperURL();
      if (url) {
        sampleTop(url, function (c) {
          send(c || cssVar('--oo-chat-fallback') || themeBg());
        });
        return;
      }
      send(cssVar('--oo-chat-fallback') || themeBg());
      return;
    }
    send(themeBg());
  }

  function ready() {
    tick();
    try {
      var root = document.querySelector('.app-container') || document.body;
      new MutationObserver(function () { tick(); })
        .observe(root, { attributes: true, attributeFilter: ['class', 'style'], subtree: true });
      new MutationObserver(function () { tick(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    } catch (e) {}
    setInterval(tick, 1200);
    window.addEventListener('focus', tick);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
