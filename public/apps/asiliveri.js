/* =====================================================================
   ASILI VERİ  v1  — çevrimdışı mesaj kuyruğu (Supabase)

   SENARYO
     X, Y'ye "merhaba" yazar. Y kapalıdır → P2P kanalı yok.
     Mesaj VERİMETRİ ile şifrelenip benzersiz bir kod (örn. 456654aahh)
     ile Supabase'e ASILI kalır. Y sonradan uygulamayı açar; kuyruğunu
     çeker, çözer, sohbete düşer — X o esnada kapalı olsa bile.

   • Motor dosyalarına DOKUNULMAZ. sendSecureP2PWhenReady sarmalanır.
   • Supabase erişimi ana pencerede (React tarafında) yapılır; buradan
     postMessage köprüsü kullanılır.
   • Aynı mesaj hem P2P hem kuyruktan gelirse msgId ile tekilleştirilir.
   ===================================================================== */
(function () {
  'use strict';

  var POLL_MS = 20000;
  var SEEN_KEY = 'sohbeto.asili.seen.v1';
  var MAX_SEEN = 800;

  var pendingKeyReq = new Map();   // phone -> [resolve]
  var pubkeyCache = new Map();     // phone -> pubkey | null
  var seen = loadSeen();
  var polling = false;
  var keyPublished = false;

  /* ------------------------------------------------------------- yardımcılar */
  function parentWin() {
    try { return window.parent && window.parent !== window ? window.parent : null; }
    catch (e) { return null; }
  }
  function send(msg) {
    var p = parentWin();
    if (p) { try { p.postMessage(msg, '*'); } catch (e) {} }
  }
  function myPhone() {
    try { return (window.CONFIG && window.CONFIG.virtualNo) || ''; } catch (e) { return ''; }
  }
  function norm(n) {
    return (window.Verimetri ? window.Verimetri.normPhone(n) : String(n || ''));
  }
  function numberOf(connId) {
    try { if (window.SohbetoPeer) return window.SohbetoPeer.numberFromId(connId) || ''; } catch (e) {}
    return '';
  }
  function connIdOf(phone) {
    try { if (window.SohbetoPeer) return window.SohbetoPeer.idForNumber(phone) || ''; } catch (e) {}
    return '';
  }
  function reachable(connId) {
    try { if (typeof window.isPeerReachable === 'function') return !!window.isPeerReachable(connId); } catch (e) {}
    return false;
  }
  function loadSeen() {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
    catch (e) { return new Set(); }
  }
  function markSeen(id) {
    if (!id) return;
    seen.add(id);
    try {
      var arr = Array.from(seen);
      if (arr.length > MAX_SEEN) { arr = arr.slice(-MAX_SEEN); seen = new Set(arr); }
      localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
    } catch (e) {}
  }
  function log(text, color) {
    try { if (typeof window.log === 'function') window.log(text, color || '#38bdf8'); } catch (e) {}
  }

  /* -------------------------------------------------- karşı tarafın anahtarı */
  function peerPubkey(phone) {
    var p = norm(phone);
    if (!p) return Promise.resolve(null);
    if (pubkeyCache.has(p)) return Promise.resolve(pubkeyCache.get(p));
    return new Promise(function (resolve) {
      var list = pendingKeyReq.get(p) || [];
      list.push(resolve);
      pendingKeyReq.set(p, list);
      send({ type: 'sohbeto:asili-anahtar-al', phone: p });
      setTimeout(function () {
        if (!pubkeyCache.has(p)) { pubkeyCache.set(p, null); resolveKey(p, null); }
      }, 6000);
    });
  }
  function resolveKey(phone, pubkey) {
    var list = pendingKeyReq.get(phone) || [];
    pendingKeyReq.delete(phone);
    list.forEach(function (fn) { try { fn(pubkey); } catch (e) {} });
  }

  /* ------------------------------------------------- kendi anahtarımı yayınla */
  async function publishKey() {
    if (keyPublished || !window.Verimetri || !window.Verimetri.destekli()) return;
    if (!myPhone()) return;
    try {
      var pk = await window.Verimetri.publicKey();
      if (!pk) return;
      keyPublished = true;
      send({ type: 'sohbeto:asili-anahtar-yaz', pubkey: pk });
    } catch (e) {}
  }

  /* ------------------------------------------------------------ kuyruğa asma */
  /**
   * @param {string} connId hedef
   * @param {string} text   düz mesaj metni
   * @param {string} msgId  motorun mesaj kimliği
   * @param {string} kind   text | image | audio | ...
   */
  async function asilaKoy(connId, text, msgId, kind) {
    if (!window.Verimetri || !window.Verimetri.destekli()) return;
    var from = myPhone();
    var to = numberOf(connId);
    if (!from || !to) return;
    try {
      var pk = await peerPubkey(to);
      var paket = await window.Verimetri.paketle({
        text: text, fromPhone: from, toPhone: to, toPubkey: pk,
        msgId: msgId || null, kind: kind || 'text', ts: Date.now()
      });
      send({
        type: 'sohbeto:asili-gonder',
        code: paket.code, toPhone: to, payload: paket.payload,
        iv: paket.iv, alg: paket.alg, kind: kind || 'text', msgId: msgId || null
      });
      log('[ASILI] Kuyruğa asıldı → ' + to + ' (' + paket.code + ')', '#fbbf24');
    } catch (e) {}
  }

  /* --------------------------------------------------------- kuyruğu boşaltma */
  async function alreadyStored(chatId, msgId) {
    if (!msgId) return false;
    if (seen.has(msgId)) return true;
    try {
      if (typeof window.dbLoadMessages === 'function') {
        var rows = await window.dbLoadMessages(chatId, 200);
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].msgId && rows[i].msgId === msgId) return true;
        }
      }
    } catch (e) {}
    return false;
  }

  async function teslimAl(list) {
    if (!Array.isArray(list) || !list.length) return;
    var me = myPhone();
    var done = [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row || !row.code) continue;
      done.push(row.code);
      if (seen.has(row.code)) continue;
      markSeen(row.code);
      try {
        var pk = await peerPubkey(row.from_phone);
        var msg = await window.Verimetri.coz(row, me, pk);
        if (!msg || !msg.text) continue;
        var connId = connIdOf(row.from_phone);
        if (!connId) continue;
        var mid = msg.msgId || ('asili-' + row.code);
        if (await alreadyStored(connId, mid)) continue;
        markSeen(mid);
        // Motorun kendi akışına düz metin olarak enjekte ediyoruz:
        // balon, saat, gönderen adı, okundu bilgisi mevcut kodla çizilir.
        var packet = 'MSG###' + mid + '###' + msg.text;
        var handler = (typeof window.handleTransportMessage === 'function')
          ? window.handleTransportMessage : null;
        if (!handler) continue;
        await handler(connId, norm(row.from_phone), (window.CONFIG && window.CONFIG.connectionId) || '', packet);
        log('[ASILI] Kuyruktan teslim ← ' + row.from_phone + ' (' + row.code + ')', '#22c55e');
      } catch (e) {}
    }
    if (done.length) send({ type: 'sohbeto:asili-teslim', codes: done });
  }

  /* ------------------------------------------------------------- motor kancası */
  function hookEngine() {
    if (typeof window.sendSecureP2PWhenReady !== 'function' || window.sendSecureP2PWhenReady.__asili) return false;
    var orig = window.sendSecureP2PWhenReady;
    var wrapped = function (targetConnId, payload, label, onSent, attempts, pushKind) {
      try {
        // Yalnızca özel metin mesajları kuyruğa asılır; sinyal paketleri değil.
        if (targetConnId && targetConnId !== 'HERKES' && typeof payload === 'string' &&
            payload.indexOf('MSG###') === 0 && !reachable(targetConnId)) {
          var sep = payload.indexOf('###', 6);
          if (sep > -1) {
            var mid = payload.substring(6, sep);
            var body = payload.substring(sep + 3);
            markSeen(mid);   // geri dönen kopyayı kendimiz göstermeyelim
            asilaKoy(targetConnId, body, mid, pushKind === 'call' ? 'call' : 'text');
          }
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    wrapped.__asili = true;
    window.sendSecureP2PWhenReady = wrapped;
    return true;
  }

  /* ------------------------------------------------------------- ana pencere */
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'sohbeto:asili-anahtar') {
      var p = norm(d.phone);
      pubkeyCache.set(p, d.pubkey || null);
      resolveKey(p, d.pubkey || null);
    } else if (d.type === 'sohbeto:asili-kuyruk') {
      teslimAl(d.list);
    }
  });

  /* ------------------------------------------------------------------ döngü */
  function tick() {
    if (!myPhone()) return;
    hookEngine();
    publishKey();
    if (document.hidden) return;
    send({ type: 'sohbeto:asili-cek' });
  }

  function start() {
    var tries = 0;
    var boot = setInterval(function () {
      tries++;
      if (hookEngine() || tries > 40) clearInterval(boot);
    }, 500);
    setTimeout(tick, 3000);
    setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    if (!polling) { polling = true; }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.AsiliVeri = { cek: tick, asilaKoy: asilaKoy };
})();
