/* =====================================================================
   SOHBETO REGISTRY BRIDGE (iframe tarafı)
   • Alınan sanal numarayı + kullanıcı adını Supabase kayıt defterine yazar
   • Çevrimiçi durumunu tazeler (heartbeat)
   • Kurucunun "şu tarihte gönder" mesajlarını çeker ve resmî sohbete düşürür
   Motor dosyalarına dokunmaz; tüm Supabase işleri ana pencerede yapılır.
   ===================================================================== */
(function () {
  'use strict';

  var OFFICIAL_CID = 'sohbeto-90606061992'; // peerIdForNumber ile aynı → kurucu P2P hattı
  var K_PROFILE = 'sohbeto.oo.profile';
  var POLL_MS = 60000;

  function parent() {
    try { return window.parent && window.parent !== window ? window.parent : null; }
    catch (e) { return null; }
  }
  function send(msg) {
    var p = parent();
    if (p) { try { p.postMessage(msg, '*'); } catch (e) {} }
  }
  function profile() {
    try { return JSON.parse(localStorage.getItem(K_PROFILE) || '{}'); } catch (e) { return {}; }
  }
  function myNo() {
    try { return (window.CONFIG && window.CONFIG.virtualNo) || ''; } catch (e) { return ''; }
  }

  /* ---------- Numara + kullanıcı adı kaydı ---------- */
  var lastSynced = '';
  function syncNumber() {
    var no = myNo();
    if (!no) return;
    var p = profile();
    var sig = no + '|' + (p.username || '') + '|' + (p.name || '');
    if (sig === lastSynced) return;
    lastSynced = sig;
    send({
      type: 'sohbeto:register-number',
      phone: no,
      username: p.username || null,
      displayName: p.name || null,
    });
  }

  /* ---------- Kurucu mesajlarını sohbete düşür ---------- */
  async function deliver(m) {
    if (!m || !m.id || typeof dbSaveMessage !== 'function') return;
    var ts = new Date(m.send_at || Date.now()).getTime();
    var msgId = 'founder-' + m.id;
    try {
      await dbSaveMessage(OFFICIAL_CID, {
        text: m.body,
        ts: ts,
        sender: 'SOHBETO',
        isOwn: false,
        isP2P: false,
        isPrivate: true,
        msgId: msgId,
        status: 'sent',
      });
      var d = new Date(ts);
      var conv = (window.state && state.conversations && state.conversations.get(OFFICIAL_CID)) || {};
      var next = {
        nick: 'SOHBETO',
        lastMsg: String(m.body || '').split('\n')[0].slice(0, 80),
        time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'),
        unread: (conv.unread || 0) + 1,
        isPrivate: true,
        ts: ts,
      };
      if (window.state && state.conversations) state.conversations.set(OFFICIAL_CID, next);
      if (typeof dbSaveConversation === 'function') await dbSaveConversation(OFFICIAL_CID, next);
      if (typeof renderConvList === 'function') renderConvList();
      if (typeof appendMessageToOpenChat === 'function') {
        try { appendMessageToOpenChat(OFFICIAL_CID, next); } catch (e) {}
      }
      send({ type: 'sohbeto:founder-delivered', id: m.id });
    } catch (e) {}
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'sohbeto:founder-messages' && Array.isArray(d.list)) {
      d.list.forEach(function (m) { deliver(m); });
    }
  });

  function tick() {
    if (!myNo()) return;
    syncNumber();
    send({ type: 'sohbeto:presence', online: !document.hidden });
    if (!document.hidden) send({ type: 'sohbeto:poll-founder' });
  }

  function start() {
    setTimeout(tick, 2500);
    setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) tick();
    });
    window.addEventListener('beforeunload', function () {
      send({ type: 'sohbeto:presence', online: false });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.SohbetoRegistry = { sync: syncNumber, poll: tick };
})();
