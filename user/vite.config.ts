import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      manifest: {
        name: 'My App',
        short_name: 'App',
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