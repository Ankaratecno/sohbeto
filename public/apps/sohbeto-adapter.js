/* ============================================================
   SOHBETO ADAPTER  v1 — Adım 1 (Login + Sohbet Listesi + Chat)
   OO arayüzünü sohbeto-engine.js motoruna bağlar.
   ÖNEMLİ: Bu dosya motor'dan ÖNCE yüklenir.
   ============================================================ */
(function () {
  'use strict';

  // ---------- 1) MOTORUN BEKLEDİĞİ STUB ID'LER ----------
  // Motor yüklenirken bu ID'leri arıyor; OO'da olmayanları görünmez ekleyelim ki patlamasın.
  var STUB_IDS = [
    'btnSendCode','btnLoginSendCode','btnLoginVerify','loginNumber','loginCode','loginCodeWrap',
    'welcomeNumber','welcomeCode','welcomePicCircle','btnStart','otpVerifyBtn','otpResendBtn','otpTimer',
    'btnMenu','menuDropdown','menuSettings','menuEvents','menuLogToggle','menuLogout','eventsModal','eventsBody',
    'settingsModal','settingsName','settingsBio','settingsPicCircle','addContactModal','contactInfoModal',
    'infoAvatar','infoName','infoNumber','infoFieldName','infoFieldNumber','infoFieldStatus',
    'infoFieldConnId','infoFieldConnType','newContactNumber','newContactError','contactList','contactCount',
    'navBadgeSohbet','convListGenel','convListOzel','convOzelBadge','pageConvList','pageChat','screenChat',
    'topbarTitle','topbarStatus','topbarBack','topbarAvatar','topbarVideoCall','topbarAudioCall',
    'btnAddContact','btnSend','btnMic','btnMute','btnSpeaker','btnVideoMute','btnVideoSpeaker',
    'btnCameraToggle','btnVideoToggle','swipeContainer','viewSohbetler','viewKisiler','viewGruplar',
    'callScreen','callAvatar','callName','callStatus','activeCallScreen','activeCallAvatar',
    'activeCallName','activeCallStatus','activeCallDuration','videoCallName','videoCallDuration',
    'videoLocal','videoRemote','videoContainer','audioContainer','fileInput',
    'logContainer','logPanel','topNotif','notifText','notifTime','memoriesList','storiesRow',
    'screenWelcome','screenLogin','screenOtp','loginPicCircle','alphaBar','themePicker',
    'avatarGrid','avatarPicker','lockLength','lockOutput','themeTour','ltTitle',
    'cardAvatar','cardName','cardNumber','cardMoreMenu'
  ];

  function tagFor(id) {
    if (id === 'fileInput') return 'input';
    if (/^(btn|otp.+Btn|topbar(Back|Audio|Video))/.test(id)) return 'button';
    if (/^(login(Number|Code)|welcome(Number|Code)|new[A-Z]|infoField|settings(Name|Bio)|lockLength)$/.test(id)) return 'input';
    return 'div';
  }

  function buildStubs() {
    if (document.getElementById('__engine_stub_host__')) return;
    var host = document.createElement('div');
    host.id = '__engine_stub_host__';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none;';
    STUB_IDS.forEach(function (id) {
      if (document.getElementById(id)) return; // OO'da zaten varsa dokunma
      var el = document.createElement(tagFor(id));
      el.id = id;
      if (el.tagName === 'INPUT') { el.type = (id === 'fileInput' ? 'file' : 'text'); }
      // Bazı motor kodları .classList.add('hidden') yapıyor; sınıf hazır olsun
      el.className = 'hidden';
      host.appendChild(el);
    });
    (document.body || document.documentElement).appendChild(host);
  }

  // DOM hazır olmadan motor yüklenirse stub'lar olmaz → DOMContentLoaded öncesi de garanti et
  if (document.body) buildStubs();
  else document.addEventListener('DOMContentLoaded', buildStubs, { once: true });

  // ---------- 2) GLOBAL KÖPRÜ — motor yüklendikten sonra çalışacak ----------
  function ready(fn) {
    if (document.readyState === 'complete') setTimeout(fn, 0);
    else window.addEventListener('load', fn, { once: true });
  }

  // OO'nun ekran navigasyonu (mevcut OO mantığı; tek kaynak burada)
  // Hangi ekranlarda alt nav gizlenecek (tam ekran katmanlar)
  var FULLSCREEN_OVERLAYS = {
    'screen-chat': true,
    'screen-ooCall': true,
    'screen-ooIncoming': true,
    // Adım 7: Ayarlar / Tema / Hesap artık alt nav'ı GİZLEMİYOR.
    // Eskiden bu üç ekran tam-ekran sayılıyordu ve nav kayboluyordu;
    // bu yüzden Tema/Hesap'a girince Sohbetler/Kişiler/Gruplar'a dönmek imkansızdı.
    'screen-phone': true,
    'screen-auth': true
  };
  function applyNavVisibility(screenId) {
    var nav = document.getElementById('bottom-nav');
    if (!nav) return;
    // Sadece login sonrası enterMain çağrılınca nav görünür hale gelir;
    // burada style.display zaten 'none' ise dokunmuyoruz (kayıt öncesi gizli kalsın).
    if (nav.dataset.enabled !== '1') return;
    if (FULLSCREEN_OVERLAYS[screenId]) nav.style.display = 'none';
    else nav.style.display = '';
  }
  function setThemePickerVisible(visible) {
    var picker = document.getElementById('screen-themepicker');
    if (!picker) return;
    picker.classList.toggle('hidden-screen', !visible);
    picker.classList.toggle('active', !!visible);
  }
  function showScreen(screenId) {
    var screens = document.querySelectorAll('.app-container > .screen');
    screens.forEach(function (s) {
      s.classList.add('hidden-screen');
      s.classList.remove('active');
    });
    setThemePickerVisible(screenId === 'screen-themepicker');
    var target = document.getElementById(screenId);
    if (target && target.id !== 'screen-themepicker') {
      target.classList.remove('hidden-screen');
      target.classList.add('active');
    }
    applyNavVisibility(screenId);
  }

  ready(function () {
    function getEngineState() {
      try { if (typeof state !== 'undefined' && state) return state; } catch (e) {}
      return window.state || null;
    }
    function normalizePhoneForAdapter(n) {
      try { if (typeof normalizeNumber === 'function') return normalizeNumber(n); } catch (e) {}
      var s = String(n || '').trim().replace(/[\s\-()]/g, '');
      if (!s) return '';
      s = s.replace(/^00/, '+').replace(/[^+\d]/g, '');
      var digits = s.replace(/^\+/, '');
      if (digits.charAt(0) === '0' && digits.length === 11) digits = '90' + digits.substring(1);
      else if (digits.length === 10 && digits.charAt(0) === '5') digits = '90' + digits;
      else if (digits.indexOf('0090') === 0) digits = digits.substring(2);
      return digits ? ('+' + digits) : '';
    }

    // Motor global mı diye bak
    var hasEngine = !!(getEngineState() && typeof window.openChat === 'function');
    if (!hasEngine) {
      console.warn('[adapter] sohbeto-engine.js yüklenmemiş gibi görünüyor.');
    }

    // ---------- 2A) APP NESNESİ (OO HTML'inin çağırdığı isim) ----------
    window.app = window.app || {};

    window.app.navigate = function (target) {
      var map = {
        phone: 'screen-phone',
        auth: 'screen-auth',
        sohbetler: 'screen-sohbetler',
        kisiler: 'screen-kisiler',
        gruplar: 'screen-gruplar',
        ayarlar: 'screen-ayarlar',
        chat: 'screen-chat'
      };
      showScreen(map[target] || target);
      try {
        document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
        var navEl = document.getElementById('nav-' + target);
        if (navEl) navEl.classList.add('active');
      } catch (e) {}
      if (target === 'kisiler' && typeof window.renderContacts === 'function') {
        window.renderContacts();
      }
    };

    // İlk kez mi giriş yoksa daha önce kayıt olmuş mu? IndexedDB'de firstSessionDone'a bakar.
    // Akışı belirler: WELCOME (ilk kayıt) vs LOGIN (tekrar giriş).
    var _flow = null; // 'welcome' | 'login'
    var INTERFACE_KEY = 'sohbeto.oo.interface';
    var LEGACY_THEME_KEY = 'sohbeto.oo.theme';
    function normalizeInterfaceChoice(v) {
      v = String(v || '').trim().toUpperCase();
      return (v === 'OO' || v === 'A2') ? v : '';
    }
    function getInterfaceChoice() {
      var chosen = '';
      try { chosen = normalizeInterfaceChoice(localStorage.getItem(INTERFACE_KEY)); } catch (e) {}
      if (chosen) return chosen;
      try {
        var legacy = normalizeInterfaceChoice(localStorage.getItem(LEGACY_THEME_KEY));
        if (legacy) {
          localStorage.setItem(INTERFACE_KEY, legacy);
          localStorage.setItem(LEGACY_THEME_KEY, 'ocean');
          return legacy;
        }
      } catch (e) {}
      return '';
    }
    function setInterfaceChoice(choice) {
      choice = normalizeInterfaceChoice(choice) || 'OO';
      try { localStorage.setItem(INTERFACE_KEY, choice); } catch (e) {}
      if (window.GunesOSStore) {
        try { window.GunesOSStore.set(window.GunesOSStore.path.globalTheme(), choice); } catch (e) {}
      }
      return choice;
    }
    function isUserLoggedIn() {
      var loggedIn = false;
      try { if (typeof myNumber !== 'undefined' && myNumber) loggedIn = true; } catch (e) {}
      try {
        if (!loggedIn) {
          var ls = localStorage.getItem('sohbet_my_number_v1') ||
                   localStorage.getItem('sohbeto.oo.profile.number') || '';
          if (ls && ls.trim()) loggedIn = true;
        }
      } catch (e) {}
      try {
        if (!loggedIn) {
          var st = getEngineState();
          if (st && (st.myNumber || st.identity || (st.users && st.users.size))) loggedIn = true;
        }
      } catch (e) {}
      return loggedIn;
    }
    async function openChosenInterface(choice) {
      choice = normalizeInterfaceChoice(choice);
      if (!choice) {
        try { if (typeof window.__hideSohbetoA2 === 'function') window.__hideSohbetoA2(); } catch (e) {}
        showScreen('screen-themepicker');
        return;
      }
      if (choice === 'A2' && typeof window.__showSohbetoA2 === 'function') { window.__showSohbetoA2(); return; }
      try { if (typeof window.__hideSohbetoA2 === 'function') window.__hideSohbetoA2(); } catch (e) {}
      if (isUserLoggedIn()) { enterMain(); return; }
      // Engine/localStorage henüz hazır olmayabilir — IndexedDB kimliğine bak.
      try {
        if (typeof window.loadIdentity === 'function') {
          var ident = await window.loadIdentity();
          if (ident && ident.firstDone) { enterMain(); return; }
        }
      } catch (e) {}
      showScreen('screen-oo-welcome');
    }
    async function detectFlow() {
      if (_flow) return _flow;
      try {
        if (typeof window.loadIdentity === 'function') {
          var ident = await window.loadIdentity();
          _flow = ident && ident.firstDone ? 'login' : 'welcome';
        } else {
          _flow = 'welcome';
        }
      } catch (e) { _flow = 'welcome'; }
      return _flow;
    }

    window.app.sendCode = async function (resend) {
      var phoneEl = document.getElementById('phoneInput');
      var phone = (phoneEl || {}).value || '';
      phone = (window.__normalizePhone ? window.__normalizePhone(phone) : phone).trim();
      if (phoneEl) phoneEl.value = phone;
      if (!phone || phone === '+90') { alert('Lütfen telefon numaranızı girin.'); return; }
      var flow = await detectFlow();
      // OTP etiketini güncelle
      var lbl = document.getElementById('authPhoneLabel'); if (lbl) lbl.innerText = phone;
      if (flow === 'login') {
        var ln = document.getElementById('loginNumber'); if (ln) ln.value = phone;
        var btnL = document.getElementById('btnLoginSendCode');
        if (btnL && typeof btnL.click === 'function') btnL.click();
      } else {
        var wn = document.getElementById('welcomeNumber'); if (wn) wn.value = phone;
        var btnW = document.getElementById('btnSendCode');
        if (btnW && typeof btnW.click === 'function') btnW.click();
      }
      // Motor postMessage'ı parent'a yolladı → kod Mesajlar app'ine düştü.
      if (!resend) showScreen('screen-auth');
    };

    window.app.verifyCode = async function () {
      var inputs = document.querySelectorAll('#codeInputs .code-input');
      var code = '';
      inputs.forEach(function (i) { code += (i.value || '').trim(); });
      if (code.length !== 6) { alert('6 haneli kodu eksiksiz girin.'); return; }
      var flow = _flow || (await detectFlow());
      if (flow === 'login') {
        var lc = document.getElementById('loginCode'); if (lc) lc.value = code;
        var b = document.getElementById('btnLoginVerify');
        if (b && typeof b.click === 'function') b.click();
      } else {
        var wc = document.getElementById('welcomeCode'); if (wc) wc.value = code;
        var bs = document.getElementById('btnStart');
        if (bs && typeof bs.click === 'function') bs.click();
      }
    };

    // ---------- 2B) OTP INPUT OTOMATİK ATLAMA (görsel davranış) ----------
    var codeInputs = document.querySelectorAll('#codeInputs .code-input');
    codeInputs.forEach(function (inp, idx) {
      inp.addEventListener('input', function () {
        if (inp.value && idx < codeInputs.length - 1) codeInputs[idx + 1].focus();
        // 6 hane tamamsa otomatik doğrula
        var all = ''; codeInputs.forEach(function (x) { all += (x.value || ''); });
        if (all.length === 6) window.app.verifyCode();
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !inp.value && idx > 0) codeInputs[idx - 1].focus();
      });
    });

    // ---------- 2C) Login BAŞARILI olduğunda ana ekrana geç ----------
    // Motor başarılı doğrulamadan sonra loginCodeWrap'a 'hidden' ekliyor (engine sat. ~1879).
    // Ama bu hep ekleniyor olabilir; daha güvenli sinyal: state.nick set olur ve WS bağlanır.
    // En basit ve sağlam: motorun renderConvList ilk çağırıldığında ana ekrana geç.
    var enteredMain = false;
    function enterMain() {
      var interfaceChoice = getInterfaceChoice();
      if (!interfaceChoice) { showScreen('screen-themepicker'); return; }
      if (interfaceChoice === 'A2' && typeof window.__showSohbetoA2 === 'function') { window.__showSohbetoA2(); return; }
      if (enteredMain) return;
      enteredMain = true;
      // Alt nav'ı sadece giriş sonrası etkinleştir; sonrası ekran bazlı yönetilir.
      var nav = document.getElementById('bottom-nav');
      if (nav) { nav.dataset.enabled = '1'; nav.style.display = ''; }
      showScreen('screen-sohbetler');
      // Giriş yapılır yapılmaz yapışkan doğrulama bildirimini kapat
      try {
        if (typeof window.__sohbetoDismissToast === 'function') {
          window.__sohbetoDismissToast('sohbeto-code');
        }
      } catch(e) {}
      // İçeri girer girmez 3 hoş geldin bildirimi (5 sn arayla, her biri 4.5 sn ekranda)
      // Sadece ilk kayıt sonrası tek seferlik; sonraki girişlerde tekrar etmesin.
      try {
        var WELCOMED_KEY = 'sohbeto.welcomed.v1';
        var alreadyWelcomed = false;
        try { alreadyWelcomed = localStorage.getItem(WELCOMED_KEY) === '1'; } catch(e){}
        if (alreadyWelcomed) throw new Error('skip');
        try { localStorage.setItem(WELCOMED_KEY, '1'); } catch(e){}
        var welcomeMsgs = [
          { title: 'Mesajlar · Sohbeto', text: '👋 Merhaba ve hoş geldin!\nHesabın hazır — dünyanın en özgür sohbeti seni bekliyor.' },
          { title: 'Mesajlar · Sohbeto', text: 'Sohbeto\u2019ya başarıyla kaydoldun. Artık güvenli, hızlı ve uçtan uca şifreli mesajlaşmanın keyfini çıkarabilirsin.' },
          { title: 'Mesajlar · Sohbeto', text: '💡 İpucu: Profil resmini ve adını Sohbeto > Ayarlar bölümünden güncelleyebilirsin. İyi sohbetler! 🌟' }
        ];
        welcomeMsgs.forEach(function(m, i){
          setTimeout(function(){
            if (typeof window.__sohbetoNotify === 'function') {
              window.__sohbetoNotify({ title: m.title, text: m.text, duration: 4500 });
            }
          }, 800 + i * 5000);
        });
      } catch(e) {}
    }
    window.__sohbetoHandleLocalLogout = function () {
      enteredMain = false;
      var nav = document.getElementById('bottom-nav');
      if (nav) {
        nav.dataset.enabled = '0';
        nav.style.display = 'none';
      }
      try {
        var ac = document.querySelector('.app-container');
        if (ac) {
          ac.classList.remove('chat-mode');
          ac.classList.add('list-mode');
        }
      } catch (e) {}
      showScreen('screen-phone');
    };

    // ---------- 2D) renderConvList monkey-patch → OO listesine yaz ----------
    function phoneForConn(connId) {
      try {
        if (typeof getContactByConnId === 'function') {
          var c = getContactByConnId(connId);
          if (c && c.number) return String(c.number);
        }
      } catch (e) {}
      try {
        var st = getEngineState();
        var raw = st && st.users ? st.users.get(connId) : '';
        var m = String(raw || '').match(/\[(.*?)\]/);
        if (m && m[1]) return m[1];
      } catch (e) {}
      return '';
    }
    function contactNameForConn(connId) {
      try {
        if (typeof getContactByConnId === 'function') {
          var c = getContactByConnId(connId);
          if (c && c.name) return String(c.name);
        }
      } catch (e) {}
      return '';
    }
    // Adı temizle: rehberde varsa kişi adı; yoksa [xxx] kısmını atılmış nick; o da yoksa numara
    // 'Kullanıcı' literali eski profil yayınlarından kalma "leke" sayılır → boş kabul edilir.
    function resolveDisplayName(connId, rawName) {
      var fromContact = contactNameForConn(connId);
      if (fromContact) return fromContact;
      var clean = String(rawName || '').replace(/\[.*?\]/g, '').trim();
      if (clean && clean.toLocaleLowerCase('tr') === 'p2p') clean = '';
      if (clean && clean.toLocaleLowerCase('tr') === 'kullanıcı') clean = '';
      if (clean) return clean;
      var phone = phoneForConn(connId);
      return phone || (connId ? String(connId).substring(0, 10) : '—');
    }

    function openPeerCardByConnId(connId, anchorEl, ev) {
      if (!connId) return;
      var overlay = document.getElementById('contactCardOverlay');
      if (!overlay) return;
      var name = contactNameForConn(connId);
      var number = phoneForConn(connId);
      var raw = '';
      try {
        var st = getEngineState();
        raw = st && st.users ? (st.users.get(connId) || '') : '';
      } catch (e) {}
      var displayName = resolveDisplayName(connId, raw);
      _activeCard = { name: name || displayName, number: number || '', connId: connId, engineIndex: -1 };

      var avEl = document.getElementById('ccAvatar');
      if (avEl) {
        // BUG FIX (Adım 12): Eski kod anchorEl içindeki herhangi bir <img>'i
        // profil fotoğrafı sanıyordu. Twemoji, mesajlardaki/önizlemedeki emojileri
        // <img class="emoji"> haline getirdiği için kişi kartını mesaj balonundan
        // açtığında son gönderilen emoji avatar olarak gözüküyordu. Sadece gerçek
        // profil fotoğrafı kapsayıcılarındaki img'leri kabul et ve twemoji'yi ele.
        var sourceAvatar = null;
        if (anchorEl && anchorEl.querySelector) {
          sourceAvatar = anchorEl.querySelector(
            '.conv-avatar img, .contact-avatar img, .chat-h-avatar img, .cc-avatar img, .profile-pic img'
          );
          if (sourceAvatar && (sourceAvatar.classList.contains('emoji') ||
              /twemoji|emoji/i.test(sourceAvatar.src || ''))) {
            sourceAvatar = null;
          }
        }
        if (sourceAvatar && sourceAvatar.src) avEl.innerHTML = '<img src="' + sourceAvatar.src + '" alt="Profil">';
        else avEl.innerHTML = escapeHtml(getInitials(name || displayName, number));
      }
      var nmEl = document.getElementById('ccName');
      if (nmEl) nmEl.textContent = name || displayName || number || '—';
      var phEl = document.getElementById('ccPhone');
      if (phEl) phEl.textContent = number || '—';

      try {
        var rect = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
        var orect = overlay.getBoundingClientRect();
        var px = (ev && ev.clientX) ? ev.clientX : (rect ? rect.left + rect.width / 2 : orect.left + orect.width / 2);
        var py = (ev && ev.clientY) ? ev.clientY : (rect ? rect.top + rect.height / 2 : orect.top + orect.height / 2);
        overlay.style.setProperty('--tx', (px - orect.left) + 'px');
        overlay.style.setProperty('--ty', (py - orect.top) + 'px');
      } catch (e) {}

      overlay.classList.remove('closing');
      overlay.classList.add('open');
    }

    // ---------- Basılı tut → sohbeti sil ----------
    function ooConfirmDelete(name, onYes) {
      var back = document.createElement('div');
      back.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px;animation:ooFadeIn .18s ease';
      var box = document.createElement('div');
      box.style.cssText = 'width:100%;max-width:320px;background:#182533;color:#e9edf2;border-radius:18px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.5);font-family:inherit';
      box.innerHTML =
        '<div style="font-size:16px;font-weight:700;margin-bottom:6px">Sohbeti sil</div>' +
        '<div style="font-size:13.5px;opacity:.75;line-height:1.45">' +
        (name ? String(name).replace(/[<>&]/g, '') : 'Bu kişi') +
        ' ile olan sohbet ve tüm mesajlar kalıcı olarak silinecek.</div>' +
        '<div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end">' +
        '<button data-x="no" style="flex:0 0 auto;padding:10px 16px;border-radius:12px;border:0;background:#233445;color:#e9edf2;font-size:14px;font-weight:600">Vazgeç</button>' +
        '<button data-x="yes" style="flex:0 0 auto;padding:10px 16px;border-radius:12px;border:0;background:#e5484d;color:#fff;font-size:14px;font-weight:700">Sil</button>' +
        '</div>';
      back.appendChild(box);
      function close() { try { back.remove(); } catch (e) {} }
      back.addEventListener('click', function (ev) {
        if (ev.target === back) return close();
        var x = ev.target.getAttribute && ev.target.getAttribute('data-x');
        if (x === 'no') return close();
        if (x === 'yes') { close(); try { onYes(); } catch (e) {} }
      });
      document.body.appendChild(back);
    }

    document.addEventListener('click', function (ev) {
      if (window.__ooLongPressAt && Date.now() - window.__ooLongPressAt < 700) {
        if (ev.target.closest && ev.target.closest('#screen-sohbetler .content-area .conv-item')) {
          ev.preventDefault(); ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        }
      }
    }, true);

    function bindConvLongPress(el, connId, name) {
      var timer = null, moved = false, fired = false;
      function trigger() {
        fired = true;
        window.__ooLongPressAt = Date.now();
        try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) {}
        ooConfirmDelete(name, function () {
          if (typeof window.deleteConversation === 'function') window.deleteConversation(connId);
        });
      }
      function clear() { if (timer) { clearTimeout(timer); timer = null; } }
      el.addEventListener('touchstart', function () {
        moved = false; fired = false; clear();
        timer = setTimeout(function () { if (!moved) trigger(); }, 550);
      }, { passive: true });
      el.addEventListener('touchmove', function () { moved = true; clear(); }, { passive: true });
      el.addEventListener('touchend', function () { clear(); }, { passive: true });
      el.addEventListener('touchcancel', function () { clear(); }, { passive: true });
      el.addEventListener('mousedown', function (ev) {
        if (ev.button !== 0) return;
        moved = false; fired = false; clear();
        timer = setTimeout(function () { if (!moved) trigger(); }, 550);
      });
      el.addEventListener('mousemove', function () { moved = true; clear(); });
      el.addEventListener('mouseup', function () { clear(); });
      el.addEventListener('mouseleave', function () { clear(); });
      el.addEventListener('contextmenu', function (ev) { ev.preventDefault(); clear(); trigger(); });
      el.addEventListener('click', function (ev) {
        if (fired) { fired = false; ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); }
      }, true);
    }


    var origRender = window.renderConvList;
    window.renderConvList = function () {
      try { if (typeof origRender === 'function') origRender.apply(this, arguments); } catch (e) { console.error(e); }
      var oo = document.querySelector('#screen-sohbetler .content-area');
      var src = document.getElementById('convListOzel');
      if (!oo || !src) return;
      var st = getEngineState();
      var convMap = (st && st.conversations) ? st.conversations : null;
      // state.conversations Map sırası = motorun render sırası (sadece isPrivate olanlar)
      var connIds = convMap ? Array.from(convMap.keys()).filter(function (k) {
        var c = convMap.get(k); return c && c.isPrivate;
      }) : [];
      var srcChildren = Array.from(src.children);
      var seen = Object.create(null);
      oo.innerHTML = '';
      srcChildren.forEach(function (child, idx) {
        var connId = connIds[idx] || '';
        var nameEl = child.querySelector('.conv-name');
        var rawName = nameEl ? (nameEl.textContent || '') : '';
        var display = resolveDisplayName(connId, rawName);
        // Adım 7: dedup ARTIK telefon numarası bazlı.
        // Aynı numaradan gelen mesajlar — karşı taraf adını/profilini değiştirmiş olsa bile —
        // tek bir thread'de birikir. Numara çıkmazsa connId, o da yoksa son çare olarak isim.
        var phoneKey = (phoneForConn(connId) || '').replace(/[^\d+]/g, '');
        var key = phoneKey || ('cid:' + (connId || display.toLowerCase()));
        if (seen[key]) return; // Aynı kişi için yeni kutu açma
        seen[key] = true;
        var clone = child.cloneNode(true);
        var cloneName = clone.querySelector('.conv-name');
        if (cloneName) cloneName.textContent = display;
        var prev = clone.querySelector('.conv-preview');
        if (prev) prev.textContent = (prev.textContent || '').replace(/\[.*?\]/g, '').trim();
        if (connId) clone.dataset.connId = connId;
        // Dedup sonrası src ↔ clone eşlemesini bozmamak için doğrudan kaynak öğeyi tutuyoruz.
        clone.__srcChild = child;
        // Sohbet kutusuna tıklayınca DOĞRUDAN sohbet penceresini aç (capture phase, garantili).
        clone.addEventListener('click', function (ev) {
          // Avatara tıklama kendi handler'ı ile kişi kartını açıyor; burada karışmıyoruz.
          if (ev.target.closest && ev.target.closest('.conv-avatar')) return;
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
          if (connId && typeof window.openChat === 'function') {
            try { window.openChat(connId); return; } catch (e) { console.error('[adapter] openChat hata:', e); }
          }
          // Son çare: kaynak motor öğesinin onclick'ini çağır (openChat closure'u onda)
          try { child.click(); } catch (e) { console.error('[adapter] src.click hata:', e); }
        }, true);
        // Avatara tıklayınca: kişi kartı (motorun showContactCard'ı). Sohbet kutusuna tıklayınca: openChat.
        var avEl = clone.querySelector('.conv-avatar');
        if (avEl) {
          if (connId) paintAvatarPresence(avEl, isConnOnline(connId));
          avEl.style.cursor = 'pointer';
          avEl.addEventListener('click', function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
            if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
            if (connId) {
              try { openPeerCardByConnId(connId, clone, ev); } catch (e) { console.error('[adapter] peer card hata:', e); }
            } else {
              // connId yoksa kişi kartı yerine direkt sohbeti aç
              try { child.click(); } catch (e) {}
            }
          }, true);
        }
        if (connId) bindConvLongPress(clone, connId, display);
        oo.appendChild(clone);
      });
      enterMain();
    };

    // OO listesine click delegasyonu — yukarıdaki per-clone handler çalışmazsa son güvenlik ağı.
    document.addEventListener('click', function (ev) {
      var item = ev.target.closest && ev.target.closest('#screen-sohbetler .content-area .conv-item');
      if (!item) return;
      // Avatar üzerinde kendi handler'ı çalışıyor.
      if (ev.target.closest && ev.target.closest('.conv-avatar')) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      var cid = item.dataset.connId;
      if (cid && typeof window.openChat === 'function') {
        try { window.openChat(cid); return; } catch (e) { console.error('[adapter] openChat hata:', e); }
      }
      // Doğrudan kaynak öğeye delege
      if (item.__srcChild && typeof item.__srcChild.click === 'function') {
        try { item.__srcChild.click(); return; } catch (e) {}
      }
      var oo = document.querySelector('#screen-sohbetler .content-area');
      var idx = Array.prototype.indexOf.call(oo.children, item);
      var src = document.getElementById('convListOzel');
      if (src && src.children[idx]) src.children[idx].click();
    }, true);

    // ---------- 2E) openChat monkey-patch → OO chat ekranını göster + başlık/avatar ----------
    var origOpenChat = window.openChat;
    window.openChat = async function (id) {
      // Önce motor mesajları eksiksiz hazırlasın. Ekranı bundan önce açmak, özellikle
      // büyük medya kayıtlarında boş sohbetin açılıp bilgilerin sonradan gelmesine yol açıyordu.
      try { if (typeof origOpenChat === 'function') await origOpenChat.apply(this, arguments); } catch (e) { console.error(e); }
      showScreen('screen-chat');
      // OO başlık/avatar
      var nameEl = document.getElementById('chatHName');
      var avEl = document.getElementById('chatHAvatar');
      if (nameEl) {
        var t = document.getElementById('topbarTitle');
        var raw0 = t ? (t.innerText || '') : '';
        var st0 = getEngineState();
        var cid0 = (st0 && st0.activeChat) || id;
        nameEl.innerText = resolveDisplayName(cid0, raw0);
      }
      if (avEl) {
        // Motorun çizdiği avatarı (topbarAvatar) klonla
        var src = document.getElementById('topbarAvatar');
        if (src) {
          avEl.innerHTML = src.innerHTML;
          avEl.className = 'chat-h-avatar ' + (src.className.replace(/\btopbar-avatar\b|\bhidden\b/g, '').trim());
        }
        avEl.style.cursor = cid0 ? 'pointer' : '';
        avEl.onclick = cid0 ? function (ev) { openPeerCardByConnId(cid0, avEl, ev); } : null;
      }
      // Mesaj kutusunu hazırla: temizle, ikonu güncelle — KLAVYE TETİKLEME
      var ci = document.getElementById('chatInput');
      if (ci) {
        ci.value = '';
        // Kullanıcı yazmaya başlayana kadar klavye açılmasın
        try { ci.blur(); } catch (e) {}
        if (document.activeElement && document.activeElement !== document.body) {
          try { document.activeElement.blur(); } catch (e) {}
        }
      }
      try { window.updateSendIcon && window.updateSendIcon(); } catch (e) {}
      // En alttaki mesajdan başla — kısa bir gecikme ile (showScreen geçişi sonrası)
      var msgs = document.getElementById('chatMessages');
      if (msgs) {
        var prev = msgs.style.scrollBehavior;
        msgs.style.scrollBehavior = 'auto';
        if (typeof window.ooPinChatBottom === 'function') window.ooPinChatBottom(msgs);
        else msgs.scrollTop = msgs.scrollHeight;
        requestAnimationFrame(function () {
          if (typeof window.ooPinChatBottom === 'function') window.ooPinChatBottom(msgs);
          else msgs.scrollTop = msgs.scrollHeight;
          msgs.style.scrollBehavior = prev || '';
        });
      }
    };

    // ---------- 2F) OO chat aksiyonları ----------
    window.closeChat = function () {
      var st = getEngineState();
      // Motorun kendi geri dönüş temizliğini de çalıştır; yalnızca ekran sınıfını
      // değiştirmek medya/görüntüleyici katmanlarının geride kalmasına yol açıyordu.
      try {
        if (typeof backToList === 'function') backToList();
        else if (st) { st.chatMode = 'list'; st.activeChat = null; }
      } catch (e) {
        if (st) { st.chatMode = 'list'; st.activeChat = null; }
      }
      try { window.renderTypingUI && window.renderTypingUI(); } catch (e) {}
      var ac = document.querySelector('.app-container');
      if (ac) { ac.classList.remove('chat-mode'); ac.classList.add('list-mode'); }
      showScreen('screen-sohbetler');
    };

    window.sendChatMsg = function () {
      var inp = document.getElementById('chatInput');
      if (!inp || !inp.value.trim()) return;
      // Motorun gerçek gönderim fonksiyonu (özel sohbette ZORUNLU P2P, WSS yalnız tanıştırma)
      if (typeof window.sendCurrentMessage === 'function') {
        window.sendCurrentMessage();
      } else {
        // Fallback: Enter tuşu simülasyonu
        var ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
        inp.dispatchEvent(ev);
      }
      // Gönderim sonrası ikonu mikrofona döndür ve odağı koru
      try { window.updateSendIcon && window.updateSendIcon(); } catch (e) {}
      try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); }
    };

    window.onSendBtn = function () { window.sendChatMsg(); };

    window.updateSendIcon = function () {
      var inp = document.getElementById('chatInput');
      var btn = document.getElementById('chatSendBtn');
      if (!inp || !btn) return;
      if (inp.value.trim()) { btn.classList.remove('is-mic'); btn.classList.add('is-send'); }
      else { btn.classList.add('is-mic'); btn.classList.remove('is-send'); }
    };

    // Chat üst barı (Adım 4): ses/görüntülü arama bağlandı
    window.chatCall    = window.chatCall    || function () { startCallForActiveChat('audio'); };
    window.chatVideo   = window.chatVideo   || function () { startCallForActiveChat('video'); };
    window.chatMore    = window.chatMore    || function () { console.info('[adapter] chatMore'); };
    window.chatNext = function () {
      try {
        var st = getEngineState();
        if (!st || !st.conversations) return;
        var ids = Array.from(st.conversations.keys()).filter(function (k) {
          var c = st.conversations.get(k); return c && c.isPrivate;
        });
        var cur = st.activeChat;
        var next = null;
        if (ids.length >= 2) {
          var i = ids.indexOf(cur);
          next = ids[(i >= 0 ? (i + 1) % ids.length : 0)];
        }
        if (!next) {
          var contacts = [];
          try {
            if (typeof contactsState !== 'undefined' && contactsState && contactsState.byNumber) {
              contacts = Array.from(contactsState.byNumber.values()).filter(function (c) { return c && c.number; });
            }
          } catch (e) {}
          if (!contacts.length) return;
          var currentNumber = phoneForConn(cur);
          var idx = contacts.findIndex(function (c) { return normalizePhoneForAdapter(c.number) === normalizePhoneForAdapter(currentNumber); });
          var nextContact = contacts[(idx >= 0 ? (idx + 1) % contacts.length : 0)];
          if (nextContact && typeof window.openContactByNumber === 'function') {
            window.openContactByNumber(nextContact.number);
            return;
          }
        }
        if (next && typeof window.openChat === 'function') window.openChat(next);
      } catch (e) { console.error('[adapter] chatNext hata:', e); }
    };
    // ---------- 2G) Mesaj kutusu içi: Ekle / Emoji / Kamera / Mikrofon ----------
    // Emoji listeleri (faces + flags)
    var EMOJI_FACES = [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇',
      '🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝',
      '🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄',
      '😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧',
      '🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁',
      '☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭',
      '😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈',
      '👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸',
      '😹','😻','😼','😽','🙀','😿','😾','❤️','🧡','💛','💚','💙','💜',
      '🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟',
      '👍','👎','👏','🙌','👐','🤲','🤝','🙏','✌️','🤞','🤟','🤘','👌',
      '🤌','🤏','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤙','💪'
    ];
    // Bayraklar (sırası kullanıcı tarafından belirlendi, başkası eklenmeyecek):
    // Türkiye → Doğu Türkistan → Azerbaycan → Türkmenistan →
    // diğer Türk devletleri (Kazakistan, Kırgızistan, Özbekistan, KKTC) →
    // İslam ülkeleri (Körfez → Levant → Güney/Orta Asya → Kuzey Afrika).
    // Doğu Türkistan ve KKTC için Unicode flag emoji yok; inline SVG (data URI) kullanılır.
    // Doğu Türkistan bayrağı: gerçek görsel (public/apps/flag-dogu-turkistan.png).
    // Emoji boyutuna küçültülerek bayrak sekmesinde Türkiye'den hemen sonra gösterilir.
    var FLAG_DOGU_TURKISTAN = 'flag-dogu-turkistan.png';
    var FLAG_KKTC = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">' +
      '<rect width="1200" height="800" fill="#fff"/>' +
      '<rect y="60" width="1200" height="80" fill="#E30A17"/>' +
      '<rect y="660" width="1200" height="80" fill="#E30A17"/>' +
      '<circle cx="540" cy="400" r="135" fill="#E30A17"/>' +
      '<circle cx="585" cy="400" r="110" fill="#fff"/>' +
      '<polygon fill="#E30A17" points="700,400 783,376 732,448 732,352 783,424"/>' +
      '</svg>'
    );
    var EMOJI_FLAGS = [
      { e: '🇹🇷', t: 'Türkiye' },
      { img: FLAG_DOGU_TURKISTAN, t: 'Doğu Türkistan' },
      { e: '🇦🇿', t: 'Azerbaycan' },
      { e: '🇹🇲', t: 'Türkmenistan' },
      { e: '🇰🇿', t: 'Kazakistan' },
      { e: '🇰🇬', t: 'Kırgızistan' },
      { e: '🇺🇿', t: 'Özbekistan' },
      { img: FLAG_KKTC, t: 'KKTC' },
      { e: '🇸🇦', t: 'Suudi Arabistan' },
      { e: '🇦🇪', t: 'BAE' },
      { e: '🇶🇦', t: 'Katar' },
      { e: '🇰🇼', t: 'Kuveyt' },
      { e: '🇧🇭', t: 'Bahreyn' },
      { e: '🇴🇲', t: 'Umman' },
      { e: '🇾🇪', t: 'Yemen' },
      { e: '🇯🇴', t: 'Ürdün' },
      { e: '🇱🇧', t: 'Lübnan' },
      { e: '🇵🇸', t: 'Filistin' },
      { e: '🇸🇾', t: 'Suriye' },
      { e: '🇮🇶', t: 'Irak' },
      { e: '🇮🇷', t: 'İran' },
      { e: '🇦🇫', t: 'Afganistan' },
      { e: '🇵🇰', t: 'Pakistan' },
      { e: '🇧🇩', t: 'Bangladeş' },
      { e: '🇲🇾', t: 'Malezya' },
      { e: '🇮🇩', t: 'Endonezya' },
      { e: '🇧🇳', t: 'Brunei' },
      { e: '🇲🇻', t: 'Maldivler' },
      { e: '🇪🇬', t: 'Mısır' },
      { e: '🇱🇾', t: 'Libya' },
      { e: '🇹🇳', t: 'Tunus' },
      { e: '🇩🇿', t: 'Cezayir' },
      { e: '🇲🇦', t: 'Fas' },
      { e: '🇸🇩', t: 'Sudan' },
      { e: '🇸🇴', t: 'Somali' }
    ];
    var __ciEmojiTab = 'faces';

    function ciRenderEmojis() {
      var grid = document.getElementById('ciEmojiGrid'); if (!grid) return;
      var list = (__ciEmojiTab === 'flags') ? EMOJI_FLAGS : EMOJI_FACES;
      grid.innerHTML = '';
      list.forEach(function (item) {
        var b = document.createElement('button');
        b.type = 'button';
        if (typeof item === 'string') {
          b.textContent = item;
          b.title = item;
          b.onclick = function () { ciInsertEmoji(item); };
        } else if (item && item.img) {
          b.title = item.t || '';
          b.style.padding = '0';
          b.style.display = 'flex';
          b.style.alignItems = 'center';
          b.style.justifyContent = 'center';
          var im = document.createElement('img');
          im.src = item.img; im.alt = item.t || '';
          // Emoji boyutunda kare bayrak (Doğu Türkistan / KKTC)
          im.style.width = '26px'; im.style.height = '20px';
          im.style.objectFit = 'contain'; im.style.borderRadius = '3px';
          im.style.display = 'block';
          b.appendChild(im);
          // Engine düz metin gönderdiği için sentinel token gönderiyoruz; render sırasında
          // adapter (FLAG_TOKENS observer) bu token'ı gerçek bayrak <img>'ine çeviriyor.
          // Böylece ☪ U+262A'nın mor görünmesi sorunu çözülür ve karşı tarafta da bayrak görünür.
          var token = (item.t === 'KKTC') ? '\uE002' : '\uE001';
          b.onclick = function () { ciInsertEmoji(token); };
        } else if (item && item.e) {
          b.textContent = item.e;
          b.title = item.t || item.e;
          b.onclick = function () { ciInsertEmoji(item.e); };
        }
        grid.appendChild(b);
      });
      // Unicode bayraklar Windows'ta "TR/AZ" harfleri gösterir; twemoji ile gerçek bayrağa çevir
      try { window.twemoji && window.twemoji.parse(grid, { folder: 'svg', ext: '.svg' }); } catch (_) {}
      // Bayrak sekmesindeki tüm görseller (twemoji + özel bayraklar) aynı ölçüde olsun
      if (__ciEmojiTab === 'flags') {
        try {
          grid.querySelectorAll('img').forEach(function (im) {
            im.style.width = '26px'; im.style.height = '20px';
            im.style.objectFit = 'contain'; im.style.borderRadius = '3px';
            im.style.display = 'block'; im.style.margin = '0';
          });
        } catch (_) {}
      }
    }
    function ciInsertEmoji(em) {
      var inp = document.getElementById('chatInput'); if (!inp) return;
      var s = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
      var e = inp.selectionEnd != null ? inp.selectionEnd : s;
      inp.value = inp.value.slice(0, s) + em + inp.value.slice(e);
      var pos = s + em.length;
      try { inp.setSelectionRange(pos, pos); } catch (_) {}
      // value programatik değiştiği için textarea'nın input olayı kendiliğinden
      // çalışmaz. Ayna/auto-grow her emoji ve bayrak seçiminde hemen güncellensin.
      try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
      try { window.updateSendIcon && window.updateSendIcon(); } catch (_) {}
    }
    window.ciSwitchEmojiTab = function (tab) {
      __ciEmojiTab = (tab === 'flags') ? 'flags' : 'faces';
      var tabs = document.querySelectorAll('#ciEmojiPanel .ci-tab');
      tabs.forEach(function (t) {
        t.classList.toggle('active', t.getAttribute('data-emoji-tab') === __ciEmojiTab);
      });
      ciRenderEmojis();
    };
    window.ciClosePanels = function () {
      var a = document.getElementById('ciAttachPanel'); if (a) a.classList.add('hidden');
      var e = document.getElementById('ciEmojiPanel');  if (e) e.classList.add('hidden');
      var pb = document.getElementById('ciPlusBtn');    if (pb) pb.classList.remove('active');
      var eb = document.getElementById('ciEmojiBtn');   if (eb) eb.classList.remove('active');
    };
    window.chatToggleAttach = function () {
      var a = document.getElementById('ciAttachPanel');
      var e = document.getElementById('ciEmojiPanel');
      var pb = document.getElementById('ciPlusBtn');
      var eb = document.getElementById('ciEmojiBtn');
      if (!a) return;
      var open = a.classList.contains('hidden');
      if (e) e.classList.add('hidden');
      if (eb) eb.classList.remove('active');
      a.classList.toggle('hidden', !open);
      if (pb) pb.classList.toggle('active', open);
      if (open) { try { document.getElementById('chatInput').blur(); } catch (_) {} }
    };
    window.chatToggleEmoji = function () {
      var a = document.getElementById('ciAttachPanel');
      var e = document.getElementById('ciEmojiPanel');
      var pb = document.getElementById('ciPlusBtn');
      var eb = document.getElementById('ciEmojiBtn');
      if (!e) return;
      var open = e.classList.contains('hidden');
      if (a) a.classList.add('hidden');
      if (pb) pb.classList.remove('active');
      e.classList.toggle('hidden', !open);
      if (eb) eb.classList.toggle('active', open);
      if (open) {
        try { document.getElementById('chatInput').blur(); } catch (_) {}
        ciRenderEmojis();
      }
    };

    // ---------- Ekle paneli: gerçek medya gönderimi ----------
    // Fotoğraf / kamera / video / dosya seçilir → dataURL'e çevrilip
    // engine.sendMediaMessage() ile P2P gönderilir ve sohbette kalıcı kalır.
    function _ciActiveTarget() {
      var target = null;
      try { target = (typeof state !== 'undefined' && state) ? (state.activeChat || state.target) : null; } catch (_) {}
      if (!target || target === 'HERKES' || target === 'genel') return null;
      return target;
    }
    function _ciFileToDataUrl(file) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result || '')); };
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
    }
    function _ciCompressImage(file, maxSize, quality) {
      return new Promise(function (resolve) {
        var fr = new FileReader();
        fr.onload = function () {
          var img = new Image();
          img.onload = function () {
            try {
              var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
              var cv = document.createElement('canvas');
              cv.width = Math.max(1, Math.round(img.width * scale));
              cv.height = Math.max(1, Math.round(img.height * scale));
              cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
              resolve({ dataUrl: cv.toDataURL('image/jpeg', quality), mime: 'image/jpeg' });
            } catch (e) { resolve({ dataUrl: String(fr.result || ''), mime: file.type || 'image/jpeg' }); }
          };
          img.onerror = function () { resolve({ dataUrl: String(fr.result || ''), mime: file.type || 'image/jpeg' }); };
          img.src = String(fr.result || '');
        };
        fr.onerror = function () { resolve({ dataUrl: '', mime: '' }); };
        fr.readAsDataURL(file);
      });
    }
    async function _ciSendFile(file) {
      window.ciClosePanels && window.ciClosePanels();
      if (!file) return;
      var target = _ciActiveTarget();
      if (!target || typeof window.sendMediaMessage !== 'function') {
        console.warn('[adapter] medya için aktif özel sohbet gerekir');
        return;
      }
      var type = file.type || '';
      var kind = type.indexOf('image/') === 0 ? 'image' : (type.indexOf('video/') === 0 ? 'video' : 'file');
      try {
        if (kind === 'image') {
          var out = await _ciCompressImage(file, 1280, 0.8);
          if (!out.dataUrl) return;
          await window.sendMediaMessage(target, out.dataUrl, 'image', out.mime, file.name || 'foto.jpg');
        } else {
          if (file.size > 25 * 1024 * 1024) { console.warn('[adapter] dosya çok büyük (>25MB)'); return; }
          var du = await _ciFileToDataUrl(file);
          if (!du) return;
          await window.sendMediaMessage(target, du, kind, type || 'application/octet-stream', file.name || 'dosya');
        }
      } catch (e) { console.warn('[adapter] medya gönderme hatası', e); }
    }
    function ciPickFile(accept, capture) {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept || '*/*';
      if (capture) inp.capture = capture;
      inp.onchange = function () { _ciSendFile(inp.files && inp.files[0]); };
      inp.click();
    }
    window.chatAttach     = function () { window.chatToggleAttach(); };
    window.chatPickPhoto  = function () { ciPickFile('image/*,video/*'); };
    window.chatPickDoc    = function () { ciPickFile('*/*'); };
    // ---------- Dahili kamera (fotoğraf çek / video kaydet) ----------
    var __ooCam = { stream: null, rec: null, chunks: [], timer: null, startedAt: 0, facing: 'environment', mime: 'video/webm' };

    function ooCamEl() {
      var el = document.getElementById('ooCamModal');
      if (el) return el;
      el = document.createElement('div');
      el.id = 'ooCamModal';
      el.className = 'oo-cam hidden';
      el.innerHTML =
        '<video id="ooCamVideo" autoplay playsinline muted></video>' +
        '<div class="oo-cam-top">' +
          '<button type="button" class="oo-cam-btn" id="ooCamClose" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button>' +
          '<button type="button" class="oo-cam-btn" id="ooCamFlip" aria-label="Kamerayı çevir"><i class="fa-solid fa-camera-rotate"></i></button>' +
        '</div>' +
        '<div class="oo-cam-timer" id="ooCamTimer">0:00</div>' +
        '<div class="oo-cam-bottom">' +
          '<span class="oo-cam-hint">Dokun: fotoğraf • Basılı tut: video</span>' +
          '<button type="button" class="oo-cam-shutter" id="ooCamShutter" aria-label="Çek"></button>' +
          '<span class="oo-cam-hint"></span>' +
        '</div>';
      document.body.appendChild(el);
      el.querySelector('#ooCamClose').onclick = ooCamClose;
      el.querySelector('#ooCamFlip').onclick = function () {
        __ooCam.facing = __ooCam.facing === 'environment' ? 'user' : 'environment';
        ooCamStart();
      };
      var sh = el.querySelector('#ooCamShutter');
      var held = false, holdTimer = null;
      var down = function (e) {
        e.preventDefault(); held = false;
        holdTimer = setTimeout(function () { held = true; ooCamStartRecording(); }, 380);
      };
      var up = function (e) {
        e.preventDefault();
        clearTimeout(holdTimer);
        if (held) ooCamStopRecording(); else ooCamTakePhoto();
        held = false;
      };
      sh.addEventListener('pointerdown', down);
      sh.addEventListener('pointerup', up);
      sh.addEventListener('pointercancel', function () { clearTimeout(holdTimer); if (held) ooCamStopRecording(); held = false; });
      return el;
    }

    async function ooCamStart() {
      var el = ooCamEl();
      try {
        if (__ooCam.stream) __ooCam.stream.getTracks().forEach(function (t) { t.stop(); });
        __ooCam.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: __ooCam.facing }, audio: true
        });
        var v = el.querySelector('#ooCamVideo');
        v.srcObject = __ooCam.stream;
        el.classList.remove('hidden');
      } catch (e) {
        console.warn('[adapter] kamera açılamadı', e);
        alert('Kameraya erişilemedi. Lütfen kamera iznini verin.');
        ooCamClose();
      }
    }

    function ooCamClose() {
      var el = document.getElementById('ooCamModal');
      try { if (__ooCam.rec && __ooCam.rec.state === 'recording') __ooCam.rec.stop(); } catch (_) {}
      try { if (__ooCam.stream) __ooCam.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
      __ooCam.stream = null; __ooCam.rec = null;
      clearInterval(__ooCam.timer);
      if (el) { el.classList.add('hidden'); el.classList.remove('recording'); }
    }

    function ooCamSendDataUrl(dataUrl, kind, mime, name) {
      var target = _ciActiveTarget();
      if (!target || typeof window.sendMediaMessage !== 'function') {
        console.warn('[adapter] medya için aktif özel sohbet gerekir');
        return;
      }
      window.sendMediaMessage(target, dataUrl, kind, mime, name);
    }

    function ooCamTakePhoto() {
      var el = document.getElementById('ooCamModal');
      var v = el && el.querySelector('#ooCamVideo');
      if (!v || !v.videoWidth) return;
      var maxSize = 1280;
      var scale = Math.min(1, maxSize / Math.max(v.videoWidth, v.videoHeight));
      var cv = document.createElement('canvas');
      cv.width = Math.round(v.videoWidth * scale);
      cv.height = Math.round(v.videoHeight * scale);
      var ctx = cv.getContext('2d');
      if (__ooCam.facing === 'user') { ctx.translate(cv.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(v, 0, 0, cv.width, cv.height);
      var dataUrl = cv.toDataURL('image/jpeg', 0.82);
      ooCamClose();
      ooCamSendDataUrl(dataUrl, 'image', 'image/jpeg', 'foto-' + Date.now() + '.jpg');
    }

    function ooCamPickVideoMime() {
      // mp4 önce: her yerde (iOS dahil) oynatılabilir. webm parametreli MIME'ı
      // sonradan temizliyoruz, aksi halde data:URL bozulup video açılmıyor.
      var cands = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
      for (var i = 0; i < cands.length; i++) {
        try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(cands[i])) return cands[i]; } catch (_) {}
      }
      return 'video/webm';
    }

    function ooCamStartRecording() {
      if (!__ooCam.stream || !window.MediaRecorder) return;
      var el = document.getElementById('ooCamModal');
      try {
        __ooCam.mime = ooCamPickVideoMime();
        __ooCam.chunks = [];
        __ooCam.rec = new MediaRecorder(__ooCam.stream, { mimeType: __ooCam.mime, videoBitsPerSecond: 900000 });
        // Kaydedicinin gerçekten kullandığı türü esas al, parametreleri at.
        __ooCam.mime = String(__ooCam.rec.mimeType || __ooCam.mime).split(';')[0] || 'video/webm';
        __ooCam.rec.ondataavailable = function (e) { if (e.data && e.data.size) __ooCam.chunks.push(e.data); };
        __ooCam.rec.onstop = ooCamFinishRecording;
        __ooCam.rec.start(200);
        __ooCam.startedAt = Date.now();
        el.classList.add('recording');
        var t = el.querySelector('#ooCamTimer');
        __ooCam.timer = setInterval(function () {
          var s = Math.floor((Date.now() - __ooCam.startedAt) / 1000);
          t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
          if (s >= 30) ooCamStopRecording(); // güvenli üst sınır
        }, 250);
      } catch (e) { console.warn('[adapter] video kaydı başlatılamadı', e); }
    }

    function ooCamStopRecording() {
      clearInterval(__ooCam.timer);
      var el = document.getElementById('ooCamModal');
      if (el) el.classList.remove('recording');
      try { if (__ooCam.rec && __ooCam.rec.state === 'recording') __ooCam.rec.stop(); } catch (_) {}
    }

    function ooCamFinishRecording() {
      var mime = String(__ooCam.mime || 'video/webm').split(';')[0];
      var blob = new Blob(__ooCam.chunks, { type: mime });
      __ooCam.chunks = [];
      ooCamClose();
      if (!blob.size) return;
      if (blob.size > 8 * 1024 * 1024) { alert('Video çok büyük (8MB üstü). Daha kısa çekin.'); return; }
      var fr = new FileReader();
      fr.onload = function () {
        var du = String(fr.result || '');
        if (du) ooCamSendDataUrl(du, 'video', mime, 'video-' + Date.now() + (mime === 'video/mp4' ? '.mp4' : '.webm'));
      };
      fr.readAsDataURL(blob);
    }

    window.chatCamera = function () {
      window.ciClosePanels && window.ciClosePanels();
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        ciPickFile('image/*,video/*', 'environment');
        return;
      }
      ooCamStart();
    };

    window.chatPickLocation = function () {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(function (pos) {
        var ci = document.getElementById('chatInput');
        if (ci) {
          ci.value = '📍 Konum: ' + pos.coords.latitude.toFixed(5) + ', ' + pos.coords.longitude.toFixed(5);
          try { window.updateSendIcon && window.updateSendIcon(); } catch (_) {}
          window.sendChatMsg && window.sendChatMsg();
        }
        window.ciClosePanels && window.ciClosePanels();
      }, function () { window.ciClosePanels && window.ciClosePanels(); });
    };

    // ---------- Mikrofon: bas-konuş kayıt ----------
    // Mikrofon: bas-konuş kayıt → gerçek ses verisi (opus/webm) P2P üzerinden gönderilir.
    // engine.js içindeki sendVoiceMessage(targetConnId, base64, durSec, mime) çağrılır.
    var __ciMic = { rec: null, stream: null, startedAt: 0, recording: false, chunks: [], mime: 'audio/webm' };
    function ciCanRecord() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    }
    function ciPickMime() {
      var cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      for (var i = 0; i < cands.length; i++) {
        try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(cands[i])) return cands[i]; } catch (_) {}
      }
      return '';
    }
    function _blobToBase64(blob) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () {
          var s = String(fr.result || '');
          var i = s.indexOf(','); resolve(i >= 0 ? s.slice(i + 1) : s);
        };
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
    }
    async function ciStartRecord() {
      if (!ciCanRecord() || __ciMic.recording) return;
      try {
        __ciMic.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        var mime = ciPickMime();
        __ciMic.rec = mime ? new MediaRecorder(__ciMic.stream, { mimeType: mime, audioBitsPerSecond: 24000 })
                           : new MediaRecorder(__ciMic.stream);
        __ciMic.mime = (__ciMic.rec.mimeType || mime || 'audio/webm').split(';')[0];
        __ciMic.chunks = [];
        __ciMic.rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) __ciMic.chunks.push(ev.data); };
        __ciMic.rec.start(250);
        __ciMic.startedAt = Date.now();
        __ciMic.recording = true;
        var btn = document.getElementById('chatSendBtn');
        if (btn) btn.classList.add('recording');
      } catch (e) { console.warn('[adapter] mic error', e); }
    }
    function ciStopRecord(send) {
      if (!__ciMic.recording) return;
      __ciMic.recording = false;
      var rec = __ciMic.rec, stream = __ciMic.stream, chunks = __ciMic.chunks, mime = __ciMic.mime;
      var dur = Math.max(1, Math.round((Date.now() - __ciMic.startedAt) / 1000));
      var btn = document.getElementById('chatSendBtn');
      if (btn) btn.classList.remove('recording');
      __ciMic.rec = null; __ciMic.stream = null; __ciMic.chunks = [];
      var stopAndCleanup = function () {
        try { stream && stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
      };
      if (!rec) { stopAndCleanup(); return; }
      rec.onstop = async function () {
        stopAndCleanup();
        if (!send) return;
        try {
          var blob = new Blob(chunks, { type: mime });
          if (!blob.size) { console.warn('[adapter] boş ses kaydı (çok kısa basıldı?)'); return; }
          if (dur > 25) dur = 25;
          var b64 = await _blobToBase64(blob);
          // engine.js içindeki state `const` ile tanımlı; window.state yok.
          // İframe içinden doğrudan global "state" referansı ile okuyoruz.
          var target = null;
          try { target = (typeof state !== 'undefined' && state) ? (state.target || state.activeChat) : null; } catch (_) {}
          if (!target || target === 'HERKES') {
            console.warn('[adapter] sesli mesaj için aktif özel sohbet gerekir (target=' + target + ')');
            return;
          }
          if (typeof window.sendVoiceMessage !== 'function') {
            console.warn('[adapter] engine.sendVoiceMessage yüklenmedi');
            return;
          }
          await window.sendVoiceMessage(target, b64, dur, mime);
        } catch (e) { console.warn('[adapter] voice send error', e); }
      };
      // Mevcut buffer'ı zorla flush et, sonra durdur (aksi halde kısa basışlarda chunk gelmeyebilir)
      try { rec.requestData && rec.requestData(); } catch (_) {}
      try { rec.stop(); } catch (_) { stopAndCleanup(); }
    }
    // Mikrofon basılı tut → kayıt; bırak → gönder. Tek tıklamada (yazı varsa) sendChatMsg() onSendBtn üstünden çalışır.
    (function bindMicHold() {
      var bound = false;
      function tryBind() {
        var btn = document.getElementById('chatSendBtn');
        if (!btn || bound) return;
        bound = true;
        btn.addEventListener('pointerdown', function (ev) {
          if (btn.classList.contains('is-send')) return; // yazı varken normal gönder
          ev.preventDefault();
          ciStartRecord();
        });
        var endHandler = function () { if (__ciMic.recording) ciStopRecord(true); };
        btn.addEventListener('pointerup', endHandler);
        btn.addEventListener('pointerleave', endHandler);
        btn.addEventListener('pointercancel', function () { if (__ciMic.recording) ciStopRecord(false); });
      }
      // OO ekranı sonradan render olabilir; biraz gecikmeli ve MutationObserver ile bağla
      tryBind();
      var mo = new MutationObserver(tryBind);
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(tryBind, 500);
    })();


    // ---------- KİŞİLER (Adım 2) ----------
    window.openAddContact = function () {
      var s = document.getElementById('addContactSheet');
      if (s) { s.classList.remove('hidden-screen'); s.classList.add('active'); }
      var n = document.getElementById('newContactName'); if (n) n.value = '';
      var p = document.getElementById('newContactPhone'); if (p) p.value = '+90 ';
      // Motorun stub error'ını da temizle
      var err = document.getElementById('newContactError'); if (err) { err.innerText = ''; err.classList.add('hidden'); }
      // Motorun bazı yerleri addContactModal'ı görünür sayıyor; senkron tut
      var m = document.getElementById('addContactModal'); if (m) m.classList.remove('hidden');
      setTimeout(function () { if (n) n.focus(); }, 50);
    };

    window.closeAddContact = function () {
      var s = document.getElementById('addContactSheet');
      if (s) { s.classList.add('hidden-screen'); s.classList.remove('active'); }
      var m = document.getElementById('addContactModal'); if (m) m.classList.add('hidden');
    };

    // OO sheet'inden Kaydet → motorun kendi saveNewContact akışına bağla.
    // Not: engine.js içindeki contactsState "const" olduğu için window üzerinden okunamaz.
    // Bu yüzden veriyi motor fonksiyonları ve motorun gizli #contactList çıktısı üzerinden taşırız.
    var _origUpdateContactList = typeof window.updateContactList === 'function' ? window.updateContactList : null;

    window.saveContact = async function () {
      var nameEl = document.getElementById('newContactName');
      var phoneEl = document.getElementById('newContactPhone');
      var numberStub = document.getElementById('newContactNumber');
      var errEl = document.getElementById('newContactError');

      var name = (nameEl && nameEl.value || '').trim();
      var phoneRaw = (phoneEl && phoneEl.value || '').trim();
      // İsim opsiyonel: girilmediyse rehberde numara olarak görünür (renderContacts numarayı yedek olarak kullanır)
      // +90 auto-normalize
      phoneRaw = window.__normalizePhone ? window.__normalizePhone(phoneRaw) : phoneRaw;
      if (phoneEl) phoneEl.value = phoneRaw;
      if (!phoneRaw || phoneRaw === '+90') { alert('Lütfen telefon numarası girin.'); phoneEl && phoneEl.focus(); return; }
      if (!name) name = phoneRaw;
      if (nameEl) nameEl.value = name;

      if (numberStub) numberStub.value = phoneRaw;
      if (errEl) { errEl.innerText = ''; errEl.classList.add('hidden'); }

      if (typeof window.saveNewContact !== 'function') {
        alert('Motor bağlantısı henüz kurulmadı. Lütfen birkaç saniye sonra tekrar deneyin.');
        return;
      }

      try {
        await window.saveNewContact();
      } catch (e) {
        console.error('[adapter] saveContact hata:', e);
        alert('Kişi eklenemedi: ' + (e && e.message ? e.message : e));
        return;
      }

      if (errEl && !errEl.classList.contains('hidden') && errEl.innerText.trim()) {
        alert(errEl.innerText.trim());
        return;
      }

      window.closeAddContact();
      if (nameEl) nameEl.value = '';
      if (phoneEl) phoneEl.value = '';
      window.renderContacts();
    };

    // Motorun #contactList stub'ından OO'nun #contactsList'ine yansıt
    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function getInitials(name, number) {
      var src = (name || number || '?').trim();
      var parts = src.split(/\s+/).filter(Boolean);
      var letters = parts.length >= 2
        ? (parts[0][0] + parts[1][0])
        : (src.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/g, '').slice(0, 2) || '?');
      return letters.toUpperCase();
    }

    function renderContactsFromEngineDom() {
      var listEl = document.getElementById('contactsList');
      var emptyEl = document.getElementById('contactsEmpty');
      if (!listEl) return;

      var src = document.getElementById('contactList');
      var engineItems = src ? Array.from(src.querySelectorAll('.contact-item')) : [];
      var srcText = src ? (src.textContent || '').trim() : '';

      if (!engineItems.length) {
        listEl.innerHTML = '';
        if (srcText && srcText.indexOf('Sonuç bulunamadı') !== -1) {
          if (emptyEl) emptyEl.style.display = 'none';
          listEl.innerHTML = '<div style="padding:40px 8px;text-align:center;color:var(--text-secondary);font-size:.9rem">Sonuç bulunamadı</div>';
        } else {
          if (emptyEl) emptyEl.style.display = '';
        }
        return;
      }
      if (emptyEl) emptyEl.style.display = 'none';

      // contactsState motorda script-scope `const` olarak yaşıyor; aynı sayfada
      // başka bir <script>'ten erişilebilir. Yine de her ihtimale karşı try/catch.
      var stateValues = [];
      try {
        if (typeof contactsState !== 'undefined' && contactsState && contactsState.byNumber) {
          stateValues = Array.from(contactsState.byNumber.values());
        }
      } catch (e) { stateValues = []; }

      var searchVal = ((document.getElementById('contactSearch') || {}).value || '').toLocaleLowerCase('tr').trim();
      var visibleContacts = stateValues.slice().sort(function (a, b) {
        return String(a.name || a.number || '').localeCompare(String(b.name || b.number || ''), 'tr');
      }).filter(function (c) {
        var nm = String(c.name || c.number || '').toLocaleLowerCase('tr');
        var no = String(c.number || '').toLocaleLowerCase('tr');
        return !searchVal || nm.indexOf(searchVal) !== -1 || no.indexOf(searchVal) !== -1;
      });

      listEl.innerHTML = engineItems.map(function (item, idx) {
        var name = (item.querySelector('.contact-name') || {}).textContent || '—';
        var avatarHtml = (item.querySelector('.contact-avatar') || {}).innerHTML || escapeHtml(getInitials(name, ''));
        // Motor listesi sıralı/filtreli geldiği için önce aynı sıradaki kaydı kullan;
        // isim çakışırsa bile satırın numarası ve connId'si doğru kalır.
        var match = visibleContacts[idx] || stateValues.find(function (c) { return (c.name || c.number || '') === name; });
        var number = match ? (match.number || '') : '';
        var connId = match && match.connId ? match.connId : '';
        var online = match ? isContactOnline(match) : isConnOnline(connId);
        var status = online ? 'Çevrimiçi' : 'Çevrimdışı';
        var dotColor = online ? 'var(--primary-green)' : '#a8b3c7';
        return '<div class="contact-row" data-engine-index="' + idx + '"'
          +   ' data-name="' + escapeHtml(name) + '"'
          +   ' data-number="' + escapeHtml(number) + '"'
          +   ' data-connid="' + escapeHtml(connId) + '">'
          +   '<div class="contact-avatar" data-avatar="1" style="background:linear-gradient(135deg,#34b7f1,#128c7e);color:#fff;font-weight:600;display:flex;align-items:center;justify-content:center;font-size:.95rem;overflow:hidden">'
          +     avatarHtml
          +   '</div>'
          +   '<div style="flex:1;min-width:0;margin-left:12px">'
          +     '<div style="font-weight:600;font-size:.98rem;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(name) + '</div>'
          +     '<div class="oo-contact-status" data-online="' + (online ? '1' : '0') + '" style="font-size:.82rem;color:var(--text-secondary);margin-top:2px;display:flex;align-items:center;gap:6px">'
          +       '<span style="width:7px;height:7px;border-radius:50%;background:' + dotColor + ';display:inline-block;box-shadow:0 0 0 2px rgba(10,124,74,.08)"></span>' + escapeHtml(status) + '</div>'
          +   '</div>'
          + '</div>';
      }).join('');
    }

    window.renderContacts = function () {
      try {
        var search = document.getElementById('contactSearch');
        var filter = search ? (search.value || '').trim() : '';
        if (typeof _origUpdateContactList === 'function') _origUpdateContactList(filter);
      } catch (e) { console.error('[adapter] updateContactList hata:', e); }
      renderContactsFromEngineDom();
      warmKnownContactPeers();
    };

    // Arama input'u zaten oninput="renderContacts()" çağırıyor — ek listener'a gerek yok.

    function openChatFromCardData(c) {
      if (!c) return false;
      if (c.connId && typeof window.openChat === 'function') {
        try {
          var st = getEngineState();
          if (st && st.users && !st.users.has(c.connId)) st.users.set(c.connId, (c.name || c.number || 'Kişi') + (c.number ? ' [' + c.number + ']' : ''));
        } catch (e) {}
        try { window.openChat(c.connId); } catch (e) { console.error('[adapter] openChat hata:', e); }
        return true;
      }
      if (c.number && typeof window.openContactByNumber === 'function') {
        // Kişi henüz çevrimiçi olarak görülmemiş olabilir; yine de sohbet penceresini
        // hemen aç. LOOKUP cevabı geldiğinde motor openChat'i tekrar çağıracak.
        try {
          showScreen('screen-chat');
          var nameEl = document.getElementById('chatHName');
          if (nameEl) nameEl.innerText = c.name || c.number || 'Sohbet';
          var avEl = document.getElementById('chatHAvatar');
          if (avEl) {
            avEl.innerHTML = escapeHtml(getInitials(c.name || '', c.number || ''));
            avEl.className = 'chat-h-avatar';
            avEl.style.background = 'linear-gradient(135deg,#34b7f1,#128c7e)';
            avEl.style.color = '#fff';
          }
          var ci = document.getElementById('chatInput');
          if (ci) ci.value = '';
        } catch (e) {}
        try { window.openContactByNumber(c.number); } catch (e) { console.error('[adapter] openContactByNumber hata:', e); }
        return true;
      }
      return false;
    }

    // ---------- Kişi satırı tıklaması → avatar kart, satır sohbet ----------
    // ÖNEMLİ: Artık motorun .contact-item click'ine forward etmiyoruz.
    // OO'nun #contactCardOverlay'ini açıp veriyi DOM'dan dolduruyoruz.
    // Sohbet başlatma (ccOpenChat) Adım 4'te bağlanacak.
    var _activeCard = { name: '', number: '', connId: '', engineIndex: -1 };

    function openContactCard(row, ev) {
      var overlay = document.getElementById('contactCardOverlay');
      if (!overlay) return;
      var name   = row.getAttribute('data-name')   || '';
      var number = row.getAttribute('data-number') || '';
      var connId = row.getAttribute('data-connid') || '';
      var idx    = Number(row.getAttribute('data-engine-index'));
      _activeCard = { name: name, number: number, connId: connId, engineIndex: idx };

      // Avatar — önce satırdaki avatar (resim/başharf) içeriği, yoksa initials
      var avEl = document.getElementById('ccAvatar');
      if (avEl) {
        var rowAv = row.querySelector('[data-avatar="1"]');
        var inner = rowAv ? rowAv.innerHTML.trim() : '';
        avEl.innerHTML = inner || escapeHtml(getInitials(name, number));
      }
      var nmEl = document.getElementById('ccName');
      if (nmEl) nmEl.textContent = name || '—';
      var phEl = document.getElementById('ccPhone');
      if (phEl) phEl.textContent = number || '—';

      // Tıklanan noktadan açılma origin'i (animasyon için)
      try {
        var rect = row.getBoundingClientRect();
        var orect = overlay.getBoundingClientRect();
        var px = (ev && ev.clientX) ? ev.clientX : (rect.left + rect.width / 2);
        var py = (ev && ev.clientY) ? ev.clientY : (rect.top  + rect.height / 2);
        overlay.style.setProperty('--tx', (px - orect.left) + 'px');
        overlay.style.setProperty('--ty', (py - orect.top)  + 'px');
      } catch (e) {}

      overlay.classList.remove('closing');
      overlay.classList.add('open');
    }

    document.addEventListener('click', function (ev) {
      var row = ev.target.closest && ev.target.closest('#contactsList .contact-row');
      if (!row) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      if (ev.target.closest && ev.target.closest('[data-avatar="1"], .contact-avatar')) {
        openContactCard(row, ev);
        return;
      }
      var c = {
        name: row.getAttribute('data-name') || '',
        number: row.getAttribute('data-number') || '',
        connId: row.getAttribute('data-connid') || '',
        engineIndex: Number(row.getAttribute('data-engine-index'))
      };
      if (!openChatFromCardData(c)) openContactCard(row, ev);
    }, true);

    // Motor saveNewContact sonrası updateContactList çağırıyor → OO listesini de aynı anda tazele
    if (typeof _origUpdateContactList === 'function') {
      window.updateContactList = function () {
        try { _origUpdateContactList.apply(this, arguments); } catch (e) { console.error(e); }
        try { renderContactsFromEngineDom(); } catch (e) { console.error(e); }
      };
    }

    // ---------- Kişi Kartı: animasyonlu kapatma + buton stub'ları ----------
    window.closeContactCard = function (ev) {
      // Karta tıklandıysa kapatma (OO'da overlay backdrop tıklamasında çağrılıyor)
      if (ev && ev.target && ev.target.id !== 'contactCardOverlay') return;
      var o = document.getElementById('contactCardOverlay');
      if (!o || !o.classList.contains('open')) return;
      o.classList.remove('open');
      o.classList.add('closing');
      var card = o.querySelector('.contact-card');
      var done = function () {
        o.classList.remove('closing');
        if (card) card.removeEventListener('transitionend', done);
      };
      if (card) card.addEventListener('transitionend', done, { once: true });
      // Güvenlik: transitionend tetiklenmezse ~500ms sonra temizle
      setTimeout(done, 500);
    };

    // ---------- KİŞİ KARTI BUTONLARI (Adım 4) ----------
    // Her cc* aksiyonunda _activeCard'ı contactsState'ten "tazele" — DB'deki
    // eski connId yerine canlı state.users'taki connId'ye baksın.
    function refreshedCard() {
      var c = Object.assign({}, _activeCard || {});
      try {
        if (typeof contactsState !== 'undefined' && contactsState.byNumber) {
          var rec = null;
          if (c.number) rec = contactsState.byNumber.get(c.number);
          if (!rec && c.name) {
            contactsState.byNumber.forEach(function (r) { if (!rec && (r.name || '') === c.name) rec = r; });
          }
          if (rec) {
            c.number = rec.number || c.number;
            // DB connId varsa al, ama canlı users haritasında yoksa görmezden gel
            var dbConn = rec.connId || '';
            var liveState = getEngineState();
            if (dbConn) c.connId = dbConn;
          }
        }
      } catch (e) {}
      return c;
    }

    window.ccCall  = function () { var c = refreshedCard(); closeCardThen(function(){ startCallFromCard(c, 'audio'); }); };
    window.ccVideo = function () { var c = refreshedCard(); closeCardThen(function(){ startCallFromCard(c, 'video'); }); };
    window.ccInfo  = function () { console.info('[adapter] ccInfo  — Adım 6 (bilgi paneli)'); };

    window.ccOpenChat = function () {
      var c = refreshedCard();
      console.info('[adapter] ccOpenChat →', c);
      closeCardThen(function () {
        if (!openChatFromCardData(c)) alert('Bu kişi için sohbet açılamadı. Lütfen kişiyi telefon numarasıyla yeniden ekleyin.');
      });
    };

    function closeCardThen(fn) {
      window.closeContactCard({ target: { id: 'contactCardOverlay' } });
      // Kart kapanırken sohbet ekranını bekletme; WhatsApp/Telegram gibi direkt aç.
      setTimeout(fn, 0);
    }

    // ---------- ARAMA — kart veya chat üst barından başlat ----------
    function isLiveConnId(id) {
      try { var st = getEngineState(); return !!(id && st && st.users && st.users.has(id)); }
      catch (e) { return false; }
    }

    function getPeersRef() {
      try { return (typeof peers !== 'undefined') ? peers : (window.peers || null); }
      catch (e) { return null; }
    }

    function hasOpenP2P(id) {
      var pr = getPeersRef();
      try { return !!(id && pr && pr[id] && pr[id].dc && pr[id].dc.readyState === 'open'); }
      catch (e) { return false; }
    }

    function isConnOnline(id) {
      return !!(id && (isLiveConnId(id) || hasOpenP2P(id)));
    }

    function isContactOnline(contact) {
      if (!contact) return false;
      var live = findLiveConnIdByNumber(contact.number);
      if (live) {
        contact.connId = live;
        contact.lastSeen = Date.now();
        try { if (typeof dbSaveContact === 'function') dbSaveContact(contact); } catch (e) {}
        return true;
      }
      return isConnOnline(contact.connId);
    }

    function markConnOffline(connId, reason) {
      if (!connId) return;
      try {
        var st = getEngineState();
        if (st && st.users && st.users.has(connId)) st.users.delete(connId);
      } catch (e) {}
      try {
        if (typeof contactsState !== 'undefined' && contactsState.byNumber) {
          contactsState.byNumber.forEach(function (c) {
            if (c && c.connId === connId) {
              c.lastSeen = Date.now();
              try { if (typeof dbSaveContact === 'function') dbSaveContact(c); } catch (e) {}
            }
          });
        }
      } catch (e) {}
      try { if (typeof window.renderContacts === 'function') window.renderContacts(); } catch (e) {}
      try { if (typeof window.renderConvList === 'function') window.renderConvList(); } catch (e) {}
      try { console.info('[adapter] peer offline:', connId, reason || ''); } catch (e) {}
    }

    function paintAvatarPresence(el, online) {
      if (!el) return;
      el.style.position = el.style.position || 'relative';
      var dot = el.querySelector(':scope > .oo-presence-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'oo-presence-dot';
        dot.style.cssText = 'position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border-radius:50%;border:2px solid var(--bg-white);background:#a8b3c7;box-shadow:0 2px 6px rgba(0,0,0,.18);';
        el.appendChild(dot);
      }
      dot.style.background = online ? 'var(--primary-green)' : '#a8b3c7';
    }

    function warmKnownContactPeers() {
      try {
        if (typeof initP2P !== 'function' || typeof contactsState === 'undefined' || !contactsState.byNumber) return;
        var warmed = 0;
        contactsState.byNumber.forEach(function (c) {
          if (warmed >= 6 || !c) return;
          var connId = findLiveConnIdByNumber(c.number) || c.connId;
          if (!connId || !isLiveConnId(connId) || hasOpenP2P(connId)) return;
          warmed += 1;
          try { initP2P(connId); } catch (e) {}
        });
      } catch (e) {}
    }

    // Motor state.users değerini "Ad [number]" formatında tutar; numaradan canlı connId bul.
    function findLiveConnIdByNumber(number) {
      var st = getEngineState();
      if (!number || !st || !st.users) return null;
      var normalized = normalizePhoneForAdapter(number);
      var needle = '[' + normalized + ']';
      var found = null;
      try {
        st.users.forEach(function (label, connId) {
          var labelNumber = normalizePhoneForAdapter(String(label || '').match(/\[(.*?)\]/)?.[1] || '');
          if (labelNumber && labelNumber === normalized) found = connId;
          else if (typeof label === 'string' && label.indexOf(needle) !== -1) found = connId;
        });
      } catch (e) {}
      return found;
    }

    function findAllConnIdsByNumber(number) {
      var st = getEngineState();
      var ids = [];
      if (!number || !st || !st.users) return ids;
      var normalized = normalizePhoneForAdapter(number);
      var needle = '[' + normalized + ']';
      try {
        st.users.forEach(function (label, connId) {
          var labelNumber = normalizePhoneForAdapter(String(label || '').match(/\[(.*?)\]/)?.[1] || '');
          if ((labelNumber && labelNumber === normalized) || (typeof label === 'string' && label.indexOf(needle) !== -1)) ids.push(connId);
        });
      } catch (e) {}
      return ids;
    }

    var lookupReplyCache = new Map();
    function rememberLookupReply(number, connId) {
      var normalized = normalizePhoneForAdapter(number);
      if (!normalized || !connId) return;
      lookupReplyCache.set(normalized, { connId: connId, ts: Date.now() });
      try {
        var st = getEngineState();
        if (st && st.users) {
          st.users.forEach(function (label, id) {
            if (id !== connId && String(label || '').indexOf('[' + normalized + ']') !== -1) st.users.delete(id);
          });
        }
      } catch (e) {}
      try {
        if (typeof contactsState !== 'undefined' && contactsState.byNumber) {
          var c = contactsState.byNumber.get(normalized);
          if (c) { c.connId = connId; c.lastSeen = Date.now(); if (typeof dbSaveContact === 'function') dbSaveContact(c); }
        }
      } catch (e) {}
    }

    var origLookupReply = null;
    try { origLookupReply = (typeof handleLookupReply === 'function') ? handleLookupReply : window.handleLookupReply; } catch (e) {}
    if (typeof origLookupReply === 'function' && !origLookupReply.__ooFreshWrapped) {
      var wrappedLookupReply = function (number, connId) {
        rememberLookupReply(number, connId);
        return origLookupReply.apply(this, arguments);
      };
      wrappedLookupReply.__ooFreshWrapped = true;
      try { handleLookupReply = wrappedLookupReply; } catch (e) {}
      try { window.handleLookupReply = wrappedLookupReply; } catch (e) {}
    }

    var origP2PMsg = null;
    try { origP2PMsg = (typeof handleP2PMsg === 'function') ? handleP2PMsg : window.handleP2PMsg; } catch (e) {}
    if (typeof origP2PMsg === 'function' && !origP2PMsg.__ooPresenceWrapped) {
      var wrappedP2PMsg = function (senderConnId, data) {
        if (typeof data === 'string' && data.indexOf('PRESENCE_OFFLINE###') === 0) {
          markConnOffline(senderConnId, 'presence-packet');
          return;
        }
        return origP2PMsg.apply(this, arguments);
      };
      wrappedP2PMsg.__ooPresenceWrapped = true;
      try { handleP2PMsg = wrappedP2PMsg; } catch (e) {}
      try { window.handleP2PMsg = wrappedP2PMsg; } catch (e) {}
    }

    var origAttachDataChannel = null;
    try { origAttachDataChannel = (typeof attachDataChannel === 'function') ? attachDataChannel : window.attachDataChannel; } catch (e) {}
    if (typeof origAttachDataChannel === 'function' && !origAttachDataChannel.__ooPresenceWrapped) {
      var wrappedAttachDataChannel = function (connId, channel, label) {
        var result = origAttachDataChannel.apply(this, arguments);
        try {
          var prevClose = channel.onclose;
          channel.onclose = function () {
            if (typeof prevClose === 'function') { try { prevClose.apply(this, arguments); } catch (e) {} }
            markConnOffline(connId, 'datachannel-close');
          };
        } catch (e) {}
        return result;
      };
      wrappedAttachDataChannel.__ooPresenceWrapped = true;
      try { attachDataChannel = wrappedAttachDataChannel; } catch (e) {}
      try { window.attachDataChannel = wrappedAttachDataChannel; } catch (e) {}
    }

    // LOOKUP atıp en fazla `timeoutMs` boyunca canlı connId'yi bekle
    function lookupAndWait(number, timeoutMs, opts) {
      return new Promise(function (resolve) {
        if (!number) return resolve(null);
        var options = opts || {};
        var normalized = normalizePhoneForAdapter(number);
        var startedAt = Date.now();
        var live = findLiveConnIdByNumber(number);
        var baseline = new Set(findAllConnIdsByNumber(number));
        if (!options.forceFresh && live) return resolve(live);
        if (options.forceFresh && live && hasOpenP2P(live)) return resolve(live);
        try {
          if (typeof window.wsSend === 'function') window.wsSend('LOOKUP###' + number, 'HERKES');
        } catch (e) {}
        var elapsed = 0, step = 200;
        var t = setInterval(function () {
          var fresh = lookupReplyCache.get(normalized);
          var newest = findLiveConnIdByNumber(number);
          var changed = findAllConnIdsByNumber(number).find(function (id) { return !baseline.has(id); });
          var id = fresh && fresh.ts >= startedAt - 50 ? fresh.connId : (options.forceFresh ? (changed || (newest && hasOpenP2P(newest) ? newest : null)) : newest);
          elapsed += step;
          if (id) { clearInterval(t); resolve(id); }
          else if (elapsed >= (timeoutMs || 3000)) { clearInterval(t); resolve(null); }
        }, step);
      });
    }

    async function startCallFromCard(c, kind) {
      // Aramada eski connId'ye güvenme: P2P açıksa kullan, değilse numaradan taze LOOKUP iste.
      var connId = hasOpenP2P(c.connId) ? c.connId : null;
      if (!connId && !c.number && isLiveConnId(c.connId)) connId = c.connId;
      if (!connId && c.number) {
        openOOCallScreen(c, kind);
        var st = document.getElementById('oocStatus'); if (st) st.textContent = 'Bağlanılıyor…';
        connId = await lookupAndWait(c.number, 3500, { forceFresh: true });
        if (!connId) {
          if (c.connId) markConnOffline(c.connId, 'fresh-lookup-timeout-before-call');
          // Çevrimdışı → ekranı kapatma: "Aranıyor…" + push ile çaldır.
          await ringOfflinePeer(c, kind);
          return;
        }
      }
      if (!connId) { alert('Aranacak kişi bulunamadı.'); return; }

      // Arama ekranı zaten açık değilse aç
      var scr = document.getElementById('screen-ooCall');
      if (!scr || scr.classList.contains('hidden-screen')) openOOCallScreen(c, kind);
      var st2 = document.getElementById('oocStatus'); if (st2) st2.textContent = 'Çalıyor…';
      // Caller: yerel ringback başlat, mikrofon trafiğini accept'e kadar sustur
      startRingbackTone();
      muteOutgoingTracksUntilAccepted(connId);

      try {
        if (kind === 'video' && typeof window.startVideoCall === 'function') window.startVideoCall(connId, false);
        else if (typeof window.startAudioCall === 'function') window.startAudioCall(connId, false);
      } catch (e) { console.error('[adapter] arama başlatılamadı:', e); }
    }

    async function startCallForActiveChat(kind) {
      var st = getEngineState() || {};
      if (!st.activeChat || st.activeChat === 'genel') { alert('Önce bir kişi sohbeti açın.'); return; }
      var connId = st.activeChat;
      // Kişi adını topbar'dan al
      var name = (document.getElementById('chatHName') || {}).textContent || '';
      // contactsState üzerinden number bul
      var number = '';
      try {
        if (typeof contactsState !== 'undefined' && contactsState.byNumber) {
          contactsState.byNumber.forEach(function (rec) { if (rec.connId === connId) number = rec.number; });
        }
      } catch (e) {}
      if (number && !hasOpenP2P(connId)) {
        var freshForCall = await lookupAndWait(number, 3500, { forceFresh: true });
        if (!freshForCall) {
          markConnOffline(connId, 'active-chat-fresh-lookup-timeout');
          await ringOfflinePeer({ name: name, number: number, connId: connId }, kind);
          return;
        }
        connId = freshForCall;
        try { await window.openChat(connId); } catch (e) {}
      } else if (!isConnOnline(connId)) {
        markConnOffline(connId, 'active-chat-stale-before-call');
        var refreshed = number ? (findLiveConnIdByNumber(number) || await lookupAndWait(number, 3500)) : null;
        if (!refreshed) {
          await ringOfflinePeer({ name: name, number: number, connId: connId }, kind);
          return;
        }
        connId = refreshed;
        try { await window.openChat(connId); } catch (e) {}
      }
      var c = { name: name, number: number, connId: connId, engineIndex: -1 };
      openOOCallScreen(c, kind);
      var st2 = document.getElementById('oocStatus'); if (st2) st2.textContent = 'Çalıyor…';
      startRingbackTone();
      muteOutgoingTracksUntilAccepted(connId);
      try {
        if (kind === 'video' && typeof window.startVideoCall === 'function') window.startVideoCall(connId, false);
        else if (typeof window.startAudioCall === 'function') window.startAudioCall(connId, false);
      } catch (e) { console.error('[adapter] arama başlatılamadı:', e); }
    }

    function showNotif(msg) {
      try { if (typeof window.showNotif === 'function') return; } catch (e) {}
      console.info('[adapter notif]', msg);
    }

    // ---------- OO Arama Ekranı ----------
    var ooCallTimer = null;
    var ooCallStartedAt = 0;
    var ooIncomingTimer = null;
    var ooIncomingStartedAt = 0;
    var ooAcceptedIncomingStartedAt = 0;
    var ooEngineActiveSeen = false;
    var ooOutgoingPending = false; // caller "Çalıyor…" bekliyor (timer durur)
    var ooOutgoingConnId = null;

    // ====== Ringback Tone (caller tarafı) — WebAudio ile sentezleme ======
    var ringbackCtx = null, ringbackOsc = null, ringbackGain = null, ringbackTimer = null;
    function startRingbackTone() {
      try {
        stopRingbackTone();
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ringbackCtx = new AC();
        var ctx = ringbackCtx;
        // Avrupa ringback: 425Hz, 1s on / 4s off (kısaltılmış 1s on / 2s off)
        var play = function () {
          if (!ringbackCtx) return;
          var osc = ctx.createOscillator(); var g = ctx.createGain();
          osc.type = 'sine'; osc.frequency.value = 440;
          g.gain.setValueAtTime(0.0001, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.05);
          g.gain.setValueAtTime(0.18, ctx.currentTime + 0.95);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.0);
          osc.connect(g); g.connect(ctx.destination);
          osc.start(); osc.stop(ctx.currentTime + 1.05);
          ringbackOsc = osc; ringbackGain = g;
        };
        play();
        ringbackTimer = setInterval(play, 3000);
      } catch (e) { /* sessizce yut */ }
    }
    function stopRingbackTone() {
      try { if (ringbackTimer) clearInterval(ringbackTimer); } catch (e) {}
      ringbackTimer = null;
      try { if (ringbackOsc) ringbackOsc.stop(); } catch (e) {}
      try { if (ringbackCtx) ringbackCtx.close(); } catch (e) {}
      ringbackCtx = null; ringbackOsc = null; ringbackGain = null;
    }

    // ====== Outgoing track mute (accept'e kadar mikrofon kapalı) ======
    var outgoingMutePoll = null;
    var ooOutgoingStartedAt = 0;
    /**
     * Bu aramanın gerçekten kabul edildiğini doğrular. Sadece "Bağlandı" metnine
     * bakmak yetmiyordu: önceki aramadan kalan bayat metin, ikinci aramada
     * daha karşı taraf açmadan süreyi başlatıp mikrofonu açıyordu.
     */
    function isCallAccepted() {
      var at = 0;
      try { at = Number(window.__SOHBETO_CALL_CONNECTED_AT || 0); } catch (e) {}
      if (!at) return 0;
      if (ooOutgoingStartedAt && at < ooOutgoingStartedAt - 1500) return 0;
      return at;
    }
    function muteOutgoingTracksUntilAccepted(connId) {
      if (outgoingMutePoll) clearInterval(outgoingMutePoll);
      ooOutgoingPending = true;
      ooOutgoingConnId = connId;
      ooOutgoingStartedAt = Date.now();
      try { window.__SOHBETO_CALL_CONNECTED_AT = null; } catch (e) {}
      var stStale = document.getElementById('activeCallStatus');
      if (stStale && (stStale.innerText || '').trim() === 'Bağlandı') stStale.innerText = 'Çalıyor…';
      var elapsed = 0;

      outgoingMutePoll = setInterval(function () {
        elapsed += 200;
        try {
          // Engine'in localAudioStream/localVideoStream globalleri (let → script-scope)
          var s = (typeof localAudioStream !== 'undefined') ? localAudioStream : null;
          if (s && s.getAudioTracks) s.getAudioTracks().forEach(function (t) { t.enabled = false; });
          var v = (typeof localVideoStream !== 'undefined') ? localVideoStream : null;
          if (v && v.getAudioTracks) v.getAudioTracks().forEach(function (t) { t.enabled = false; });
          // PC sender'larını da sustur (yedek)
          var p = (typeof peers !== 'undefined') ? peers : null;
          if (p && connId && p[connId] && p[connId].pc) {
            p[connId].pc.getSenders().forEach(function (s2) {
              if (s2.track && s2.track.kind === 'audio') s2.track.enabled = false;
            });
          }
        } catch (e) {}
        // Status değişti mi? (Bağlandı → mikrofonu aç)
        var stEl = document.getElementById('activeCallStatus');
        var st = stEl ? (stEl.innerText || '').trim() : '';
        if (st === 'Bağlandı' || elapsed > 60000) {
          clearInterval(outgoingMutePoll); outgoingMutePoll = null;
          ooOutgoingPending = false;
          // mute butonuna saygı duyarak mikrofonu aç
          var muteBtn = document.getElementById('oocMute');
          var userWantsMute = !!(muteBtn && muteBtn.classList.contains('active'));
          try {
            var s = (typeof localAudioStream !== 'undefined') ? localAudioStream : null;
            if (s && s.getAudioTracks) s.getAudioTracks().forEach(function (t) { t.enabled = !userWantsMute; });
            var v = (typeof localVideoStream !== 'undefined') ? localVideoStream : null;
            if (v && v.getAudioTracks) v.getAudioTracks().forEach(function (t) { t.enabled = !userWantsMute; });
          } catch (e) {}
        }
      }, 200);
    }
    function clearOutgoingMute() {
      if (outgoingMutePoll) { clearInterval(outgoingMutePoll); outgoingMutePoll = null; }
      ooOutgoingPending = false; ooOutgoingConnId = null;
    }

    // ====== Offline call queue (callee açık değilken) ======
    var OFFLINE_CALL_KEY = 'oo_offline_call_queue_v1__' + (window.__SOHBETO_TAB_ID__ || 'shared');
    function loadOfflineCallQueue() {
      try { return JSON.parse(localStorage.getItem(OFFLINE_CALL_KEY) || '[]'); } catch (e) { return []; }
    }
    function saveOfflineCallQueue(q) {
      try { localStorage.setItem(OFFLINE_CALL_KEY, JSON.stringify(q)); } catch (e) {}
    }
    function enqueueOfflineCall(c, kind) {
      var q = loadOfflineCallQueue();
      // Aynı kişi için tek kayıt: 19:00, 19:05, 19:10 denemeleri karşı taraf
      // açıldığında üst üste mesaj olarak gitmesin; sadece en sonu kalsın.
      q = q.filter(function (x) { return String(x && x.number) !== String(c.number || ''); });
      q.push({ name: c.name || '', number: c.number || '', kind: kind, ts: Date.now() });
      saveOfflineCallQueue(q);
    }

    function showCallToast(msg) {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);background:rgba(20,24,33,.95);color:#fff;padding:12px 18px;border-radius:14px;font:500 14px system-ui,sans-serif;z-index:99999;box-shadow:0 10px 30px rgba(0,0,0,.4);max-width:80%;text-align:center;';
      document.body.appendChild(t);
      setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 3500);
      setTimeout(function () { try { t.remove(); } catch (e) {} }, 4200);
    }
    /** sohbetoNotifyPhone köprüsünü bulur (iframe içinden parent/top'a da bakar). */
    function findNotifyBridge() {
      var fn = null;
      try { if (typeof window.sohbetoNotifyPhone === 'function') fn = window.sohbetoNotifyPhone; } catch (e) {}
      try { if (!fn && window.parent && typeof window.parent.sohbetoNotifyPhone === 'function') fn = window.parent.sohbetoNotifyPhone; } catch (e) {}
      try { if (!fn && window.top && typeof window.top.sohbetoNotifyPhone === 'function') fn = window.top.sohbetoNotifyPhone; } catch (e) {}
      return fn;
    }

    /**
     * Çevrimdışı kişiyi ARAMA akışı: ekran açık kalır, "Aranıyor…" yazar,
     * karşı tarafa arama push'u gider. Kişi uygulamayı açarsa (LOOKUP cevabı gelirse)
     * gerçek arama otomatik başlar. RING_TIMEOUT sonunda cevapsız arama olarak kapanır.
     */
    var RING_TIMEOUT_MS = 45000;
    async function ringOfflinePeer(c, kind) {
      var scr = document.getElementById('screen-ooCall');
      if (!scr || scr.classList.contains('hidden-screen')) openOOCallScreen(c, kind);
      var st = document.getElementById('oocStatus');
      if (st) st.textContent = 'Aranıyor…';
      try { startRingbackTone(); } catch (e) {}

      // Karşı tarafa "Gelen arama" push'u gönder.
      var notify = findNotifyBridge();
      var myName = '';
      try { myName = (window.CONFIG && (CONFIG.userName || CONFIG.virtualNo)) || ''; } catch (e) {}
      if (notify && c.number) {
        try {
          notify(
            c.number,
            'Gelen arama',
            (myName || 'Biri') + (kind === 'video' ? ' seni görüntülü arıyor' : ' seni arıyor'),
            'call'
          );
        } catch (e) {}
      }

      // Kişi çevrimiçi olana kadar periyodik LOOKUP.
      var startedAt = Date.now();
      var connId = null;
      while (Date.now() - startedAt < RING_TIMEOUT_MS) {
        var cancelled = !document.getElementById('screen-ooCall') ||
          document.getElementById('screen-ooCall').classList.contains('hidden-screen');
        if (cancelled) return;
        connId = findLiveConnIdByNumber(c.number) || await lookupAndWait(c.number, 3000, { forceFresh: true });
        if (connId) break;
      }

      if (!connId) {
        try { closeOOCallScreen(); } catch (e) {}
        enqueueOfflineCall(c, kind);
        showCallToast('📵 ' + (c.name || c.number || 'Kişi') + ' cevap vermedi.');
        return;
      }

      var st2 = document.getElementById('oocStatus');
      if (st2) st2.textContent = 'Çalıyor…';
      try { muteOutgoingTracksUntilAccepted(connId); } catch (e) {}
      try {
        if (kind === 'video' && typeof window.startVideoCall === 'function') window.startVideoCall(connId, false);
        else if (typeof window.startAudioCall === 'function') window.startAudioCall(connId, false);
      } catch (e) { console.error('[adapter] arama başlatılamadı:', e); }
    }

    // Eski sekmelere ait öksüz kuyruk anahtarlarını temizle (24 saat üstü).
    (function cleanupOrphanCallQueues() {
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (!k || k.indexOf('oo_offline_call_queue_v1__') !== 0 || k === OFFLINE_CALL_KEY) continue;
          var arr = [];
          try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { arr = []; }
          var fresh = arr.filter(function (x) { return x && Date.now() - (x.ts || 0) < 24 * 3600 * 1000; });
          if (!fresh.length) localStorage.removeItem(k);
          else localStorage.setItem(k, JSON.stringify(fresh));
        }
      } catch (e) {}
    })();

    // Periyodik kontrol: kuyruktaki kişi online olduysa bildirim mesajı yolla
    setInterval(function () {
      var q = loadOfflineCallQueue();
      if (!q.length) return;

      var remaining = [];
      q.forEach(function (item) {
        var connId = findLiveConnIdByNumber(item.number);
        if (!connId) {
          // 24 saatten eski denemeleri at
          if (Date.now() - item.ts < 24 * 3600 * 1000) remaining.push(item);
          return;
        }
        // Online! Sohbet kanalı üzerinden bilgilendirme mesajı yolla.
        // Engine'in outboundQueue/MSG yolu çağrılmalı; basit yaklaşım: peer DC üzerinden direkt gönder.
        try {
          var when = new Date(item.ts);
          var hh = String(when.getHours()).padStart(2, '0');
          var mm = String(when.getMinutes()).padStart(2, '0');
          var label = item.kind === 'video' ? 'görüntülü arama' : 'sesli arama';
          var text = 'Saat ' + hh + ':' + mm + ' civarında seni ' + label + ' ile aradım ama çevrimdışıydın.';
          var msgId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
          var sent = false;
          try {
            var p = (typeof peers !== 'undefined') ? peers : null;
            if (p && p[connId] && p[connId].dc && p[connId].dc.readyState === 'open') {
              p[connId].dc.send('MSG###' + msgId + '###' + text);
              sent = true;
            }
          } catch (e) {}
          // DC hazır değilse engine outboundQueue'ya at
          if (!sent) {
            try {
              var s = (typeof state !== 'undefined') ? state : window.state;
              if (s && s.outboundQueue && s.outboundQueue.set) {
                s.outboundQueue.set(msgId, { msgId: msgId, targetConnId: connId, text: text, ts: Date.now(), attempts: 0 });
                if (typeof saveOutbox === 'function') try { saveOutbox(); } catch (e) {}
              }
            } catch (e) {}
          }
        } catch (e) { console.warn('[adapter] offline call notify hata:', e); }
      });
      saveOfflineCallQueue(remaining);
    }, 6000);

    function formatOOElapsed(startedAt) {
      var elapsed = Math.max(0, Date.now() - (startedAt || Date.now()));
      var mins = Math.floor(elapsed / 60000);
      var secs = Math.floor((elapsed % 60000) / 1000);
      return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }

    function startOOCallTimer(startedAt) {
      if (ooCallTimer) clearInterval(ooCallTimer);
      var engineStartedAt = 0;
      try { engineStartedAt = Number(window.__SOHBETO_CALL_CONNECTED_AT || 0); } catch (e) {}
      ooCallStartedAt = startedAt || engineStartedAt || ooCallStartedAt || Date.now();
      var tick = function () {
        var el = document.getElementById('oocDuration');
        if (el) el.textContent = formatOOElapsed(ooCallStartedAt);
        var engineDur = document.getElementById('activeCallDuration');
        if (engineDur) engineDur.innerText = formatOOElapsed(ooCallStartedAt);
        var videoDur = document.getElementById('videoCallDuration');
        if (videoDur) videoDur.innerText = formatOOElapsed(ooCallStartedAt);
      };
      tick();
      ooCallTimer = setInterval(tick, 1000);
    }

    function stopOOCallTimer() {
      if (ooCallTimer) clearInterval(ooCallTimer);
      ooCallTimer = null;
      ooCallStartedAt = 0;
    }

    function startOOIncomingTimer() {
      if (ooIncomingTimer) clearInterval(ooIncomingTimer);
      ooIncomingStartedAt = Date.now();
      var tick = function () {
        var el = document.getElementById('ooiDuration');
        if (el) el.textContent = formatOOElapsed(ooIncomingStartedAt);
      };
      tick();
      ooIncomingTimer = setInterval(tick, 1000);
    }

    function stopOOIncomingTimer() {
      if (ooIncomingTimer) clearInterval(ooIncomingTimer);
      ooIncomingTimer = null;
      ooIncomingStartedAt = 0;
    }

    function resetOOIncomingDuration() {
      var el = document.getElementById('ooiDuration');
      if (!el) return;
      el.textContent = '00:00';
      el.style.visibility = 'hidden';
    }

    function isEngineCallVisible() {
      var src = document.getElementById('activeCallScreen');
      return !!(src && !src.classList.contains('hidden'));
    }

    function isEngineVideoActive() {
      var vc = document.getElementById('videoContainer');
      return !!(vc && vc.classList.contains('active'));
    }

    function openOOCallScreen(c, kind, opts) {
      var scr = document.getElementById('screen-ooCall');
      if (!scr) return;
      var wasHidden = scr.classList.contains('hidden-screen');
      scr.classList.remove('connected');
      var modeEl = document.getElementById('oocMode');
      var statusEl = document.getElementById('oocStatus');
      var avEl = document.getElementById('oocAvatar');
      var nmEl = document.getElementById('oocName');
      var durEl = document.getElementById('oocDuration');

      if (modeEl) modeEl.textContent = kind === 'video' ? 'Görüntülü Arama' : 'Sesli Arama';
      if (statusEl) statusEl.textContent = 'Çalıyor…';
      if (nmEl) nmEl.textContent = (c && c.name) || '—';
      if (durEl) {
        durEl.textContent = '00:00';
        // Çalıyor… durumunda süreyi gizle. "Bağlandı" olunca tekrar göster.
        if (opts && opts.startedAt) {
          durEl.style.visibility = 'visible';
        } else {
          durEl.style.visibility = 'hidden';
        }
      }
      if (avEl) {
        // Kart açıldıysa oradan, değilse initials
        var ccA = document.getElementById('ccAvatar');
        var inner = ccA && ccA.innerHTML.trim();
        avEl.innerHTML = inner || escapeHtml(getInitials(c && c.name, c && c.number));
      }
      // Sıfırla buton durumlarını
      ['oocMute','oocSpeaker','oocVideo'].forEach(function (id) {
        var b = document.getElementById(id); if (b) b.classList.remove('active');
      });
      scr.classList.remove('hidden-screen');
      scr.classList.add('active');
      if (wasHidden) {
        ooEngineActiveSeen = isEngineCallVisible() || isEngineVideoActive();
        // Sadece "kabul edilmiş" arama ise timer'ı hemen başlat.
        // Caller "Çalıyor…" durumunda timer durur; "Bağlandı" anında başlar.
        if (opts && opts.startedAt) {
          startOOCallTimer(opts.startedAt);
        } else {
          stopOOCallTimer();
          if (durEl) durEl.textContent = '00:00';
        }
      }
    }

    function closeOOCallScreen() {
      var scr = document.getElementById('screen-ooCall');
      if (!scr) return;
      scr.classList.add('hidden-screen');
      scr.classList.remove('active', 'connected', 'video-on');
      ooEngineActiveSeen = false;
      stopOOCallTimer();
      stopRingbackTone();
      clearOutgoingMute();
    }

    // Motorun stub #activeCallScreen / #activeCallStatus / #activeCallDuration değişimlerini OO'ya yansıt
    function bridgeEngineCallToOO() {
      var src = document.getElementById('activeCallScreen');
      if (!src) return;
      var lastHidden = src.classList.contains('hidden');

      // Status / duration polling (motor 1 sn'de bir günceller)
      setInterval(function () {
        var oo = document.getElementById('screen-ooCall');
        if (!oo || oo.classList.contains('hidden-screen')) return;
        var engineVisible = !src.classList.contains('hidden');
        var videoActive = isEngineVideoActive();
        if (engineVisible || videoActive) ooEngineActiveSeen = true;
        else if (ooEngineActiveSeen) { closeOOCallScreen(); return; }
        var st = (document.getElementById('activeCallStatus') || {}).innerText || '';
        var du = (document.getElementById('activeCallDuration') || {}).innerText || '';
        var oS = document.getElementById('oocStatus');
        var oD = document.getElementById('oocDuration');
        if (oS && st) oS.textContent = st;
        if (oD && du && du !== '00:00' && !ooCallTimer) oD.textContent = du;
        if (st === 'Bağlandı') {
          oo.classList.add('connected');
          if (oD) oD.style.visibility = 'visible';
          // Caller pending bekliyorduysa: ringback'i durdur, timer'ı 00:00'dan başlat
          if (ooOutgoingPending || !ooCallTimer) {
            stopRingbackTone();
            if (!ooCallTimer) {
              var connectedAt = 0;
              try { connectedAt = Number(window.__SOHBETO_CALL_CONNECTED_AT || 0); } catch (e) {}
              startOOCallTimer(connectedAt || Date.now());
            }
          }
        }
      }, 500);

      // Motor aramayı açıp/kapatınca OO'yu da senkronize et
      var mo = new MutationObserver(function () {
        var hidden = src.classList.contains('hidden');
        if (hidden && !lastHidden) {
          closeOOCallScreen();
        } else if (!hidden && lastHidden) {
          // Motor aktif arama ekranını AÇTI → OO ooCall ekranı açık değilse aç (callee için kritik).
          var oo = document.getElementById('screen-ooCall');
          if (oo && oo.classList.contains('hidden-screen')) {
            var vc = document.getElementById('videoContainer');
            var kind = (vc && vc.classList.contains('active')) ? 'video' : 'audio';
            var name = (document.getElementById('activeCallName') || {}).innerText || '—';
            var number = '';
            try {
              var st2 = getEngineState();
              if (st2 && st2.users) {
                st2.users.forEach(function (label) {
                  var m = String(label || '').match(/^(.*?)\s*\[(.*?)\]\s*$/);
                  if (!number && m && m[1].trim() === name.trim()) number = m[2];
                });
              }
            } catch (e) {}
            var acceptedStartedAt = ooAcceptedIncomingStartedAt || Date.now();
            ooAcceptedIncomingStartedAt = 0;
            openOOCallScreen({ name: name, number: number }, kind, { startedAt: acceptedStartedAt });
          }
          ooEngineActiveSeen = true;
          // Gelen arama ekranı varsa kapat
          closeOOIncomingScreen();
        }
        lastHidden = hidden;
      });
      mo.observe(src, { attributes: true, attributeFilter: ['class'] });
    }
    bridgeEngineCallToOO();

    // ---------- VIDEO KÖPRÜSÜ — engine #videoLocal/#videoRemote → OO sahnesi ----------
    // Engine srcObject'i offscreen stub'taki video element'lerine veriyor; biz
    // bu DOM node'larını OO sahnesine fiziksel olarak taşırız (ID'ler korunur,
    // engine erişmeye devam edebilir). Container 'active' olunca taşı, kalktığında geri koy.
    function bridgeVideoToOO() {
      var vc = document.getElementById('videoContainer');
      var stubHost = document.getElementById('__engine_stub_host__');
      var ooStageRemote = document.getElementById('oocVideoRemote');
      var ooStageLocal  = document.getElementById('oocVideoLocal');
      var ooScreen = document.getElementById('screen-ooCall');
      if (!vc || !ooStageRemote || !ooStageLocal || !ooScreen) return;

      var vlocal = document.getElementById('videoLocal');
      var vremote = document.getElementById('videoRemote');

      function moveToOO() {
        if (vlocal && vlocal.parentElement !== ooStageLocal) {
          vlocal.classList.remove('hidden');
          vlocal.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
          ooStageLocal.appendChild(vlocal);
        }
        if (vremote && vremote.parentElement !== ooStageRemote) {
          vremote.classList.remove('hidden');
          vremote.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
          ooStageRemote.appendChild(vremote);
        }
        ooScreen.classList.add('video-on');
        if (ooScreen.classList.contains('hidden-screen')) {
          var name = (document.getElementById('videoCallName') || {}).innerText
                  || (document.getElementById('activeCallName') || {}).innerText || '—';
          openOOCallScreen({ name: name }, 'video');
        }
        var modeEl = document.getElementById('oocMode');
        if (modeEl) modeEl.textContent = 'Görüntülü Arama';
        var vbtn = document.getElementById('oocVideo');
        if (vbtn) vbtn.classList.add('active');
      }
      function moveBack() {
        ooScreen.classList.remove('video-on');
        if (vlocal && stubHost && vlocal.parentElement !== stubHost) {
          vlocal.style.cssText = ''; vlocal.classList.add('hidden');
          stubHost.appendChild(vlocal);
        }
        if (vremote && stubHost && vremote.parentElement !== stubHost) {
          vremote.style.cssText = ''; vremote.classList.add('hidden');
          stubHost.appendChild(vremote);
        }
        var vbtn = document.getElementById('oocVideo');
        if (vbtn) vbtn.classList.remove('active');
      }

      var lastActive = vc.classList.contains('active');
      var mo = new MutationObserver(function () {
        var active = vc.classList.contains('active');
        if (active && !lastActive) moveToOO();
        else if (!active && lastActive) moveBack();
        lastActive = active;
      });
      mo.observe(vc, { attributes: true, attributeFilter: ['class'] });
      if (lastActive) moveToOO();
    }
    bridgeVideoToOO();

    // ---------- ÇEVRİMİÇİ/ÇEVRİMDIŞI KÖPRÜSÜ (chat header) ----------
    setInterval(function () {
      var st = getEngineState(); if (!st) return;
      var statusEl = document.querySelector('#screen-chat .chat-h-status');
      if (!statusEl) return;
      var connId = st.activeChat;
      if (!connId || connId === 'genel') { statusEl.textContent = ''; return; }
      var online = !!(st.users && st.users.has(connId));
      var dcOpen = false;
      var peersRef = null;
      try { peersRef = (typeof peers !== 'undefined') ? peers : (window.peers || null); } catch (e) {}
      try { dcOpen = !!(peersRef && peersRef[connId] && peersRef[connId].dc && peersRef[connId].dc.readyState === 'open'); } catch (e) {}
      var isOn = online || dcOpen;
      statusEl.textContent = isOn ? 'çevrimiçi' : 'çevrimdışı';
      statusEl.style.color = isOn ? 'var(--primary-green)' : 'var(--text-secondary)';
    }, 1000);

    // ---------- UYGULAMA KAPANIŞ → mevcut P2P üzerinden çevrimdışı bildirimi ----------
    // Sekme/PWA kapanırken aktif arama varsa CALL_END yolla, peer connection'ları
    // düzgünce kapat → karşı taraftaki dc.onclose + pc.onconnectionstatechange
    // engine.updateUI()'ı tetikler → liste/durumda anında çevrimdışı görünür.
    function gracefulShutdown() {
      try {
        try { if (typeof window.endActiveCall === 'function') window.endActiveCall(); } catch (e) {}
        var peersRef = getPeersRef();
        if (peersRef) {
          Object.keys(peersRef).forEach(function (cid) {
            var p = peersRef[cid];
            try { if (p && p.dc && p.dc.readyState === 'open') p.dc.send('PRESENCE_OFFLINE###' + Date.now()); } catch (e) {}
            try { if (p && p.dc && p.dc.readyState === 'open') p.dc.close(); } catch (e) {}
            try { if (p && p.pc) p.pc.close(); } catch (e) {}
          });
        }
        try { var st = getEngineState(); if (st && st.ws && st.ws.close) st.ws.close(); } catch (e) {}
        try { if (window.ws && window.ws.close) window.ws.close(); } catch (e) {}
      } catch (e) {}
    }
    window.addEventListener('pagehide', gracefulShutdown);
    window.addEventListener('beforeunload', gracefulShutdown);

    // ---------- GELEN ARAMA KÖPRÜSÜ (callee tarafı) ----------
    // Motor showIncomingCall() → #callScreen.hidden kalkar → OO #screen-ooIncoming açılır.
    function openOOIncomingScreen() {
      var scr = document.getElementById('screen-ooIncoming');
      if (!scr) return;
      var rawName   = (document.getElementById('callName')   || {}).innerText || '';
      var rawStatus = (document.getElementById('callStatus') || {}).innerText || '';
      var avSrc     = document.getElementById('callAvatar');
      var nm = document.getElementById('ooiName');   if (nm) nm.textContent = rawName || '—';
      var stE = document.getElementById('ooiStatus'); if (stE) stE.textContent = rawStatus || 'Seni arıyor…';
      var md = document.getElementById('ooiMode');
      if (md) md.textContent = /görüntü|video/i.test(rawStatus) ? 'Gelen Görüntülü Arama' : 'Gelen Sesli Arama';
      var av = document.getElementById('ooiAvatar');
      if (av) {
        if (avSrc && avSrc.innerHTML.trim()) av.innerHTML = avSrc.innerHTML;
        else av.textContent = (rawName.trim().split(/\s+/).map(function(p){return p[0]||'';}).join('').slice(0,2) || '?').toUpperCase();
      }
      scr.classList.remove('hidden-screen');
      scr.classList.add('active');
      stopOOIncomingTimer();
      resetOOIncomingDuration();
    }
    function closeOOIncomingScreen() {
      var scr = document.getElementById('screen-ooIncoming');
      if (!scr) return;
      scr.classList.add('hidden-screen');
      scr.classList.remove('active');
      stopOOIncomingTimer();
    }
    function bridgeEngineIncomingToOO() {
      var src = document.getElementById('callScreen');
      if (!src) return;
      var lastHidden = src.classList.contains('hidden');
      var mo = new MutationObserver(function () {
        var hidden = src.classList.contains('hidden');
        if (!hidden && lastHidden) openOOIncomingScreen();
        else if (hidden && !lastHidden) closeOOIncomingScreen();
        lastHidden = hidden;
      });
      mo.observe(src, { attributes: true, attributeFilter: ['class'] });
    }
    bridgeEngineIncomingToOO();

    // ---------- SİNYAL YAN ETKİLERİ (motor handleCallSignal sarmalama) ----------
    // NOT: Engine düzeltildikten sonra (CALL_END/REJECT incoming overlay'i kapatıyor,
    // CALL_ACCEPT activeCallStatus="Bağlandı" yazıyor) bu sarmalayıcı çoğunlukla
    // gereksizdir; eski/farklı engine sürümleriyle çalışsın diye savunma amaçlı bırakıldı.
    (function patchHandleCallSignal() {
      var orig = window.handleCallSignal;
      if (typeof orig !== 'function') {
        return setTimeout(patchHandleCallSignal, 200);
      }
      window.handleCallSignal = function (senderConnId, text, viaP2P) {
        var incomingScr = document.getElementById('screen-ooIncoming');
        var wasIncomingOpen = !!(incomingScr && !incomingScr.classList.contains('hidden-screen'));
        try { orig.apply(this, arguments); } catch (e) { console.error('[adapter] handleCallSignal:', e); }
        try {
          // Savunma: incoming overlay açıkken CALL_END/REJECT geldiyse mutlaka kapat
          if ((text === 'CALL_END' || text === 'CALL_REJECT') && wasIncomingOpen) {
            try { if (typeof window.stopBeep === 'function') window.stopBeep(); } catch (e) {}
            closeOOIncomingScreen();
          }
          // Savunma: CALL_ACCEPT geldiğinde OO call ekranı açıksa "Bağlandı" + 00:00 başlat
          if (typeof text === 'string' && (text === 'CALL_ACCEPT' || text.indexOf('CALL_ACCEPT###') === 0)) {
            var oo = document.getElementById('screen-ooCall');
            if (oo && !oo.classList.contains('hidden-screen')) {
              var oS = document.getElementById('oocStatus'); if (oS) oS.textContent = 'Bağlandı';
              var oD = document.getElementById('oocDuration'); if (oD) oD.style.visibility = 'visible';
              oo.classList.add('connected');
              stopRingbackTone();
              ooOutgoingPending = false;
              ooEngineActiveSeen = true;
              if (!ooCallTimer) {
                var acceptedAt = Number(text.split('###')[1]) || 0;
                startOOCallTimer(acceptedAt || Date.now());
              }
            }
          }
        } catch (e) { console.warn('[adapter] handleCallSignal yan etki hata:', e); }
      };
    })();

    window.ooiAccept = function () {
      // Motor: acceptCall() → startAudioCall/startVideoCall(callerConnId, true) →
      // #activeCallScreen açılır → bridgeEngineCallToOO OO ekranını da açar.
      ooAcceptedIncomingStartedAt = Date.now();
      var incomingDur = document.getElementById('ooiDuration');
      if (incomingDur) {
        incomingDur.textContent = '00:00';
        incomingDur.style.visibility = 'visible';
      }
      if (typeof window.acceptCall === 'function') {
        try { window.acceptCall(); } catch (e) { console.error('[adapter] acceptCall hata:', e); }
      }
    };
    window.ooiReject = function () {
      if (typeof window.rejectCall === 'function') {
        try { window.rejectCall(); } catch (e) { console.error('[adapter] rejectCall hata:', e); }
      }
      closeOOIncomingScreen();
    };

    // OO arama ekranı buton aksiyonları → motor fonksiyonlarına forward
    window.oocToggleMute = function () {
      var b = document.getElementById('oocMute'); if (b) b.classList.toggle('active');
      if (typeof window.toggleMute === 'function') window.toggleMute();
    };
    window.oocToggleSpeaker = function () {
      var b = document.getElementById('oocSpeaker'); if (b) b.classList.toggle('active');
      if (typeof window.toggleSpeaker === 'function') window.toggleSpeaker();
    };
    window.oocToggleVideo = function () {
      var b = document.getElementById('oocVideo'); if (b) b.classList.toggle('active');
      // Motor: toggleVideoInCall sesli aramayı görüntülüye çevirir
      if (typeof window.toggleVideoInCall === 'function') window.toggleVideoInCall();
    };
    window.oocHangup = function () {
      // Stabilite: CALL_END sinyalini birden fazla yoldan + retry ile gönder.
      var connId = null;
      try { connId = (typeof activeCallConnId !== 'undefined' && activeCallConnId) || ooOutgoingConnId || null; } catch (e) {}
      var sendEnd = function () {
        try { if (typeof sendCallSignal === 'function' && connId) sendCallSignal(connId, 'CALL_END'); } catch (e) {}
        try { if (typeof window.wsSend === 'function' && connId) window.wsSend('CALL_END', connId); } catch (e) {}
      };
      sendEnd();
      try { if (typeof window.endVideoCall === 'function') window.endVideoCall(); } catch (e) {}
      try { if (typeof window.endActiveCall === 'function') window.endActiveCall(); } catch (e) {}
      // Karşı taraf hâlâ "çalıyor" diyebiliyor → 250ms ve 800ms sonra tekrar dene
      setTimeout(sendEnd, 250);
      setTimeout(sendEnd, 800);
      stopRingbackTone();
      clearOutgoingMute();
      closeOOCallScreen();
    };

    // ---------- 2G) İlk ekranı göster (Adım 7 + Adım 10 tema seçici) ----------
    // Akış:
    //  - Splash 600ms görünür
    //  - Arayüz seçimi yoksa → screen-themepicker (oturum olsa bile)
    //  - Arayüz seçiliyse → seçilen arayüz açılır
    // DEV: ?fresh=1 ile ilk-açılış akışını test et (splash + arayüz seçici)
    try {
      if (/[?&]fresh=1\b/.test(location.search)) {
        [INTERFACE_KEY,'sohbeto.oo.theme','sohbet_my_number_v1','sohbeto.oo.profile.number'].forEach(function(k){ try{ localStorage.removeItem(k); }catch(e){} });
      }
    } catch(e){}
    setTimeout(function () {
      // DEV: fresh=1 ise her ihtimale karşı boot anında tekrar temizle
      try {
        if (/[?&]fresh=1\b/.test(location.search)) {
          [INTERFACE_KEY,'sohbeto.oo.theme','sohbet_my_number_v1','sohbeto.oo.profile.number'].forEach(function(k){ try{ localStorage.removeItem(k); }catch(e){} });
          try { if (window.GunesOSStore) window.GunesOSStore.set(window.GunesOSStore.path.globalTheme(), ''); } catch(e){}
        }
      } catch(e){}
      var splash = document.getElementById('screenSplash');
      if (splash) splash.classList.add('fade-out');
      if (enteredMain) return;
      var chosenInterface = getInterfaceChoice();
      if (chosenInterface) { openChosenInterface(chosenInterface); return; }

      var isFresh = false;
      try { isFresh = /[?&]fresh=1\b/.test(location.search); } catch(e){}
      if (window.GunesOSStore && !isFresh) {
        window.GunesOSStore.get(window.GunesOSStore.path.globalTheme()).then(function (v) {
          var storedInterface = normalizeInterfaceChoice(v);
          if (storedInterface) {
            setInterfaceChoice(storedInterface);
            openChosenInterface(storedInterface);
          } else {
            showScreen('screen-themepicker');
          }
        });
      } else {
        if (isFresh && window.GunesOSStore) {
          try { window.GunesOSStore.set(window.GunesOSStore.path.globalTheme(), ''); } catch(e){}
        }
        showScreen('screen-themepicker');
      }
    }, 600);

    // Tema seçici buton handler'ı
    window.__chooseTheme = function (theme) {
      var choice = setInterfaceChoice(theme);
      openChosenInterface(choice);
    };

    // ---------- Twemoji: tüm sohbet balonlarındaki emojileri (özellikle bayrakları) gerçek görüntüye çevir ----------
    (function bindTwemoji() {
      function parseAll() {
        if (!window.twemoji) return;
        try {
          var c = document.getElementById('chatMessages');
          if (c) window.twemoji.parse(c, { folder: 'svg', ext: '.svg' });
          // Sohbet listesi önizlemeleri
          var lists = document.querySelectorAll('#convListGenel, #convListOzel, .conv-preview, .conv-name');
          lists.forEach(function (n) { window.twemoji.parse(n, { folder: 'svg', ext: '.svg' }); });
        } catch (_) {}
      }
      // Yeni mesaj eklendikçe parse et
      var target = document.getElementById('chatMessages');
      if (target && window.MutationObserver) {
        var mo = new MutationObserver(function () { parseAll(); });
        mo.observe(target, { childList: true, subtree: true });
      } else {
        // Hedef DOM henüz yoksa kısa süre sonra tekrar dene
        setTimeout(bindTwemoji, 500);
      }
      // İlk açılışta da bir kez tara
      setTimeout(parseAll, 300);
      // chat ekranı her açıldığında bir tarama daha
      var bodyObs = new MutationObserver(function () { parseAll(); });
      bodyObs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
    })();

    // ---------- Dokunmatik swipe: sohbetler ↔ kişiler ↔ gruplar ↔ ayarlar ----------
    (function bindSwipeNav() {
      var ORDER = ['sohbetler', 'kisiler', 'gruplar', 'ayarlar'];
      var SCREEN_TO_TAB = {
        'screen-sohbetler': 'sohbetler',
        'screen-kisiler':   'kisiler',
        'screen-gruplar':   'gruplar',
        'screen-ayarlar':   'ayarlar'
      };
      function currentTab() {
        for (var sid in SCREEN_TO_TAB) {
          var el = document.getElementById(sid);
          if (el && !el.classList.contains('hidden-screen')) return SCREEN_TO_TAB[sid];
        }
        return null;
      }
      var startX = 0, startY = 0, tracking = false, startedTab = null;
      var THRESHOLD = 60, MAX_OFF_AXIS = 50;
      function fluidTabsActive() {
        var container = document.querySelector('.app-container');
        return !!(container && container.classList.contains('fluid-mode'));
      }
      function isInChatOrCall() {
        var ids = ['screen-chat', 'screen-ooCall', 'screen-ooIncoming', 'screen-phone', 'screen-auth'];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (el && !el.classList.contains('hidden-screen')) return true;
        }
        return false;
      }
      function onStart(e) {
        if (fluidTabsActive()) { tracking = false; return; }
        if (isInChatOrCall()) { tracking = false; return; }
        var t = e.touches ? e.touches[0] : e;
        // Yatay kaydırma içeren elementlerde (örn. ses ayarı şeritleri) iptal et
        var blocked = e.target && e.target.closest && e.target.closest('input,textarea,.alphabet-sidebar,.ci-emoji-grid,.ci-attach-grid,.ooc-actions');
        if (blocked) { tracking = false; return; }
        startX = t.clientX; startY = t.clientY;
        startedTab = currentTab();
        tracking = !!startedTab;
      }
      function onEnd(e) {
        if (fluidTabsActive()) { tracking = false; return; }
        if (!tracking) return;
        tracking = false;
        var t = (e.changedTouches && e.changedTouches[0]) || e;
        var dx = t.clientX - startX, dy = t.clientY - startY;
        if (Math.abs(dy) > MAX_OFF_AXIS) return;
        if (Math.abs(dx) < THRESHOLD) return;
        var idx = ORDER.indexOf(startedTab);
        if (idx < 0) return;
        var next = dx < 0 ? ORDER[idx + 1] : ORDER[idx - 1];
        if (!next) return;
        if (window.app && typeof window.app.navigate === 'function') window.app.navigate(next);
      }
      var container = document.querySelector('.app-container') || document.body;
      container.addEventListener('touchstart', onStart, { passive: true });
      container.addEventListener('touchend', onEnd, { passive: true });
    })();

    // ---------- 9) +90 OTOMATİK PREFIX (telefon inputları) ----------
    window.__normalizePhone = function (raw) {
      var v = String(raw || '').trim();
      if (!v) return '+90 ';
      // Sadece rakam ve + bırak
      v = v.replace(/[^\d+]/g, '');
      if (v.startsWith('+')) {
        // +90 dışında bir ülke kodu yazıldıysa dokunma
        return v;
      }
      // baştaki 0'ı sil
      v = v.replace(/^0+/, '');
      // baştaki 90'ı sil (çift +90 olmasın)
      v = v.replace(/^90/, '');
      return '+90 ' + v;
    };
    (function bindPhoneAutoPrefix() {
      function bind(id) {
        var el = document.getElementById(id); if (!el) return;
        function ensure() {
          var v = (el.value || '').trim();
          if (!v) { el.value = '+90 '; return; }
          if (!v.startsWith('+')) el.value = window.__normalizePhone(v);
        }
        el.addEventListener('focus', ensure);
        el.addEventListener('input', function () {
          if (!el.value.startsWith('+')) el.value = '+90 ' + el.value.replace(/[^\d ]/g, '');
        });
        ensure();
      }
      function tick() { bind('phoneInput'); bind('newContactPhone'); }
      tick();
      var mo = new MutationObserver(tick);
      mo.observe(document.body, { childList: true, subtree: true });
    })();

    // ---------- 10) TEMA AYARLARI ----------
    (function bindThemeSettings() {
      var THEMES = {
        ocean: { label: 'Okyanus · Açık', primary: '#0f766e', hover: '#115e59', light: '#dff7f5', bg: '#f8fffe' },
        forest: { label: 'Orman · Açık', primary: '#0a7c4a', hover: '#08633b', light: '#e6f3eb', bg: '#ffffff' },
        sunset: { label: 'Günbatımı · Açık', primary: '#ea580c', hover: '#c2410c', light: '#ffedd5', bg: '#fffaf5' }
      };
      var PRIMARY_ORDER = ['ocean', 'forest', 'sunset'];
      var BG_ORDER = ['ocean', 'forest', 'sunset'];

      // Eski tercih "night" idi: okyanusa zorla yükselt
      try {
        var __old = localStorage.getItem('sohbeto.oo.theme');
        if (__old === 'night') localStorage.setItem('sohbeto.oo.theme', 'ocean');
      } catch (e) {}

      function applyTheme(name) {
        var theme = THEMES[name] || THEMES.ocean;
        var root = document.documentElement;
        root.style.setProperty('--primary-green', theme.primary);
        root.style.setProperty('--primary-green-hover', theme.hover);
        root.style.setProperty('--light-green-bg', theme.light);
        root.style.setProperty('--bg-white', theme.bg);
        try { localStorage.setItem('sohbeto.oo.theme', name); } catch (e) {}
        var title = document.getElementById('current-theme-name');
        if (title) title.textContent = theme.label;
        document.querySelectorAll('#primary-colors .color-swatch, #bg-colors .color-swatch').forEach(function (el) {
          el.classList.toggle('active', el.dataset.theme === name);
        });
      }

      function renderPalette(containerId, order, mode) {
        var wrap = document.getElementById(containerId);
        if (!wrap) return;
        wrap.innerHTML = order.map(function (name) {
          var t = THEMES[name];
          var color = mode === 'bg' ? t.bg : t.primary;
          return '<button type="button" class="color-swatch" data-theme="' + name + '" style="background:' + color + '" aria-label="' + t.label + '"></button>';
        }).join('');
        wrap.querySelectorAll('.color-swatch').forEach(function (btn) {
          btn.addEventListener('click', function () { applyTheme(btn.dataset.theme); });
        });
      }

      window.app.openThemeSettings = function () {
        renderPalette('primary-colors', PRIMARY_ORDER, 'primary');
        renderPalette('bg-colors', BG_ORDER, 'bg');
        showScreen('screen-tema');
        try { applyTheme(localStorage.getItem('sohbeto.oo.theme') || 'ocean'); } catch (e) { applyTheme('ocean'); }
      };
      window.app.closeThemeSettings = function () { showScreen('screen-ayarlar'); };

      // Hesap > Profil overlay (Ad + Biyografi). Fotoğraf seçimi ayarlar girişinde kalır.
      window.app.openAccount = function () { showScreen('screen-hesap'); };
      window.app.closeAccount = function () { showScreen('screen-ayarlar'); };

      // ---------- Adım 8: GİZLİLİK ----------
      // Anahtar hesap-bazlı: kayıtlı kullanıcı her hangi olursa olsun kendi tercihi yüklenir.
      function privacyKey() {
        var num = '';
        try {
          if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.virtualNo) num = CONFIG.virtualNo;
          if (!num) num = localStorage.getItem('sohbeto.oo.profile.number') || '';
          if (!num) num = localStorage.getItem('sohbet_my_number_v1') || '';
        } catch (e) {}
        var norm = (window.__normalizePhone ? window.__normalizePhone(num) : num).trim();
        return 'sohbeto.oo.privacy.showName.' + (norm || 'anon');
      }
      window.__privacyShowName = function () {
        try { return localStorage.getItem(privacyKey()) === '1'; } catch (e) { return false; }
      };
      function setPrivacyShowName(v) {
        try { localStorage.setItem(privacyKey(), v ? '1' : '0'); } catch (e) {}
        updatePrivacySubtitle();
        // Tercih değişince mevcut tüm peer'lara güncel profili (ya da boş ad) yeniden yayınla
        try { if (typeof window.scheduleProfileBroadcast === 'function') window.scheduleProfileBroadcast(50); } catch (e) {}
      }
      function updatePrivacySubtitle() {
        var sub = document.getElementById('privacy-subtitle');
        if (!sub) return;
        sub.textContent = window.__privacyShowName()
          ? 'Adın herkese görünür · Şifreleme aktif'
          : 'Sadece kişilerin adını görür · Şifreleme aktif';
      }
      window.app.openPrivacy = function () {
        showScreen('screen-gizlilik');
        var t = document.getElementById('privacyShowNameToggle');
        if (t) {
          t.checked = window.__privacyShowName();
          // Listener'ı tek sefer bağla
          if (!t.dataset.bound) {
            t.dataset.bound = '1';
            t.addEventListener('change', function () { setPrivacyShowName(t.checked); });
          }
        }
        updatePrivacySubtitle();
      };
      window.app.closePrivacy = function () { showScreen('screen-ayarlar'); };

      // Veri saklama bilgi modali
      window.app.openDataInfo = function () {
        var m = document.getElementById('dataInfoModal');
        if (!m) return;
        var numEl = document.getElementById('dataInfoMyNum');
        if (numEl) {
          var n = (window.myNumber) ||
            localStorage.getItem('sohbeto.oo.profile.number') ||
            localStorage.getItem('sohbet_my_number_v1') || '<+90...>';
          numEl.textContent = n;
        }
        m.classList.remove('hidden-screen');
        m.style.display = 'flex';
      };
      window.app.closeDataInfo = function () {
        var m = document.getElementById('dataInfoModal');
        if (!m) return;
        m.classList.add('hidden-screen');
        m.style.display = 'none';
      };

      // İlk açılışta subtitle'ı doğru bas
      setTimeout(updatePrivacySubtitle, 800);

      // Profil paketi yayınını gizliliğe göre filtrele.
      // Kapalıysa: alıcı bizim kişimiz değilse, profil paketinde 'name' alanını boş yolla
      // (engine cleanProfileName 'Kullanıcı' lekesini zaten boş kabul eder; alıcının
      // resolveDisplayName fonksiyonu numara/rehber adına düşer → "+90… seni arıyor").
      try {
        var _origSendProfileUpdate = window.sendProfileUpdate;
        if (typeof _origSendProfileUpdate === 'function') {
          window.sendProfileUpdate = function (targetConnId) {
            try {
              if (window.__privacyShowName()) return _origSendProfileUpdate.apply(this, arguments);
              if (!targetConnId || targetConnId === 'HERKES') return _origSendProfileUpdate.apply(this, arguments);
              // Alıcının numarasını bul; rehberde varsa tam profil yolla
              var num = '';
              try { num = phoneForConn(targetConnId) || ''; } catch (e) {}
              var normalized = num ? (window.__normalizePhone ? window.__normalizePhone(num).trim() : num.trim()) : '';
              var inContacts = false;
              try {
                if (normalized && typeof contactsState !== 'undefined' && contactsState && contactsState.byNumber) {
                  // contactsState.byNumber numarayı normalize formatla (boşluksuz?) tutuyor olabilir.
                  // İki varyantı da dene.
                  var stripped = normalized.replace(/\s+/g, '');
                  inContacts = !!(contactsState.byNumber.get(normalized) || contactsState.byNumber.get(stripped));
                }
              } catch (e) {}
              if (inContacts) return _origSendProfileUpdate.apply(this, arguments);

              // Gizli mod: ad alanını geçici olarak boşalt, paketi üret, eski hâle döndür.
              var hadNick = (typeof state !== 'undefined' && state) ? state.nick : undefined;
              try { if (typeof state !== 'undefined') state.nick = ''; } catch (e) {}
              var packet = '';
              try {
                if (typeof window.createProfileUpdatePacket === 'function') packet = window.createProfileUpdatePacket(true);
                else if (typeof createProfileUpdatePacket === 'function') packet = createProfileUpdatePacket(true);
              } catch (e) {}
              try { if (typeof state !== 'undefined' && hadNick !== undefined) state.nick = hadNick; } catch (e) {}
              if (!packet) return _origSendProfileUpdate.apply(this, arguments);
              try {
                if (typeof window.sendWhenP2PReady === 'function') {
                  return window.sendWhenP2PReady(targetConnId, packet, 'Profil (gizli ad) gönderildi');
                }
                if (typeof sendWhenP2PReady === 'function') {
                  return sendWhenP2PReady(targetConnId, packet, 'Profil (gizli ad) gönderildi');
                }
              } catch (e) {}
              return _origSendProfileUpdate.apply(this, arguments);
            } catch (e) {
              return _origSendProfileUpdate.apply(this, arguments);
            }
          };
        }
      } catch (e) { console.warn('[adapter] privacy patch hata:', e); }


      renderPalette('primary-colors', PRIMARY_ORDER, 'primary');
      renderPalette('bg-colors', BG_ORDER, 'bg');
      try { applyTheme(localStorage.getItem('sohbeto.oo.theme') || 'ocean'); } catch (e) { applyTheme('ocean'); }
    })();

    // ---------- 10) PROFİL FOTOĞRAFI + AD/BİYO PERSİSTANSI ----------
    window.handleProfilePic = function (ev) {
      var f = ev && ev.target && ev.target.files && ev.target.files[0];
      if (!f) return;
      var circle = document.getElementById('profilePicCircle');
      var reader = new FileReader();
      reader.onload = function (e) {
        var url = e.target.result;
        if (circle) circle.innerHTML = '<img src="' + url + '" alt="Profil" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';
        try {
          var data = JSON.parse(localStorage.getItem('sohbeto.oo.profile') || '{}');
          data.image = url;
          localStorage.setItem('sohbeto.oo.profile', JSON.stringify(data));
        } catch (e) {}
        // Motora ilet (resize + IndexedDB + P2P broadcast)
        try {
          var stub = document.getElementById('fileInput');
          if (stub && typeof stub.onchange === 'function') {
            var dt = new DataTransfer();
            dt.items.add(f);
            stub.files = dt.files;
            stub.onchange({ target: stub });
          }
        } catch (err) { console.warn('[adapter] profil foto motora iletilemedi', err); }
        // Anında P2P yayınla — karşıdaki kişi sohbet/kişi listesinde gezinirken bile görsün
        try { if (typeof window.scheduleProfileBroadcast === 'function') window.scheduleProfileBroadcast(50); } catch (e) {}
      };
      reader.readAsDataURL(f);
      ev.target.value = '';
    };

    (function bindProfileFields() {
      function init() {
        var nameEl = document.getElementById('profileName');
        var bioEl = document.getElementById('profileBio');
        var circle = document.getElementById('profilePicCircle');
        if (!nameEl && !bioEl && !circle) return false;
        var sv = {};
        try { sv = JSON.parse(localStorage.getItem('sohbeto.oo.profile') || '{}'); } catch (e) {}
        if (nameEl && sv.name && !nameEl.value) nameEl.value = sv.name;
        if (bioEl && sv.bio && !bioEl.value) bioEl.value = sv.bio;
        if (circle && sv.image && !circle.querySelector('img')) {
          circle.innerHTML = '<img src="' + sv.image + '" alt="Profil" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';
        }
        function save() {
          try {
            var data = JSON.parse(localStorage.getItem('sohbeto.oo.profile') || '{}');
            data.name = nameEl ? nameEl.value.trim() : '';
            data.bio = bioEl ? bioEl.value : '';
            localStorage.setItem('sohbeto.oo.profile', JSON.stringify(data));
            try {
              var st = getEngineState && getEngineState();
              if (st) {
                // Boş ad → state.nick'i temizle (engine 'Kullanıcı' lekesi göndermesin)
                st.nick = data.name || '';
                st.bio = data.bio || '';
              }
            } catch (e) {}
            // P2P'ye anında yayınla — debounce ile (her tuşta paket basmasın)
            try { if (typeof window.scheduleProfileBroadcast === 'function') window.scheduleProfileBroadcast(400); } catch (e) {}
          } catch (e) {}
        }
        if (nameEl) nameEl.addEventListener('input', save);
        if (bioEl) bioEl.addEventListener('input', save);
        return true;
      }
      if (!init()) {
        var mo = new MutationObserver(function () { if (init()) mo.disconnect(); });
        mo.observe(document.body, { childList: true, subtree: true });
      }
    })();

    // ---------- BAYRAK TOKEN DEĞİŞTİRİCİ (Doğu Türkistan / KKTC) ----------
    // Engine mesajları escapeHtml ile basıyor; bu yüzden gerçek <img> gönderemiyoruz.
    // Çözüm: tıklayınca metne :dt-flag: / :kktc-flag: token'ı eklenir, render sonrası
    // adapter bu token'ları DOM'da inline bayrak görseliyle değiştirir.
    (function setupFlagTokenReplacer() {
      var FLAG_DT_SRC = 'flag-dogu-turkistan.png';
      var FLAG_KKTC_SRC = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">' +
        '<rect width="1200" height="800" fill="#fff"/>' +
        '<rect y="60" width="1200" height="80" fill="#E30A17"/>' +
        '<rect y="660" width="1200" height="80" fill="#E30A17"/>' +
        '<circle cx="540" cy="400" r="135" fill="#E30A17"/>' +
        '<circle cx="585" cy="400" r="110" fill="#fff"/>' +
        '<polygon fill="#E30A17" points="700,400 783,376 732,448 732,352 783,424"/>' +
        '</svg>'
      );
      var TOKEN_RE = /:dt-flag:|:kktc-flag:|\uE001|\uE002/g;

      function imgHtml(src, alt) {
        return '<img src="' + src + '" alt="' + alt + '" ' +
               'style="display:inline-block;width:1.3em;height:1em;vertical-align:-0.15em;' +
               'object-fit:contain;border-radius:2px;margin:0 1px">';
      }

      function replaceInTextNode(node) {
        var v = node.nodeValue;
        if (!v || !/(:dt-flag:|:kktc-flag:|\uE001|\uE002)/.test(v)) return;
        var span = document.createElement('span');
        span.innerHTML = v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/:dt-flag:|\uE001/g, imgHtml(FLAG_DT_SRC, 'Doğu Türkistan'))
          .replace(/:kktc-flag:|\uE002/g, imgHtml(FLAG_KKTC_SRC, 'KKTC'));
        node.parentNode.replaceChild(span, node);
      }

      function walk(root) {
        if (!root) return;
        if (root.nodeType === 3) { replaceInTextNode(root); return; }
        if (root.nodeType !== 1) return;
        // input/textarea içine girme — kullanıcı yazarken token'ı görsün ki silebilsin
        var tag = root.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SCRIPT' || tag === 'STYLE') return;
        var children = Array.prototype.slice.call(root.childNodes);
        for (var i = 0; i < children.length; i++) walk(children[i]);
      }

      function scan() {
        var targets = document.querySelectorAll(
          '#chatMessages .msg-bubble, .conv-preview, .msg-bubble'
        );
        targets.forEach(walk);
      }

      // İlk tarama + sürekli gözlem
      scan();
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === 'childList') {
            m.addedNodes.forEach(function (n) {
              if (n.nodeType !== 1) return;
              if (n.matches && (n.matches('.msg-bubble') || n.matches('.conv-preview'))) walk(n);
              var subs = n.querySelectorAll && n.querySelectorAll('.msg-bubble, .conv-preview');
              if (subs) subs.forEach(walk);
            });
          } else if (m.type === 'characterData') {
            replaceInTextNode(m.target);
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    })();

    // ---------- ADIM 9: Hesap-bazlı kalıcı veri (GunesOSStore köprüsü) ----------
    // contactsState'i `.gunesos/sohbeto/<+90...>/contacts` yoluna aynalar.
    // Boot'ta okuyup engine'in contactsState'ine merge eder (tab id sıfırlansa
    // bile veriler korunur).
    (function bindGunesosStore() {
      if (!window.GunesOSStore) {
        console.warn('[adapter] GunesOSStore yok, kalıcı katman atlandı.');
        return;
      }
      var Store = window.GunesOSStore;

      function currentNumber() {
        try { if (typeof myNumber !== 'undefined' && myNumber) return myNumber; } catch (e) {}
        try {
          return localStorage.getItem('sohbet_my_number_v1') ||
                 localStorage.getItem('sohbeto.oo.profile.number') || '';
        } catch (e) { return ''; }
      }

      function snapshotContacts() {
        if (typeof contactsState === 'undefined' || !contactsState || !contactsState.byNumber) return [];
        var out = [];
        contactsState.byNumber.forEach(function (c) {
          if (!c || !c.number) return;
          // Sadece serileştirilebilir alanları yaz
          out.push({
            number:  c.number,
            name:    c.name || '',
            connId:  c.connId || '',
            status:  c.status || '',
            avatar:  c.avatar || '',
            picture: c.picture || ''
          });
        });
        return out;
      }

      var flushContacts = Store.debounce(function () {
        var num = currentNumber();
        if (!num) return;
        var snap = snapshotContacts();
        Store.set(Store.path.contacts(num), snap);
      }, 600);

      // Boot restore: engine ContactState'ini doldurduktan sonra üstüne merge et.
      // 1.5sn sonra çalışır (engine kendi DB'sini yüklemiş olur), eksik kayıtları
      // ekler. Var olanlara dokunmaz (engine'in daha güncel verisi varsa korunur).
      setTimeout(function bootRestore() {
        var num = currentNumber();
        if (!num) { setTimeout(bootRestore, 1500); return; }
        Store.get(Store.path.contacts(num)).then(function (list) {
          if (!Array.isArray(list) || !list.length) return;
          if (typeof contactsState === 'undefined' || !contactsState || !contactsState.byNumber) return;
          var added = 0;
          list.forEach(function (c) {
            if (!c || !c.number) return;
            if (!contactsState.byNumber.has(c.number)) {
              contactsState.byNumber.set(c.number, c);
              added++;
            }
          });
          if (added > 0) {
            try { if (typeof window.renderContacts === 'function') window.renderContacts(); } catch (e) {}
            try { if (typeof window.renderConvList === 'function') window.renderConvList(); } catch (e) {}
            console.info('[adapter] GunesOSStore: ' + added + ' kişi geri yüklendi.');
          }
        });
      }, 1500);

      // Her renderContacts/saveContact sonrası flush
      var _origRenderContacts = typeof window.renderContacts === 'function' ? window.renderContacts : null;
      if (_origRenderContacts) {
        window.renderContacts = function () {
          var r = _origRenderContacts.apply(this, arguments);
          flushContacts();
          return r;
        };
      }
      // Periyodik güvence flush (her 5 sn) — kaçırılan değişiklikleri yakalar
      setInterval(flushContacts, 5000);
      // Sayfa kapanırken son bir senkron flush dene
      window.addEventListener('beforeunload', function () {
        try {
          var num = currentNumber();
          if (num) Store.set(Store.path.contacts(num), snapshotContacts());
        } catch (e) {}
      });

      console.info('[adapter] GunesOSStore köprüsü aktif (hesap-bazlı kalıcılık).');
    })();

    // ---------- MESAJ KUTUSU BAYRAK/EMOJİ AYNASI ----------
    // Textarea içinde <img> gösterilemediği için üstüne birebir hizalı bir "ayna"
    // katmanı koyuyoruz: :dt-flag: / :kktc-flag: token'ları gerçek bayrağa,
    // Unicode bayraklar (🇹🇷 vb. Windows'ta "TR" harfleri) twemoji görseline dönüşür.
    (function setupInputFlagMirror() {
      var FLAG_DT = 'flag-dogu-turkistan.png';
      var FLAG_KKTC = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">' +
        '<rect width="1200" height="800" fill="#fff"/>' +
        '<rect y="60" width="1200" height="80" fill="#E30A17"/>' +
        '<rect y="660" width="1200" height="80" fill="#E30A17"/>' +
        '<circle cx="540" cy="400" r="135" fill="#E30A17"/>' +
        '<circle cx="585" cy="400" r="110" fill="#fff"/>' +
        '<polygon fill="#E30A17" points="700,400 783,376 732,448 732,352 783,424"/>' +
        '</svg>'
      );

      function esc(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      function flagImg(src, alt) {
        return '<img src="' + src + '" alt="' + alt + '" ' +
               'style="display:inline-block;width:1.5em;height:1.15em;vertical-align:-0.2em;' +
               'object-fit:contain;border-radius:2px;margin:0 1px">';
      }

      function init() {
        var ta = document.getElementById('chatInput');
        if (!ta || ta.__flagMirror) return !!ta;

        var wrap = document.createElement('div');
        wrap.className = 'ci-mirror-wrap';
        wrap.style.cssText = 'position:relative;flex:1 1 auto;min-width:0;display:flex;';
        ta.parentNode.insertBefore(wrap, ta);
        wrap.appendChild(ta);

        var mirror = document.createElement('div');
        mirror.setAttribute('aria-hidden', 'true');
        mirror.style.cssText =
          'position:absolute;inset:0;pointer-events:none;overflow:hidden;' +
          'white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;' +
          'display:block;min-width:0;';
        wrap.appendChild(mirror);
        ta.__flagMirror = mirror;

        // Gerçek yazı rengini metni gizlemeden ÖNCE al
        var baseColor = getComputedStyle(ta).color || '#111827';

        // Yazıyı gizle, imleci koru
        ta.style.color = 'transparent';
        ta.style.caretColor = baseColor;
        ta.style.position = 'relative';
        ta.style.zIndex = '1';
        ta.style.background = 'transparent';

        function syncStyle() {
          var cs = getComputedStyle(ta);
          ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight',
           'paddingTop','paddingRight','paddingBottom','paddingLeft','textAlign'].forEach(function (k) {
            mirror.style[k] = cs[k];
          });
          mirror.style.color = baseColor;
        }

        function render() {
          var v = ta.value || '';
          if (!v) { mirror.innerHTML = ''; return; }
          mirror.innerHTML = esc(v)
            .replace(/:dt-flag:|\uE001/g, flagImg(FLAG_DT, 'Doğu Türkistan'))
            .replace(/:kktc-flag:|\uE002/g, flagImg(FLAG_KKTC, 'KKTC'));
          try { window.twemoji && window.twemoji.parse(mirror, { folder: 'svg', ext: '.svg' }); } catch (_) {}
          // twemoji görsellerini satır yüksekliğine oturt
          try {
            mirror.querySelectorAll('img').forEach(function (im) {
              // Bazı genel img stilleri görseli block yaparak her emojiyi yeni
              // satıra atıyordu. Tüm özel/Unicode bayrak ve emojileri kesin olarak
              // satır içi, sabit kutulu karakter gibi tut.
              im.style.setProperty('display', 'inline-block', 'important');
              im.style.setProperty('width', im.classList.contains('emoji') ? '1.15em' : '1.5em', 'important');
              im.style.setProperty('height', '1.15em', 'important');
              im.style.setProperty('max-width', 'none', 'important');
              im.style.setProperty('vertical-align', '-0.2em', 'important');
              im.style.setProperty('margin', '0 1px', 'important');
              im.style.setProperty('object-fit', 'contain', 'important');
            });
          } catch (_) {}
          mirror.scrollTop = ta.scrollTop;
        }

        syncStyle();
        render();
        ['input', 'change', 'keyup', 'paste', 'cut', 'focus', 'blur'].forEach(function (ev) {
          ta.addEventListener(ev, function () { setTimeout(render, 0); });
        });
        ta.addEventListener('scroll', function () { mirror.scrollTop = ta.scrollTop; });
        window.addEventListener('resize', function () { syncStyle(); render(); });
        // Engine input'u programatik temizlediğinde (gönderim sonrası) yakala
        setInterval(function () {
          if (mirror.__last !== ta.value) { mirror.__last = ta.value; render(); }
        }, 200);
        return true;
      }

      if (!init()) {
        var mo = new MutationObserver(function () { if (init()) mo.disconnect(); });
        mo.observe(document.body, { childList: true, subtree: true });
      }
    })();

    console.info('[sohbeto-adapter] hazır — Adım 1 (login + sohbet listesi + chat) bağlandı.');
  });
})();


