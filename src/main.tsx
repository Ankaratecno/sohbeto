import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import Sohbeto from "@/components/Sohbeto";
import { InstallSheet } from "@/pwa/InstallSheet";
import { registerServiceWorker } from "@/pwa/serviceWorkerRegistration";
import { initPush } from "@/pwa/push";
import "./styles.css";

void registerServiceWorker().then(() => initPush());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Toaster position="top-center" />
    <Sohbeto />
    <InstallSheet />
  </React.StrictMode>,
);
