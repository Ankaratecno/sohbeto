import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import Sohbeto from "@/components/Sohbeto";
import { InstallSheet } from "@/pwa/InstallSheet";
import { registerServiceWorker } from "@/pwa/serviceWorkerRegistration";
import { initPush } from "@/pwa/push";
import "@/styles.css";

// iframe yüklenmeden önce köprü fonksiyonlarını hazırla. Service worker kaydı
// daha uzun sürerse sanal numaranın push aboneliğine yazılması kaçmasın.
initPush();
void registerServiceWorker();

// "Uygulama açık" kalp atışı: SW, push geldiğinde bu bilgiye bakıp uygulama
// ön plandayken sistem bildirimi göstermez.
const pingSw = () => {
  const visible = document.visibilityState === "visible";
  navigator.serviceWorker?.controller?.postMessage(visible ? "SOHBETO_ALIVE" : "SOHBETO_HIDDEN");
};
pingSw();
setInterval(pingSw, 5000);
document.addEventListener("visibilitychange", pingSw);
window.addEventListener("focus", pingSw);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Toaster position="top-center" />
    <Sohbeto />
    <InstallSheet />
  </React.StrictMode>,
);
