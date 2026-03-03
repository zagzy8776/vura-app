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
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('react-dom') || id.includes('react/') || id.includes('react-router')) {
            return 'vendor-react';
          }
          if (id.includes('@radix-ui') || id.includes('lucide-react')) {
            return 'vendor-ui';
          }
          if (id.includes('framer-motion')) {
            return 'vendor-motion';
          }
          // Removed vendor-charts chunk to fix circular dependency with recharts
        },
      },
    },
  },
}));