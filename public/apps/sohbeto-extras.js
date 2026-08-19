/* ============================================================
   SOHBETO EXTRAS — Adım 13
   Sohbetler ekranı başlığındaki 3 ikon + 3 tam-ekran overlay:
     - Gelen kutusu (rehberde olmayanlar) → screen-inbox
     - Telefon (son aramalar, çevrimdışı çağrı kuyruğu) → screen-calls
     - Not defteri (.gunesos/sohbeto/<num>/notes/<id>) → screen-notes
   Tüm ekranlar:
     • Tam ekran, üstte geri tuşu + başlık
     • Alt nav'a basılınca otomatik kapanır (fluid-tabs ile entegre)
     • Başlıkta okunmamış adedi 1,2,... rozet olarak görünür
   Motoru/adapter'ı kirletmez; yalnızca window.SohbetoExtras API sağlar.
   ============================================================ */
(function () {
  'use strict';
  if (window.SohbetoExtras) return;

  // ----------------- Yardımcılar -----------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtDT(ts) {
    try {
      var d = new Date(ts);
      var dd = String(d.getDate()).padStart(2, '0');
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var yy = d.getFullYear();
      var hh = String(d.getHours()).padStart(2, '0');
      var mi = String(d.getMinutes()).padStart(2, '0');
      return dd + '.' + mm + '.' + yy + ' · ' + hh + ':' + mi;
    } catch (e) { return ''; }
  }
  function fmtTime(ts) {
    try {
      var d = new Date(ts);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    } catch (e) { return ''; }
  }
  function myNumber() {
    try {
      return (window.GunesOSStore && window.GunesOSStore.__profileNumber__)
        || localStorage.getItem('sohbeto.oo.profile.number')
        || localStorage.getItem('sohbet_my_number_v1')
        || '_anon';
    } catch (e) { return '_anon'; }
  }
  function notesPath()  { return '.gunesos/sohbeto/' + myNumber() + '/notes/__index__'; }
  function notePath(id) { return '.gunesos/sohbeto/' + myNumber() + '/notes/' + id; }
  function inboxPath()  { return '.gunesos/sohbeto/' + myNumber() + '/inbox'; }
  function callsPath()  { return '.gunesos/sohbeto/' + myNumber() + '/calls'; }
  function groupsPath() { return '.gunesos/sohbeto/' + myNumber() + '/groups'; }
  function allowedKey() { return 'sohbeto.extras.allowedSenders.' + myNumber(); }

  // ----------------- ALLOWED SENDERS (rehberde olmasa da yazabilenler) -----------------
  // Kullanıcı gelen kutusundan "Yanıtla" derse, o kişiye yazma izni veririz:
  // sonraki mesajları artık gelen kutusuna düşmesin, normal sohbet açılsın.
  // Sync erişim için localStorage kullanırız; GunesOSStore'a da ayna tutarız.
  function loadAllowedSet() {
    try {
      var raw = localStorage.getItem(allowedKey());
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      return new Set(arr.map(String));
    } catch (e) { return new Set(); }
  }
  function saveAllowedSet(set) {
    try {
      localStorage.setItem(allowedKey(), JSON.stringify(Array.from(set)));
    } catch (e) {}
  }
  function addAllowedEntry(entry) {
    if (!entry) return;
    var set = loadAllowedSet();
    if (entry.connId) set.add('c:' + entry.connId);
    if (entry.number) set.add('n:' + String(entry.number).replace(/\s+/g, ''));
    saveAllowedSet(set);
  }
  function isAllowedConn(connId) {
    try {
      var set = loadAllowedSet();
      if (connId && set.has('c:' + connId)) return true;
      var num = peerNumber(connId);
      if (num && set.has('n:' + String(num).replace(/\s+/g, ''))) return true;
    } catch (e) {}
    return false;
  }

  // ----------------- CSS enjekte -----------------
  function injectCSS() {
    if (document.getElementById('__sohbeto_extras_css__')) return;
    var css = ''
      + '.hdr-icons{display:flex;align-items:center;gap:18px;}'
      + '.hdr-icon{position:relative;font-size:1.15rem;color:var(--primary-green,#0a7c4a);cursor:pointer;padding:6px;border-radius:10px;transition:background .15s;}'
      + '.hdr-icon:hover{background:rgba(10,124,74,.08);}'
      + '.hdr-icon:active{transform:scale(.94);}'
      + '.hdr-badge{position:absolute;top:-2px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--primary-green,#0f766e);color:#fff;font-size:.62rem;font-weight:800;display:none;align-items:center;justify-content:center;line-height:1;box-shadow:0 2px 6px color-mix(in srgb, var(--primary-green,#0f766e) 45%, transparent);}'
      + '.hdr-badge.show{display:inline-flex;}'
      // Tam ekran overlay
      + '.fs-screen{position:absolute;inset:0;z-index:80;background:var(--bg-white,#fff);display:flex;flex-direction:column;opacity:0;visibility:hidden;pointer-events:none;transform:none;transition:opacity .12s ease,visibility 0s linear .12s;}'
      + '.fs-screen.active{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition:opacity .12s ease,visibility 0s;}'
      + '.fs-header{display:flex;align-items:center;gap:12px;padding:14px 16px;padding-top:max(14px,env(safe-area-inset-top));background:var(--bg-white,#fff);border-bottom:1px solid var(--border-light,#e5e7eb);min-height:54px;}'
      + '.fs-header .fs-back{font-size:1.1rem;color:var(--text-main,#111);cursor:pointer;padding:6px 10px;border-radius:10px;}'
      + '.fs-header .fs-back:hover{background:rgba(0,0,0,.05);}'
      + '.fs-header .fs-title{font-size:1.05rem;font-weight:700;flex:1;}'
      + '.fs-header .fs-action{font-size:1rem;color:var(--primary-green,#0a7c4a);cursor:pointer;padding:6px 10px;border-radius:10px;font-weight:600;}'
      + '.fs-header .fs-action:hover{background:rgba(10,124,74,.08);}'
      + '.fs-body{flex:1;overflow-y:auto;padding:12px 14px 96px;}'
      + '.fs-empty{text-align:center;color:var(--text-secondary,#6b7280);font-size:.88rem;padding:60px 20px;line-height:1.6;}'
      + '.fs-empty .fs-empty-ico{font-size:2.4rem;color:#cbd5e1;margin-bottom:14px;}'
      // Notlar kartı
      + '.note-card{display:flex;flex-direction:column;gap:6px;padding:14px 16px;margin:8px 0;border-radius:16px;background:#fff;border:1px solid rgba(0,0,0,.06);box-shadow:0 4px 10px rgba(15,23,42,.05);cursor:pointer;transition:transform .15s,box-shadow .15s;}'
      + '.note-card:hover{box-shadow:0 8px 18px rgba(15,23,42,.09);}'
      + '.note-card:active{transform:scale(.99);}'
      + '.note-card .nc-title{font-size:.95rem;font-weight:700;color:var(--text-main,#111);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.note-card .nc-snip{font-size:.8rem;color:var(--text-secondary,#6b7280);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}'
      + '.note-card .nc-meta{display:flex;justify-content:space-between;align-items:center;font-size:.7rem;color:#9ca3af;margin-top:4px;}'
      + '.note-card .nc-del{color:#ef4444;font-size:.85rem;padding:4px 8px;border-radius:8px;}'
      + '.note-card .nc-del:hover{background:rgba(239,68,68,.1);}'
      // Not editör
      + '.note-editor{display:flex;flex-direction:column;flex:1;}'
      + '.note-editor input.ne-title{border:none;outline:none;font-size:1.1rem;font-weight:700;padding:14px 18px;background:transparent;color:var(--text-main,#111);}'
      + '.note-editor textarea.ne-body{flex:1;border:none;outline:none;resize:none;padding:0 18px 24px;font-size:.95rem;line-height:1.55;background:transparent;color:var(--text-main,#111);font-family:inherit;}'
      + '.note-editor .ne-meta{padding:4px 18px 8px;font-size:.7rem;color:#9ca3af;border-bottom:1px solid var(--border-light,#e5e7eb);}'
      // Aramalar/Inbox listesi
      + '.list-row{display:flex;align-items:center;gap:12px;padding:12px 14px;margin:6px 0;border-radius:14px;background:#fff;border:1px solid rgba(0,0,0,.05);box-shadow:0 3px 8px rgba(15,23,42,.04);cursor:pointer;transition:background .15s;}'
      + '.list-row:hover{background:#f9fafb;}'
      + '.list-row .lr-avatar{width:42px;height:42px;border-radius:14px;flex:0 0 42px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;background:linear-gradient(135deg,#0a7c4a,#12b981);color:#fff;}'
      + '.list-row .lr-avatar.danger{background:linear-gradient(135deg,#ef4444,#f97316);}'
      + '.list-row .lr-avatar.muted{background:linear-gradient(135deg,#94a3b8,#64748b);}'
      + '.list-row .lr-info{flex:1;min-width:0;}'
      + '.list-row .lr-name{font-size:.92rem;font-weight:700;color:var(--text-main,#111);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      + '.list-row .lr-sub{font-size:.76rem;color:var(--text-secondary,#6b7280);margin-top:2px;}'
      + '.list-row .lr-meta{font-size:.68rem;color:#9ca3af;white-space:nowrap;}'
      // FAB
      + '.fs-fab{position:absolute;right:18px;bottom:84px;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,var(--primary-green,#0a7c4a),#12b981);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4rem;box-shadow:0 10px 24px rgba(10,124,74,.35);cursor:pointer;border:none;z-index:5;}'
      + '.fs-fab:active{transform:scale(.92);}'
      // Inbox action buttons
      + '.lr-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}'
      + '.lr-act{font-size:.72rem;font-weight:600;padding:6px 10px;border-radius:999px;border:1px solid var(--primary-green,#0a7c4a);background:#fff;color:var(--primary-green,#0a7c4a);cursor:pointer;line-height:1;}'
      + '.lr-act:hover{background:color-mix(in srgb, var(--primary-green,#0a7c4a) 10%, #fff);}'
      + '.lr-act.primary{background:linear-gradient(135deg,var(--primary-green,#0a7c4a),#12b981);color:#fff;border-color:transparent;}'
      + '.lr-act.danger{color:#ef4444;border-color:#ef4444;}'
      + '.lr-act.danger:hover{background:rgba(239,68,68,.08);}'
      + '.list-row.inbox-row{flex-direction:column;align-items:stretch;}'
      + '.list-row.inbox-row .lr-top{display:flex;align-items:center;gap:12px;width:100%;}'
      // Group cards
      + '.group-card{display:flex;align-items:center;gap:12px;padding:14px 14px;margin:8px 0;border-radius:16px;background:#fff;border:1px solid rgba(0,0,0,.06);box-shadow:0 4px 10px rgba(15,23,42,.05);cursor:pointer;}'
      + '.group-card .gc-ic{width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.1rem;background:linear-gradient(135deg,var(--primary-green,#0a7c4a),#12b981);}'
      + '.group-card .gc-info{flex:1;min-width:0;}'
      + '.group-card .gc-name{font-size:.95rem;font-weight:700;color:var(--text-main,#111);}'
      + '.group-card .gc-sub{font-size:.75rem;color:var(--text-secondary,#6b7280);margin-top:2px;}'
      + '.group-card .gc-del{color:#ef4444;padding:6px 10px;border-radius:10px;font-size:.85rem;}'
      // Create-group modal
      + '.cg-list{display:flex;flex-direction:column;gap:6px;margin:8px 0 14px;}'
      + '.cg-row{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:12px;cursor:pointer;}'
      + '.cg-row.checked{border-color:var(--primary-green,#0a7c4a);background:color-mix(in srgb, var(--primary-green,#0a7c4a) 8%, #fff);}'
      + '.cg-row .cg-av{width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,#0a7c4a,#12b981);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex:0 0 36px;}'
      + '.cg-row .cg-nm{flex:1;font-size:.9rem;color:var(--text-main,#111);font-weight:600;}'
      + '.cg-row .cg-num{font-size:.72rem;color:var(--text-secondary,#6b7280);}'
      + '.cg-row .cg-ck{width:22px;height:22px;border-radius:50%;border:2px solid #cbd5e1;display:flex;align-items:center;justify-content:center;color:#fff;flex:0 0 22px;}'
      + '.cg-row.checked .cg-ck{background:var(--primary-green,#0a7c4a);border-color:var(--primary-green,#0a7c4a);}'
      + '.cg-name-input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--border-light,#e5e7eb);font-size:.95rem;outline:none;background:#fff;color:var(--text-main,#111);margin-bottom:6px;}'
      + '.cg-name-input:focus{border-color:var(--primary-green,#0a7c4a);}'
      + '.cg-save{display:block;width:100%;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--primary-green,#0a7c4a),#12b981);color:#fff;font-weight:700;font-size:.95rem;cursor:pointer;margin-top:8px;}'
      + '.cg-save:disabled{opacity:.5;cursor:not-allowed;}'
      ;
    var s = document.createElement('style');
    s.id = '__sohbeto_extras_css__';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ----------------- DOM: ekranları enjekte et -----------------
  function injectScreens() {
    var app = document.querySelector('.app-container') || document.body;
    if (!document.getElementById('screen-notes')) {
      var n = document.createElement('div');
      n.id = 'screen-notes';
      n.className = 'fs-screen';
      n.innerHTML =
        '<div class="fs-header">' +
        '  <div class="fs-back" data-fs-close="screen-notes" aria-label="Geri"><i class="fa-solid fa-arrow-left"></i></div>' +
        '  <div class="fs-title">Not Defteri</div>' +
        '  <div class="fs-action" id="notes-new-btn"><i class="fa-regular fa-pen-to-square"></i></div>' +
        '</div>' +
        '<div class="fs-body" id="notes-body"></div>' +
        '<div id="note-editor-wrap" style="display:none;position:absolute;inset:0;background:var(--bg-white,#fff);z-index:6;flex-direction:column;">' +
        '  <div class="fs-header">' +
        '    <div class="fs-back" id="note-editor-back" aria-label="Geri"><i class="fa-solid fa-arrow-left"></i></div>' +
        '    <div class="fs-title">Not</div>' +
        '    <div class="fs-action" id="note-editor-save">Kaydet</div>' +
        '  </div>' +
        '  <div class="note-editor" style="flex:1;display:flex;flex-direction:column;">' +
        '    <input class="ne-title" id="ne-title" placeholder="Başlık" maxlength="120">' +
        '    <div class="ne-meta" id="ne-meta">—</div>' +
        '    <textarea class="ne-body" id="ne-body" placeholder="Notunu buraya yaz…"></textarea>' +
        '  </div>' +
        '</div>';
      app.appendChild(n);
    }
    if (!document.getElementById('screen-calls')) {
      var c = document.createElement('div');
      c.id = 'screen-calls';
      c.className = 'fs-screen';
      c.innerHTML =
        '<div class="fs-header">' +
        '  <div class="fs-back" data-fs-close="screen-calls" aria-label="Geri"><i class="fa-solid fa-arrow-left"></i></div>' +
        '  <div class="fs-title">Aramalar</div>' +
        '  <div class="fs-action" id="calls-clear-btn" title="Temizle"><i class="fa-regular fa-trash-can"></i></div>' +
        '</div>' +
        '<div class="fs-body" id="calls-body"></div>';
      app.appendChild(c);
    }
    if (!document.getElementById('screen-inbox')) {
      var i = document.createElement('div');
      i.id = 'screen-inbox';
      i.className = 'fs-screen';
      i.innerHTML =
        '<div class="fs-header">' +
        '  <div class="fs-back" data-fs-close="screen-inbox" aria-label="Geri"><i class="fa-solid fa-arrow-left"></i></div>' +
        '  <div class="fs-title">Gelen Kutusu</div>' +
        '  <div class="fs-action" id="inbox-clear-btn" title="Temizle"><i class="fa-regular fa-trash-can"></i></div>' +
        '</div>' +
        '<div class="fs-body" id="inbox-body"></div>';
      app.appendChild(i);
    }
    if (!document.getElementById('screen-create-group')) {
      var g = document.createElement('div');
      g.id = 'screen-create-group';
      g.className = 'fs-screen';
      g.innerHTML =
        '<div class="fs-header">' +
        '  <div class="fs-back" data-fs-close="screen-create-group" aria-label="Geri"><i class="fa-solid fa-arrow-left"></i></div>' +
        '  <div class="fs-title">Yeni Grup</div>' +
        '</div>' +
        '<div class="fs-body" id="cg-body">' +
        '  <input id="cg-name" class="cg-name-input" placeholder="Grup adı" maxlength="60">' +
        '  <div style="font-size:.78rem;color:var(--text-secondary,#6b7280);margin:6px 2px 4px;">Davet edilecek kişiler</div>' +
        '  <div class="cg-list" id="cg-list"></div>' +
        '  <button class="cg-save" id="cg-save">Grubu Oluştur</button>' +
        '</div>';
      app.appendChild(g);
    }
  }

  // ----------------- Sohbetler başlığı: 3 ikon -----------------
  function injectHeaderIcons() {
    var screen = document.getElementById('screen-sohbetler');
    if (!screen) return;
    var header = screen.querySelector('.main-header');
    if (!header || header.dataset.extrasInjected === '1') return;
    var old = header.querySelector('.header-icon');
    if (old) old.remove();
    var box = document.createElement('div');
    box.className = 'hdr-icons';
    box.innerHTML =
      '<div class="hdr-icon" id="hdr-inbox" title="Gelen Kutusu" aria-label="Gelen Kutusu">' +
      '  <i class="fa-regular fa-envelope"></i>' +
      '  <span class="hdr-badge" id="hdr-inbox-badge">0</span>' +
      '</div>' +
      '<div class="hdr-icon" id="hdr-calls" title="Aramalar" aria-label="Aramalar">' +
      '  <i class="fa-solid fa-phone"></i>' +
      '  <span class="hdr-badge" id="hdr-calls-badge">0</span>' +
      '</div>' +
      '<div class="hdr-icon" id="hdr-notes" title="Not Defteri" aria-label="Not Defteri">' +
      '  <i class="fa-regular fa-pen-to-square"></i>' +
      '</div>';
    header.appendChild(box);
    header.dataset.extrasInjected = '1';

    // NOT: Doğrudan addEventListener yerine document seviyesinde delegation
    // kullanıyoruz (aşağıda bindGlobalHeaderDelegation). Böylece motor/adapter
    // header'ı yeniden çizse bile basışlar her zaman çalışır.
  }

  // Global delegation: hdr-inbox/calls/notes hangi anda enjekte edilirse edilsin çalışır
  function bindGlobalHeaderDelegation() {
    if (document.__sohbetoExtrasHeaderDeleg) return;
    document.__sohbetoExtrasHeaderDeleg = true;
    document.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest && ev.target.closest('#hdr-inbox,#hdr-calls,#hdr-notes,#hdr-create-group,#btn-create-group');
      if (!t) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (t.id === 'hdr-inbox') { openScreen('screen-inbox'); renderInbox(); }
      else if (t.id === 'hdr-calls') { openScreen('screen-calls'); renderCalls(); }
      else if (t.id === 'hdr-notes') { openScreen('screen-notes'); renderNotes(); }
      else if (t.id === 'hdr-create-group' || t.id === 'btn-create-group') { openCreateGroup(); }
    }, true); // capture: fluid-tabs gesture katmanından önce yakala
    // Geri butonları için de delegation
    document.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest('[data-fs-close]');
      if (!b) return;
      ev.preventDefault();
      ev.stopPropagation();
      closeScreen(b.getAttribute('data-fs-close'));
    }, true);
  }

  // ----------------- Ekran aç/kapat -----------------
  function openScreen(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden-screen');
    el.classList.add('active');
  }
  function closeScreen(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    el.classList.add('hidden-screen');
    // Not editör açıksa onu da kapat
    if (id === 'screen-notes') {
      var ed = document.getElementById('note-editor-wrap');
      if (ed) ed.style.display = 'none';
    }
  }
  function closeAllFsScreens() {
    ['screen-inbox', 'screen-calls', 'screen-notes', 'screen-create-group'].forEach(closeScreen);
  }

  // ----------------- NOTLAR -----------------
  // Index: { ids: [string], byId: { id: { id, title, snip, createdAt, updatedAt } } }
  function loadNotesIndex() {
    if (!window.GunesOSStore) return Promise.resolve({ ids: [], byId: {} });
    return window.GunesOSStore.get(notesPath()).then(function (v) {
      if (v && v.ids && v.byId) return v;
      return { ids: [], byId: {} };
    });
  }
  function saveNotesIndex(idx) {
    if (!window.GunesOSStore) return Promise.resolve(false);
    return window.GunesOSStore.set(notesPath(), idx);
  }
  function loadNote(id) {
    if (!window.GunesOSStore) return Promise.resolve(null);
    return window.GunesOSStore.get(notePath(id));
  }
  function saveNote(note) {
    if (!window.GunesOSStore) return Promise.resolve(false);
    return window.GunesOSStore.set(notePath(note.id), note);
  }
  function deleteNote(id) {
    if (!window.GunesOSStore) return Promise.resolve(false);
    return window.GunesOSStore.del(notePath(id)).then(function () {
      return loadNotesIndex();
    }).then(function (idx) {
      idx.ids = idx.ids.filter(function (x) { return x !== id; });
      delete idx.byId[id];
      return saveNotesIndex(idx);
    });
  }

  var _editingNote = null;
  function renderNotes() {
    var body = document.getElementById('notes-body');
    if (!body) return;
    body.innerHTML = '<div class="fs-empty"><div class="fs-empty-ico"><i class="fa-regular fa-clock"></i></div>Yükleniyor…</div>';
    loadNotesIndex().then(function (idx) {
      if (!idx.ids.length) {
        body.innerHTML =
          '<div class="fs-empty">' +
          '  <div class="fs-empty-ico"><i class="fa-regular fa-note-sticky"></i></div>' +
          '  Henüz notun yok.<br>' +
          '  Sağ üstteki <b><i class="fa-regular fa-pen-to-square"></i></b> ile yeni not ekleyebilirsin.' +
          '</div>';
        return;
      }
      var html = '';
      idx.ids.slice().sort(function (a, b) {
        var na = idx.byId[a], nb = idx.byId[b];
        return (nb && nb.updatedAt || 0) - (na && na.updatedAt || 0);
      }).forEach(function (id) {
        var n = idx.byId[id];
        if (!n) return;
        html += '<div class="note-card" data-note-id="' + escapeHtml(id) + '">' +
                '  <div class="nc-title">' + escapeHtml(n.title || '(Başlıksız)') + '</div>' +
                '  <div class="nc-snip">' + escapeHtml(n.snip || '') + '</div>' +
                '  <div class="nc-meta">' +
                '    <span>' + fmtDT(n.updatedAt || n.createdAt) + '</span>' +
                '    <span class="nc-del" data-del-id="' + escapeHtml(id) + '"><i class="fa-regular fa-trash-can"></i></span>' +
                '  </div>' +
                '</div>';
      });
      body.innerHTML = html;
      body.querySelectorAll('.note-card').forEach(function (card) {
        card.addEventListener('click', function (e) {
          var delTarget = e.target.closest('[data-del-id]');
          if (delTarget) {
            e.stopPropagation();
            var did = delTarget.getAttribute('data-del-id');
            if (confirm('Bu notu silmek istiyor musun?')) {
              deleteNote(did).then(renderNotes);
            }
            return;
          }
          var nid = card.getAttribute('data-note-id');
          loadNote(nid).then(function (n) {
            if (n) openNoteEditor(n);
          });
        });
      });
    });
  }

  function openNoteEditor(note) {
    _editingNote = note || {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      title: '',
      body: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    var wrap = document.getElementById('note-editor-wrap');
    var ti = document.getElementById('ne-title');
    var bo = document.getElementById('ne-body');
    var meta = document.getElementById('ne-meta');
    if (!wrap) return;
    ti.value = _editingNote.title || '';
    bo.value = _editingNote.body || '';
    meta.textContent = _editingNote.createdAt
      ? ('Oluşturma: ' + fmtDT(_editingNote.createdAt) +
         (_editingNote.updatedAt && _editingNote.updatedAt !== _editingNote.createdAt
            ? '   ·   Son değişiklik: ' + fmtDT(_editingNote.updatedAt) : ''))
      : '—';
    wrap.style.display = 'flex';
    setTimeout(function () { ti.focus(); }, 50);
  }
  function closeNoteEditor() {
    var wrap = document.getElementById('note-editor-wrap');
    if (wrap) wrap.style.display = 'none';
    _editingNote = null;
  }
  function saveCurrentNote() {
    if (!_editingNote) return;
    var ti = document.getElementById('ne-title');
    var bo = document.getElementById('ne-body');
    var title = (ti.value || '').trim();
    var body  = (bo.value || '').trim();
    if (!title && !body) { closeNoteEditor(); return; }
    _editingNote.title = title || '(Başlıksız)';
    _editingNote.body  = body;
    _editingNote.updatedAt = Date.now();
    var snip = body.split('\n').slice(0, 2).join(' ').slice(0, 140);
    var copy = _editingNote;
    saveNote(copy).then(function () {
      return loadNotesIndex();
    }).then(function (idx) {
      if (!idx.byId[copy.id]) idx.ids.push(copy.id);
      idx.byId[copy.id] = {
        id: copy.id,
        title: copy.title,
        snip: snip,
        createdAt: copy.createdAt,
        updatedAt: copy.updatedAt,
      };
      return saveNotesIndex(idx);
    }).then(function () {
      closeNoteEditor();
      renderNotes();
    });
  }

  // ----------------- ARAMALAR -----------------
  // Kaynak: localStorage'daki "oo_offline_call_queue_v1__*" (adapter) +
  // ileride buradan zenginleştirilen ek aramalar (.gunesos/.../calls)
  function loadOfflineCallsFromAdapter() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('oo_offline_call_queue_v1__') === 0) {
          try {
            var arr = JSON.parse(localStorage.getItem(k) || '[]');
            if (Array.isArray(arr)) arr.forEach(function (x) { out.push(x); });
          } catch (e) {}
        }
      }
    } catch (e) {}
    return out;
  }
  function loadCallsLog() {
    if (!window.GunesOSStore) return Promise.resolve([]);
    return window.GunesOSStore.get(callsPath()).then(function (v) {
      return Array.isArray(v) ? v : [];
    });
  }
  function clearCallsLog() {
    if (!window.GunesOSStore) return Promise.resolve(false);
    return window.GunesOSStore.set(callsPath(), []);
  }
  function renderCalls() {
    var body = document.getElementById('calls-body');
    if (!body) return;
    var fromAdapter = loadOfflineCallsFromAdapter();
    loadCallsLog().then(function (extra) {
      var all = fromAdapter.concat(extra).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      if (!all.length) {
        body.innerHTML =
          '<div class="fs-empty">' +
          '  <div class="fs-empty-ico"><i class="fa-solid fa-phone"></i></div>' +
          '  Henüz arama yok.<br>' +
          '  Çevrimdışıyken seni arayanlar burada listelenir.' +
          '</div>';
        markCallsSeen();
        updateBadges();
        return;
      }
      var html = '';
      all.forEach(function (c) {
        var name = c.name || c.number || 'Bilinmeyen';
        var kind = c.kind === 'video' ? 'Görüntülü arama' : 'Sesli arama';
        var initials = (name.match(/[A-Za-zÇĞİÖŞÜçğıöşü0-9]/) || [name.charAt(0) || '?'])[0].toUpperCase();
        html += '<div class="list-row">' +
                '  <div class="lr-avatar danger"><i class="fa-solid fa-phone-slash"></i></div>' +
                '  <div class="lr-info">' +
                '    <div class="lr-name">' + escapeHtml(name) + '</div>' +
                '    <div class="lr-sub">Cevapsız · ' + escapeHtml(kind) + '</div>' +
                '  </div>' +
                '  <div class="lr-meta">' + fmtDT(c.ts || Date.now()) + '</div>' +
                '</div>';
      });
      body.innerHTML = html;
      markCallsSeen();
      updateBadges();
    });
  }

  // ----------------- GELEN KUTUSU (rehberde olmayanlar) -----------------
  function loadInbox() {
    if (!window.GunesOSStore) return Promise.resolve([]);
    return window.GunesOSStore.get(inboxPath()).then(function (v) {
      return Array.isArray(v) ? v : [];
    });
  }
  function saveInbox(arr) {
    if (!window.GunesOSStore) return Promise.resolve(false);
    return window.GunesOSStore.set(inboxPath(), arr);
  }
  function appendInbox(entry) {
    return loadInbox().then(function (arr) {
      arr.unshift(Object.assign({ ts: Date.now(), seen: false }, entry || {}));
      // En fazla son 200 kayıt
      if (arr.length > 200) arr = arr.slice(0, 200);
      return saveInbox(arr);
    });
  }
  function renderInbox() {
    var body = document.getElementById('inbox-body');
    if (!body) return;
    loadInbox().then(function (arr) {
      if (!arr.length) {
        body.innerHTML =
          '<div class="fs-empty">' +
          '  <div class="fs-empty-ico"><i class="fa-regular fa-envelope"></i></div>' +
          '  Gelen kutun boş.<br>' +
          '  Rehberinde olmayan kişilerden gelen mesaj ve arama istekleri burada görünür.' +
          '</div>';
        markInboxSeen();
        updateBadges();
        return;
      }
      var html = '';
      arr.forEach(function (e, idx) {
        var name = e.name || e.number || 'Bilinmeyen';
        var isGroup = e.kind === 'group_invite';
        var sub;
        if (isGroup) sub = 'Grup daveti: ' + (e.groupName || e.groupId || '');
        else if (e.kind === 'call') sub = (e.callType === 'video' ? 'Görüntülü arama' : 'Sesli arama') + ' isteği';
        else sub = e.text || 'Mesaj';
        var icon = isGroup ? 'fa-solid fa-users' : (e.kind === 'call' ? 'fa-solid fa-phone' : 'fa-regular fa-envelope');
        var sub2 = e.number ? ('<div class="lr-sub" style="opacity:.7;font-size:.7rem">' + escapeHtml(e.number) + '</div>') : '';
        var actions = '';
        if (isGroup) {
          actions =
            '<button class="lr-act primary" data-act="join-group" data-idx="' + idx + '"><i class="fa-solid fa-check"></i> Katıl</button>' +
            '<button class="lr-act danger" data-act="delete" data-idx="' + idx + '">Reddet</button>';
        } else if (e.kind === 'call') {
          actions =
            '<button class="lr-act primary" data-act="call-back" data-idx="' + idx + '"><i class="fa-solid fa-phone"></i> Geri ara</button>' +
            (e.number ? '<button class="lr-act" data-act="add-contact" data-idx="' + idx + '"><i class="fa-solid fa-user-plus"></i> Kişi ekle</button>' : '') +
            '<button class="lr-act danger" data-act="delete" data-idx="' + idx + '">Sil</button>';
        } else {
          actions =
            '<button class="lr-act primary" data-act="reply" data-idx="' + idx + '"><i class="fa-solid fa-reply"></i> Yanıtla</button>' +
            (e.number ? '<button class="lr-act" data-act="add-contact" data-idx="' + idx + '"><i class="fa-solid fa-user-plus"></i> Kişi ekle</button>' : '') +
            '<button class="lr-act danger" data-act="delete" data-idx="' + idx + '">Sil</button>';
        }
        html += '<div class="list-row inbox-row" data-idx="' + idx + '">' +
                '  <div class="lr-top">' +
                '    <div class="lr-avatar muted"><i class="' + icon + '"></i></div>' +
                '    <div class="lr-info">' +
                '      <div class="lr-name">' + escapeHtml(name) + '</div>' +
                '      <div class="lr-sub">' + escapeHtml(sub) + '</div>' +
                       sub2 +
                '    </div>' +
                '    <div class="lr-meta">' + fmtDT(e.ts || Date.now()) + '</div>' +
                '  </div>' +
                '  <div class="lr-actions">' + actions + '</div>' +
                '</div>';
      });
      body.innerHTML = html;
      bindInboxActions(arr);
      markInboxSeen();
      updateBadges();
    });
  }

  function bindInboxActions(arr) {
    var body = document.getElementById('inbox-body');
    if (!body || body.__actBound) {
      body && (body.__currentInbox = arr);
      return;
    }
    body.__actBound = true;
    body.__currentInbox = arr;
    body.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest('[data-act]');
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      var act = btn.getAttribute('data-act');
      var idx = parseInt(btn.getAttribute('data-idx'), 10);
      var list = body.__currentInbox || [];
      var entry = list[idx];
      if (!entry) return;
      if (act === 'delete') return removeInboxAt(idx);
      if (act === 'add-contact') return openAddContactWith(entry);
      if (act === 'call-back') return callBackEntry(entry);
      if (act === 'reply') return replyEntry(entry);
      if (act === 'join-group') return joinGroupFromInvite(entry, idx);
    });
  }

  function removeInboxAt(idx) {
    return loadInbox().then(function (arr) {
      arr.splice(idx, 1);
      return saveInbox(arr);
    }).then(renderInbox);
  }

  function openAddContactWith(entry) {
    try {
      if (typeof window.openAddContact === 'function') window.openAddContact();
      setTimeout(function () {
        var n = document.getElementById('newContactName');
        var p = document.getElementById('newContactPhone');
        if (n && entry.name && entry.name !== entry.number) n.value = entry.name;
        if (p && entry.number) p.value = entry.number;
      }, 60);
    } catch (e) { console.warn('[extras] openAddContact hata', e); }
  }

  function callBackEntry(entry) {
    try {
      closeAllFsScreens();
      if (entry.number && typeof window.openContactByNumber === 'function') {
        window.openContactByNumber(entry.number);
      } else if (entry.connId && typeof window.openChat === 'function') {
        window.openChat(entry.connId);
      }
      setTimeout(function () {
        try {
          if (entry.callType === 'video' && typeof window.chatVideo === 'function') window.chatVideo();
          else if (typeof window.chatCall === 'function') window.chatCall();
        } catch (e) {}
      }, 350);
    } catch (e) { console.warn('[extras] callBack hata', e); }
  }

  function replyEntry(entry) {
    try {
      // Kullanıcı yanıt veriyor → bu kişiye yazma izni ver.
      // Bundan sonra gönderdiği mesajlar gelen kutusuna düşmeyecek, normal
      // sohbet ekranında görünecek (rehbere eklenmesi gerekmez).
      addAllowedEntry(entry);
      closeAllFsScreens();
      if (entry.number && typeof window.openContactByNumber === 'function') {
        window.openContactByNumber(entry.number);
      } else if (entry.connId && typeof window.openChat === 'function') {
        window.openChat(entry.connId);
      }
    } catch (e) {}
  }
  function markInboxSeen() {
    loadInbox().then(function (arr) {
      var changed = false;
      arr.forEach(function (e) { if (!e.seen) { e.seen = true; changed = true; } });
      if (changed) saveInbox(arr);
    });
  }
  function markCallsSeen() {
    // Adapter'ın kuyruğunu silmiyoruz; sadece "görüldü" damgası
    try { localStorage.setItem('sohbeto.extras.callsSeenTs', String(Date.now())); } catch (e) {}
  }

  // ----------------- ROZET GÜNCELLE -----------------
  function updateBadges() {
    // Inbox: seen=false kayıt sayısı
    loadInbox().then(function (arr) {
      var n = arr.filter(function (e) { return !e.seen; }).length;
      var el = document.getElementById('hdr-inbox-badge');
      if (!el) return;
      el.textContent = n > 9 ? '9+' : String(n);
      el.classList.toggle('show', n > 0);
    });
    // Calls: son görülme tarihinden sonraki kayıtların sayısı
    var seenTs = 0;
    try { seenTs = parseInt(localStorage.getItem('sohbeto.extras.callsSeenTs') || '0', 10) || 0; } catch (e) {}
    var calls = loadOfflineCallsFromAdapter();
    var unread = calls.filter(function (c) { return (c.ts || 0) > seenTs; }).length;
    var cb = document.getElementById('hdr-calls-badge');
    if (cb) {
      cb.textContent = unread > 9 ? '9+' : String(unread);
      cb.classList.toggle('show', unread > 0);
    }
  }

  // ----------------- Alt nav entegrasyonu -----------------
  // Fluid-tabs alt nav'a basılınca closeSettingsSubscreens çağırıyor; biz de
  // window.app.navigate'ı sarmalayıp bu 3 ekranı da kapatalım.
  function wrapNavigate() {
    if (!window.app || typeof window.app.navigate !== 'function') {
      setTimeout(wrapNavigate, 200); return;
    }
    if (window.app.__extrasWrapped__) return;
    var orig = window.app.navigate;
    window.app.navigate = function () {
      closeAllFsScreens();
      return orig.apply(this, arguments);
    };
    window.app.__extrasWrapped__ = true;
  }

  // ----------------- Bağlayıcılar -----------------
  function bind() {
    // Yeni not
    var nb = document.getElementById('notes-new-btn');
    if (nb && !nb.__bound) { nb.__bound = 1; nb.addEventListener('click', function () { openNoteEditor(null); }); }
    var nbk = document.getElementById('note-editor-back');
    if (nbk && !nbk.__bound) { nbk.__bound = 1; nbk.addEventListener('click', saveCurrentNote); }
    var nsv = document.getElementById('note-editor-save');
    if (nsv && !nsv.__bound) { nsv.__bound = 1; nsv.addEventListener('click', saveCurrentNote); }
    var cc  = document.getElementById('calls-clear-btn');
    if (cc && !cc.__bound) {
      cc.__bound = 1;
      cc.addEventListener('click', function () {
        if (!confirm('Arama geçmişini temizlemek istiyor musun?')) return;
        try {
          for (var i = localStorage.length - 1; i >= 0; i--) {
            var k = localStorage.key(i);
            if (k && k.indexOf('oo_offline_call_queue_v1__') === 0) localStorage.removeItem(k);
          }
        } catch (e) {}
        clearCallsLog().then(renderCalls);
      });
    }
    var ic  = document.getElementById('inbox-clear-btn');
    if (ic && !ic.__bound) {
      ic.__bound = 1;
      ic.addEventListener('click', function () {
        if (!confirm('Gelen kutusunu temizlemek istiyor musun?')) return;
        saveInbox([]).then(renderInbox);
      });
    }
    // Tüm fs-back butonları
    document.querySelectorAll('[data-fs-close]').forEach(function (b) {
      if (b.__bound) return; b.__bound = 1;
      b.addEventListener('click', function () { closeScreen(b.getAttribute('data-fs-close')); });
    });
  }

  // ----------------- INBOX SESİ (okyanus dalgası) -----------------
  // Tanıdık olmayanlardan gelen mesaj/aramaları normal beep yerine üç-notalık
  // yumuşak bir "okyanus" tonu ile çalarız — kullanıcı sesten anlasın.
  function playInboxChime() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var notes = [523.25, 392.00, 659.25]; // C5, G4, E5
      notes.forEach(function (f, i) {
        var t0 = ctx.currentTime + i * 0.14;
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + 0.5);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1200);
    } catch (e) {}
  }

  // ----------------- TANIMA: connId rehberde mi? -----------------
  function isKnownConn(connId) {
    try {
      if (typeof getContactByConnId === 'function') {
        if (getContactByConnId(connId)) return true;
      }
      if (typeof contactsState !== 'undefined' && contactsState && contactsState.byNumber) {
        var found = false;
        contactsState.byNumber.forEach(function (c) {
          if (!found && c && c.connId === connId) found = true;
        });
        if (found) return true;
      }
    } catch (e) {}
    return false;
  }
  function peerDisplayName(connId) {
    try { if (typeof getDisplayName === 'function') return getDisplayName(connId); } catch (e) {}
    return connId;
  }
  function peerNumber(connId) {
    try {
      var n = peerDisplayName(connId);
      var m = String(n || '').match(/\[(.*?)\]/);
      if (m && m[1]) return m[1];
    } catch (e) {}
    return '';
  }

  // ----------------- ENGINE WRAP: incoming msg/call → inbox -----------------
  function wrapEngineHooks() {
    // ----- ortak yardımcı: bilinmeyen aramayı sessizce kapat -----
    function rejectUnknownCall(senderConnId, type) {
      try {
        if (typeof sendCallSignal === 'function') {
          sendCallSignal(senderConnId, 'CALL_REJECT');
        } else if (typeof window.sendCallSignal === 'function') {
          window.sendCallSignal(senderConnId, 'CALL_REJECT');
        }
      } catch (e) {}
      try {
        if (typeof state !== 'undefined' && state) {
          state.incomingCallFrom = null;
          state.incomingCallType = 'audio';
        }
      } catch (e) {}
      // Görüntülü aramada arayan, CALL_RING_VIDEO öncesinde OFFER ile
      // video tracklerini gönderebiliyor; bunlar bizde #videoRemote'a takılmadan
      // peer'in tüm gelen tracklerini durdurup video elementini de söndürelim.
      try {
        var peer = (typeof peers !== 'undefined' ? peers : (window.peers || {}))[senderConnId];
        if (peer && peer.pc) {
          try {
            peer.pc.getReceivers().forEach(function (r) {
              try { if (r.track) r.track.stop(); } catch (e) {}
            });
          } catch (e) {}
        }
      } catch (e) {}
      try {
        var vRemote = document.getElementById('videoRemote');
        if (vRemote) {
          var ve = vRemote.querySelector('video');
          if (ve) { try { ve.pause(); } catch (e) {} ve.srcObject = null; ve.remove(); }
        }
        var vc = document.getElementById('videoContainer');
        if (vc) vc.classList.remove('active');
        var cs = document.getElementById('callScreen');
        if (cs) cs.classList.add('hidden');
      } catch (e) {}
      // Üst kabuğun (GunesOS) "Görüntülü arıyor" tam ekran bildirimini de iptal et.
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'sohbeto:incoming-call-cancelled', from: senderConnId }, '*');
        }
      } catch (e) {}
      var nm = peerDisplayName(senderConnId).replace(/\[.*?\]/g, '').trim();
      appendInbox({
        kind: 'call',
        connId: senderConnId,
        number: peerNumber(senderConnId),
        name: nm || 'Bilinmeyen',
        callType: type || 'audio'
      }).then(updateBadges);
      playInboxChime();
    }

    // handleCallSignal sarmalayıcısı — showIncomingCall'a varmadan önce
    // bilinmeyen aranlardan gelen CALL_RING / CALL_RING_VIDEO sinyallerini yakala.
    if (typeof window.handleCallSignal === 'function' && !window.handleCallSignal.__extrasWrapped) {
      var origHandleCall = window.handleCallSignal;
      window.handleCallSignal = function (senderConnId, text, viaP2P) {
        try {
          if (typeof text === 'string' &&
              (text === 'CALL_RING' || text === 'CALL_RING_VIDEO') &&
              !isKnownConn(senderConnId)) {
            var t = text === 'CALL_RING_VIDEO' ? 'video' : 'audio';
            rejectUnknownCall(senderConnId, t);
            return;
          }
        } catch (e) {}
        return origHandleCall.apply(this, arguments);
      };
      window.handleCallSignal.__extrasWrapped = true;
    }
    // renderIncomingMsg(senderConnId, targetConnId, text, isP2P, msgId)
    if (typeof window.renderIncomingMsg === 'function' && !window.renderIncomingMsg.__extrasWrapped) {
      var origMsg = window.renderIncomingMsg;
      window.renderIncomingMsg = function (senderConnId, targetConnId, text, isP2P, msgId) {
        try {
          // GROUP_INVITE protokolü: text "GROUP_INVITE_V2###groupId###name###members"
          var txt = String(text || '');
          if (txt.indexOf('GROUP_INVITE_V2###') === 0) {
            var parts = txt.split('###');
            var nm0 = peerDisplayName(senderConnId).replace(/\[.*?\]/g, '').trim();
            appendInbox({
              kind: 'group_invite',
              connId: senderConnId,
              number: peerNumber(senderConnId),
              name: nm0 || 'Bilinmeyen',
              groupId: parts[1] || '',
              groupName: parts[2] || '',
              members: (parts[3] || '').split(',').filter(Boolean)
            }).then(updateBadges);
            playInboxChime();
            return;
          }
          var isPrivate = (targetConnId !== 'HERKES');
          if (isPrivate && !isKnownConn(senderConnId) && !isAllowedConn(senderConnId)) {
            var nm = peerDisplayName(senderConnId).replace(/\[.*?\]/g, '').trim();
            appendInbox({
              kind: 'msg',
              connId: senderConnId,
              number: peerNumber(senderConnId),
              name: nm || 'Bilinmeyen',
              text: txt.slice(0, 240)
            }).then(updateBadges);
            playInboxChime();
            return; // Rehberde yok → ana sohbete düşürme, sadece gelen kutusu
          }
        } catch (e) {}
        return origMsg.apply(this, arguments);
      };
      window.renderIncomingMsg.__extrasWrapped = true;
    }
    // showIncomingCall(senderConnId, type)
    if (typeof window.showIncomingCall === 'function' && !window.showIncomingCall.__extrasWrapped) {
      var origCall = window.showIncomingCall;
      window.showIncomingCall = function (senderConnId, type) {
        try {
          if (!isKnownConn(senderConnId)) {
            // Defense-in-depth: handleCallSignal gate'i atlamış olabilir
            // (örn. handleCallSignal wrap'i daha kurulmadan ilk çağrı geldi).
            rejectUnknownCall(senderConnId, type);
            return;
          }
        } catch (e) {}
        return origCall.apply(this, arguments);
      };
      window.showIncomingCall.__extrasWrapped = true;
    }
  }

  // ----------------- GRUPLAR -----------------
  function loadGroups() {
    if (!window.GunesOSStore) return Promise.resolve([]);
    return window.GunesOSStore.get(groupsPath()).then(function (v) {
      return Array.isArray(v) ? v : [];
    });
  }
  function saveGroups(arr) {
    if (!window.GunesOSStore) return Promise.resolve(false);
    return window.GunesOSStore.set(groupsPath(), arr);
  }
  function listMyContacts() {
    var out = [];
    try {
      if (typeof contactsState !== 'undefined' && contactsState && contactsState.byNumber) {
        contactsState.byNumber.forEach(function (c) {
          if (c && c.number) out.push({
            number: c.number,
            name: c.name || c.number,
            connId: c.connId || ''
          });
        });
      }
    } catch (e) {}
    return out;
  }
  var _cgSelected = {};
  function openCreateGroup() {
    _cgSelected = {};
    openScreen('screen-create-group');
    bindCgFields();
    var nm = document.getElementById('cg-name');
    if (nm) nm.value = '';
    renderCgContactList();
    updateCgSaveBtn();
    setTimeout(function () { if (nm) nm.focus(); }, 80);
  }
  function renderCgContactList() {
    var box = document.getElementById('cg-list');
    if (!box) return;
    var contacts = listMyContacts();
    if (!contacts.length) {
      box.innerHTML = '<div class="fs-empty" style="padding:24px 12px;"><div class="fs-empty-ico"><i class="fa-regular fa-address-book"></i></div>Önce Kişiler sekmesine kişi ekleyin.</div>';
      return;
    }
    var html = '';
    contacts.forEach(function (c) {
      var checked = !!_cgSelected[c.number];
      var initial = (c.name || c.number).trim().charAt(0).toUpperCase();
      html += '<div class="cg-row' + (checked ? ' checked' : '') + '" data-num="' + escapeHtml(c.number) + '">' +
              '  <div class="cg-av">' + escapeHtml(initial) + '</div>' +
              '  <div class="cg-nm">' + escapeHtml(c.name || c.number) + '<div class="cg-num">' + escapeHtml(c.number) + '</div></div>' +
              '  <div class="cg-ck">' + (checked ? '<i class="fa-solid fa-check"></i>' : '') + '</div>' +
              '</div>';
    });
    box.innerHTML = html;
    box.querySelectorAll('.cg-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var num = row.getAttribute('data-num');
        if (_cgSelected[num]) delete _cgSelected[num]; else _cgSelected[num] = true;
        renderCgContactList();
        updateCgSaveBtn();
      });
    });
  }
  function updateCgSaveBtn() {
    var btn = document.getElementById('cg-save');
    var nm = document.getElementById('cg-name');
    if (!btn) return;
    var hasName = nm && (nm.value || '').trim().length > 0;
    var hasMembers = Object.keys(_cgSelected).length > 0;
    btn.disabled = !(hasName && hasMembers);
  }
  function bindCgFields() {
    var nm = document.getElementById('cg-name');
    if (nm && !nm.__bound) {
      nm.__bound = 1;
      nm.addEventListener('input', updateCgSaveBtn);
    }
    var sv = document.getElementById('cg-save');
    if (sv && !sv.__bound) {
      sv.__bound = 1;
      sv.addEventListener('click', createGroupFromCg);
    }
  }
  function createGroupFromCg() {
    var nm = document.getElementById('cg-name');
    var name = (nm && nm.value || '').trim();
    var memberNumbers = Object.keys(_cgSelected);
    if (!name || !memberNumbers.length) return;
    var contacts = listMyContacts();
    var memberObjs = contacts.filter(function (c) { return _cgSelected[c.number]; });
    var group = {
      id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: name,
      createdAt: Date.now(),
      ownerNumber: myNumber(),
      members: memberObjs.map(function (c) { return { number: c.number, name: c.name, connId: c.connId }; })
    };
    loadGroups().then(function (arr) {
      arr.unshift(group);
      return saveGroups(arr);
    }).then(function () {
      // Davetleri online üyelere P2P üzerinden gönder (best-effort)
      try {
        var payload = 'GROUP_INVITE_V2###' + group.id + '###' + group.name + '###' +
                      memberObjs.map(function (m) { return m.number; }).join(',');
        memberObjs.forEach(function (m) {
          if (!m.connId) return;
          try {
            if (typeof sendToPeer === 'function') sendToPeer(m.connId, payload);
            else if (typeof window.sendToPeer === 'function') window.sendToPeer(m.connId, payload);
          } catch (e) {}
        });
      } catch (e) {}
      closeScreen('screen-create-group');
      renderGroups();
    });
  }
  function renderGroups() {
    var list = document.getElementById('groups-list');
    var empty = document.getElementById('groups-empty');
    if (!list) return;
    loadGroups().then(function (arr) {
      if (!arr.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
      }
      if (empty) empty.style.display = 'none';
      var html = '';
      arr.forEach(function (g) {
        var sub = (g.members ? g.members.length : 0) + ' üye';
        html += '<div class="group-card" data-gid="' + escapeHtml(g.id) + '">' +
                '  <div class="gc-ic"><i class="fa-solid fa-users"></i></div>' +
                '  <div class="gc-info">' +
                '    <div class="gc-name">' + escapeHtml(g.name) + '</div>' +
                '    <div class="gc-sub">' + sub + ' · ' + fmtDT(g.createdAt) + '</div>' +
                '  </div>' +
                '  <button class="gc-del" data-del-gid="' + escapeHtml(g.id) + '" title="Sil"><i class="fa-regular fa-trash-can"></i></button>' +
                '</div>';
      });
      list.innerHTML = html;
      list.querySelectorAll('[data-del-gid]').forEach(function (b) {
        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var gid = b.getAttribute('data-del-gid');
          if (!confirm('Bu grubu silmek istiyor musun?')) return;
          loadGroups().then(function (a) {
            return saveGroups(a.filter(function (g) { return g.id !== gid; }));
          }).then(renderGroups);
        });
      });
    });
  }
  function joinGroupFromInvite(entry, idx) {
    loadGroups().then(function (arr) {
      if (entry.groupId && arr.some(function (g) { return g.id === entry.groupId; })) return arr;
      arr.unshift({
        id: entry.groupId || ('g_' + Date.now()),
        name: entry.groupName || 'Grup',
        createdAt: Date.now(),
        ownerNumber: entry.number || '',
        members: (entry.members || []).map(function (n) { return { number: n, name: n, connId: '' }; }),
        joinedFromInvite: true
      });
      return saveGroups(arr).then(function () { return arr; });
    }).then(function () {
      return removeInboxAt(idx);
    });
  }

  // ----------------- Public API -----------------
  window.SohbetoExtras = {
    openInbox:  function () { openScreen('screen-inbox');  renderInbox(); },
    openCalls:  function () { openScreen('screen-calls');  renderCalls(); },
    openNotes:  function () { openScreen('screen-notes');  renderNotes(); },
    openCreateGroup: openCreateGroup,
    renderGroups: renderGroups,
    closeAll:   closeAllFsScreens,
    appendInbox: appendInbox,
    playInboxChime: playInboxChime,
    appendGroupInvite: function (opts) {
      opts = opts || {};
      return appendInbox({
        kind: 'group_invite',
        groupId: opts.groupId || '',
        groupName: opts.groupName || '',
        name: opts.from || opts.fromName || 'Grup daveti',
        connId: opts.connId || '',
        number: opts.number || '',
        members: opts.members || []
      }).then(function () { playInboxChime(); updateBadges(); });
    },
    refresh:    updateBadges,
  };


  // ----------------- Boot -----------------
  function boot() {
    injectCSS();
    injectScreens();
    injectHeaderIcons();
    bindGlobalHeaderDelegation();
    bind();
    wrapNavigate();
    updateBadges();
    // Engine fonksiyonları henüz tanımlanmamış olabilir; başarana kadar dene
    var tries = 0;
    var hookTimer = setInterval(function () {
      wrapEngineHooks();
      tries++;
      if ((window.renderIncomingMsg && window.renderIncomingMsg.__extrasWrapped &&
           window.showIncomingCall && window.showIncomingCall.__extrasWrapped &&
           window.handleCallSignal && window.handleCallSignal.__extrasWrapped) || tries > 50) {
        clearInterval(hookTimer);
      }
    }, 200);
    // Periyodik badge tazeleme (çevrimdışı kuyruk değişebilir)
    setInterval(updateBadges, 5000);
    // Sohbetler ekranı henüz oluşmamış olabilir; gözlemle
    var mo = new MutationObserver(function () {
      injectHeaderIcons();
      bind();
      bindCgFields();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    // Gruplar sekmesi her açıldığında listeyi tazele
    var renderTimer = null;
    function maybeRenderGroups() {
      var s = document.getElementById('screen-gruplar');
      if (s && !s.classList.contains('hidden-screen')) {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(renderGroups, 50);
      }
    }
    var navMo = new MutationObserver(maybeRenderGroups);
    var sg = document.getElementById('screen-gruplar');
    if (sg) navMo.observe(sg, { attributes: true, attributeFilter: ['class'] });
    else {
      // Bekleyip bağla
      var t = setInterval(function () {
        var sg2 = document.getElementById('screen-gruplar');
        if (sg2) { navMo.observe(sg2, { attributes: true, attributeFilter: ['class'] }); clearInterval(t); maybeRenderGroups(); }
      }, 300);
    }
    // İlk açılışta da bir kere çağır
    setTimeout(renderGroups, 1200);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
