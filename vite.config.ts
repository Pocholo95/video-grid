import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "fs";
import path from "path";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    sourcemap: false,
  },
  optimizeDeps: {
    exclude: ["mediainfo.js", "@ffmpeg/ffmpeg", "@ffmpeg/core"],
  },
});
