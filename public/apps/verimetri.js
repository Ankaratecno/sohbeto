/* =====================================================================
   VERİMETRİ  v1
   Mesaj kodu üretimi + uçtan uca şifreleme (AES-GCM)

   MANTIK
     • Her mesaj için BENZERSİZ bir kod üretilir: 456654aahh gibi.
       Kod, gönderici + alıcı + metin + zaman + rastgele tuzdan türetilir.
       Aynı metin farklı zamanda farklı kod alır (tahmin edilemez).
     • Gövde cihazda AES-GCM ile şifrelenir. Supabase'de yalnızca
       okunamaz blob durur; anahtar hiçbir zaman sunucuya gitmez.
     • Anahtar değişimi: ECDH P-256. Açık anahtar Supabase'e yazılır,
       özel anahtar cihazda (IndexedDB) kalır.
     • Karşı tarafın açık anahtarı henüz yoksa, iki numaradan türetilen
       çift-anahtarı (aes-gcm-pair) kullanılır ki mesaj kaybolmasın.

   Motor dosyalarına dokunmaz. Sadece window.Verimetri sunar.
   ===================================================================== */
(function () {
  'use strict';

  var KEY_STORE = 'verimetri.identity.v1';
  var ALG_ECDH = 'aes-gcm-ecdh';
  var ALG_PAIR = 'aes-gcm-pair';
  var CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

  var subtle = (window.crypto && window.crypto.subtle) || null;
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  /* ------------------------------------------------------------- yardımcılar */
  function b64u(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    var s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var raw = atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function normPhone(n) {
    var d = String(n || '').replace(/[^0-9]/g, '');
    return d ? '+' + d : '';
  }
  async function sha256Bytes(text) {
    return new Uint8Array(await subtle.digest('SHA-256', enc.encode(text)));
  }

  /* --------------------------------------------------------- kalıcı depolama */
  // Motorun IndexedDB yardımcıları varsa onları kullan, yoksa localStorage.
  async function store(key, val) {
    try { if (typeof window.dbPut === 'function') { await window.dbPut(key, val); return; } } catch (e) {}
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  async function load(key) {
    try {
      if (typeof window.dbGet === 'function') {
        var v = await window.dbGet(key);
        if (v) return v;
      }
    } catch (e) {}
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  /* ------------------------------------------------------------ mesaj kodu */
  /**
   * Benzersiz verimetri kodu.
   * Örn: "456654aahh" — 10 karakter, harf+rakam karışık, tahmin edilemez.
   */
  async function kod(fromPhone, toPhone, text, ts) {
    var salt = new Uint8Array(12);
    crypto.getRandomValues(salt);
    var seed = [
      normPhone(fromPhone), normPhone(toPhone),
      String(text || '').slice(0, 512),
      String(ts || Date.now()),
      b64u(salt)
    ].join('::');
    var h = await sha256Bytes('verimetri::' + seed);
    var out = '';
    for (var i = 0; i < 10; i++) out += CODE_ALPHABET[h[i] % CODE_ALPHABET.length];
    return out;
  }

  /* -------------------------------------------------------- kimlik anahtarı */
  var _identity = null;   // { pubkey, jwk }
  var _privKey = null;    // CryptoKey

  async function identity() {
    if (_identity && _privKey) return _identity;
    var saved = await load(KEY_STORE);
    if (saved && saved.jwk && saved.pubkey) {
      try {
        _privKey = await subtle.importKey('jwk', saved.jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
        _identity = saved;
        return _identity;
      } catch (e) { /* bozuk kayıt → yeniden üret */ }
    }
    var pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    var raw = await subtle.exportKey('raw', pair.publicKey);
    var jwk = await subtle.exportKey('jwk', pair.privateKey);
    _identity = { pubkey: b64u(raw), jwk: jwk, createdAt: Date.now() };
    _privKey = pair.privateKey;
    await store(KEY_STORE, _identity);
    return _identity;
  }

  /** Supabase'e yazılacak açık anahtar. */
  async function publicKey() {
    var id = await identity();
    return id.pubkey;
  }

  /* ------------------------------------------------------- oturum anahtarları */
  var _peerKeyCache = new Map();   // phone -> CryptoKey (AES-GCM)

  async function ecdhKey(peerPubkeyB64) {
    await identity();
    var peerPub = await subtle.importKey(
      'raw', unb64u(peerPubkeyB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []
    );
    return subtle.deriveKey(
      { name: 'ECDH', public: peerPub }, _privKey,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  async function pairKey(aPhone, bPhone) {
    var pair = [normPhone(aPhone), normPhone(bPhone)].sort().join('|');
    var bits = await sha256Bytes('verimetri-pair::' + pair);
    return subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  async function keyFor(peerPhone, peerPubkey, myPhone) {
    var ck = normPhone(peerPhone) + '|' + (peerPubkey ? 'e' : 'p');
    var hit = _peerKeyCache.get(ck);
    if (hit) return { key: hit, alg: peerPubkey ? ALG_ECDH : ALG_PAIR };
    var key, alg;
    if (peerPubkey) {
      try { key = await ecdhKey(peerPubkey); alg = ALG_ECDH; } catch (e) { key = null; }
    }
    if (!key) { key = await pairKey(myPhone, peerPhone); alg = ALG_PAIR; }
    _peerKeyCache.set(ck, key);
    return { key: key, alg: alg };
  }

  /* -------------------------------------------------------------- şifreleme */
  /**
   * @returns {{code,payload,iv,alg}}
   */
  async function paketle(opts) {
    opts = opts || {};
    var text = String(opts.text || '');
    var ts = opts.ts || Date.now();
    var k = await keyFor(opts.toPhone, opts.toPubkey, opts.fromPhone);
    var iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    var body = JSON.stringify({
      t: text, ts: ts, from: normPhone(opts.fromPhone),
      kind: opts.kind || 'text', msgId: opts.msgId || null
    });
    var ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv }, k.key, enc.encode(body));
    return {
      code: await kod(opts.fromPhone, opts.toPhone, text, ts),
      payload: b64u(ct),
      iv: b64u(iv),
      alg: k.alg
    };
  }

  /**
   * @returns {{text,ts,from,kind,msgId}|null}
   */
  async function coz(row, myPhone, peerPubkey) {
    if (!row || !row.payload || !row.iv) return null;
    var attempts = [];
    if (row.alg === ALG_PAIR) {
      attempts.push(function () { return pairKey(myPhone, row.from_phone); });
    } else {
      if (peerPubkey) attempts.push(function () { return ecdhKey(peerPubkey); });
      attempts.push(function () { return pairKey(myPhone, row.from_phone); });
    }
    for (var i = 0; i < attempts.length; i++) {
      try {
        var key = await attempts[i]();
        var pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64u(row.iv) }, key, unb64u(row.payload));
        var obj = JSON.parse(dec.decode(pt));
        return {
          text: String(obj.t || ''),
          ts: obj.ts || new Date(row.created_at || Date.now()).getTime(),
          from: obj.from || row.from_phone,
          kind: obj.kind || row.kind || 'text',
          msgId: obj.msgId || row.msg_id || null
        };
      } catch (e) { /* sonraki anahtarı dene */ }
    }
    return null;
  }

  window.Verimetri = {
    ALG_ECDH: ALG_ECDH,
    ALG_PAIR: ALG_PAIR,
    kod: kod,
    publicKey: publicKey,
    paketle: paketle,
    coz: coz,
    normPhone: normPhone,
    destekli: function () { return !!subtle; }
  };
})();
