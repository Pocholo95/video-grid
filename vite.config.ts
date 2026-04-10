import { defineConfig } from "vite";

export default defineConfig({
  base: "/VidGrid-HTML/",
  build: {
    sourcemap: false,
  },
  optimizeDeps: {
    exclude: ["mediainfo.js", "@ffmpeg/ffmpeg", "@ffmpeg/core"],
  },
});