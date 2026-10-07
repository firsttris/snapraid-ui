import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

const config = defineConfig({
  // The running version for the sidebar, raised by the release (package.json)
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    // resolve path aliases (@/*, @shared/*) from tsconfig.json
    tsconfigPaths: true,
  },
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      outputStructure: 'message-modules',
      // An explicit choice (cookie) wins, then the browser language, then English
      strategy: ['cookie', 'preferredLanguage', 'globalVariable', 'baseLocale'],
    }),
    devtools(),
    nitro({
      // Writes .gz and .br next to the client assets; the server sends them to
      // browsers that accept them instead of the uncompressed files
      compressPublicAssets: { gzip: true, brotli: true },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // Only for the client build, which Nitro writes to .output/public
    ...VitePWA({
      outDir: '.output/public',
      // Registered in __root.tsx, there is no index.html to inject into with SSR
      injectRegister: false,
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'apple-touch-icon-180x180.png',
      ],
      manifest: {
        name: 'SnapRAID UI',
        short_name: 'SnapRAID',
        description: 'Web interface for managing SnapRAID arrays',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#101828',
        background_color: '#101828',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Not every JS chunk and font subset: the scripts are hashed and served
        // as immutable, so the browser cache keeps the ones a page needs, and
        // precaching all of them (chart.js included) cost every first visit
        // about 1.5 MB in the background. Only the Latin fonts are precached,
        // other subsets load when a text needs them.
        globPatterns: [
          '**/*.{css,ico,png,svg}',
          'assets/geist-*latin-wght-normal-*.woff2',
        ],
        // Pages are rendered by the server and API data has to be live, so neither is cached
        navigateFallback: null,
      },
    }).map((plugin) => ({
      ...plugin,
      applyToEnvironment: (env: { name: string }) => env.name === 'client',
    })),
    /* Proxy not forwarding POST request bodys correctly, disabled for now
      server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  */
  ],
})

export default config
