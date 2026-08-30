import React, { useEffect, useRef, useState } from "react";
import { enablePush, disablePush } from "@/pwa/push";
import {
  registerNumber,
  isUsernameAvailable,
  touchPresence,
  pendingFounderMessages,
  markFounderMessageDelivered,
  verifyFounderLogin,
} from "@/pwa/registry";
import { setMyKey, getPeerKey, enqueue, fetchQueue, markDelivered } from "@/pwa/asiliveri";
import { initNativeNotifications } from "@/native/nativeNotify";




/**
 * Sohbeto tam ekran kabuğu.
 * BASE_URL, GitHub Pages'te "/sohbeto/", dev'de "/" olur.
 * Motor dosyaları (engine/adapter/extras/fluid-tabs/card-anim/peer) DOKUNULMAZ;
 * tüm arayüz public/apps/sohbetoOO.html içinde yaşar.
 */
type PushClick = { from?: string | undefined; kind?: string | undefined; act?: string | undefined };

const Sohbeto: React.FC = () => {
  const src = `${import.meta.env.BASE_URL}apps/sohbetoOO.html`;
  const [iframeReady, setIframeReady] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const pendingRef = useRef<PushClick | null>(null);

  // Bildirime tıklanınca hedefi iframe'e ilet. iframe henüz yüklenmediyse beklet.
  const deliver = (payload: PushClick) => {
    const win = frameRef.current?.contentWindow;
    if (!win || !iframeReadyRef.current) {
      pendingRef.current = payload;
      return;
    }
    win.postMessage({ type: "sohbeto:push-click", ...payload }, "*");
  };
  const iframeReadyRef = useRef(false);

  const [askPush, setAskPush] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  function getPushStatus() {
    if (typeof window === "undefined") return { unsupported: true, enabled: false, permission: "unsupported" };
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return { unsupported: true, enabled: false, permission: "unsupported" };
    }
    return {
      unsupported: false,
      enabled: Notification.permission === "granted",
      permission: Notification.permission,
    };
  }

  function notifyPushStatus() {
    const win = frameRef.current?.contentWindow;
    if (!win || !iframeReadyRef.current) return;
    win.postMessage({ type: "sohbeto:push-status", ...getPushStatus() }, "*");
  }

  // Tarayıcı izin penceresi yalnızca gerçek bir tıklama (user gesture) ile açılır.
  // iframe'den gelen postMessage bu jesti taşımadığı için burada küçük bir onay
  // katmanı gösterip izni o tıklamayla istiyoruz; izin verilirse abonelik
  // Supabase'e (push_subscriptions) yazılır.
  const askPermissionAndSubscribe = async () => {
    setPushBusy(true);
    try {
      await enablePush();
    } finally {
      setPushBusy(false);
      setAskPush(false);
      notifyPushStatus();
    }
  };

  useEffect(() => {
    // 1) Soğuk açılış: adres satırındaki ?from=&kind=&act= parametreleri.
    const url = new URL(window.location.href);
    const from = url.searchParams.get("from");
    const kind = url.searchParams.get("kind");
    const act = url.searchParams.get("act");
    if (from || kind) {
      pendingRef.current = { from: from || undefined, kind: kind || undefined, act: act || undefined };
      ["from", "kind", "act"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }

    // 2) Uygulama açıkken: service worker'ın gönderdiği mesajlar.
    const onSwMessage = (ev: MessageEvent) => {
      const d = ev.data as
        | { type?: string; action?: string; kind?: string; title?: string; body?: string; data?: Record<string, unknown> }
        | null;
      if (!d) return;
      // Uygulama ön plandayken sistem bildirimi gösterilmez; olay iframe'e iletilir.
      if (d.type === "SOHBETO_PUSH_FOREGROUND") {
        frameRef.current?.contentWindow?.postMessage(
          {
            type: "sohbeto:push-foreground",
            kind: d.kind,
            title: d.title,
            body: d.body,
            from: (d.data?.["from"] as string) || undefined,
          },
          "*",
        );
        return;
      }
      if (d.type !== "SOHBETO_PUSH_CLICK") return;
      deliver({
        from: (d.data?.["from"] as string) || undefined,
        kind: (d.data?.["kind"] as string) || undefined,
        act: d.action || "open",
      });
    };

    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // APK (Capacitor) tarafı: FCM'siz yerel bildirimler. Web/PWA'da devreye girmez.
  useEffect(() => {
    void initNativeNotifications((payload) => deliver(payload));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  const handleLoad = () => {
    setIframeReady(true);
    iframeReadyRef.current = true;
    if (pendingRef.current) {
      const payload = pendingRef.current;
      pendingRef.current = null;
      // iframe içindeki motor hazır olmadan mesaj kaybolmasın: kısa gecikme.
      setTimeout(() => frameRef.current?.contentWindow?.postMessage({ type: "sohbeto:push-click", ...payload }, "*"), 300);
    }
    // Ayarlar ekranındaki push bildirim toggle'ının ilk durumunu gönder.
    notifyPushStatus();
  };

  // Durum çubuğu (saat/pil alanı) rengi — iframe'den gelen tema/duvar kağıdı rengiyle boyanır.
  const [barColor, setBarColor] = useState<string>("#0e1621");
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) meta.setAttribute("content", barColor);
    document.documentElement.style.backgroundColor = barColor;
    document.body.style.backgroundColor = barColor;
  }, [barColor]);

  useEffect(() => {
    const onMessage = async (ev: MessageEvent) => {
      const d = ev.data as
        | {
            type?: string;
            color?: string;
            dark?: boolean;
            phone?: string;
            username?: string | null;
            displayName?: string | null;
            online?: boolean;
            id?: string;
            rid?: string;
            pin?: string;
            // asılı veri köprüsü
            pubkey?: string;
            code?: string;
            toPhone?: string;
            payload?: string;
            iv?: string | null;
            alg?: string;
            kind?: string;
            msgId?: string | null;
            codes?: string[];

          }
        | null;
      if (!d) return;
      const win = frameRef.current?.contentWindow;
      if (d.type === "sohbeto:theme-color") {
        if (typeof d.color === "string" && d.color) setBarColor(d.color);
        return;
      }
      if (d.type === "sohbeto:query-push-status") {
        notifyPushStatus();
      } else if (d.type === "sohbeto:enable-push") {
        const perm = "Notification" in window ? Notification.permission : "denied";
        if (perm === "default") {
          // İzin hiç istenmemiş: gesture gerektiği için onay katmanını göster.
          setAskPush(true);
          return;
        }
        await enablePush();
        notifyPushStatus();
      } else if (d.type === "sohbeto:disable-push") {
        await disablePush();
        notifyPushStatus();
      } else if (d.type === "sohbeto:register-number") {
        // Alınan numara + kullanıcı adı kalıcı kayıt defterine yazılır.
        const res = await registerNumber(String(d.phone || ""), d.username ?? null, d.displayName ?? null);
        win?.postMessage({ type: "sohbeto:register-result", ...res }, "*");
      } else if (d.type === "sohbeto:check-username") {
        const available = await isUsernameAvailable(String(d.username || ""));
        win?.postMessage({ type: "sohbeto:username-result", username: d.username, available }, "*");
      } else if (d.type === "sohbeto:presence") {
        await touchPresence(d.online !== false);
      } else if (d.type === "sohbeto:poll-founder") {
        const list = await pendingFounderMessages();
        win?.postMessage({ type: "sohbeto:founder-messages", list }, "*");
      } else if (d.type === "sohbeto:founder-delivered") {
        if (d.id) await markFounderMessageDelivered(String(d.id));
      } else if (d.type === "sohbeto:verify-founder") {
        const res = await verifyFounderLogin(String(d.phone || ""), String(d.pin || ""));
        win?.postMessage({ type: "sohbeto:founder-verified", rid: d.rid, ...res }, "*");
      } else if (d.type === "sohbeto:asili-anahtar-yaz") {
        // Verimetri açık anahtarı defterine yazılır (özel anahtar cihazda kalır).
        await setMyKey(String(d.pubkey || ""));
      } else if (d.type === "sohbeto:asili-anahtar-al") {
        const pubkey = await getPeerKey(String(d.phone || ""));
        win?.postMessage({ type: "sohbeto:asili-anahtar", phone: d.phone, pubkey }, "*");
      } else if (d.type === "sohbeto:asili-gonder") {
        await enqueue({
          code: String(d.code || ""),
          toPhone: String(d.toPhone || ""),
          payload: String(d.payload || ""),
          iv: d.iv ?? null,
          alg: d.alg ?? null,
          kind: d.kind ?? null,
          msgId: d.msgId ?? null,
        });
      } else if (d.type === "sohbeto:asili-cek") {
        const list = await fetchQueue();
        if (list.length) win?.postMessage({ type: "sohbeto:asili-kuyruk", list }, "*");
      } else if (d.type === "sohbeto:asili-teslim") {
        await markDelivered(d.codes || []);
      }

    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);



  return (
    <div className="fixed inset-0 w-full h-[100dvh]" style={{ backgroundColor: barColor }}>
      {!iframeReady && (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: "radial-gradient(circle at 50% 40%, #1a2638 0%, #0e1621 70%)",
          }}
        />
      )}
      <iframe
        ref={frameRef}
        title="Sohbeto"
        src={src}
        onLoad={handleLoad}
        className="relative w-full h-full border-0 bg-[#0e1621]"
        allow="camera; microphone; display-capture; clipboard-write; clipboard-read; autoplay; fullscreen"
        allowFullScreen
      />
      {askPush && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-[#17212b] p-5 text-[#e7eef6] shadow-2xl">
            <h2 className="text-base font-semibold">Bildirimlere izin ver</h2>
            <p className="mt-2 text-sm text-[#a8b8c8]">
              Yeni mesaj ve aramaları uygulama kapalıyken de alabilmek için tarayıcı bildirim
              iznine ihtiyacımız var. Devam edince tarayıcının izin penceresi açılacak.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-[#2b5278] px-4 py-2.5 text-sm font-medium disabled:opacity-60"
                disabled={pushBusy}
                onClick={askPermissionAndSubscribe}
              >
                {pushBusy ? "Bekleyin…" : "İzin ver"}
              </button>
              <button
                type="button"
                className="rounded-xl bg-white/10 px-4 py-2.5 text-sm"
                disabled={pushBusy}
                onClick={() => {
                  setAskPush(false);
                  notifyPushStatus();
                }}
              >
                Şimdi değil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sohbeto;
