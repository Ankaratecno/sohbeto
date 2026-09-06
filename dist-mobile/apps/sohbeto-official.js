/* =====================================================================
   SOHBETO OFFICIAL — Resmî "SOHBETO" hesabı (Ankara Tecno / kurucu hattı)
   • Yardım & Topluluk ekranını açar/kapatır
   • İlk girişte kalıcı hoş geldin mesajı bırakır (bir kez)
   • Adın yanında gri "doğrulanmış" tiki çizer
   • +90606061992 numarasını kayıt/girişte rezerve eder
   Motor dosyalarına dokunmaz; sadece public API'leri kullanır.
   ===================================================================== */
(function () {
  'use strict';

  var OFFICIAL_NUMBER = '+90606061992';
  var OFFICIAL_CID = 'sohbeto-90606061992'; // peerIdForNumber ile aynı → kurucu P2P hattı
  var OFFICIAL_NAME = 'Sohbeto';
  var OFFICIAL_NAME_ALIASES = ['sohbeto'];
  var WELCOME_TEXT =
    'Es selamü aleyküm ve rahmetullah 🌙\n\nSohbeto\'ya hoş geldin! ' +
    'Ben Ankara Tecno kurucu ekibinin resmî SOHBETO hesabıyım. ' +
    'Sorun, öneri veya yardım için buraya yazabilirsin.';

  /* ---------- SO ikonu (kalıcı profil fotoğrafı, data URI) ---------- */
  var SO_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">' +
    '<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#22d3ee"/><stop offset="55%" stop-color="#6366f1"/>' +
    '<stop offset="100%" stop-color="#a855f7"/></linearGradient>' +
    '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#ffffff" stop-opacity=".5"/>' +
    '<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>' +
    '<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#b)"/>' +
    '<rect x="2" y="2" width="60" height="34" rx="16" fill="url(#g)"/>' +
    '<path d="M16 22c0-3.3 2.7-6 6-6h20c3.3 0 6 2.7 6 6v14c0 3.3-2.7 6-6 6H30l-7 6v-6h-1c-3.3 0-6-2.7-6-6V22z" ' +
    'fill="#ffffff" fill-opacity=".92"/>' +
    '<text x="32" y="35" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" ' +
    'font-size="15" font-weight="700" fill="#4338ca">SO</text></svg>';
  var SO_IMAGE = 'data:image/svg+xml;base64,' + btoa(SO_SVG);

  function norm(n) {
    try { return typeof normalizeNumber === 'function' ? normalizeNumber(n) : String(n || ''); }
    catch (e) { return String(n || ''); }
  }
  function myNo() {
    try { return (window.CONFIG && window.CONFIG.virtualNo) || ''; } catch (e) { return ''; }
  }

  /* ---------------- Yardım & Topluluk ekranı ---------------- */
  function openHelp() {
    var el = document.getElementById('screen-yardim');
    if (!el) return;
    el.classList.remove('hidden-screen');
    el.classList.add('active');
  }
  function closeHelp() {
    var el = document.getElementById('screen-yardim');
    if (!el) return;
    el.classList.add('hidden-screen');
    el.classList.remove('active');
  }
  function bindHelp() {
    window.app = window.app || {};
    window.app.openHelp = openHelp;
    window.app.closeHelp = closeHelp;
    var row = document.getElementById('helpFounderRow');
    if (row && !row.dataset.bound) {
      row.dataset.bound = '1';
      row.addEventListener('click', function () {
        closeHelp();
        try {
          if (typeof window.openChat === 'function') window.openChat(OFFICIAL_CID);
        } catch (e) {}
      });
    }
  }

  /* ---------------- Doğrulanmış (gri tik) rozeti ---------------- */
  function injectBadgeCss() {
    if (document.getElementById('__sb_verified_css__')) return;
    var s = document.createElement('style');
    s.id = '__sb_verified_css__';
    s.textContent =
      '.sb-verified{color:#64748b;font-size:.95em;margin-left:6px;vertical-align:baseline;'
      + 'text-shadow:0 1px 2px rgba(0,0,0,.12);}';
    document.head.appendChild(s);
  }
  function decorateNames() {
    var sels = ['.conv-name', '.contact-name', '#topbarName', '#cardName', '#infoName'];
    sels.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        var txt = (el.textContent || '').replace(/\[.*?\]/g, '').trim();
        var has = el.querySelector('.sb-verified');
        var isOfficial = OFFICIAL_NAME_ALIASES.indexOf(txt.toLowerCase()) >= 0;
        if (isOfficial && txt !== OFFICIAL_NAME && !has) {
          try { el.textContent = OFFICIAL_NAME; } catch (e) {}
        }
        if (isOfficial && !has) {
          var i = document.createElement('i');
          i.className = 'fa-solid fa-circle-check sb-verified';
          i.title = 'Doğrulanmış resmî hesap';
          el.appendChild(i);
        } else if (!isOfficial && has) {
          has.remove();
        }
      });
    });
  }

  /* ---------------- Resmî hesabı kur + hoş geldin mesajı ---------------- */
  function ensureProfile(force) {
    try {
      if (!window.state) return;
      if (myNo() === OFFICIAL_NUMBER) return; // kurucu kendi cihazı
      if (!state.peerProfiles) state.peerProfiles = {};
      var cur = state.peerProfiles[OFFICIAL_CID];
      var ok = cur && cur.image === SO_IMAGE && cur.name === OFFICIAL_NAME;
      if (ok && !force) return;
      state.peerProfiles[OFFICIAL_CID] = {
        name: OFFICIAL_NAME,
        emoji: '',
        image: SO_IMAGE,
        bio: 'Ankara Tecno · Resmî destek hesabı',
      };
      state.users.set(OFFICIAL_CID, OFFICIAL_NAME + ' [' + OFFICIAL_NUMBER + ']');
      if (typeof persistPeerProfiles === 'function') persistPeerProfiles();
      try {
        if (typeof updateUI === 'function') updateUI();
        if (typeof refreshLiveScreensForPeer === 'function') refreshLiveScreensForPeer(OFFICIAL_CID);
      } catch (e) {}
    } catch (e) {}
  }

  /* Gelen profil güncellemesi resmî hesabın fotoğrafını silmesin. */
  function guardProfileUpdates() {
    try {
      if (window.__sbOfficialProfileGuard) return;
      if (typeof window.applyPeerProfileUpdate !== 'function') return;
      window.__sbOfficialProfileGuard = true;
      var orig = window.applyPeerProfileUpdate;
      window.applyPeerProfileUpdate = function (connId, profile) {
        if (connId === OFFICIAL_CID) {
          profile = profile || {};
          profile.name = OFFICIAL_NAME;
          if (!profile.image || String(profile.image).indexOf('data:image/') !== 0) profile.image = SO_IMAGE;
        }
        return orig.call(this, connId, profile);
      };
    } catch (e) {}
  }


  async function ensureContact() {
    try {
      if (typeof dbSaveContact !== 'function' || !window.contactsState) return;
      var existing = contactsState.byNumber.get(OFFICIAL_NUMBER);
      var c = {
        number: OFFICIAL_NUMBER,
        name: OFFICIAL_NAME,
        connId: OFFICIAL_CID,
        addedAt: (existing && existing.addedAt) || Date.now(),
        lastSeen: (existing && existing.lastSeen) || null,
        official: true,
      };
      contactsState.byNumber.set(OFFICIAL_NUMBER, c);
      await dbSaveContact(c);
      if (typeof updateContactList === 'function') updateContactList();
    } catch (e) {}
  }

  async function ensureWelcome() {
    var key = 'sohbeto.official.welcome.v1.' + (myNo() || 'anon');
    try { if (localStorage.getItem(key) === '1') return; } catch (e) {}
    try {
      var ts = Date.now();
      if (typeof dbSaveMessage === 'function') {
        await dbSaveMessage(OFFICIAL_CID, {
          text: WELCOME_TEXT,
          ts: ts,
          sender: OFFICIAL_NAME,
          isOwn: false,
          isP2P: false,
          isPrivate: true,
          msgId: 'sohbeto-welcome-1',
          status: 'sent',
        });
      }
      var d = new Date(ts);
      var conv = {
        nick: OFFICIAL_NAME,
        lastMsg: 'Es selamü aleyküm ve rahmetullah 🌙 Sohbeto\'ya hoş geldin!',
        time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'),
        unread: 1,
        isPrivate: true,
        ts: ts,
      };
      if (window.state && state.conversations) state.conversations.set(OFFICIAL_CID, conv);
      if (typeof dbSaveConversation === 'function') await dbSaveConversation(OFFICIAL_CID, conv);
      try { localStorage.setItem(key, '1'); } catch (e) {}
      if (typeof renderConvList === 'function') renderConvList();
    } catch (e) {}
  }

  /* ---------------- Numara rezervasyonu (yalnızca kayıt engellenir) ---------------- */
  function guardReservedNumber() {
    // Login artık PIN ile korunuyor (kurucu girişi) — sadece kayıt bloklanır.
    var pair = ['btnSendCode', 'welcomeNumber'];
    var btn = document.getElementById(pair[0]);
    var inp = document.getElementById(pair[1]);
    if (!btn || !inp || btn.dataset.reservedGuard) return;
    btn.dataset.reservedGuard = '1';
    btn.addEventListener('click', function (ev) {
      if (norm(inp.value) === OFFICIAL_NUMBER) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        try {
          if (typeof showNotif === 'function')
            showNotif('Bu numara SOHBETO resmî hattı için ayrılmıştır.', 4500);
          else alert('Bu numara SOHBETO resmî hattı için ayrılmıştır.');
        } catch (e) {}
      }
    }, true);
  }

  /* ---------------- Kurucu PIN girişi (SOHBETO olarak giriş) ---------------- */
  var _founderPinMode = false;
  var _founderResolvers = {};
  function sendUp(msg) {
    try { window.parent && window.parent.postMessage(msg, '*'); } catch (e) {}
  }
  function verifyFounderPin(phone, pin) {
    return new Promise(function (resolve) {
      var rid = 'f' + Date.now() + Math.random().toString(36).slice(2, 7);
      _founderResolvers[rid] = resolve;
      sendUp({ type: 'sohbeto:verify-founder', rid: rid, phone: phone, pin: pin });
      setTimeout(function () {
        if (_founderResolvers[rid]) { delete _founderResolvers[rid]; resolve({ ok: false, reason: 'timeout' }); }
      }, 9000);
    });
  }
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (d && d.type === 'sohbeto:founder-verified' && d.rid && _founderResolvers[d.rid]) {
      var r = _founderResolvers[d.rid];
      delete _founderResolvers[d.rid];
      r(d);
    }
  });

  /* Kurucu oturumunu motorun kod karşılaştırmasına girmeden aç. */
  async function founderSignIn() {
    try {
      if (window.state) state.nick = OFFICIAL_NAME;
      if (typeof dbPut === 'function') await dbPut('nick', OFFICIAL_NAME);
      var seed = typeof generateSeed === 'function'
        ? await generateSeed(OFFICIAL_NAME, OFFICIAL_NUMBER)
        : String(Date.now());
      if (typeof saveVirtualNo === 'function') await saveVirtualNo(OFFICIAL_NUMBER, seed);
      if (typeof dbPut === 'function') await dbPut('firstSessionDone', true);
      if (typeof hideNotif === 'function') hideNotif();
      var lc = document.getElementById('loginCode'); if (lc) lc.value = '';
      var lw = document.getElementById('loginCodeWrap'); if (lw) lw.classList.add('hidden');
      sendUp({ type: 'sohbeto:logged-in', number: OFFICIAL_NUMBER });
      if (typeof connectAndChat === 'function') connectAndChat();
      else if (typeof enterChatScreen === 'function') enterChatScreen();
    } catch (e) {}
  }

  function bindFounderLogin() {
    var sendBtn = document.getElementById('btnLoginSendCode');
    var verifyBtn = document.getElementById('btnLoginVerify');
    if (!sendBtn || !verifyBtn) return;
    if (sendBtn.dataset.founderBound) return;
    sendBtn.dataset.founderBound = '1';
    var origSend = sendBtn.onclick;
    var origVerify = verifyBtn.onclick;

    sendBtn.onclick = async function (e) {
      var inp = document.getElementById('loginNumber');
      var isFounder = inp && norm(inp.value) === OFFICIAL_NUMBER;
      _founderPinMode = isFounder;
      if (isFounder) {
        // Sahte SMS kodu üretilmesin; doğrudan PIN ekranı açılsın.
        try { if (typeof openOtpScreen === 'function') openOtpScreen('login'); } catch (err) {}
        try {
          if (typeof showNotif === 'function')
            showNotif('Kurucu PIN\'inizi girin (6 haneli).', 5000);
        } catch (err) {}
        return;
      }
      return origSend ? origSend.call(this, e) : undefined;
    };

    verifyBtn.onclick = async function (e) {
      if (!_founderPinMode) return origVerify ? origVerify.call(this, e) : undefined;
      var codeEl = document.getElementById('loginCode');
      var pin = (codeEl.value || '').trim();
      if (!pin || pin.length !== 6) { showNotif('6 haneli kurucu PIN girin.', 3000); return; }
      var r = await verifyFounderPin(OFFICIAL_NUMBER, pin);
      if (!r || !r.ok) {
        showNotif('❌ Kurucu PIN hatalı veya yetkisiz.', 4000);
        codeEl.value = '';
        try {
          document.querySelectorAll('#codeInputs .code-input').forEach(function (i) { i.value = ''; });
          var f = document.querySelector('#codeInputs .code-input'); if (f) f.focus();
        } catch (err) {}
        return;
      }
      _founderPinMode = false;
      await founderSignIn();
    };
  }

  /* -------- Kurucu cihazı: profil fotoğrafı + ad otomatik -------- */
  function isFounderSelf() { return norm(myNo()) === OFFICIAL_NUMBER; }
  var founderIdentitySyncing = false;
  async function applyFounderIdentity() {
    if (!isFounderSelf()) return;
    if (founderIdentitySyncing) return;
    founderIdentitySyncing = true;
    var d = {};
    try { d = JSON.parse(localStorage.getItem('sohbeto.oo.profile') || '{}'); } catch (e) {}
    var changed = false;
    if (d.image !== SO_IMAGE) { d.image = SO_IMAGE; changed = true; }
    if (d.name !== OFFICIAL_NAME) { d.name = OFFICIAL_NAME; changed = true; }
    if (d.bio !== 'Ankara Tecno · Resmî destek hesabı') { d.bio = 'Ankara Tecno · Resmî destek hesabı'; changed = true; }
    if (changed) { try { localStorage.setItem('sohbeto.oo.profile', JSON.stringify(d)); } catch (e) {} }
    var engineChanged = false;
    try {
      if (window.state) {
        if (state.nick !== d.name) { state.nick = d.name; engineChanged = true; }
        if (state.bio !== d.bio) { state.bio = d.bio; engineChanged = true; }
        if (state.profileImage !== d.image) { state.profileImage = d.image; engineChanged = true; }
        if (state.profileEmoji !== '') { state.profileEmoji = ''; engineChanged = true; }
      }
      if (engineChanged && typeof dbPut === 'function') {
        await dbPut('nick', d.name);
        await dbPut('bio', d.bio);
        await dbPut('profileImage', d.image);
        await dbPut('profileEmoji', '');
      }
    } catch (e) {}
    var circle = document.getElementById('profilePicCircle');
    var currentImage = circle && circle.querySelector('img');
    if (circle && (!currentImage || currentImage.getAttribute('src') !== d.image)) {
      circle.innerHTML = '<img src="' + d.image + '" alt="Profil" ' +
        'style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';
    }
    var nameEl = document.getElementById('profileName');
    if (nameEl && !nameEl.value) {
      nameEl.value = d.name;
      try { nameEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    }
    var bioEl = document.getElementById('profileBio');
    if (bioEl && !bioEl.value) {
      bioEl.value = d.bio;
      try { bioEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    }
    if (engineChanged) {
      try {
        if (typeof updateProfilePics === 'function') updateProfilePics();
        if (typeof scheduleProfileBroadcast === 'function') scheduleProfileBroadcast(50);
      } catch (e) {}
    }
    founderIdentitySyncing = false;
  }

  /* ---------------- Yaşam döngüsü ---------------- */
  var seeded = false;
  async function seedIfReady() {
    if (seeded) return;
    if (!window.state || !window.contactsState || typeof dbSaveMessage !== 'function') return;
    if (!myNo()) return;
    // Kurucu kendi cihazında resmî hesabı enjekte etmesin (kendi hesabı odur).
    if (myNo() === OFFICIAL_NUMBER) { seeded = true; return; }
    seeded = true;
    ensureProfile();
    await ensureContact();
    // Karşılama mesajı sunucudan geliyormuş gibi birkaç saniye sonra düşsün.
    setTimeout(function () {
      ensureWelcome().then(function () {
        decorateNames();
        try {
          if (typeof showNotif === 'function') showNotif('SOHBETO size bir mesaj gönderdi.', 3500);
        } catch (e) {}
      });
    }, 6000);
    decorateNames();
  }


  function start() {
    injectBadgeCss();
    bindHelp();
    guardReservedNumber();
    bindFounderLogin();
    // Kayıt/giriş kaç dakika sürerse sürsün bekle: numara oluşana kadar poll devam eder.
    guardProfileUpdates();
    setInterval(function () {
      guardReservedNumber();
      bindFounderLogin();
      guardProfileUpdates();
      seedIfReady();
      if (seeded) ensureProfile();
      applyFounderIdentity();
      decorateNames();

    }, 700);
    // Kayıt tamamlandığı anda hemen tohumla.
    window.addEventListener('message', function (ev) {
      var d = ev.data;
      if (d && (d.type === 'sohbeto:registered' || d.type === 'sohbeto:logged-in')) {
        setTimeout(seedIfReady, 300);
        setTimeout(seedIfReady, 1500);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.SohbetoOfficial = {
    number: OFFICIAL_NUMBER,
    connId: OFFICIAL_CID,
    name: OFFICIAL_NAME,
    image: SO_IMAGE,
    openHelp: openHelp,
    isFounderNumber: function (n) { return norm(n) === OFFICIAL_NUMBER; },
    seed: seedIfReady,
  };

})();
