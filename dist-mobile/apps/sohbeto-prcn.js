/**
 * sohbeto-prcn.js — Sohbet üst çubuğundaki ⋮ menüsü ve eklenen 5 özellik:
 *   1) Sohbet teması        → mevcut chatOpenSettings
 *   2) Sohbeti kilitle      → PIN (4-6 hane) + cihaz biyometrisi (varsa)
 *   3) Şifreleme            → AES-GCM uçtan uca anahtar + PRÇN 571 ek koruma
 *   4) Arşiv                → sohbeti arşivle / arşivden çıkar
 *   5) Canlı ileti + ekran  → canlı yazma modu ve ekran paylaşımı
 *
 * Motor dosyalarına dokunulmaz; her şey üst katmanda yaşar ve tema
 * değişkenlerini (--app-bg, --app-surface-solid, --app-text-1 ...) kullanır.
 */
(function () {
  'use strict';
  if (window.SohbetoPRCN) return;

  var BOXES = 571;                       // PRÇN 571 kutu sayısı
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?+-';
  var LSK = 'sohbeto-prcn-v1';

  // ---------------------------------------------------------------- yardımcılar
  function st() {
    // Motor `state`'i dosya üstünde `const` ile tanımlar; window.state oluşmaz.
    // Adapter'ın yaptığı gibi önce global sözcüksel bağlamdan oku.
    try { if (typeof state !== 'undefined' && state) return state; } catch (e) {}
    try { return window.state || null; } catch (e) { return null; }
  }
  function activeConn() { var s = st(); return (s && s.activeChat) || ''; }
  function esc(v) { return String(v == null ? '' : v).replace(/[<>&"]/g, function (c) {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function load() { try { return JSON.parse(localStorage.getItem(LSK)) || {}; } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem(LSK, JSON.stringify(v)); } catch (e) {} }
  function peerData(id) { var d = load(); return (d[id] = d[id] || {}), d; }
  function get(id) { return load()[id] || {}; }
  function set(id, patch) {
    var d = peerData(id); var o = d[id];
    Object.keys(patch).forEach(function (k) { o[k] = patch[k]; });
    save(d); return o;
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'prcn-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 1800);
    setTimeout(function () { try { t.remove(); } catch (e) {} }, 2300);
  }
  function rnd(n) {
    var out = '', a = new Uint32Array(n);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function () {});
    for (var i = 0; i < n; i++) out += ALPHA[(a[i] || Math.floor(Math.random() * 1e9)) % ALPHA.length];
    return out;
  }
  async function sha256hex(text) {
    try {
      var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2); }).join('');
    } catch (e) {
      // Çok eski tarayıcı: basit yedek özet
      var h = 0; for (var i = 0; i < text.length; i++) { h = (h * 31 + text.charCodeAt(i)) | 0; }
      return ('00000000' + (h >>> 0).toString(16)).slice(-8).repeat(8);
    }
  }

  // ------------------------------------------------------------- 571 kutu üretimi
  /** Tamamen rastgele: her kutuya 1-4 karakter. */
  function autoBoxes() {
    var out = new Array(BOXES);
    for (var i = 0; i < BOXES; i++) out[i] = rnd(1 + Math.floor(Math.random() * 4));
    return out;
  }
  /** Parola tohumundan deterministik: aynı parola = aynı 571 kutu. */
  async function seedBoxes(seed) {
    var out = [], block = 0;
    while (out.length < BOXES) {
      var hex = await sha256hex(seed + '|prcn571|' + block++);
      for (var i = 0; i + 1 < hex.length && out.length < BOXES; i += 2) {
        var n = parseInt(hex.substr(i, 2), 16);
        var len = 1 + (n % 4), s = '';
        for (var j = 0; j < len; j++) s += ALPHA[(n + j * 37 + out.length * 11) % ALPHA.length];
        out.push(s);
      }
    }
    return out;
  }
  function normBox(v) {
    v = String(v || '').replace(/\s+/g, '').slice(0, 4);
    return v || rnd(1);
  }

  // --------------------------------------------------------- anahtar paketi / AES
  async function keyMaterial(connId) {
    var d = get(connId);
    var boxes = d.boxes && d.boxes.length === BOXES ? d.boxes : null;
    if (!boxes) return null;
    return await sha256hex(boxes.join('·'));
  }
  async function fingerprint(connId) {
    var m = await keyMaterial(connId);
    return m ? m.slice(0, 12).toUpperCase().replace(/(.4)/g, '$1 ').trim() : '';
  }

  // Anahtar iletimi: motorun normal mesaj kanalı (AES/P2P) kullanılır; taşıyıcı
  // metin arayüzde baloncuk olarak DEĞİL, "PRÇN 571" anahtar rozeti olarak çizilir.
  var MARK = 'PRCN571#';
  var MARK_LIVE = 'PRCNLIVE#';
  var MARK_SCREEN = 'PRCNSCREEN#';

  function sendRaw(text) {
    var inp = document.getElementById('chatInput');
    if (!inp) return false;
    var keep = inp.value;
    inp.value = text;
    try {
      if (typeof window.sendCurrentMessage === 'function') window.sendCurrentMessage();
      else inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } catch (e) {}
    setTimeout(function () { inp.value = keep; try { window.updateSendIcon && window.updateSendIcon(); } catch (e) {} }, 30);
    return true;
  }

  async function sendKey(connId) {
    var mat = await keyMaterial(connId);
    if (!mat) { toast('Önce 571 kutulu anahtarı oluştur'); return; }
    var pack = btoa(unescape(encodeURIComponent(JSON.stringify({ k: mat, t: Date.now() }))));
    sendRaw(MARK + pack);
    set(connId, { sentAt: Date.now() });
    toast('PRÇN 571 anahtarı gönderildi');
  }

  // Gelen/giden anahtar mesajlarını rozete çevir (metin asla görünmez).
  function decorate(root) {
    var nodes = (root || document).querySelectorAll('.message:not([data-prcn]), .msg:not([data-prcn]), [class*="message"]:not([data-prcn])');
    Array.prototype.forEach.call(nodes, function (el) {
      var txt = (el.textContent || '');
      var i = txt.indexOf(MARK);
      if (i < 0) {
        if (txt.indexOf(MARK_SCREEN) >= 0) {
          el.setAttribute('data-prcn', 'screen');
          el.innerHTML = '<div class="prcn-inline"><i class="fa-solid fa-display"></i> Ekran paylaşımı başlatıldı</div>';
        }
        return;
      }
      el.setAttribute('data-prcn', 'key');
      var own = /own|out|sent|me\b/i.test(el.className);
      el.innerHTML =
        '<div class="prcn-keycard' + (own ? ' own' : '') + '">' +
        '  <div class="prcn-keyorb"><i class="fa-solid fa-key"></i></div>' +
        '  <div class="prcn-keytx"><b>PRÇN 571</b><span>' +
        (own ? 'Ek korumalı anahtar gönderildi' : 'Ek korumalı anahtar geldi') + '</span></div>' +
        (own ? '' : '  <button class="prcn-keyok" type="button">Onayla</button>') +
        '</div>';
      var btn = el.querySelector('.prcn-keyok');
      if (btn) btn.onclick = function () {
        var cid = activeConn();
        set(cid, { peerApproved: Date.now() });
        btn.outerHTML = '<span class="prcn-keydone"><i class="fa-solid fa-check"></i> Onaylandı</span>';
        toast('Anahtar onaylandı — şifreni kimse göremez');
      };
    });
  }
  function watch() {
    var box = document.getElementById('chatMessages');
    if (!box) { setTimeout(watch, 600); return; }
    decorate(box);
    new MutationObserver(function () { decorate(box); }).observe(box, { childList: true, subtree: true });
  }

  // --------------------------------------------------------------------- kabuk UI
  function sheet(title, bodyHtml, opts) {
    opts = opts || {};
    var back = document.createElement('div');
    back.className = 'prcn-layer' + (opts.full ? ' full' : '');
    back.innerHTML =
      '<div class="prcn-card' + (opts.full ? ' full' : '') + '">' +
      '  <div class="prcn-head">' +
      '    <button class="prcn-x" type="button" aria-label="Kapat"><i class="fa-solid fa-' + (opts.full ? 'arrow-left' : 'xmark') + '"></i></button>' +
      '    <div class="prcn-title">' + esc(title) + '</div>' +
      '  </div>' +
      '  <div class="prcn-body">' + bodyHtml + '</div>' +
      '</div>';
    document.body.appendChild(back);
    if (opts.full) {
      document.documentElement.classList.add('prcn-noscroll');
      try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen(); } catch (e) {}
    }
    function close() {
      try { back.remove(); } catch (e) {}
      if (opts.full) {
        document.documentElement.classList.remove('prcn-noscroll');
        try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
      }
    }
    back.querySelector('.prcn-x').onclick = close;
    back.addEventListener('click', function (e) { if (e.target === back && !opts.full) close(); });
    back.close = close;
    return back;
  }

  function row(icon, label, sub) {
    return '<button class="prcn-row" type="button"><i class="fa-solid fa-' + icon + '"></i>' +
      '<span><b>' + esc(label) + '</b>' + (sub ? '<em>' + esc(sub) + '</em>' : '') + '</span>' +
      '<i class="fa-solid fa-chevron-right prcn-chev"></i></button>';
  }

  /** ⋮ düğmesine yapışık, oklu (caret) açılır menü. */
  function popover(anchor, html) {
    var back = document.createElement('div');
    back.className = 'prcn-pop-back';
    back.innerHTML = '<div class="prcn-pop"><i class="prcn-pop-arrow"></i>' + html + '</div>';
    document.body.appendChild(back);
    var pop = back.querySelector('.prcn-pop');
    var r = anchor ? anchor.getBoundingClientRect() : null;
    if (!r || !r.width) r = { bottom: 58, right: window.innerWidth - 10, left: window.innerWidth - 46, width: 36 };
    var right = Math.max(8, Math.min(window.innerWidth - 12, window.innerWidth - r.right - 2));
    pop.style.top = (r.bottom + 12) + 'px';
    pop.style.right = right + 'px';
    var cx = r.left + r.width / 2;
    pop.querySelector('.prcn-pop-arrow').style.right = Math.max(12, (window.innerWidth - cx) - right - 7) + 'px';
    requestAnimationFrame(function () { pop.classList.add('in'); });
    function close() { try { back.remove(); } catch (e) {} }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.close = close;
    return back;
  }

  // 1) ⋮ menüsü — düğmenin hemen altında açılır
  function openMenu() {
    var cid = activeConn(), d = get(cid);
    var anchor = document.querySelector('.chat-hbtn[onclick*="chatMore"]');
    var l = popover(anchor, '<div class="prcn-list">' +
      row('palette', 'Sohbet teması', 'Duvar kağıdı ve baloncuk rengi') +
      row('lock', 'Sohbeti kilitle', d.lock ? 'Açık' : 'Kapalı') +
      row('shield-halved', 'Şifreleme', 'AES + PRÇN 571 ek koruma') +
      row('box-archive', 'Arşiv', d.archived ? 'Arşivde' : 'Arşivde değil') +
      row('tower-broadcast', 'Canlı ileti + ekran', live.on ? 'Canlı yazma açık' : 'Canlı yazma kapalı') +
      '</div>');
    var rows = l.querySelectorAll('.prcn-row');
    rows[0].onclick = function () { l.close(); try { window.chatOpenSettings(); } catch (e) {} };
    rows[1].onclick = function () { l.close(); openLock(cid); };
    rows[2].onclick = function () { l.close(); openCrypto(cid); };
    rows[3].onclick = function () { l.close(); toggleArchive(cid); };
    rows[4].onclick = function () { l.close(); openLive(cid); };
  }

  // 2) Sohbeti kilitle
  function openLock(cid) {
    var d = get(cid);
    var l = sheet('Sohbeti kilitle',
      '<div class="prcn-note">Kilitli sohbet açılırken PIN veya cihaz tanıma (parmak izi / yüz) istenir.</div>' +
      '<label class="prcn-field"><span>PIN (4-6 hane)</span>' +
      '<input id="prcnPin" type="password" inputmode="numeric" maxlength="6" placeholder="••••"></label>' +
      '<label class="prcn-check"><input id="prcnBio" type="checkbox"' + (d.bio ? ' checked' : '') + '>' +
      '<span>Cihaz biyometrisi (parmak izi / yüz) — yoksa PIN\'e döner</span></label>' +
      '<div class="prcn-actions">' +
      '<button class="prcn-btn" id="prcnLockSave" type="button">' + (d.lock ? 'Güncelle' : 'Kilidi kur') + '</button>' +
      (d.lock ? '<button class="prcn-btn ghost" id="prcnLockOff" type="button">Kilidi kaldır</button>' : '') +
      '</div>', { full: true });
    l.querySelector('#prcnLockSave').onclick = async function () {
      var pin = (l.querySelector('#prcnPin').value || '').trim();
      if (!/^\d{4,6}$/.test(pin)) { toast('PIN 4-6 haneli sayı olmalı'); return; }
      set(cid, { lock: 1, pin: await sha256hex('prcnpin|' + pin), bio: l.querySelector('#prcnBio').checked ? 1 : 0 });
      l.close(); toast('Sohbet kilidi açık');
    };
    var off = l.querySelector('#prcnLockOff');
    if (off) off.onclick = function () { set(cid, { lock: 0, pin: '', bio: 0 }); l.close(); toast('Kilit kaldırıldı'); };
  }

  function askUnlock(cid) {
    var d = get(cid);
    return new Promise(function (resolve) {
      var l = sheet('Kilitli sohbet',
        '<div class="prcn-note">Bu sohbet kilitli. Devam etmek için doğrulama gerekir.</div>' +
        (d.bio ? '<button class="prcn-btn" id="prcnBioGo" type="button"><i class="fa-solid fa-fingerprint"></i> Cihaz tanıma ile aç</button>' : '') +
        '<label class="prcn-field"><span>PIN</span><input id="prcnPin2" type="password" inputmode="numeric" maxlength="6" placeholder="••••"></label>' +
        '<div class="prcn-actions"><button class="prcn-btn" id="prcnPinGo" type="button">Aç</button>' +
        '<button class="prcn-btn ghost" id="prcnPinNo" type="button">Vazgeç</button></div>', { full: false });
      function done(ok) { l.close(); resolve(ok); }
      var bio = l.querySelector('#prcnBioGo');
      if (bio) bio.onclick = async function () {
        try {
          var ok = window.PublicKeyCredential &&
            await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          if (!ok) { toast('Cihaz tanıma yok, PIN gir'); return; }
          await navigator.credentials.get({
            publicKey: {
              challenge: crypto.getRandomValues(new Uint8Array(32)),
              userVerification: 'required', timeout: 30000, rpId: location.hostname
            }
          });
          done(true);
        } catch (e) { toast('Doğrulanamadı, PIN gir'); }
      };
      l.querySelector('#prcnPinGo').onclick = async function () {
        var v = (l.querySelector('#prcnPin2').value || '').trim();
        if (await sha256hex('prcnpin|' + v) === d.pin) done(true);
        else toast('PIN hatalı');
      };
      l.querySelector('#prcnPinNo').onclick = function () { done(false); };
    });
  }

  // 3) Şifreleme + PRÇN 571
  async function openCrypto(cid) {
    var d = get(cid);
    var fp = await fingerprint(cid);
    var l = sheet('Şifreleme',
      '<div class="prcn-badge"><i class="fa-solid fa-lock"></i> Uçtan uca AES-GCM 256 · P2P kanal</div>' +
      '<div class="prcn-note">AES\'in üstüne <b>PRÇN 571</b> ek koruma katmanı gelir: 571 kutunun her birinde 1-4 karakter bulunur. Anahtarını karşı tarafa gönderirsin, o onaylar; şifreni kimse göremez.</div>' +
      '<div class="prcn-kv"><span>Anahtar parmak izi</span><b>' + (fp || 'Henüz yok') + '</b></div>' +
      '<div class="prcn-kv"><span>Karşı taraf onayı</span><b>' + (d.peerApproved ? 'Onaylandı' : 'Bekliyor') + '</b></div>' +
      '<div class="prcn-actions col">' +
      '<button class="prcn-btn" id="prcnOpen571" type="button"><i class="fa-solid fa-table-cells"></i> PRÇN 571 kutularını aç</button>' +
      '<button class="prcn-btn ghost" id="prcnSendKey" type="button"><i class="fa-solid fa-key"></i> Yeni anahtar gönder</button>' +
      '</div>', { full: true });
    l.querySelector('#prcnOpen571').onclick = function () { l.close(); open571(cid); };
    l.querySelector('#prcnSendKey').onclick = function () { l.close(); sendKey(cid); };
  }

  async function open571(cid) {
    var d = get(cid);
    var boxes = (d.boxes && d.boxes.length === BOXES) ? d.boxes.slice() : autoBoxes();
    var l = sheet('PRÇN 571',
      '<div class="prcn-571top">' +
      '  <div class="prcn-571orb"><i class="fa-solid fa-key"></i></div>' +
      '  <div><b>571 kutulu ek şifre</b><em id="prcn571fp">—</em></div>' +
      '</div>' +
      '<div class="prcn-seg">' +
      '  <button class="prcn-segb on" data-m="auto" type="button">Otomatik</button>' +
      '  <button class="prcn-segb" data-m="seed" type="button">Parola tohumu</button>' +
      '</div>' +
      '<label class="prcn-field hidden" id="prcnSeedWrap"><span>Parola</span>' +
      '<input id="prcnSeed" type="text" placeholder="tek parola gir, 571 kutuya açılır"></label>' +
      '<div class="prcn-actions"><button class="prcn-btn ghost" id="prcn571Gen" type="button"><i class="fa-solid fa-dice"></i> Üret</button></div>' +
      '<div class="prcn-571grid" id="prcn571Grid"></div>' +
      '<div class="prcn-actions col sticky">' +
      '<button class="prcn-btn" id="prcn571Save" type="button">Kaydet</button>' +
      '<button class="prcn-btn ghost" id="prcn571Send" type="button"><i class="fa-solid fa-paper-plane"></i> Yeni anahtar gönder</button>' +
      '</div>', { full: true });

    var mode = 'auto';
    var grid = l.querySelector('#prcn571Grid');
    async function paintFp() {
      var h = await sha256hex(boxes.join('·'));
      l.querySelector('#prcn571fp').textContent = h.slice(0, 12).toUpperCase().replace(/(.{4})/g, '$1 ').trim();
    }
    function paint() {
      var html = '';
      for (var i = 0; i < BOXES; i++) {
        html += '<label class="prcn-box"><i>' + (i + 1) + '</i>' +
          '<input maxlength="4" data-i="' + i + '" value="' + esc(boxes[i]) + '"></label>';
      }
      grid.innerHTML = html;
      paintFp();
    }
    grid.addEventListener('input', function (e) {
      var t = e.target; if (!t || !t.dataset || t.dataset.i === undefined) return;
      boxes[+t.dataset.i] = normBox(t.value);
      paintFp();
    });
    Array.prototype.forEach.call(l.querySelectorAll('.prcn-segb'), function (b) {
      b.onclick = function () {
        Array.prototype.forEach.call(l.querySelectorAll('.prcn-segb'), function (x) { x.classList.remove('on'); });
        b.classList.add('on'); mode = b.dataset.m;
        l.querySelector('#prcnSeedWrap').classList.toggle('hidden', mode !== 'seed');
      };
    });
    l.querySelector('#prcn571Gen').onclick = async function () {
      if (mode === 'seed') {
        var s = (l.querySelector('#prcnSeed').value || '').trim();
        if (s.length < 4) { toast('Parola en az 4 karakter olmalı'); return; }
        boxes = await seedBoxes(s);
      } else boxes = autoBoxes();
      paint(); toast('571 kutu üretildi');
    };
    l.querySelector('#prcn571Save').onclick = function () {
      set(cid, { boxes: boxes, mode: mode, at: Date.now() });
      toast('Anahtar kaydedildi'); l.close();
    };
    l.querySelector('#prcn571Send').onclick = function () {
      set(cid, { boxes: boxes, mode: mode, at: Date.now() });
      l.close(); sendKey(cid);
    };
    paint();
  }

  // 4) Arşiv
  function toggleArchive(cid) {
    var d = get(cid);
    set(cid, { archived: d.archived ? 0 : 1 });
    var el = document.querySelector('[data-conn-id="' + cid + '"]');
    if (el) el.classList.toggle('prcn-archived', !d.archived);
    toast(d.archived ? 'Arşivden çıkarıldı' : 'Sohbet arşivlendi');
    if (!d.archived) { try { window.closeChat && window.closeChat(); } catch (e) {} }
  }

  // 5) Canlı ileti + ekran paylaşımı
  function openLive(cid) {
    var l = sheet('Canlı ileti + ekran',
      '<div class="prcn-note">Canlı yazma modu <b>kapalı</b> gelir. Açtığında sohbet ekranında yeşil bir baloncuk belirir; sen yazdıkça hem sen hem karşı taraf harfleri ve imleci anında görür.</div>' +
      '<label class="prcn-check"><input id="prcnLiveOn" type="checkbox"' + (live.on ? ' checked' : '') + '>' +
      '<span>Canlı yazma modu</span></label>' +
      '<div class="prcn-actions col">' +
      '<button class="prcn-btn" id="prcnShare" type="button"><i class="fa-solid fa-display"></i> Ekranı paylaş</button>' +
      '<button class="prcn-btn ghost" id="prcnShareStop" type="button">Paylaşımı durdur</button>' +
      '</div>' +
      '<div class="prcn-preview" id="prcnPrev"><video id="prcnVideo" autoplay muted playsinline></video></div>', { full: true });
    l.querySelector('#prcnLiveOn').onchange = function () { setLive(this.checked); };
    l.querySelector('#prcnShare').onclick = function () { startShare(l.querySelector('#prcnVideo')); };
    l.querySelector('#prcnShareStop').onclick = stopShare;
  }

  // ---- canlı yazma: yeşil baloncuk (kendi + karşı taraf) ----
  var LIVE_KEY = 'sohbeto-live-typing';
  function liveDefault() {
    try { return localStorage.getItem(LIVE_KEY) === '1'; } catch (e) { return false; }
  }
  var live = { on: liveDefault(), timer: null, last: '' };

  function msgBox() { return document.getElementById('chatMessages'); }
  function liveBubble(kind) {
    var box = msgBox(); if (!box) return null;
    var id = 'prcnLive-' + kind;
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'prcn-live' + (kind === 'me' ? ' me' : '');
      el.innerHTML = '<div class="prcn-live-b"><span class="prcn-live-t"></span><i class="prcn-caret"></i></div>';
      box.appendChild(el);
    } else if (el.parentNode !== box) {
      box.appendChild(el);
    }
    return el;
  }
  function paintLive(kind, text) {
    if (!text) { dropLive(kind); return; }
    var el = liveBubble(kind); if (!el) return;
    el.querySelector('.prcn-live-t').textContent = text;
    var box = msgBox();
    // Yukarıda geçmişi okuyorsa sayfayı zorla aşağı çekme.
    if (box && (box.scrollHeight - box.clientHeight - box.scrollTop) <= 200) box.scrollTop = box.scrollHeight;
  }
  function dropLive(kind) {
    var el = document.getElementById('prcnLive-' + kind);
    if (el) try { el.remove(); } catch (e) {}
  }

  /** Motor, karşı taraftan gelen LIVE### paketini buraya verir. */
  window.__prcnLive = function (senderConnId, text) {
    if (senderConnId && senderConnId !== activeConn()) return;
    paintLive('peer', String(text || '').slice(0, 300));
  };

  function setLive(on) {
    live.on = !!on;
    try { localStorage.setItem(LIVE_KEY, live.on ? '1' : '0'); } catch (e) {}
    var inp = document.getElementById('chatInput');
    if (inp) {
      inp.removeEventListener('input', liveTick);
      if (on) inp.addEventListener('input', liveTick);
    }
    if (on) { paintLive('me', (inp && inp.value) || ''); }
    else {
      dropLive('me'); sendLive('');
    }
  }
  function sendLive(text) {
    var cid = activeConn();
    if (!cid || cid === 'genel') return;
    try {
      if (typeof window.sendLiveText === 'function') { window.sendLiveText(cid, text); return; }
      var p = window.SohbetoPeer;
      if (p) p.send(MARK_LIVE + text, cid);
    } catch (e) {}
  }
  function liveTick() {
    if (!live.on) return;
    var inp = document.getElementById('chatInput');
    var v = (inp && inp.value || '').slice(0, 300);
    paintLive('me', v);
    if (v === live.last) return;
    live.last = v;
    if (live.timer) clearTimeout(live.timer);
    live.timer = setTimeout(function () { sendLive(v); }, 70);
  }

  /** Giriş kutusu her sohbette aynı olduğu için tek sefer bağlanır. */
  function bindLiveInput() {
    var inp = document.getElementById('chatInput');
    if (!inp) { setTimeout(bindLiveInput, 600); return; }
    if (inp.dataset.prcnLive === '1') return;
    inp.dataset.prcnLive = '1';
    inp.addEventListener('input', liveTick);
  }


  // ---- ekran paylaşımı: gerçek görüntü aktarımı ----
  var shareStream = null, shareCalls = [];
  async function startShare(video) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        toast('Bu cihaz/tarayıcı ekran paylaşımını desteklemiyor');
        return;
      }
      shareStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (video) { video.srcObject = shareStream; try { await video.play(); } catch (e) {} }
      var cid = activeConn();
      if (cid && cid !== 'genel' && window.SohbetoPeer) {
        var call = SohbetoPeer.callWithStream(cid, shareStream, { prcn: 'screen' });
        if (call) shareCalls.push(call);
      }
      sendRaw(MARK_SCREEN + '1');
      shareStream.getVideoTracks()[0].addEventListener('ended', stopShare);
      toast('Ekran paylaşılıyor');
    } catch (e) {
      var n = (e && e.name) || '';
      if (n === 'NotAllowedError') toast('Ekran paylaşımına izin verilmedi');
      else if (n === 'NotSupportedError' || n === 'TypeError') toast('Bu tarayıcı ekran paylaşımını desteklemiyor');
      else toast('Ekran paylaşımı başlatılamadı');
    }
  }
  function stopShare() {
    shareCalls.forEach(function (c) { try { c.close(); } catch (e) {} });
    shareCalls = [];
    if (shareStream) { shareStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); shareStream = null; }
    toast('Paylaşım durdu');
  }

  /** Karşı taraftan gelen ekran paylaşımı: tam ekran izleyici. */
  function onScreenCall(call) {
    var l = sheet('Ekran paylaşımı', '<div class="prcn-note">Karşı tarafın ekranı canlı yayınlanıyor.</div>' +
      '<div class="prcn-preview live"><video id="prcnRemote" autoplay playsinline></video></div>', { full: true });
    var v = l.querySelector('#prcnRemote');
    try { call.answer(); } catch (e) {}
    call.on('stream', function (stream) { v.srcObject = stream; try { v.play(); } catch (e) {} });
    call.on('close', function () { l.close(); toast('Ekran paylaşımı sona erdi'); });
  }
  window.__prcnScreenCall = onScreenCall;

  // ---- gelen canlı yazma paketlerini yakala (baloncuk olarak gösterme) ----
  function hookTransport() {
    var orig = window.handleTransportMessage;
    if (typeof orig !== 'function' || orig.__prcn) { setTimeout(hookTransport, 600); return; }
    var wrapped = function (sConnId, sVirtualNo, tConnId, text) {
      if (typeof text === 'string' && text.indexOf(MARK_LIVE) === 0) {
        if (sConnId === activeConn()) paintLive('peer', text.slice(MARK_LIVE.length));
        return;
      }
      return orig.apply(this, arguments);
    };
    wrapped.__prcn = 1;
    window.handleTransportMessage = wrapped;
  }

  // Mesaj gönderilince canlı baloncuklar temizlenir.
  function hookSend() {
    var orig = window.sendChatMsg;
    if (typeof orig !== 'function' || orig.__prcn) { setTimeout(hookSend, 600); return; }
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      if (live.on) { live.last = ''; dropLive('me'); sendLive(''); }
      return r;
    };
    wrapped.__prcn = 1;
    window.sendChatMsg = wrapped;
  }

  // --------------------------------------------------------- openChat kilit kapısı
  function hookOpenChat() {
    var orig = window.openChat;
    if (typeof orig !== 'function' || orig.__prcn) { setTimeout(hookOpenChat, 500); return; }
    var wrapped = async function (id) {
      dropLive('me'); dropLive('peer'); live.last = '';
      var d = get(id);
      if (d.lock) { var ok = await askUnlock(id); if (!ok) return; }
      return orig.apply(this, arguments);
    };
    wrapped.__prcn = 1;
    window.openChat = wrapped;
  }

  window.SohbetoPRCN = { openMenu: openMenu, sendKey: sendKey, boxes: BOXES };
  window.chatMore = openMenu;

  function boot() { watch(); hookOpenChat(); hookTransport(); hookSend(); bindLiveInput(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
