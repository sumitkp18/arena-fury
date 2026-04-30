import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',  // Expose to all network interfaces (LAN access)
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  }
});
