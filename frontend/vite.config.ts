import path from "node:path";
import react from "@vitejs/plugin-react";
import devServer from "@hono/vite-dev-server";
import { defineConfig } from "vite";

const frontendDir = import.meta.dirname;
const projectDir = path.resolve(frontendDir, "..");

export default defineConfig({
  root: frontendDir,
  plugins: [
    devServer({ entry: path.resolve(projectDir, "server/app.ts"), exclude: [/^\/(?!api\/).*$/] }),
    react(),
  ],
  server: { port: 5173 },
  resolve: {
    alias: {
      "@": path.resolve(frontendDir, "src"),
      "@contracts": path.resolve(projectDir, "contracts"),
      "@db": path.resolve(projectDir, "db"),
    },
  },
  envDir: projectDir,
  build: { outDir: "dist", emptyOutDir: true },
});
