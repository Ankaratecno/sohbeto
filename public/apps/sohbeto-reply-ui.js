/* ============================================================
   SOHBETO REPLY UI — sağa kaydırarak yanıtlama (motora dokunmaz)
   - Bir mesaj balonunu sağa çekince, yazma alanının üstünde
     alıntı şeridi açılır.
   - Gönderilen mesaj metnine okunabilir bir alıntı bloğu eklenir:
       ┌ Gönderen
       │ alıntı metni
       └
       kendi mesajın
   - DOM'da bu blok, mesaj balonu içinde küçük bir "alıntı balonu"
     olarak (üstte alıntı, altta metin) gösterilir.
   YÜKLEME: sohbeto-ui-sheets.js'TEN SONRA.
   ============================================================ */
(function () {
  'use strict';

  var TOP = '\u250C', MID = '\u2502', END = '\u2514';
  var pending = null; // { name, text }

  // ---------- yardımcılar ----------
  function mediaLabel(msgEl) {
    if (!msgEl) return '';
    if (msgEl.querySelector('.msg-media-img')) return '\uD83D\uDCF7 Fotoğraf';
    if (msgEl.querySelector('.msg-media-video')) return '\uD83C\uDFAC Video';
    if (msgEl.querySelector('.msg-media-audio')) return '\uD83C\uDFA4 Sesli mesaj';
    var f = msgEl.querySelector('.msg-media-file .oo-file-name');
    if (f) return '\uD83D\uDCC4 ' + (f.textContent || 'Dosya').trim();
    if (msgEl.querySelector('.msg-media-file')) return '\uD83D\uDCC4 Dosya';
    return '';
  }
  function textOf(msgEl) {
    var m = mediaLabel(msgEl);
    if (m) return m;
    var b = msgEl && msgEl.querySelector('.msg-bubble .msg-text');
    if (!b) b = msgEl && msgEl.querySelector('.msg-bubble');
    if (!b) return '';
    var c = b.cloneNode(true);
    try { c.querySelectorAll('.msg-meta,.msg-sender,.ui-reaction,.rq-quote').forEach(function (x) { x.remove(); }); } catch (e) {}
    return (c.innerText || '').trim();
  }
  function cleanName(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    // "+90506506506 [+90506506506]" → "+90506506506" (aynı ad iki kez yazılmasın)
    var m = /^(.*?)\s*\[(.*?)\]\s*$/.exec(s);
    if (m) {
      var a = m[1].trim(), b = m[2].trim();
      s = (!a || a === b) ? b : a;
    }
    return s;
  }
  function senderOf(msgEl) {
    if (!msgEl) return '';
    if (msgEl.classList.contains('msg-own')) return 'Sen';
    var s = msgEl.querySelector('.msg-sender');
    if (s) {
      var t = s.cloneNode(true);
      try { t.querySelectorAll('.msg-tag').forEach(function (x) { x.remove(); }); } catch (e) {}
      return cleanName(t.innerText || '');
    }
    var h = document.getElementById('chatHName');
    return h ? cleanName(h.textContent || '') : '';
  }
  function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function norm(s) {
    return String(s || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Alıntının kaynağı olan mesaj balonunu bul (medya dahil, iki taraf için de).
  function findSource(el, name, qtext) {
    var box = document.getElementById('chatMessages');
    if (!box) return null;
    var host = el.closest ? el.closest('#chatMessages .msg') : null;
    var all = [], nl = box.querySelectorAll('.msg'), i;
    for (i = 0; i < nl.length; i++) all.push(nl[i]);
    var idx = host ? all.indexOf(host) : all.length;
    if (idx < 0) idx = all.length;
    var target = norm(qtext);
    var isMedia = /foto|video|sesli|dosya|medya/i.test(String(qtext || ''));

    function scan(strictName) {
      for (var j = idx - 1; j >= 0; j--) {
        var m = all[j];
        if (m === host) continue;
        if (strictName) {
          var who = senderOf(m);
          if (name && who && who !== name) continue;
        }
        var mt = norm(textOf(m));
        if (!mt) continue;
        if (mt === target) return m;
        if (isMedia && norm(mediaLabel(m)) === target) return m;
      }
      return null;
    }
    return scan(true) || scan(false);
  }

  function thumbOf(msgEl) {
    if (!msgEl) return '';
    var img = msgEl.querySelector('.msg-media-img');
    if (img && img.src) return img.src;
    var v = msgEl.querySelector('.msg-media-video');
    if (v && v.getAttribute('poster')) return v.getAttribute('poster');
    return '';
  }

  function jumpTo(msgEl) {
    if (!msgEl) return;
    try { msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { msgEl.scrollIntoView(); }
    msgEl.classList.remove('rq-flash');
    void msgEl.offsetWidth;
    msgEl.classList.add('rq-flash');
    setTimeout(function () { msgEl.classList.remove('rq-flash'); }, 1400);
  }



  // ---------- alıntı şeridi ----------
  function bar() { return document.getElementById('rqBar'); }
  function ensureBar() {
    var b = bar();
    if (b) return b;
    var field = document.querySelector('.chat-input-bar');
    if (!field) return null;
    b = document.createElement('div');
    b.id = 'rqBar';
    b.className = 'rq-bar';
    b.innerHTML =
      '<div class="rq-line"></div>' +
      '<div class="rq-body"><div class="rq-name"></div><div class="rq-text"></div></div>' +
      '<button type="button" class="rq-close" aria-label="Vazgeç">&times;</button>';
    field.parentNode.insertBefore(b, field);
    b.querySelector('.rq-close').addEventListener('click', clearReply);
    return b;
  }
  function startReply(msgEl) {
    var txt = textOf(msgEl);
    if (!txt) txt = 'Medya';
    pending = { name: senderOf(msgEl) || 'Mesaj', text: txt };
    var b = ensureBar();
    if (!b) return;
    b.querySelector('.rq-name').textContent = pending.name;
    b.querySelector('.rq-text').textContent = clip(pending.text, 120);
    b.classList.add('open');
    var ta = document.getElementById('chatInput');
    if (ta) setTimeout(function () { ta.focus(); }, 60);
  }
  function clearReply() {
    pending = null;
    var b = bar();
    if (b) b.classList.remove('open');
  }

  function quoteBlock() {
    if (!pending) return '';
    var lines = String(pending.text).split('\n').slice(0, 4).map(function (l) { return MID + ' ' + l; });
    return TOP + ' ' + pending.name + '\n' + lines.join('\n') + '\n' + END + '\n';
  }

  // ---------- gönderimi sar ----------
  function wrapSend() {
    var orig = window.sendChatMsg;
    if (typeof orig !== 'function' || orig.__rqWrapped) return;
    var wrapped = function () {
      try {
        var ta = document.getElementById('chatInput');
        if (pending && ta && ta.value.trim()) {
          ta.value = quoteBlock() + ta.value;
          clearReply();
        } else if (pending) { clearReply(); }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    wrapped.__rqWrapped = true;
    window.sendChatMsg = wrapped;
  }
  var wrapTimer = setInterval(wrapSend, 400);
  setTimeout(function () { clearInterval(wrapTimer); wrapSend(); }, 12000);

  // ---------- balon içinde alıntıyı çiz ----------
  function decorate(root) {
    var scope = (root && root.querySelectorAll) ? root : document;
    var list = scope.querySelectorAll('#chatMessages .msg-text, #chatMessages .msg-bubble');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.dataset.rqDone === '1') continue;
      // Balon seviyesinde yalnızca .msg-text yoksa çalış (çift işlem olmasın)
      if (el.classList.contains('msg-bubble') && el.querySelector('.msg-text')) continue;
      var raw = (el.textContent || '').replace(/^[\s\u200b]+/, '');
      if (raw.charAt(0) !== TOP) {
        // Metin sonradan gelebilir; boşsa işaretleme.
        if (raw) el.dataset.rqDone = '1';
        continue;
      }
      var lines = raw.split('\n');
      var name = cleanName(lines[0].slice(1));
      var q = [], k = 1;
      for (; k < lines.length; k++) {
        var ln = lines[k].replace(/^\s+/, '');
        if (ln.charAt(0) === MID) q.push(ln.slice(1).trim());
        else break;
      }
      if (lines[k] && lines[k].replace(/^\s+/, '').charAt(0) === END) k++;
      var rest = lines.slice(k).join('\n').replace(/^\n+/, '');
      el.dataset.rqDone = '1';
      el.textContent = rest;
      var quote = document.createElement('div');
      quote.className = 'rq-quote';
      quote.innerHTML = '<span class="rq-q-body"><span class="rq-q-name"></span><span class="rq-q-text"></span></span>';
      quote.querySelector('.rq-q-name').textContent = name;
      var qtext = q.join(' ');
      quote.querySelector('.rq-q-text').textContent = clip(qtext, 140);
      var src = findSource(el, name, qtext);
      var thumb = thumbOf(src);
      if (thumb) {
        var im = document.createElement('img');
        im.className = 'rq-q-thumb';
        im.src = thumb;
        im.alt = '';
        quote.appendChild(im);
      }
      quote.dataset.qname = name;
      quote.dataset.qtext = qtext;
      quote.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var target = findSource(this, this.dataset.qname, this.dataset.qtext);
        jumpTo(target);
      });
      el.parentNode.insertBefore(quote, el);

    }
  }


  // ---------- sağa kaydırma ----------
  var sx = 0, sy = 0, act = null, dragging = false, locked = false;
  var pressTimer = null, glowEl = null, swallowClick = false;
  function clearGlow() {
    clearTimeout(pressTimer); pressTimer = null;
    if (glowEl) { glowEl.classList.remove('rq-glow'); glowEl = null; }
  }
  function onStart(e) {
    var t = e.target && e.target.closest ? e.target.closest('#chatMessages .msg') : null;
    if (!t) return;
    var p = e.touches ? e.touches[0] : e;
    sx = p.clientX; sy = p.clientY; act = t; dragging = false; locked = false;
    clearGlow();
    pressTimer = setTimeout(function () {
      glowEl = t;
      t.classList.add('rq-glow');
    }, 320);
  }

  function onMove(e) {
    if (!act) return;
    var p = e.touches ? e.touches[0] : e;
    var dx = p.clientX - sx, dy = p.clientY - sy;
    if ((Math.abs(dx) > 8 || Math.abs(dy) > 8) && pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (!locked) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { reset(); return; }
      if (dx > 10) { locked = true; dragging = true; act.classList.add('rq-dragging'); }
      else return;
    }

    if (dx < 0) dx = 0;
    var d = Math.min(dx * 0.6, 72);
    act.style.transform = 'translateX(' + d + 'px)';
    act.style.setProperty('--rq-p', Math.min(1, d / 52).toFixed(2));
    if (e.cancelable) e.preventDefault();
  }
  function onEnd() {
    if (!act) return;
    var m = /translateX\(([\d.]+)px\)/.exec(act.style.transform || '');
    var d = m ? parseFloat(m[1]) : 0;
    var el = act;
    if (dragging) {
      swallowClick = true;
      setTimeout(function () { swallowClick = false; }, 400);
    }
    if (dragging && d >= 44) {
      startReply(el);
      try { navigator.vibrate && navigator.vibrate(12); } catch (e) {}
    }
    reset();
  }
  function reset() {
    if (act) {
      act.style.transition = 'transform .18s cubic-bezier(.22,1,.36,1)';
      act.style.transform = '';
      act.style.removeProperty('--rq-p');
      var el = act;
      setTimeout(function () { el.style.transition = ''; el.classList.remove('rq-dragging'); }, 200);
    }
    act = null; dragging = false; locked = false;
    clearTimeout(pressTimer); pressTimer = null;
  }

  function styles() {
    if (document.getElementById('__rq_css__')) return;
    var css = [
      /* alıntı şeridi (yazma alanının üstünde) */
      '.rq-bar{display:none;align-items:center;gap:10px;margin:0 10px 6px;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);animation:rqIn .18s cubic-bezier(.22,1,.36,1);}',
      '.rq-bar.open{display:flex;}',
      '@keyframes rqIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}',
      '.rq-line{width:3px;align-self:stretch;border-radius:99px;background:var(--app-accent,#22c55e);flex:0 0 auto;}',
      '.rq-body{flex:1;min-width:0;}',
      '.rq-name{font-size:.78rem;font-weight:600;color:var(--app-accent,#22c55e);}',
      '.rq-text{font-size:.8rem;color:var(--app-text-2,rgba(255,255,255,.6));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.rq-close{border:0;background:transparent;color:var(--app-text-2,rgba(255,255,255,.55));font-size:20px;line-height:1;padding:2px 4px;cursor:pointer;}',
      /* balon içindeki alıntı balonu — hem açık hem koyu balonda okunur */
      '#chatMessages .rq-quote{display:flex;align-items:center;gap:8px;margin:0 0 6px;padding:6px 9px;border-radius:10px;border-left:3px solid currentColor;background:color-mix(in srgb, currentColor 12%, transparent);}',
      '#chatMessages .rq-q-body{flex:1;min-width:0;}',
      '#chatMessages .rq-q-thumb{flex:0 0 auto;width:38px;height:38px;border-radius:8px;object-fit:cover;}',
      '@supports not (background: color-mix(in srgb, red 10%, transparent)){#chatMessages .rq-quote{background:rgba(127,127,127,.18);}}',
      '#chatMessages .rq-q-name{display:block;font-size:.72rem;font-weight:600;opacity:.9;}',
      '#chatMessages .rq-q-text{display:block;font-size:.78rem;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',

      /* sürükleme */
      '#chatMessages .msg{position:relative;}',
      '#chatMessages .msg.rq-dragging::before{content:"\\21A9";position:absolute;left:-30px;top:50%;transform:translateY(-50%) scale(calc(.6 + var(--rq-p,0) * .4));opacity:var(--rq-p,0);width:26px;height:26px;border-radius:99px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.12);color:var(--app-accent,#22c55e);font-size:14px;}',
      /* medya balonlarında da sağa çekme çalışsın */
      '#chatMessages .msg img,#chatMessages .msg video{-webkit-user-drag:none;user-drag:none;-webkit-touch-callout:none;}',
      '#chatMessages .msg-media-img,#chatMessages .msg-media-video,#chatMessages .msg-media-file{touch-action:pan-y;}',
      /* basılı tutunca nabız gibi vurgu parıltısı */
      '#chatMessages .msg.rq-glow .msg-bubble,#chatMessages .msg.rq-glow .msg-media-img,#chatMessages .msg.rq-glow .msg-media-video{border-radius:inherit;animation:rqPulse 1.1s ease-in-out infinite;outline:2px solid var(--app-accent,var(--primary-green,#22c55e));outline-offset:1px;}',
      '@keyframes rqPulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--app-accent,var(--primary-green,#22c55e)) 55%, transparent);}50%{box-shadow:0 0 14px 4px color-mix(in srgb, var(--app-accent,var(--primary-green,#22c55e)) 45%, transparent);}}',
      /* alıntıya tıklayınca hedef mesaj vurgulansın */
      '#chatMessages .rq-quote{cursor:pointer;}',
      '#chatMessages .msg.rq-flash .msg-bubble,#chatMessages .msg.rq-flash .msg-media-img{animation:rqFlash 1.3s ease;}',
      '@keyframes rqFlash{0%,100%{box-shadow:none;}20%,60%{box-shadow:0 0 0 3px color-mix(in srgb, var(--app-accent,var(--primary-green,#22c55e)) 60%, transparent);}}'
    ].join('\n');
    var st = document.createElement('style');
    st.id = '__rq_css__';
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
    document.addEventListener('click', function (e) {
      if (swallowClick) { e.stopPropagation(); e.preventDefault(); return; }
      if (!(e.target && e.target.closest && e.target.closest('#chatMessages .msg'))) clearGlow();
    }, true);
    var mo = new MutationObserver(function () { decorate(document); });
    mo.observe(document.body, { childList: true, subtree: true });
    decorate(document);
    wrapSend();
    window.SohbetoReply = { start: startReply, clear: clearReply };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
