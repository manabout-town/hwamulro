import { defineConfig } from "@apps-in-toss/web-framework/config"

export default defineConfig({
  appName: "takca",
  brand: {
    displayName: "탁카",
    primaryColor: "#F97316",
    icon: "", // 콘솔에서 업로드한 로고 URL로 교체
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  permissions: [],
  outdir: "dist",
})
