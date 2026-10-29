// Web del panel. `npm run build` → dist/ (la sirve panel/servidor.mjs). En desarrollo, `npm run dev` con el
// servidor en marcha en el puerto 4321: las llamadas a /api pasan por el proxy.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { proxy: { '/api': { target: `http://127.0.0.1:${process.env.PANEL_PUERTO ?? 4321}` } } },
});
