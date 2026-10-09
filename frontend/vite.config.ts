import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // O Nexus agora é servido na raiz do domínio próprio, não em /kz-nexus/.
  base: "/",
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173 },
});
