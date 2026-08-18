import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli/index.ts', 'src/mcp/server.ts'],
  format: ['esm'],
  target: 'node20',
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  onSuccess: 'chmod +x dist/cli/index.js dist/mcp/server.js',
})
