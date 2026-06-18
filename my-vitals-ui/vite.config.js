import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In dev the UI runs on Vite (:5173) while the API runs on Flask (:3000).
// Proxy the API routes so the relative fetch('/predict') reaches the backend.
const API_TARGET = process.env.VITE_API_URL || 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/predict': API_TARGET,
      '/health': API_TARGET,
    },
  },
});