/* ------------------------------------------------------------------
 * Kişiler: satıra uzun basınca "Kişiyi Sil" eylem sayfası
 * ------------------------------------------------------------------ */
(function () {
  'use strict';
  var LONG_MS = 500;
  var timer = null, startX = 0, startY = 0, activeRow = null, suppressClick = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function closeSheet() {
    var el = document.getElementById('contactActionSheet');
    if (el) el.remove();
  }

  function openSheet(name, number, connId) {
    closeSheet();
    var wrap = document.createElement('div');
    wrap.id = 'contactActionSheet';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.4);display:flex;align-items:flex-end;';
    wrap.innerHTML =
      '<div style="background:var(--bg-white);width:100%;border-radius:22px 22px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -10px 30px rgba(0,0,0,.18)">'
      + '<div style="width:40px;height:4px;background:#e5e7eb;border-radius:2px;margin:0 auto 14px"></div>'
      + '<div style="font-weight:700;font-size:1.02rem;text-align:center;margin-bottom:4px">' + esc(name || number || 'Kişi') + '</div>'
      + '<div style="font-size:.82rem;color:var(--text-secondary);text-align:center;margin-bottom:16px">' + esc(number || '') + '</div>'
      + '<button data-act="delete" style="width:100%;padding:14px;border:none;border-radius:14px;background:#fee2e2;color:#b91c1c;font-weight:700;font-size:.98rem;font-family:inherit;cursor:pointer">Kişiyi Sil</button>'
      + '<button data-act="cancel" style="width:100%;margin-top:10px;padding:14px;border:none;border-radius:14px;background:#f1f5f9;color:var(--text-main);font-weight:600;font-size:.98rem;font-family:inherit;cursor:pointer">İptal</button>'
      + '</div>';
    wrap.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (e.target === wrap || act === 'cancel') { closeSheet(); return; }
      if (act === 'delete') { closeSheet(); doDelete(name, number, connId); }
    });
    document.body.appendChild(wrap);
  }

  function doDelete(name, number, connId) {
    if (!confirm('"' + (name || number) + '" rehberden silinsin mi?')) return;
    try {
      if (connId && typeof peers !== 'undefined' && peers[connId] && peers[connId].pc) peers[connId].pc.close();
      if (connId && typeof peers !== 'undefined') delete peers[connId];
    } catch (e) {}
    try {
      if (typeof contactsState !== 'undefined' && contactsState && contactsState.byNumber && number) {
        contactsState.byNumber.delete(number);
      }
    } catch (e) {}
    try { if (typeof dbDeleteContact === 'function' && number) dbDeleteContact(number); } catch (e) {}
    try {
      var Store = window.GunesOSStore;
      var me = (typeof state !== 'undefined' && state && state.myNumber) ? state.myNumber : null;
      if (Store && me && number) Store.del(Store.path.thread(me, number));
    } catch (e) {}
    try { if (typeof window.renderContacts === 'function') window.renderContacts(); } catch (e) {}
    try { if (typeof window.renderConvList === 'function') window.renderConvList(); } catch (e) {}
    try { if (typeof updateUI === 'function') updateUI(); } catch (e) {}
  }

  function rowOf(t) { return t && t.closest ? t.closest('#contactsList .contact-row') : null; }

  function trigger(row) {
    activeRow = null;
    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 700);
    try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) {}
    openSheet(row.getAttribute('data-name') || '', row.getAttribute('data-number') || '', row.getAttribute('data-connid') || '');
  }

  function start(e) {
    var row = rowOf(e.target);
    if (!row) return;
    activeRow = row;
    var p = e.touches ? e.touches[0] : e;
    startX = p.clientX; startY = p.clientY;
    clearTimeout(timer);
    timer = setTimeout(function () { if (activeRow === row) trigger(row); }, LONG_MS);
  }
  function move(e) {
    if (!activeRow) return;
    var p = e.touches ? e.touches[0] : e;
    if (Math.abs(p.clientX - startX) > 10 || Math.abs(p.clientY - startY) > 10) cancel();
  }
  function cancel() { clearTimeout(timer); activeRow = null; }

  document.addEventListener('touchstart', start, { passive: true, capture: true });
  document.addEventListener('touchmove', move, { passive: true, capture: true });
  document.addEventListener('touchend', cancel, true);
  document.addEventListener('touchcancel', cancel, true);
  document.addEventListener('mousedown', start, true);
  document.addEventListener('mousemove', move, true);
  document.addEventListener('mouseup', cancel, true);
  document.addEventListener('contextmenu', function (e) {
    var row = rowOf(e.target);
    if (!row) return;
    e.preventDefault();
    trigger(row);
  }, true);
  document.addEventListener('click', function (e) {
    if (suppressClick && rowOf(e.target)) {
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
  }, true);
})();
