/* ============================================================
   SOHBETO UI SHEETS — mesaj eylem menüsü kabuğu (v3)
   Motoru (sohbeto-engine.js) DEĞİŞTİRMEZ. Engine'in ürettiği
   .msg-action-overlay DOM'unu yakalayıp:
     1) Parmağın bastığı noktada açılan yatay simge şeridi,
        hemen ÜSTÜNDE zengin emoji tepki barı (+ genişleyen ızgara),
     2) Simge sırası: Yanıtla, Kopyala, İlet, Sabitle, Sil,
        "Sil" ekranın ortasında naif bir kart açar:
        Benden sil / Herkesten sil / Sil ve arşivle,
     3) Tepkiler + sabitleme + arşiv işareti yerel (cihazda) saklanır.
   YÜKLEME: sohbeto-engine.js'TEN SONRA.
   ============================================================ */
(function () {
  'use strict';

  var QUICK = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🙏', '🎉'];
  // Emoji atölyesi: kategori sekmeli
  var CATS = [
    { id: 'son', tab: '🕒', label: 'Son kullanılan', items: [] },
    { id: 'yuz', tab: '😀', label: 'Yüzler', items: ['😀','😃','😄','😁','😆','🥹','😊','🙂','😉','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','🤗','🤭','🤔','🤨','😐','😑','😶','🙄','😏','😴','🤤','🤒','🤕','🥳','😎','🤓','🧐','😮‍💨','😭','😢','😤','😠','😡','🤯','😱','😨','🥺','😳','🙈','🤫'] },
    { id: 'jest', tab: '👍', label: 'Jestler', items: ['👍','👎','👏','🙌','🤝','🤲','🙏','💪','👌','✌️','🤞','🫰','🤙','👋','🖐️','✋','🫶','👆','👇','👈','👉','☝️','✍️','💅','🫡'] },
    { id: 'kalp', tab: '❤️', label: 'Kalpler', items: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💖','💗','💓','💞','💕','💘','💝','❤️‍🔥','❤️‍🩹','💔','💟','♥️','💫','⭐','🌟','✨','🔥','💯'] },
    { id: 'doga', tab: '🌿', label: 'Doğa', items: ['🌿','🍀','🌱','🌳','🌴','🌵','🌸','🌷','🌹','💐','🌻','🌼','🍁','🍂','🌾','🌊','🌙','☀️','⛅','🌧️','❄️','⛄','🌈','🐝','🦋','🐢','🐬','🐈','🐕','🕊️'] },
    { id: 'yemek', tab: '☕', label: 'Yiyecek', items: ['☕','🍵','🥤','🧃','🍽️','🍞','🥐','🧀','🍕','🍔','🌮','🍜','🍚','🥗','🍇','🍉','🍊','🍋','🍌','🍎','🍓','🍒','🥝','🍰','🎂','🍫','🍬','🍯','🥜'] },
    { id: 'sem', tab: '🎉', label: 'Simgeler', items: ['🎉','🎊','🎁','🎈','🏆','🥇','🎯','✅','☑️','❗','❓','⚠️','🔔','📌','📍','📢','💡','🔒','🕌','☪️','🤲','📖','🧿','⚡','🌍','🚀','⏰','📸','🎵','🎶'] }
  ];
  var RKEY = 'sohbeto-msg-reactions';
  var PKEY = 'sohbeto-msg-pins';
  var AKEY = 'sohbeto-msg-archive';
  var EKEY = 'sohbeto-emoji-recent';

  function recents() { try { return JSON.parse(localStorage.getItem(EKEY)) || []; } catch (e) { return []; } }
  function pushRecent(em) {
    var r = recents().filter(function (x) { return x !== em; });
    r.unshift(em);
    try { localStorage.setItem(EKEY, JSON.stringify(r.slice(0, 24))); } catch (e) {}
  }


  var ICONS = {
    reply: '<svg viewBox="0 0 24 24"><path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>',
    forward: '<svg viewBox="0 0 24 24"><path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 0 0-6 6v1"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 4 3H6l4-3-1-6Z"/><path d="M12 13v7"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
    archive: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4" rx="1.5"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/></svg>'
  };
  var TITLES = { reply: 'Yanıtla', copy: 'Kopyala', forward: 'İlet', pin: 'Sabitle', trash: 'Sil' };
  var ORDER = ['reply', 'copy', 'forward', 'pin', 'trash'];

  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // ---------- Tepkiler (yerel) ----------
  function setReaction(msgId, emoji) {
    if (!msgId) return;
    var all = readJSON(RKEY);
    if (all[msgId] === emoji) delete all[msgId]; else all[msgId] = emoji;
    writeJSON(RKEY, all);
    paintReactions();
  }
  function paintReactions() {
    var all = readJSON(RKEY);
    var pins = readJSON(PKEY);
    var list = document.querySelectorAll('#chatMessages .msg[data-msg-id]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var id = el.dataset.msgId;
      var bubble = el.querySelector('.msg-bubble');
      if (!bubble) continue;
      var pill = bubble.querySelector(':scope > .ui-reaction');
      var emoji = all[id];
      if (!emoji) {
        if (pill) pill.remove();
        el.classList.remove('ui-has-reaction');
      } else {
        if (!pill) {
          pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'ui-reaction';
          pill.addEventListener('click', function (ev) {
            ev.stopPropagation();
            setReaction(this.closest('.msg').dataset.msgId, this.dataset.emoji);
          });
          bubble.appendChild(pill);
        }
        pill.dataset.emoji = emoji;
        pill.textContent = emoji;
        el.classList.add('ui-has-reaction');
      }
      el.classList.toggle('ui-pinned', !!pins[id]);
    }
  }

  // ---------- Son basılan mesaj + basma noktası ----------
  var lastMsgEl = null, pressX = 0, pressY = 0;
  function remember(e) {
    var t = e.target && e.target.closest ? e.target.closest('.msg') : null;
    if (t) {
      lastMsgEl = t;
      var p = e.touches && e.touches[0] ? e.touches[0] : e;
      if (typeof p.clientX === 'number') { pressX = p.clientX; pressY = p.clientY; }
    }
  }
  ['touchstart', 'mousedown', 'contextmenu'].forEach(function (t) {
    document.addEventListener(t, remember, true);
  });

  function toast(msg) { try { if (window.log) window.log(msg, '#22c55e'); } catch (e) {} }

  function plainTextOf(msgEl) {
    var b = msgEl && msgEl.querySelector('.msg-bubble .msg-text');
    if (!b) b = msgEl && msgEl.querySelector('.msg-bubble');
    var clone = b ? b.cloneNode(true) : null;
    if (clone) {
      try { clone.querySelectorAll('.msg-meta,.msg-sender,.ui-reaction').forEach(function (x) { x.remove(); }); } catch (e) {}
      try {
        clone.querySelectorAll('img').forEach(function (im) {
          im.replaceWith(document.createTextNode(im.getAttribute('alt') || ''));
        });
      } catch (e) {}
    }
    return clone ? (clone.innerText || '').trim() : '';
  }

  // ---------- Menüyü zenginleştir ----------
  function enhance(overlay) {
    if (!overlay || overlay.dataset.uiEnhanced === '1') return;
    overlay.dataset.uiEnhanced = '1';
    var sheet = overlay.querySelector('.msg-action-sheet');
    if (!sheet) return;
    overlay.classList.add('ui-sheet');

    var msgEl = lastMsgEl;
    var msgId = msgEl ? msgEl.dataset.msgId : '';
    var text = plainTextOf(msgEl);

    // Motorun butonlarını gizli tut, sadece programatik tetikleyeceğiz
    var have = {}, cancelBtn = null;
    var btns = sheet.querySelectorAll('button[data-act]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], act = b.dataset.act;
      if (act === 'cancel') cancelBtn = b; else have[act] = b;
      b.classList.add('ui-hidden-native');
    }
    sheet.classList.add('ui-native-hidden');
    if (msgEl) msgEl.classList.add('ui-msg-focus');

    function closeMenu() { if (cancelBtn) cancelBtn.click(); else { overlay.classList.remove('open'); setTimeout(function () { try { overlay.remove(); } catch (e) {} }, 160); } }

    // ---- yatay simge şeridi ----
    var bar = document.createElement('div');
    bar.className = 'ui-emoji-bar';
    bar.innerHTML =
      QUICK.map(function (em) { return '<button type="button" class="ui-em" data-emoji="' + em + '">' + em + '</button>'; }).join('') +
      '<button type="button" class="ui-em ui-more" aria-label="Daha fazla">＋</button>';

    var iconRow = document.createElement('div');
    iconRow.className = 'ui-icon-row';
    var pins = readJSON(PKEY);
    iconRow.innerHTML = ORDER.map(function (act) {
      var t = act === 'pin' && pins[msgId] ? 'Sabitlemeyi kaldır' : TITLES[act];
      return '<button type="button" class="ui-ibtn' + (act === 'trash' ? ' danger' : '') + '" data-ui="' + act + '" title="' + t + '" aria-label="' + t + '">' + ICONS[act] + '</button>';
    }).join('');

    // ---- emoji atölyesi: sekmeler + ızgara ----
    var cats = CATS.map(function (c) { return c.id === 'son' ? { id: c.id, tab: c.tab, label: c.label, items: recents() } : c; })
                   .filter(function (c) { return c.items.length > 0; });
    var grid = document.createElement('div');
    grid.className = 'ui-emoji-grid';
    grid.innerHTML =
      '<div class="ui-cat-tabs">' + cats.map(function (c, i) {
        return '<button type="button" class="ui-cat' + (i === 0 ? ' on' : '') + '" data-cat="' + c.id + '" title="' + c.label + '" aria-label="' + c.label + '">' + c.tab + '</button>';
      }).join('') + '</div>' +
      '<div class="ui-cat-label">' + cats[0].label + '</div>' +
      '<div class="ui-emoji-scroll">' + cats.map(function (c, i) {
        return '<div class="ui-emoji-page' + (i === 0 ? ' on' : '') + '" data-page="' + c.id + '">' +
          c.items.map(function (em) { return '<button type="button" data-emoji="' + em + '">' + em + '</button>'; }).join('') + '</div>';
      }).join('') + '</div>';

    var pop = document.createElement('div');
    pop.className = 'ui-pop';
    pop.appendChild(bar);
    pop.appendChild(grid);
    pop.appendChild(iconRow);
    overlay.appendChild(pop);

    // seçili emoji vurgusu
    var current = readJSON(RKEY)[msgId];
    if (current) {
      var cur = pop.querySelector('[data-emoji="' + current + '"]');
      if (cur) cur.classList.add('on');
    }

    pop.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var ct = ev.target.closest('.ui-cat');
      if (ct) {
        grid.querySelectorAll('.ui-cat').forEach(function (b3) { b3.classList.toggle('on', b3 === ct); });
        grid.querySelectorAll('.ui-emoji-page').forEach(function (p2) { p2.classList.toggle('on', p2.dataset.page === ct.dataset.cat); });
        var lbl = grid.querySelector('.ui-cat-label');
        if (lbl) lbl.textContent = ct.getAttribute('title') || '';
        var sc = grid.querySelector('.ui-emoji-scroll'); if (sc) sc.scrollTop = 0;
        return;
      }
      var em = ev.target.closest('button[data-emoji]');
      if (em) { pushRecent(em.dataset.emoji); setReaction(msgId, em.dataset.emoji); closeMenu(); return; }
      if (ev.target.closest('.ui-more')) { pop.classList.toggle('grid-open'); place(); return; }

      var ib = ev.target.closest('.ui-ibtn');
      if (!ib) return;
      var act = ib.dataset.ui;
      if (act === 'copy') { if (have.copy) have.copy.click(); else { try { navigator.clipboard.writeText(text); toast('Kopyalandı'); } catch (e) {} } return; }
      if (act === 'reply') {
        var ta = document.getElementById('chatInput');
        if (ta) {
          var q = text ? text.split('\n').map(function (l) { return '> ' + l; }).join('\n') + '\n' : '';
          ta.value = q + ta.value;
          try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
          setTimeout(function () { ta.focus(); }, 100);
        }
        closeMenu(); return;
      }
      if (act === 'forward') {
        if (navigator.share && text) { navigator.share({ text: text }).catch(function () {}); }
        else { try { navigator.clipboard.writeText(text); toast('Mesaj kopyalandı (iletmek için yapıştır)'); } catch (e) {} }
        closeMenu(); return;
      }
      if (act === 'pin') {
        var p = readJSON(PKEY);
        if (p[msgId]) delete p[msgId]; else p[msgId] = 1;
        writeJSON(PKEY, p);
        paintReactions(); closeMenu(); return;
      }
      if (act === 'trash') { openDeleteCard(); }
    }, true);

    // ---- ortadaki silme kartı ----
    function openDeleteCard() {
      pop.classList.add('ui-away');
      var card = document.createElement('div');
      card.className = 'ui-dialog-wrap';
      var canAll = !!have.all;
      card.innerHTML =
        '<div class="ui-dialog">' +
          '<div class="ui-dialog-ico">' + ICONS.trash + '</div>' +
          '<div class="ui-dialog-title">Mesajı sil</div>' +
          '<div class="ui-dialog-sub">Bu mesajı nasıl silmek istersin?</div>' +
          '<button type="button" class="ui-dbtn" data-d="local">Benden sil</button>' +
          (canAll ? '<button type="button" class="ui-dbtn danger" data-d="all">Herkesten sil</button>' : '') +
          '<button type="button" class="ui-dbtn soft" data-d="archive"><span class="ui-dico">' + ICONS.archive + '</span>Sil ve arşivle</button>' +
          '<button type="button" class="ui-dbtn ghost" data-d="cancel">Vazgeç</button>' +
        '</div>';
      overlay.appendChild(card);
      requestAnimationFrame(function () { card.classList.add('open'); });
      card.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var b2 = ev.target.closest('.ui-dbtn');
        if (!b2) return;
        var d = b2.dataset.d;
        if (d === 'cancel') { closeMenu(); return; }
        if (d === 'all' && have.all) { have.all.click(); return; }
        if (d === 'archive') {
          var a = readJSON(AKEY);
          a[msgId] = { text: text, at: Date.now() };
          writeJSON(AKEY, a);
          toast('Arşivlendi ve silindi');
        }
        if (have.local) have.local.click(); else closeMenu();
      }, true);
    }

    // ---- konumlandırma: basılan noktaya göre, ekran sınırları içinde ----
    function place() {
      var host = overlay.getBoundingClientRect();
      var x0 = host.left || 0, y0 = host.top || 0;
      var vw = host.width || window.innerWidth, vh = host.height || window.innerHeight;
      var pad = 8;
      pop.style.maxWidth = Math.max(200, vw - pad * 2) + 'px';
      pop.style.maxHeight = Math.max(160, vh - pad * 2) + 'px';
      var pw = pop.offsetWidth || 300, ph = pop.offsetHeight || 120;
      var px = pressX - x0, py = pressY - y0;
      var left = Math.max(pad, Math.min(px - pw / 2, vw - pw - pad));
      var top = py - ph - 14;                        // parmağın hemen üstü
      if (top < pad) top = Math.min(py + 18, vh - ph - pad);
      pop.style.left = (x0 + left) + 'px';
      pop.style.top = (y0 + Math.max(pad, top)) + 'px';
    }
    requestAnimationFrame(function () { place(); pop.classList.add('ready'); });
    window.addEventListener('resize', place);
    window.addEventListener('orientationchange', place);


    var mo = new MutationObserver(function () {
      if (!document.body.contains(overlay)) {
        try { document.querySelectorAll('.ui-msg-focus').forEach(function (e2) { e2.classList.remove('ui-msg-focus'); }); } catch (e) {}
        window.removeEventListener('resize', place);
        window.removeEventListener('orientationchange', place);
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true });

  }

  function injectStyles() {
    if (document.getElementById('__ui_sheets_css__')) return;
    var css = [
      '.msg-action-overlay.ui-sheet{background:rgba(6,11,20,.55);backdrop-filter:none;-webkit-backdrop-filter:none;align-items:flex-start;justify-content:flex-start;}',
      '.msg-action-overlay.ui-sheet .msg-action-sheet.ui-native-hidden{display:none!important;}',
      /* ---- basılan noktada açılan kutu ---- */
      '.ui-pop{position:fixed;z-index:100001;display:flex;flex-direction:column;gap:8px;width:max-content;max-width:calc(100vw - 16px);opacity:0;transform:scale(.92);transform-origin:center bottom;transition:opacity .14s ease,transform .16s cubic-bezier(.22,1,.36,1);}',
      '.ui-pop.ready{opacity:1;transform:scale(1);}',
      '.ui-pop.ui-away{opacity:0;pointer-events:none;transform:scale(.9);}',
      '.ui-emoji-bar{display:flex;align-items:center;gap:2px;padding:5px;border-radius:99px;background:#1d2735;box-shadow:0 12px 30px rgba(0,0,0,.45);max-width:100%;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;}',
      '.ui-emoji-bar::-webkit-scrollbar{display:none;}',
      '.ui-emoji-bar .ui-em{flex:0 0 auto;border:0;background:transparent;font-size:clamp(18px,5.6vw,23px);line-height:1;padding:5px;border-radius:99px;cursor:pointer;transition:transform .12s ease,background .12s;}',
      '.ui-emoji-bar .ui-em:active{transform:scale(1.35);}',
      '.ui-emoji-bar .ui-em.on{background:rgba(59,130,246,.32);}',
      '.ui-emoji-bar .ui-more{font-size:clamp(16px,4.6vw,19px);color:#9fb0c6;font-weight:600;position:sticky;right:0;background:#1d2735;}',
      /* ---- emoji atölyesi ---- */
      '.ui-emoji-grid{display:none;flex-direction:column;gap:6px;padding:8px;border-radius:18px;background:#1d2735;box-shadow:0 12px 30px rgba(0,0,0,.45);max-width:100%;min-width:min(300px,calc(100vw - 24px));overflow:hidden;}',
      '.ui-pop.grid-open .ui-emoji-grid{display:flex;}',
      '.ui-cat-tabs{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;border-bottom:1px solid rgba(255,255,255,.07);}',
      '.ui-cat-tabs::-webkit-scrollbar{display:none;}',
      '.ui-cat{flex:1 1 0;min-width:34px;border:0;background:transparent;font-size:17px;line-height:1;padding:7px 0 8px;border-radius:10px;cursor:pointer;opacity:.55;transition:opacity .12s,background .12s;}',
      '.ui-cat.on{opacity:1;background:rgba(59,130,246,.16);}',
      '.ui-cat-label{font-size:11px;letter-spacing:.03em;text-transform:uppercase;color:rgba(232,237,245,.45);padding:0 2px;}',
      '.ui-emoji-scroll{max-height:min(42vh,220px);overflow-y:auto;-webkit-overflow-scrolling:touch;}',
      '.ui-emoji-page{display:none;grid-template-columns:repeat(auto-fill,minmax(clamp(30px,9vw,38px),1fr));gap:2px;}',
      '.ui-emoji-page.on{display:grid;}',
      '.ui-emoji-grid button[data-emoji]{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:0;background:transparent;font-size:clamp(18px,5.4vw,22px);line-height:1;border-radius:10px;cursor:pointer;}',
      '.ui-emoji-grid button[data-emoji].on,.ui-emoji-grid button[data-emoji]:active{background:rgba(59,130,246,.3);}',
      /* ---- yatay simge şeridi ---- */
      '.ui-icon-row{display:flex;align-items:center;gap:2px;padding:5px;border-radius:18px;background:#16202e;box-shadow:0 14px 34px rgba(0,0,0,.5);max-width:100%;}',
      '.ui-ibtn{flex:1 1 0;display:flex;align-items:center;justify-content:center;min-width:40px;max-width:56px;height:42px;border:0;background:transparent;border-radius:13px;color:#e8edf5;cursor:pointer;}',
      '.ui-ibtn + .ui-ibtn{position:relative;}',
      '.ui-ibtn + .ui-ibtn::before{content:"";position:absolute;left:-1px;top:9px;bottom:9px;width:1px;background:rgba(255,255,255,.08);}',

      '.ui-ibtn svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;}',
      '.ui-ibtn:active{background:rgba(255,255,255,.08);}',
      '.ui-ibtn.danger{color:#ff453a;}',
      /* ---- ortadaki silme kartı ---- */
      '.ui-dialog-wrap{position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .16s ease;}',
      '.ui-dialog-wrap.open{opacity:1;}',
      '.ui-dialog{width:100%;max-width:300px;background:#16202e;color:#e8edf5;border-radius:22px;padding:20px 16px 14px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.06);transform:translateY(10px) scale(.96);transition:transform .2s cubic-bezier(.22,1,.36,1);}',
      '.ui-dialog-wrap.open .ui-dialog{transform:none;}',
      '.ui-dialog-ico{width:46px;height:46px;margin:0 auto 10px;border-radius:99px;display:flex;align-items:center;justify-content:center;background:rgba(255,69,58,.14);color:#ff453a;}',
      '.ui-dialog-ico svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;}',
      '.ui-dialog-title{font-size:17px;font-weight:600;}',
      '.ui-dialog-sub{font-size:13px;color:rgba(232,237,245,.55);margin:4px 0 14px;}',
      '.ui-dbtn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border:0;margin-top:8px;padding:13px 14px;border-radius:14px;font-size:15px;font-weight:500;color:#e8edf5;background:rgba(255,255,255,.07);cursor:pointer;}',
      '.ui-dbtn:active{background:rgba(255,255,255,.13);}',
      '.ui-dbtn.danger{color:#ff453a;background:rgba(255,69,58,.12);}',
      '.ui-dbtn.soft{color:#7fb2ff;background:rgba(59,130,246,.12);}',
      '.ui-dbtn.ghost{background:transparent;color:rgba(232,237,245,.6);margin-top:4px;}',
      '.ui-dico{display:flex;}',
      '.ui-dico svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;}',
      /* Seçili mesaj vurgusu */
      '.ui-msg-focus{position:relative;z-index:100000;}',
      /* Tepki baloncuğu */
      '#chatMessages .msg-bubble{position:relative;}',
      '#chatMessages .msg.ui-has-reaction{margin-bottom:12px;}',
      '#chatMessages .msg.ui-has-reaction .msg-bubble{padding-bottom:16px;}',
      '.ui-reaction{position:absolute;bottom:-10px;border:2px solid rgba(0,0,0,.25);background:#1d2735;color:#e8edf5;box-shadow:0 3px 10px rgba(0,0,0,.28);border-radius:99px;padding:1px 6px;font-size:13px;line-height:1.35;cursor:pointer;z-index:2;}',
      '#chatMessages .msg:not(.msg-own) .ui-reaction{left:10px;}',
      '#chatMessages .msg.msg-own .ui-reaction{right:10px;}',
      '#chatMessages .msg.ui-pinned .msg-bubble::after{content:"📌";position:absolute;top:-8px;right:-4px;font-size:12px;}'
    ].join('\n');

    var st = document.createElement('style');
    st.id = '__ui_sheets_css__';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function watch() {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.classList && n.classList.contains('msg-action-overlay')) enhance(n);
          if (n.id === 'chatMessages' || (n.querySelector && n.querySelector('.msg[data-msg-id]')) ||
              (n.classList && n.classList.contains('msg'))) paintReactions();
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function start() { injectStyles(); watch(); paintReactions(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
