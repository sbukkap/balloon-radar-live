// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // WindBorne
      "/proxy/wb": {
        target: "https://a.windbornesystems.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/wb/, ""),
      },
      // USGS Earthquakes
      "/proxy/usgs": {
        target: "https://earthquake.usgs.gov",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/usgs/, ""),
      },
      // GDACS Cyclones
      "/proxy/gdacs": {
        target: "https://www.gdacs.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/gdacs/, ""),
      },
    },
  },
});
