import React, { useEffect, useState } from "react";
import { isStandalone } from "./serviceWorkerRegistration";
import { X, Share2, Plus } from "lucide-react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "sohbeto_install_dismissed_at";
const DISMISS_DAYS = 7;
const SHOW_DELAY_MS = 8_000;
const MOBILE_MAX_WIDTH = 1024; // tablet dahil, masaüstü hariç

const isIOS = () =>
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  // @ts-ignore
  !window.MSStream;

const isMobileOrTablet = () =>
  typeof window !== "undefined" && window.innerWidth <= MOBILE_MAX_WIDTH;

export const InstallSheet: React.FC = () => {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [iosMode, setIosMode] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const onResize = () => setMobile(isMobileOrTablet());
    onResize();
    window.addEventListener("resize", onResize);

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const recently = dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86400_000;
    if (recently) {
      window.removeEventListener("resize", onResize);
      return;
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      window.setTimeout(() => {
        if (isMobileOrTablet()) setOpen(true);
      }, SHOW_DELAY_MS);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    let iosTimer: number | undefined;
    if (isIOS()) {
      iosTimer = window.setTimeout(() => {
        if (isMobileOrTablet()) {
          setIosMode(true);
          setOpen(true);
        }
      }, SHOW_DELAY_MS);
    }

    const onInstalled = () => {
      setOpen(false);
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("resize", onResize);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setOpen(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "dismissed") dismiss();
    setDeferred(null);
    setOpen(false);
  };

  if (!open || !mobile) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-[360px] group animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient glow */}
        <div className="absolute -inset-4 bg-amber-500/20 blur-3xl rounded-full opacity-60 transition-opacity duration-500" />

        <div
          className="relative bg-[#0b1d3a] border border-amber-500/30 rounded-[2.5rem] p-8 overflow-hidden shadow-2xl"
          style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
        >
          {/* Mesh gradient overlay */}
          <div
            className="absolute top-0 right-0 w-40 h-40 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at top right, rgba(245,158,11,0.2), transparent 70%)",
            }}
          />

          {/* Close */}
          <button
            onClick={dismiss}
            aria-label="Kapat"
            className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-slate-400 hover:text-white z-10"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col items-center">
            {/* App icon */}
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-amber-400 blur-xl opacity-40 animate-pulse rounded-full" />
              <img
                src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
                alt="Sohbeto"
                className="relative w-24 h-24 rounded-[1.5rem] shadow-lg shadow-amber-500/40"
              />
            </div>

            <h2 className="text-2xl font-extrabold text-white mb-2 tracking-tight text-center">
              Sohbeto'u Yükle
            </h2>
            <p className="text-slate-400 text-sm text-center px-2 mb-8 leading-relaxed">
              {iosMode
                ? "Safari'nin alt çubuğundaki Paylaş butonuna basıp \"Ana Ekrana Ekle\"yi seç."
                : "WebOS deneyimini tam ekran ve ultra hızla cebinde taşı."}
            </p>

            {iosMode ? (
              <div className="w-full space-y-2 text-sm text-amber-50/90">
                <div className="flex items-start gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
                  <Share2 className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
                  <div>
                    1. Safari'de <b>Paylaş</b> butonuna bas
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
                  <Plus className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
                  <div>
                    2. <b>"Ana Ekrana Ekle"</b>yi seç
                  </div>
                </div>
                <button
                  onClick={dismiss}
                  className="mt-2 w-full py-3 text-amber-200 hover:text-white transition-colors text-sm"
                >
                  Anladım
                </button>
              </div>
            ) : (
              <button
                onClick={install}
                className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-[#0b1d3a] font-extrabold rounded-2xl shadow-[0_8px_20px_-4px_rgba(245,158,11,0.5)] active:scale-95 transition-all duration-200 border-t border-white/20 tracking-wide"
              >
                ŞİMDİ YÜKLE
              </button>
            )}
          </div>
        </div>

        {/* Bottom sparkle */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-amber-500/50 blur-lg rounded-full" />
      </div>
    </div>
  );
};
