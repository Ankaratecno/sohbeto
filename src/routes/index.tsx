import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import Sohbeto from "@/components/Sohbeto";
import { Toaster } from "@/components/ui/sonner";
import { InstallSheet } from "@/pwa/InstallSheet";
import { initPush } from "@/pwa/push";
import { registerServiceWorker } from "@/pwa/serviceWorkerRegistration";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sohbeto — Hızlı ve Güvenli Sohbet" },
      {
        name: "description",
        content:
          "Sohbeto: hızlı, sade ve güvenli mesajlaşma uygulaması. Telefonuna kur, sohbete hemen başla.",
      },
      { name: "theme-color", content: "#0e1621" },
      { name: "color-scheme", content: "dark" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Sohbeto" },
      { property: "og:title", content: "Sohbeto — Hızlı ve Güvenli Sohbet" },
      {
        property: "og:description",
        content: "Sohbeto: hızlı, sade ve güvenli mesajlaşma uygulaması.",
      },
    ],
    links: [
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      { rel: "apple-touch-icon", sizes: "192x192", href: "/icons/icon-192.png" },
    ],
  }),
  component: Index,
});

function Index() {
  // Eski sürümdeki main.tsx davranışı: push köprüleri + SW kaydı + "uygulama açık" kalp atışı.
  useEffect(() => {
    initPush();
    void registerServiceWorker();

    const pingSw = () => {
      const visible = document.visibilityState === "visible";
      navigator.serviceWorker?.controller?.postMessage(
        visible ? "SOHBETO_ALIVE" : "SOHBETO_HIDDEN",
      );
    };
    pingSw();
    const timer = window.setInterval(pingSw, 5000);
    document.addEventListener("visibilitychange", pingSw);
    window.addEventListener("focus", pingSw);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", pingSw);
      window.removeEventListener("focus", pingSw);
    };
  }, []);

  return (
    <>
      <Toaster position="top-center" />
      <Sohbeto />
      <InstallSheet />
    </>
  );
}
