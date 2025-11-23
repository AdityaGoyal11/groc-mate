import { defineConfig } from 'vite';
import { ViteMinifyPlugin } from 'vite-plugin-minify';

export default defineConfig({
  plugins: [
    ViteMinifyPlugin({}), // Minifies HTML
  ],
  build: {
    outDir: 'dist',
    sourcemap: false, // Do not generate source maps (hides code structure)
    minify: 'terser', // Use terser for better minification
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log
        drop_debugger: true, // Remove debugger
      },
    },
  },
});

