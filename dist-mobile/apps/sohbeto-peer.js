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
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
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

    // ---- Çevrimiçi/çevrimdışı kararlılığı ----------------------------------
    // watch: durumu izlenen kişiler (rehber). onlineSet: "yeşil" kabul edilenler.
    // graceTimers: kanal koptuğunda hemen gri yapma; kısa süre yeniden bağlanmayı dene.
    var watch = new Set();
    var onlineSet = new Set();
    var graceTimers = new Map();
    var sweepTimer = null;
    var pingTimer = null;
    var GRACE_MS = 6000;
    var SWEEP_MS = 10000;
    var PING_MS = 8000;

    function markOnline(connId) {
        var t = graceTimers.get(connId);
        if (t) { clearTimeout(t); graceTimers.delete(connId); }
        if (onlineSet.has(connId)) return;
        onlineSet.add(connId);
        try { if (handlers.onPeerOpen) handlers.onPeerOpen(connId); } catch (e) {}
    }

    function markOfflineNow(connId) {
        var t = graceTimers.get(connId);
        if (t) { clearTimeout(t); graceTimers.delete(connId); }
        if (!onlineSet.has(connId)) return;
        onlineSet.delete(connId);
        try { if (handlers.onPeerClose) handlers.onPeerClose(connId); } catch (e) {}
    }

    /** Kanal koptu: hemen gri yapma — yeniden bağlanmayı dene, olmazsa çevrimdışı. */
    function markOfflineSoon(connId) {
        if (graceTimers.has(connId)) return;
        try { ensure(connId); } catch (e) {}
        var t = setTimeout(function () {
            graceTimers.delete(connId);
            var c = conns.get(connId);
            if (c && c.open) return;
            markOfflineNow(connId);
        }, GRACE_MS);
        graceTimers.set(connId, t);
    }

    /** Rehberdeki kişiyi izlemeye al: periyodik olarak bağlanmayı dener. */
    function watchPeer(connId) {
        if (!connId || connId === 'HERKES' || connId === myId) return;
        watch.add(connId);
    }

    function startTimers() {
        if (!sweepTimer) {
            sweepTimer = setInterval(function () {
                if (!peer || peer.destroyed || peer.disconnected) return;
                watch.forEach(function (id) {
                    var c = conns.get(id);
                    if (c && c.open) return;
                    // Kapanmış/yarım kalmış bağlantıyı temizleyip tekrar dene:
                    // kişi uygulamayı yeniden açtığında otomatik yeşile döner.
                    if (c && !c.open) { try { c.close(); } catch (e) {} conns.delete(id); }
                    try { ensure(id); } catch (e) {}
                });
            }, SWEEP_MS);
        }
        if (!pingTimer) {
            pingTimer = setInterval(function () {
                conns.forEach(function (c, id) {
                    if (!c.open) return;
                    try { c.send(JSON.stringify({ s: myId, v: myNumber, t: id, c: 'ping' })); } catch (e) { markOfflineSoon(id); }
                });
            }, PING_MS);
        }
    }


    function digits(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }
    function idForNumber(number) { var d = digits(number); return d ? 'sohbeto-' + d : ''; }
    function numberFromId(id) {
        var m = /^sohbeto-(\d+)$/.exec(String(id || ''));
        return m ? '+' + m[1] : '';
    }
    function emitLog(msg, color) { try { if (typeof window.log === 'function') window.log(msg, color); } catch (e) {} }

    /** Push köprüsü: fonksiyonlar üst pencerede (React app) tanımlı; iframe içinden erişim. */
    function pushFn(name) {
        try { if (typeof window[name] === 'function') return window[name]; } catch (e) {}
        try { if (window.parent && typeof window.parent[name] === 'function') return window.parent[name]; } catch (e) {}
        try { if (window.top && typeof window.top[name] === 'function') return window.top[name]; } catch (e) {}
        return null;
    }

    function setReady(v) {
        if (ready === v) return;
        ready = v;
        try { if (v) { if (handlers.onOpen) handlers.onOpen(); } else if (handlers.onClose) handlers.onClose(); } catch (e) {}
    }

    // ---------- gelen veri ----------
    function handlePayload(conn, raw) {
        var env = null;
        try { env = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) { return; }
        if (!env) return;
        var sConnId = env.s || conn.peer;
        offline.delete(sConnId);
        watchPeer(sConnId);
        markOnline(sConnId);
        // Kontrol paketleri (ping/pong) motora iletilmez.
        if (env.c === 'ping') {
            try { conn.send(JSON.stringify({ s: myId, v: myNumber, t: sConnId, c: 'pong' })); } catch (e) {}
            return;
        }
        if (env.c === 'pong') return;
        if (typeof env.x !== 'string') return;
        var sVirtualNo = env.v || numberFromId(sConnId);
        var tConnId = env.t || 'HERKES';
        try { if (handlers.onData) handlers.onData(sConnId, sVirtualNo, tConnId, env.x); } catch (e) {}
    }

    function attach(conn) {
        conns.set(conn.peer, conn);
        conn.on('open', function () {
            offline.delete(conn.peer);
            watchPeer(conn.peer);
            emitLog('[PEER] Bağlantı açıldı → ' + conn.peer, '#22c55e');
            flush(conn.peer);
            markOnline(conn.peer);
        });
        conn.on('data', function (raw) { handlePayload(conn, raw); });
        // Kapanan bağlantı zaten yenisiyle değiştirildiyse "çevrimdışı" deme.
        conn.on('close', function () {
            if (conns.get(conn.peer) !== conn) return;
            conns.delete(conn.peer);
            markOfflineSoon(conn.peer);
        });
        conn.on('error', function () {
            if (conns.get(conn.peer) !== conn) return;
            conns.delete(conn.peer);
            markOfflineSoon(conn.peer);
        });
    }

    function ensure(connId) {
        if (!connId || connId === 'HERKES' || connId === myId) return null;
        var existing = conns.get(connId);
        if (existing) {
            if (existing.open) return existing;
            // Kapanmış/ölü bağlantı nesnesi elde kalırsa yeni bağlantı hiç kurulmuyordu.
            var pcState = existing.peerConnection && existing.peerConnection.connectionState;
            if (pcState === 'failed' || pcState === 'closed' || pcState === 'disconnected') {
                try { existing.close(); } catch (e) {}
                conns.delete(connId);
            } else {
                return existing;
            }
        }

        if (!peer || peer.destroyed || peer.disconnected) return null;
        var conn;
        try { conn = peer.connect(connId, { reliable: true, serialization: 'json', metadata: { v: myNumber } }); }
        catch (e) { return null; }
        if (!conn) return null;
        watchPeer(connId);
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
            if (now - item.ts > 10 * 60 * 1000) return;
            try { conn.send(item.text); } catch (e) {}
        });
    }

    function envelope(text, target) {
        return JSON.stringify({ s: myId, v: myNumber, t: target || 'HERKES', x: text });
    }

    // ---------- push bildirimi (karşı taraf ÇEVRİMDIŞI iken) ----------
    var lastPush = new Map(); // key -> ts (spam engeli)
    /**
     * kind: 'message' | 'call' (motor tarafından açıkça verilir).
     * Şifreli SEC### paketlerinin içeriği burada okunamadığı için tür dışarıdan gelir.
     * Bildirim SADECE hedefe açık bir veri kanalı yokken (yani kişi çevrimdışıyken) gider.
     */
    function pushNotify(connId, text, kind) {
        try {
            var k = kind;
            if (!k) {
                if (text.indexOf('CALL_RING') === 0) k = 'call';
                else if (text.indexOf('MSG###') === 0) k = 'message';
            }
            if (k !== 'call' && k !== 'message') return;

            // Kişi çevrimiçi ve kanal açıksa uygulama içi teslim yeterli.
            var conn = conns.get(connId);
            if (conn && conn.open) return;

            var notify = pushFn('sohbetoNotifyPhone');
            if (!notify) return;
            var toNumber = numberFromId(connId);
            if (!toNumber) return;

            var now = Date.now();
            var isCall = k === 'call';
            var key = connId + ':' + k;
            var gap = isCall ? 10000 : 15000;
            if (now - (lastPush.get(key) || 0) < gap) return;
            lastPush.set(key, now);

            // Kanal henüz AÇILMAMIŞ olabilir (kişi uygulamayı yeni açtı ya da
            // bağlantı el sıkışması sürüyor). Hemen push atmak "uygulama
            // açıkken bildirim geliyor" sorununu doğuruyordu. Önce bağlanmayı
            // deneyip kısa bir süre bekliyoruz; kanal açılırsa push GÖNDERİLMEZ.
            try { ensure(connId); } catch (e) {}
            var waited = 0;
            var graceMs = isCall ? 2500 : 4000;
            var iv = setInterval(function () {
                waited += 250;
                var c = conns.get(connId);
                if (c && c.open) {
                    // Kişi çevrimiçi çıktı → uygulama içi teslim yeterli.
                    clearInterval(iv);
                    lastPush.delete(key);
                    return;
                }
                if (waited < graceMs) return;
                clearInterval(iv);
                var again = conns.get(connId);
                if (again && again.open) { lastPush.delete(key); return; }
                var from = myNumber || 'Sohbeto';
                emitLog('[PUSH] Çevrimdışı kişiye bildirim → ' + toNumber, '#fbbf24');
                notify(
                    toNumber,
                    isCall ? 'Gelen arama' : 'Yeni mesaj',
                    isCall ? from + ' seni arıyor' : from + ' sana mesaj gönderdi',
                    isCall ? 'call' : 'message',
                    undefined,
                    undefined,
                    { from: from }
                );
            }, 250);
        } catch (e) {}
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
            try {
                var setPhone = pushFn('sohbetoSetPushPhone');
                if (myNumber && setPhone) setPhone(myNumber);
            } catch (e) {}
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
                startTimers();
                try { if (handlers.onReady) handlers.onReady(id); } catch (e) {}
            });
            peer.on('connection', function (conn) { attach(conn); });
            peer.on('call', function (call) {
                // Ekran paylaşımı çağrıları PRÇN katmanına gider, sesli/görüntülü arama motora.
                try {
                    var md = call && call.metadata;
                    if (md && md.prcn === 'screen' && typeof window.__prcnScreenCall === 'function') {
                        window.__prcnScreenCall(call);
                        return;
                    }
                } catch (e) {}
                try { if (handlers.onCall) handlers.onCall(call); } catch (e) {}
            });
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
                    if (pid) {
                        offline.set(pid, Date.now());
                        var dead = conns.get(pid);
                        if (dead) { try { dead.close(); } catch (e2) {} }
                        conns.delete(pid);
                        // Kişi gerçekten ulaşılamıyor → durum noktası griye dönsün.
                        markOfflineNow(pid);
                    }
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
        /** Rehberdeki kişiyi izlemeye al (periyodik yeniden bağlanma + presence). */
        watch: function (connId) { watchPeer(connId); if (peer && !peer.destroyed) { try { ensure(connId); } catch (e) {} } },
        watchNumber: function (number) { this.watch(idForNumber(number)); },
        /** Bir kişiyle bağlantıyı hemen tazele (arama öncesi stabilite). */
        refresh: function (connId) {
            if (!connId) return null;
            var c = conns.get(connId);
            if (c && c.open) return c;
            if (c) { conns.delete(connId); try { c.close(); } catch (e) {} }
            return ensure(connId);
        },
        openPeers: function () { var out = []; conns.forEach(function (c, id) { if (c.open) out.push(id); }); return out; },

        connectTo: function (connId) { return ensure(connId); },

        /** Medya çağrısı (ekran paylaşımı vb.) — metadata ile ayırt edilir. */
        callWithStream: function (connId, stream, metadata) {
            if (!peer || peer.destroyed || !connId || !stream) return null;
            try { return peer.call(connId, stream, { metadata: metadata || {} }); } catch (e) { return null; }
        },
        connectToNumber: function (number) { return ensure(idForNumber(number)); },

        /** Motorun wsSend() imzasıyla birebir uyumlu gönderim. */
        send: function (text, targetConnId, pushKind) {
            if (!peer || !myId) return false;
            var target = targetConnId || 'HERKES';
            if (target !== 'HERKES') {
                pushNotify(target, text, pushKind);
                return sendTo(target, text, target);
            }

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
            if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
            if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
            graceTimers.forEach(function (t) { clearTimeout(t); });
            graceTimers.clear(); onlineSet.clear();
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
