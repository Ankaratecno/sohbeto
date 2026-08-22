import React, { useEffect, useRef, useState } from "react";

/**
 * Sohbeto tam ekran kabuğu.
 * BASE_URL, GitHub Pages'te "/sohbeto/", dev'de "/" olur.
 * Motor dosyaları (engine/adapter/extras/fluid-tabs/card-anim/peer) DOKUNULMAZ;
 * tüm arayüz public/apps/sohbetoOO.html içinde yaşar.
 */
type PushClick = { from?: string | undefined; kind?: string | undefined; act?: string | undefined; text?: string | undefined };

const Sohbeto: React.FC = () => {
  const src = `${import.meta.env.BASE_URL}apps/sohbetoOO.html`;
  const [iframeReady, setIframeReady] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const pendingRef = useRef<PushClick | null>(null);
  const iframeReadyRef = useRef(false);
  const handledRef = useRef(false);
  const retryTimersRef = useRef<number[]>([]);

  const clearSwIntent = () => {
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: "SOHBETO_CLEAR_PENDING_INTENT" });
    } catch (e) {
      /* noop */
    }
  };

  // Bildirime tıklanınca hedefi iframe'e ilet. iframe henüz yüklenmediyse beklet
  // (bekleyen niyet kuyruğu) ve yüklenince birkaç kez tekrar dene.
  const deliver = (payload: PushClick) => {
    const win = frameRef.current?.contentWindow;
    if (!win || !iframeReadyRef.current) {
      pendingRef.current = payload;
      return;
    }
    handledRef.current = false;
    retryTimersRef.current.forEach((t) => window.clearTimeout(t));
    retryTimersRef.current = [];
    const send = () => {
      if (handledRef.current) return;
      frameRef.current?.contentWindow?.postMessage({ type: "sohbeto:push-click", ...payload }, "*");
    };
    send();
    [400, 1200, 2500, 5000].forEach((ms) => {
      retryTimersRef.current.push(window.setTimeout(send, ms));
    });
  };

  useEffect(() => {
    // 1) Soğuk açılış: adres satırındaki ?from=&kind=&act= parametreleri.
    const url = new URL(window.location.href);
    const from = url.searchParams.get("from");
    const kind = url.searchParams.get("kind");
    const act = url.searchParams.get("act");
    const txt = url.searchParams.get("txt");
    if (from || kind) {
      pendingRef.current = { from: from || undefined, kind: kind || undefined, act: act || undefined, text: txt || undefined };
      ["from", "kind", "act", "txt"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }

    // 2) Uygulama açıkken: service worker'ın gönderdiği tıklama mesajı.
    const onSwMessage = (ev: MessageEvent) => {
      const d = ev.data as { type?: string; action?: string; data?: Record<string, unknown> } | null;
      if (!d || d.type !== "SOHBETO_PUSH_CLICK") return;
      deliver({
        from: (d.data?.["from"] as string) || undefined,
        kind: (d.data?.["kind"] as string) || undefined,
        act: d.action || "open",
        text: (d.data?.["text"] as string) || undefined,
      });
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    // 3) iframe "niyeti uyguladım" derse tekrarları durdur ve SW kuyruğunu temizle.
    const onFrameMessage = (ev: MessageEvent) => {
      const d = ev.data as { type?: string } | null;
      if (!d || d.type !== "sohbeto:push-click-handled") return;
      handledRef.current = true;
      retryTimersRef.current.forEach((t) => window.clearTimeout(t));
      retryTimersRef.current = [];
      clearSwIntent();
    };
    window.addEventListener("message", onFrameMessage);

    // 4) Soğuk açılışta mesaj kaçmış olabilir: SW'de bekleyen niyeti iste.
    const askPending = () => {
      try {
        navigator.serviceWorker?.controller?.postMessage({ type: "SOHBETO_GET_PENDING_INTENT" });
      } catch (e) {
        /* noop */
      }
    };
    navigator.serviceWorker?.ready.then(askPending).catch(() => undefined);
    const askTimer = window.setTimeout(askPending, 1500);
    const onVisible = () => {
      if (document.visibilityState === "visible") askPending();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      window.removeEventListener("message", onFrameMessage);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(askTimer);
      retryTimersRef.current.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoad = () => {
    setIframeReady(true);
    iframeReadyRef.current = true;
    if (pendingRef.current) {
      const payload = pendingRef.current;
      pendingRef.current = null;
      // iframe içindeki motor hazır olmadan mesaj kaybolmasın: kısa gecikme + tekrarlar.
      window.setTimeout(() => deliver(payload), 250);
    }
  };


  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-[#0e1621]">
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
        allow="camera; microphone; clipboard-write; clipboard-read; autoplay"
      />
    </div>
  );
};

export default Sohbeto;
