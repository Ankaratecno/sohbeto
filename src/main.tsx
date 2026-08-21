import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import Sohbeto from "@/components/Sohbeto";
import { InstallSheet } from "@/pwa/InstallSheet";
import { registerServiceWorker } from "@/pwa/serviceWorkerRegistration";
import { initPush } from "@/pwa/push";
import "./styles.css";

// iframe yüklenmeden önce köprü fonksiyonlarını hazırla. Service worker kaydı
// daha uzun sürerse sanal numaranın push aboneliğine yazılması kaçmasın.
initPush();
void registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Toaster position="top-center" />
    <Sohbeto />
    <InstallSheet />
  </React.StrictMode>,
);
