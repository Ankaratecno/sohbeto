/* ====================================================================
   SOHBETO PEER TRANSPORT (PeerJS)
   --------------------------------------------------------------------
   Eski `wss://...` sinyalleşme/taşıma katmanının yerini alır.
   Motorun protokol metinleri ([P2P_*], MSG###, MSG_ACK###, SEC###,
   PROFILE_UPDATE###, CALL_*, LOOKUP###, LOOKUP_REPLY###) birebir aynı
   kalır; sadece taşıma PeerJS DataConnection üzerinden yapılır.

   Kimlik: peer ID kullanıcının sanal numarasından türetilir
   ("sohbeto-905551234567"). Böylece "kim online" yayınına gerek kalmaz,
   bir kişiye ulaşmak için doğrudan ID'sine bağlanılır.
   ==================================================================== */
(function () {
    'use strict';

    var BROKER = { host: '0.peerjs.com', port: 443, secure: true, path: '/', debug: 0 };
    var ICE = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ];

    var peer = null;
    var myId = null;
    var myNumber = '';
    var ready = false;
    var conns = new Map();      // connId -> DataConnection (open ya da açılıyor)
    var queues = new Map();     // connId -> [{ text, ts }]
    var offline = new Map();    // connId -> son "ulaşılamadı" zamanı
    var handlers = {};
    var reconnectTimer = null;
    var reconnectAttempts = 0;

    function digits(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }
    function idForNumber(number) { var d = digits(number); return d ? 'sohbeto-' + d : ''; }
    function numberFromId(id) {
        var m = /^sohbeto-(\d+)$/.exec(String(id || ''));
        return m ? '+' + m[1] : '';
    }
    function emitLog(msg, color) { try { if (typeof window.log === 'function') window.log(msg, color); } catch (e) {} }

    function setReady(v) {
        if (ready === v) return;
        ready = v;
        try { if (v) { if (handlers.onOpen) handlers.onOpen(); } else if (handlers.onClose) handlers.onClose(); } catch (e) {}
    }

    // ---------- gelen veri ----------
    function handlePayload(conn, raw) {
        var env = null;
        try { env = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) { return; }
        if (!env || typeof env.x !== 'string') return;
        var sConnId = env.s || conn.peer;
        var sVirtualNo = env.v || numberFromId(sConnId);
        var tConnId = env.t || 'HERKES';
        offline.delete(sConnId);
        try { if (handlers.onData) handlers.onData(sConnId, sVirtualNo, tConnId, env.x); } catch (e) {}
    }

    function attach(conn) {
        conns.set(conn.peer, conn);
        conn.on('open', function () {
            offline.delete(conn.peer);
            emitLog('[PEER] Bağlantı açıldı → ' + conn.peer, '#22c55e');
            flush(conn.peer);
            try { if (handlers.onPeerOpen) handlers.onPeerOpen(conn.peer); } catch (e) {}
        });
        conn.on('data', function (raw) { handlePayload(conn, raw); });
        conn.on('close', function () {
            if (conns.get(conn.peer) === conn) conns.delete(conn.peer);
            try { if (handlers.onPeerClose) handlers.onPeerClose(conn.peer); } catch (e) {}
        });
        conn.on('error', function () {
            if (conns.get(conn.peer) === conn) conns.delete(conn.peer);
        });
    }

    function ensure(connId) {
        if (!connId || connId === 'HERKES' || connId === myId) return null;
        var existing = conns.get(connId);
        if (existing) return existing;
        if (!peer || peer.destroyed || peer.disconnected) return null;
        var conn;
        try { conn = peer.connect(connId, { reliable: true, serialization: 'json', metadata: { v: myNumber } }); }
        catch (e) { return null; }
        if (!conn) return null;
        attach(conn);
        return conn;
    }

    function queue(connId, text) {
        var q = queues.get(connId) || [];
        q.push({ text: text, ts: Date.now() });
        while (q.length > 200) q.shift();
        queues.set(connId, q);
    }

    function flush(connId) {
        var q = queues.get(connId);
        if (!q || !q.length) return;
        var conn = conns.get(connId);
        if (!conn || !conn.open) return;
        var now = Date.now();
        queues.set(connId, []);
        q.forEach(function (item) {
            if (now - item.ts > 30000) return;
            try { conn.send(item.text); } catch (e) {}
        });
    }

    function envelope(text, target) {
        return JSON.stringify({ s: myId, v: myNumber, t: target || 'HERKES', x: text });
    }

    function sendTo(connId, text, target) {
        var payload = envelope(text, target || connId);
        var conn = conns.get(connId);
        if (conn && conn.open) {
            try { conn.send(payload); return true; } catch (e) {}
        }
        // Kanal henüz açılmadıysa kuyruğa al ve bağlantıyı başlat; açılınca
        // otomatik gönderilir. Çağıran taraf tekrar denemesin diye true döner.
        queue(connId, payload);
        ensure(connId);
        return true;
    }


    // ---------- public API ----------
    var api = {
        idForNumber: idForNumber,
        numberFromId: numberFromId,

        init: function (opts) {
            opts = opts || {};
            handlers = opts.handlers || {};
            myNumber = opts.number || '';
            myId = opts.connectionId || idForNumber(myNumber);
            if (!myId) { emitLog('[PEER] Sanal numara yok, bağlantı kurulamadı', '#ef4444'); return null; }
            if (peer && !peer.destroyed && peer.id === myId) {
                if (peer.disconnected) { try { peer.reconnect(); } catch (e) {} }
                else if (ready && handlers.onOpen) handlers.onOpen();
                return peer;
            }
            this.destroy();
            if (typeof window.Peer !== 'function') {
                emitLog('[PEER] PeerJS kütüphanesi yüklenemedi', '#ef4444');
                return null;
            }
            var cfg = { host: BROKER.host, port: BROKER.port, secure: BROKER.secure, path: BROKER.path, debug: BROKER.debug, config: { iceServers: ICE } };
            peer = new window.Peer(myId, cfg);

            peer.on('open', function (id) {
                myId = id;
                reconnectAttempts = 0;
                emitLog('Ağ ID: ' + id, '#a855f7');
                emitLog('Sunucuya bağlandı', '#22c55e');
                setReady(true);
                try { if (handlers.onReady) handlers.onReady(id); } catch (e) {}
            });
            peer.on('connection', function (conn) { attach(conn); });
            peer.on('call', function (call) { try { if (handlers.onCall) handlers.onCall(call); } catch (e) {} });
            peer.on('disconnected', function () {
                setReady(false);
                emitLog('Bağlantı kesildi - yeniden bağlanılıyor...', '#ef4444');
                scheduleReconnect();
            });
            peer.on('close', function () { setReady(false); scheduleReconnect(); });
            peer.on('error', function (err) {
                var type = err && err.type;
                if (type === 'peer-unavailable') {
                    var m = /Could not connect to peer (\S+)/.exec(String(err && err.message || ''));
                    var pid = m ? m[1] : null;
                    if (pid) { offline.set(pid, Date.now()); conns.delete(pid); queues.delete(pid); }
                    return;
                }
                if (type === 'unavailable-id') {
                    // Aynı numara başka bir sekmede açık: kısa süre sonra tekrar dene.
                    emitLog('[PEER] Kimlik meşgul, yeniden denenecek', '#fbbf24');
                    scheduleReconnect();
                    return;
                }
                if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
                    setReady(false);
                    scheduleReconnect();
                    return;
                }
                emitLog('[PEER] Hata: ' + type, '#ef4444');
            });
            return peer;
        },

        scheduleReconnect: function () { scheduleReconnect(); },

        isReady: function () { return !!ready; },
        myId: function () { return myId; },
        setNumber: function (n) { myNumber = n || ''; },

        isPeerOnline: function (connId) { var c = conns.get(connId); return !!(c && c.open); },
        openPeers: function () { var out = []; conns.forEach(function (c, id) { if (c.open) out.push(id); }); return out; },

        connectTo: function (connId) { return ensure(connId); },
        connectToNumber: function (number) { return ensure(idForNumber(number)); },

        /** Motorun wsSend() imzasıyla birebir uyumlu gönderim. */
        send: function (text, targetConnId) {
            if (!peer || !myId) return false;
            var target = targetConnId || 'HERKES';
            if (target !== 'HERKES') return sendTo(target, text, target);

            // Yayın: PeerJS'te broadcast yok → açık tüm bağlantılara yaz.
            var delivered = false;
            conns.forEach(function (conn, id) {
                if (!conn.open) return;
                try { conn.send(envelope(text, 'HERKES')); delivered = true; } catch (e) {}
            });
            // LOOKUP yayını: numaradan ID türetilebildiği için doğrudan hedefe bağlan.
            if (text.indexOf('LOOKUP###') === 0) {
                var wanted = idForNumber(text.substring(9));
                if (wanted && wanted !== myId) { sendTo(wanted, text, 'HERKES'); delivered = true; }
            }
            return delivered;
        },

        destroy: function () {
            if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
            conns.forEach(function (c) { try { c.close(); } catch (e) {} });
            conns.clear(); queues.clear(); offline.clear();
            if (peer) { try { peer.destroy(); } catch (e) {} }
            peer = null;
            ready = false;
        }
    };

    function scheduleReconnect() {
        if (reconnectTimer) return;
        reconnectAttempts++;
        var delay = Math.min(30000, 1000 * Math.pow(1.5, Math.min(reconnectAttempts, 8)));
        reconnectTimer = setTimeout(function () {
            reconnectTimer = null;
            if (!peer || peer.destroyed) { api.init({ handlers: handlers, number: myNumber, connectionId: myId }); return; }
            if (peer.disconnected) { try { peer.reconnect(); } catch (e) { api.init({ handlers: handlers, number: myNumber, connectionId: myId }); } }
        }, delay);
    }

    window.SohbetoPeer = api;
})();
