import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        injectRegister: false,
        registerType: "prompt",
        devOptions: { enabled: false },
        injectManifest: {
          globPatterns: [
            "index.html",
            "assets/**/*.{js,css}",
            "icons/*.png",
            "icon.svg",
            "image-placeholder.svg",
          ],
        },
        manifest: {
          id: "/",
          name: "Les Report - Manajemen Les Privat",
          short_name: "Les Report",
          description: "Jadwal, absensi dan laporan belajar les privat.",
          lang: "id",
          start_url: "/",
          scope: "/",
          display: "standalone",
          theme_color: "#4f46e5",
          background_color: "#f8fafc",
          icons: [
            {
              src: "/icons/pwa-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icons/pwa-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icons/pwa-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "."),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true",
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === "true" ? null : {},
    },
  };
});
