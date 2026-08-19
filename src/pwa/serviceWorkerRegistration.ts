/**
 * SW kayıt + güncelleme yönetimi.
 * Lovable preview iframe + preview host + dev modda KAYIT YAPMAZ.
 * Yalnızca production build'inde aktif olur.
 */
import { toast } from "sonner";

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com") ||
    window.location.hostname === "localhost");

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches ||
    new URLSearchParams(window.location.search).get("source") === "pwa" ||
    // @ts-ignore iOS Safari
    window.navigator.standalone === true
  );
}

export async function registerServiceWorker(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // Preview / iframe / dev: temizle ve çık
  if (isPreviewHost || isInIframe || import.meta.env.DEV) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      /* noop */
    }
    return;
  }

  try {
    const base = import.meta.env.BASE_URL || "/";
    const reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });

    // Yeni SW bekliyor
    if (reg.waiting) promptUpdate(reg);

    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          promptUpdate(reg);
        }
      });
    });

    // Yalnızca GERÇEKTEN yeni bir SW devraldıysa reload et.
    // Site verileri silindiğinde controller null'dan bir SW'e geçer; bunu reload sebebi sayma.
    const initialController = navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      const newController = navigator.serviceWorker.controller;
      // İlk kontrol yoktu (ilk kayıt veya veriler yeni silindi) → reload etme
      if (!initialController) return;
      // Aynı SW ise reload etme
      if (newController === initialController) return;
      refreshing = true;
      window.location.reload();
    });
  } catch (err) {
    console.warn("[Sohbeto] SW kayıt başarısız:", err);
  }
}

function promptUpdate(reg: ServiceWorkerRegistration) {
  toast("Yeni sürüm hazır", {
    description: "Sohbeto güncellendi. Yenile butonuna basıp en son sürüme geç.",
    duration: Infinity,
    action: {
      label: "Yenile",
      onClick: () => reg.waiting?.postMessage("SKIP_WAITING"),
    },
  });
}
