import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ['input-otp', 'react-router-dom', 'framer-motion'],
    esbuildOptions: {
      target: 'esnext',
      // Ensure proper handling of ESM modules
      format: 'esm',
    },
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: mode === 'production',
      },
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Core React
          if (id.includes('react-dom') || id.includes('react/') || id.includes('react-router')) {
            return 'vendor-react';
          }
          // UI Components
          if (id.includes('@radix-ui') || id.includes('lucide-react')) {
            return 'vendor-ui';
          }
          // Animations
          if (id.includes('framer-motion')) {
            return 'vendor-motion';
          }
          // Charts
          if (id.includes('recharts') || id.includes('chart.js')) {
            return 'vendor-charts';
          }
        },
      },
    },
  },
}));