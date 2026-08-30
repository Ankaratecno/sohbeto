import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Production build (GitHub Pages) → /sohbeto/
// Dev / preview sandbox → /
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/sohbeto/" : "/",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    outDir: "dist",
  },
}));
