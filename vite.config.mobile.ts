// Capacitor (APK) için statik SPA çıktısı üreten ayrı Vite yapılandırması.
// TanStack Start / SSR devre dışıdır; çıktı dist-mobile/ klasörüne yazılır.
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  publicDir: "public",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist-mobile",
    emptyOutDir: true,
    rollupOptions: {
      input: "mobile/index.html",
    },
  },
});
