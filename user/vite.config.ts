import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg', 'audio/fireworks.mp3', 'audio/finale_bgm.mp3', 'logo.png'],
      manifest: {
        name: 'NUTFES HANABI',
        short_name: 'NUTFES HANABI',
        start_url: '.',
        display: 'standalone',
        background_color: '#ffffff',
        icons: [
          {
            src: 'logo.png',
            sizes: '320x320',
            type: 'image/png',
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true
    },
    allowedHosts: [
      '.local',
      'localhost', 
      // '16dbd1de098c.ngrok-free.app',
      'hanabi.nutfes.net',
      'hanabi-stg.nutfes.net',
    ]
  }
})