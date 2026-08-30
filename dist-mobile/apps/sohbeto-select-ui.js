/* ============================================================
   SOHBETO SELECT UI — sola kaydırarak toplu mesaj seçimi
   - Mesajı SOLA çekince seçim kipi başlar ve o mesaj işaretlenir.
   - Kip açıkken mesajlara dokunarak seçim eklenir/çıkarılır.
   - Son mesajı tekrar SOLA çekince ilk seçimden o mesaja kadar
     olan aralığın tamamı seçilir ve toplu işlem kartı açılır:
       Benden sil / Herkesten sil / Sil ve arşivle / Vazgeç
   - Seçililer vurgu rengiyle belirgin nabız (glow) ile işaretlenir.
   YÜKLEME: sohbeto-reply-ui.js'TEN SONRA.
   ============================================================ */
(function () {
  'use strict';

  var AKEY = 'sohbeto-msg-archive';
  var mode = false;
  var anchor = null; // ilk sola çekilen mesaj

  function box() { return document.getElementById('chatMessages'); }
  function msgs() {
    var b = box(); if (!b) return [];
    return Array.prototype.slice.call(b.querySelectorAll('.msg'));
  }
  function selected() { return msgs().filter(function (m) { return m.classList.contains('sel-on'); }); }
  function toast(m) { try { if (window.log) window.log(m, '#22c55e'); } catch (e) {} }
  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function textOf(el) {
    if (!el) return '';
    var b = el.querySelector('.msg-bubble .msg-text') || el.querySelector('.msg-bubble');
    if (!b) return '';
    var c = b.cloneNode(true);
    try { c.querySelectorAll('.msg-meta,.msg-sender,.ui-reaction,.rq-quote').forEach(function (x) { x.remove(); }); } catch (e) {}
    return (c.innerText || '').trim();
  }

  // ---------- seçim ----------
  function enter() {
    if (mode) return;
    mode = true;
    document.body.classList.add('sel-mode');
    ensureBar();
    sync();
  }
  function exit() {
    mode = false; anchor = null;
    document.body.classList.remove('sel-mode');
    msgs().forEach(function (m) { m.classList.remove('sel-on'); });
    var b = document.getElementById('selBar');
    if (b) b.classList.remove('open');
    closeCard();
  }
  function toggle(el) {
    if (!el || el.classList.contains('msg-deleted')) return;
    el.classList.toggle('sel-on');
    if (!anchor && el.classList.contains('sel-on')) anchor = el;
    try { navigator.vibrate && navigator.vibrate(8); } catch (e) {}
    sync();
  }
  function selectRange(to) {
    var all = msgs();
    var a = all.indexOf(anchor), b = all.indexOf(to);
    if (a < 0 || b < 0) { toggle(to); return; }
    if (a > b) { var t = a; a = b; b = t; }
    for (var i = a; i <= b; i++) {
      if (!all[i].classList.contains('msg-deleted')) all[i].classList.add('sel-on');
    }
    sync();
  }
  function sync() {
    var n = selected().length;
    var bar = document.getElementById('selBar');
    if (!bar) return;
    if (!mode || !n) { if (!mode) bar.classList.remove('open'); }
    bar.classList.toggle('open', mode);
    var c = bar.querySelector('.sel-count');
    if (c) c.textContent = n + ' seçildi';
    if (mode && n === 0 && anchor) { exit(); }
  }

  // ---------- üst çubuk ----------
  function ensureBar() {
    if (document.getElementById('selBar')) return;
    var host = document.getElementById('screen-chat') || document.body;
    var bar = document.createElement('div');
    bar.id = 'selBar';
    bar.className = 'sel-bar';
    bar.innerHTML =
      '<button type="button" class="sel-x" aria-label="Vazgeç">&times;</button>' +
      '<div class="sel-count">0 seçildi</div>' +
      '<button type="button" class="sel-all" aria-label="Tümü"><i class="fa-solid fa-list-check"></i></button>' +
      '<button type="button" class="sel-trash" aria-label="Sil"><i class="fa-solid fa-trash"></i></button>';
    try { if (host !== document.body && getComputedStyle(host).position === 'static') host.style.position = 'relative'; } catch (e) {}
    host.appendChild(bar);
    bar.addEventListener('click', function (e) {
      if (e.target.closest('.sel-x')) { exit(); return; }
      if (e.target.closest('.sel-all')) {
        msgs().forEach(function (m) { if (!m.classList.contains('msg-deleted')) m.classList.add('sel-on'); });
        sync(); return;
      }
      if (e.target.closest('.sel-trash')) { openCard(); }
    });
  }

  // ---------- toplu işlem kartı ----------
  var cardEl = null;
  function closeCard() {
    if (!cardEl) return;
    var el = cardEl; cardEl = null;
    el.classList.remove('open');
    setTimeout(function () { try { el.remove(); } catch (e) {} }, 180);
  }
  function openCard() {
    var list = selected();
    if (!list.length) return;
    closeCard();
    var canAll = list.every(function (m) { return m.classList.contains('msg-own'); });
    var wrap = document.createElement('div');
    wrap.className = 'sel-dialog-wrap';
    wrap.innerHTML =
      '<div class="sel-dialog">' +
        '<div class="sel-dialog-ico"><i class="fa-solid fa-trash"></i></div>' +
        '<div class="sel-dialog-title">' + list.length + ' mesaj seçildi</div>' +
        '<div class="sel-dialog-sub">Bu mesajları nasıl silmek istersin?</div>' +
        '<button type="button" class="sel-dbtn" data-d="local">Benden sil</button>' +
        (canAll ? '<button type="button" class="sel-dbtn danger" data-d="all">Herkesten sil</button>' : '') +
        '<button type="button" class="sel-dbtn soft" data-d="archive"><i class="fa-solid fa-box-archive"></i> Sil ve arşivle</button>' +
        '<button type="button" class="sel-dbtn ghost" data-d="cancel">Vazgeç</button>' +
      '</div>';
    document.body.appendChild(wrap);
    cardEl = wrap;
    requestAnimationFrame(function () { wrap.classList.add('open'); });
    wrap.addEventListener('click', async function (e) {
      if (e.target === wrap) { closeCard(); return; }
      var b = e.target.closest('.sel-dbtn');
      if (!b) return;
      var d = b.dataset.d;
      if (d === 'cancel') { closeCard(); return; }
      closeCard();
      await runBulk(d, list);
      exit();
    });
  }

  async function runBulk(kind, list) {
    if (kind === 'archive') {
      var a = readJSON(AKEY);
      list.forEach(function (m) {
        var id = m.dataset.msgId || String(Math.random());
        a[id] = { text: textOf(m), at: Date.now() };
      });
      writeJSON(AKEY, a);
    }
    for (var i = 0; i < list.length; i++) {
      var id = list[i].dataset.msgId;
      if (!id) { try { list[i].remove(); } catch (e) {} continue; }
      try {
        if (kind === 'all' && typeof window.deleteMessageForEveryone === 'function') {
          await window.deleteMessageForEveryone(id);
        } else if (typeof window.deleteMessageLocal === 'function') {
          await window.deleteMessageLocal(id);
        } else { list[i].remove(); }
      } catch (e) { try { list[i].remove(); } catch (e2) {} }
    }
    toast(kind === 'archive' ? 'Arşivlendi ve silindi' : list.length + ' mesaj silindi');
  }

  // ---------- sola kaydırma ----------
  var sx = 0, sy = 0, act = null, dragging = false, locked = false, swallow = false, lastD = 0;
  function onStart(e) {
    var t = e.target && e.target.closest ? e.target.closest('#chatMessages .msg') : null;
    if (!t) return;
    var p = e.touches ? e.touches[0] : e;
    sx = p.clientX; sy = p.clientY; act = t; dragging = false; locked = false; lastD = 0;
  }
  function onMove(e) {
    if (!act) return;
    var p = e.touches ? e.touches[0] : e;
    var dx = p.clientX - sx, dy = p.clientY - sy;
    if (!locked) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { reset(); return; }
      if (dx < -10) { locked = true; dragging = true; act.classList.add('sel-dragging'); }
      else return;
    }
    if (dx > 0) dx = 0;
    var d = Math.max(dx * 0.6, -72);
    lastD = Math.abs(d);
    act.style.transform = 'translateX(' + d + 'px)';
    act.style.setProperty('--sel-p', Math.min(1, Math.abs(d) / 52).toFixed(2));
    if (e.cancelable) e.preventDefault();
  }
  function onEnd() {
    if (!act) return;
    var d = lastD;
    var el = act;
    if (dragging) { swallow = true; setTimeout(function () { swallow = false; }, 400); }
    var fired = dragging && d >= 34;
    reset();
    if (!fired) return;
    try { navigator.vibrate && navigator.vibrate(14); } catch (e) {}
    if (!mode) { enter(); toggle(el); anchor = el; }
    else { selectRange(el); openCard(); }
  }
  function reset() {
    if (act) {
      var el = act;
      el.style.transition = 'transform .18s cubic-bezier(.22,1,.36,1)';
      el.style.transform = '';
      el.style.removeProperty('--sel-p');
      setTimeout(function () { el.style.transition = ''; el.classList.remove('sel-dragging'); }, 200);
    }
    act = null; dragging = false; locked = false; lastD = 0;
  }

  // ---------- stiller ----------
  function styles() {
    if (document.getElementById('__sel_css__')) return;
    var A = 'var(--app-accent,var(--primary-green,#22c55e))';
    var css = [
      '.sel-bar{position:absolute;left:0;right:0;top:0;z-index:60;display:none;align-items:center;gap:10px;padding:10px 12px;padding-top:calc(10px + env(safe-area-inset-top,0px));background:' + A + ';color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25);}',
      '.sel-bar.open{display:flex;animation:selIn .18s cubic-bezier(.22,1,.36,1);}',
      '@keyframes selIn{from{opacity:0;transform:translateY(-10px);}to{opacity:1;transform:none;}}',
      '.sel-bar .sel-count{flex:1;font-weight:700;font-size:.95rem;}',
      '.sel-bar button{border:0;background:transparent;color:#fff;font-size:18px;line-height:1;padding:6px 8px;cursor:pointer;border-radius:10px;}',
      '.sel-bar button:active{background:rgba(255,255,255,.18);}',
      '.sel-bar .sel-x{font-size:26px;}',

      /* sola çekme ipucu */
      '#chatMessages .msg.sel-dragging::after{content:"\\f00c";font-family:"Font Awesome 6 Free";font-weight:900;position:absolute;right:-30px;top:50%;transform:translateY(-50%) scale(calc(.6 + var(--sel-p,0) * .4));opacity:var(--sel-p,0);width:26px;height:26px;border-radius:99px;display:flex;align-items:center;justify-content:center;background:rgba(127,127,127,.18);color:' + A + ';font-size:13px;}',

      /* seçili mesaj: balon rengine uyan belirgin nabız */
      '#chatMessages .msg.sel-on > .msg-bubble,#chatMessages .msg.sel-on .msg-media-img,#chatMessages .msg.sel-on .msg-media-video{outline:3px solid ' + A + ';outline-offset:2px;animation:selPulse 1.05s ease-in-out infinite;}',
      '@keyframes selPulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb, ' + A + ' 70%, transparent);filter:none;}50%{box-shadow:0 0 22px 7px color-mix(in srgb, ' + A + ' 60%, transparent);filter:brightness(1.06);}}',
      '@supports not (background: color-mix(in srgb, red 10%, transparent)){@keyframes selPulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.7);}50%{box-shadow:0 0 22px 7px rgba(34,197,94,.55);}}}',
      '#chatMessages .msg.sel-on::before{content:"\\f00c";font-family:"Font Awesome 6 Free";font-weight:900;position:absolute;top:-6px;width:22px;height:22px;border-radius:99px;display:flex;align-items:center;justify-content:center;background:' + A + ';color:#fff;font-size:11px;box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid var(--bg-white,#fff);z-index:5;pointer-events:none;}',
      '#chatMessages .msg-own.sel-on::before{left:-6px;}',
      '#chatMessages .msg-other.sel-on::before,#chatMessages .msg-private.sel-on::before{right:-6px;}',
      'html.sb-dark #chatMessages .msg.sel-on::before{border-color:var(--sb-dark-bg,#14181c);}',
      'body.sel-mode #chatMessages .msg{cursor:pointer;}',

      /* toplu işlem kartı */
      '.sel-dialog-wrap{position:fixed;inset:0;z-index:2200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);opacity:0;transition:opacity .18s ease;padding:22px;}',
      '.sel-dialog-wrap.open{opacity:1;}',
      '.sel-dialog{width:100%;max-width:320px;border-radius:22px;padding:20px 18px 16px;text-align:center;background:var(--bg-white,#fff);color:var(--text-dark,#111);box-shadow:0 24px 60px rgba(0,0,0,.35);transform:scale(.94);transition:transform .18s cubic-bezier(.22,1,.36,1);}',
      '.sel-dialog-wrap.open .sel-dialog{transform:none;}',
      'html.sb-dark .sel-dialog{background:var(--sb-dark-bg,#14181c);color:#e5e7eb;}',
      '.sel-dialog-ico{width:52px;height:52px;margin:0 auto 10px;border-radius:99px;display:flex;align-items:center;justify-content:center;font-size:20px;background:color-mix(in srgb, ' + A + ' 18%, transparent);color:' + A + ';}',
      '.sel-dialog-title{font-weight:700;font-size:1.02rem;}',
      '.sel-dialog-sub{font-size:.84rem;opacity:.65;margin:4px 0 14px;}',
      '.sel-dbtn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:8px;padding:12px 14px;border:0;border-radius:14px;font-size:.92rem;font-weight:600;cursor:pointer;background:' + A + ';color:#fff;}',
      '.sel-dbtn.danger{background:#dc2626;}',
      '.sel-dbtn.soft{background:rgba(127,127,127,.16);color:inherit;}',
      '.sel-dbtn.ghost{background:transparent;color:inherit;opacity:.7;}'
    ].join('\n');
    var st = document.createElement('style');
    st.id = '__sel_css__';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function start() {
    styles();
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
    document.addEventListener('mousedown', onStart, true);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onEnd, true);
    // Seçim kipinde dokunuş = seç/bırak (diğer menüler açılmasın)
    document.addEventListener('click', function (e) {
      if (!mode) return;
      if (e.target.closest('#selBar') || e.target.closest('.sel-dialog-wrap')) return;
      var m = e.target.closest ? e.target.closest('#chatMessages .msg') : null;
      e.stopPropagation(); e.preventDefault();
      if (swallow) return;
      if (m) toggle(m);
    }, true);
    document.addEventListener('contextmenu', function (e) { if (mode) { e.stopPropagation(); e.preventDefault(); } }, true);
    // Seçim kipindeyken tekli mesaj menüsü açılmasın
    new MutationObserver(function (recs) {
      if (!mode) return;
      recs.forEach(function (r) {
        Array.prototype.forEach.call(r.addedNodes, function (n) {
          if (n.classList && n.classList.contains('msg-action-overlay')) { try { n.remove(); } catch (e) {} }
        });
      });
    }).observe(document.body, { childList: true });
    window.SohbetoSelect = { enter: enter, exit: exit, isActive: function () { return mode; } };

  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
