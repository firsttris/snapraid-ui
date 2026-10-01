import {
  defineConfig,
  minimal2023Preset as preset,
} from '@vite-pwa/assets-generator/config'

// Generates favicon.ico, the PWA and the Apple icons from public/favicon.svg: npm run generate-pwa-assets
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...preset,
    // Padding and background in the color of the tile, so the masked icon still looks like the logo
    maskable: { ...preset.maskable, resizeOptions: { background: '#101828' } },
    apple: { ...preset.apple, resizeOptions: { background: '#101828' } },
  },
  images: ['public/favicon.svg'],
})
