import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: `npm run dev` proxies API + WebSocket to the Express server on :4000.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://162.35.18.210:4000', '/socket.io': { target: 'http://162.35.18.210:4000', ws: true } } },
});
