// Capacitor (APK) ve GitHub Pages için statik SPA çıktısı üreten Vite yapılandırması.
// TanStack Start / SSR devre dışıdır; çıktı dist-mobile/index.html olarak yazılır.
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  root: "mobile",
  plugins: [react(), tailwindcss()],
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-mobile", import.meta.url)),
    emptyOutDir: true,
  },
});
