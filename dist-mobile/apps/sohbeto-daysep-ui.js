/* ============================================================
   SOHBETO DAY SEPARATOR — sohbet penceresinde gün ayracı
   - Her günün ilk mesajının üstüne tarih rozeti koyar
     (Bugün / Dün / 24 Ağustos 2026 gibi).
   - Kaydırırken üstte "yapışkan" tarih rozeti güncellenir.
   Motora dokunmaz; yalnızca DOM'a ekleme yapar.
   YÜKLEME: sohbeto-reply-ui.js'TEN SONRA.
   ============================================================ */
(function () {
  'use strict';

  var AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function label(d) {
    var now = new Date();
    var t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((t - m) / 86400000);
    if (diff === 0) return 'Bugün';
    if (diff === 1) return 'Dün';
    if (diff > 1 && diff < 7) return ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][d.getDay()];
    var s = d.getDate() + ' ' + AY[d.getMonth()];
    if (d.getFullYear() !== now.getFullYear()) s += ' ' + d.getFullYear();
    return s;
  }

  // Mesajın tarihi: data-ts varsa ondan, yoksa saatten bugüne göre tahmin.
  function dateOf(msgEl) {
    var ts = msgEl.getAttribute('data-ts');
    if (ts && !isNaN(+ts)) return new Date(+ts);
    if (msgEl.__dsDate) return msgEl.__dsDate;
    var d = new Date();
    var t = msgEl.querySelector('.msg-time');
    if (t) {
      var mm = /(\d{1,2}):(\d{2})/.exec(t.textContent || '');
      if (mm) { d.setHours(+mm[1], +mm[2], 0, 0); }
    }
    msgEl.__dsDate = d;
    return d;
  }

  function box() { return document.getElementById('chatMessages'); }

  function rebuild() {
    var c = box();
    if (!c) return;
    var kids = c.children, prev = null, i;
    var nodes = [];
    for (i = 0; i < kids.length; i++) nodes.push(kids[i]);
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.classList.contains('ds-sep')) { el.remove(); continue; }
      if (!el.classList.contains('msg')) continue;
      var d = dateOf(el);
      var k = dayKey(d);
      if (k !== prev) {
        var sep = document.createElement('div');
        sep.className = 'ds-sep';
        sep.dataset.key = k;
        sep.innerHTML = '<span>' + label(d) + '</span>';
        c.insertBefore(sep, el);
        prev = k;
      }
      el.dataset.dsKey = k;
      el.dataset.dsLabel = label(d);
    }
    updateFloat();
  }

  function floatEl() {
    var c = box();
    if (!c) return null;
    var host = document.getElementById('screen-chat') || c.parentNode;
    var f = document.getElementById('dsFloat');
    if (!f || f.parentNode !== host) {
      if (f) f.remove();
      f = document.createElement('div');
      f.id = 'dsFloat';
      f.className = 'ds-float';
      f.innerHTML = '<span></span>';
      host.appendChild(f);
    }
    // Yapışkan başlığın altına konumlandır (başlığın altında kalmasın).
    var h = host.querySelector('.chat-header');
    if (h) {
      var hr = h.getBoundingClientRect(), pr = host.getBoundingClientRect();
      f.style.top = Math.max(0, hr.bottom - pr.top + 8) + 'px';
    }
    return f;
  }

  function updateFloat() {
    var c = box(), f = floatEl();
    if (!c || !f) return;
    var top = c.getBoundingClientRect().top, cur = '', i;
    var kids = c.querySelectorAll('.msg');
    for (i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      if (r.bottom > top + 4) { cur = kids[i].dataset.dsLabel || ''; break; }
    }
    if (!cur) { f.classList.remove('show'); return; }

    // Ayni tarihin satir-ici ayraci hâlâ görünüyorsa yüzen rozeti gösterme
    // (çift "Bugün" görünmesin). Yalnizca ayrac yukari kaydiginda çik.
    var fr = f.getBoundingClientRect();
    var seps = c.querySelectorAll('.ds-sep');
    for (i = 0; i < seps.length; i++) {
      var sr = seps[i].getBoundingClientRect();
      var txt = (seps[i].textContent || '').trim();
      if (txt === cur && sr.bottom > fr.top - 2) { f.classList.remove('show'); return; }
    }

    f.querySelector('span').textContent = cur;
    f.classList.add('show');
  }

  function styles() {
    if (document.getElementById('__ds_css__')) return;
    var css = [
      '#chatMessages .ds-sep{display:flex;justify-content:center;margin:12px 0 10px;pointer-events:none;}',
      '#chatMessages .ds-sep span,.ds-float span{font-size:.72rem;font-weight:700;letter-spacing:.02em;padding:5px 13px;border-radius:99px;background:var(--primary-green,#22c55e);color:#fff;border:1px solid rgba(255,255,255,.18);box-shadow:0 2px 10px rgba(0,0,0,.28);backdrop-filter:blur(8px);}',
      '.ds-float{position:absolute;left:0;right:0;top:8px;display:flex;justify-content:center;z-index:24;pointer-events:none;opacity:0;transform:translateY(-6px);transition:opacity .18s ease,transform .18s ease;}',
      '.ds-float.show{opacity:1;transform:none;}'
    ].join('\n');
    var st = document.createElement('style');
    st.id = '__ds_css__';
    st.textContent = css;
    document.head.appendChild(st);
  }

  var raf = 0;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; rebuild(); });
  }

  function start() {
    styles();
    var attached = false;
    setInterval(function () {
      var c = box();
      if (!c) return;
      if (!attached) {
        attached = true;
        var p = c.parentNode;
        if (p && getComputedStyle(p).position === 'static') p.style.position = 'relative';
        var userAct = false, actTimer = null;
        function markAct() {
          userAct = true;
          clearTimeout(actTimer);
          actTimer = setTimeout(function () { userAct = false; }, 900);
        }
        c.addEventListener('wheel', markAct, { passive: true });
        c.addEventListener('touchmove', markAct, { passive: true });
        c.addEventListener('pointerdown', markAct, { passive: true });
        c.addEventListener('scroll', function () { updateFloat(); }, { passive: true });
        new MutationObserver(function (recs) {
          for (var i = 0; i < recs.length; i++) {
            for (var j = 0; j < recs[i].addedNodes.length; j++) {
              var n = recs[i].addedNodes[j];
              if (n.nodeType === 1 && n.classList && n.classList.contains('msg')) { schedule(); return; }
            }
            if (recs[i].removedNodes.length) { schedule(); return; }
          }
        }).observe(c, { childList: true });
        schedule();
      }
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
