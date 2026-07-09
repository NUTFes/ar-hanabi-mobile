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
      '.ngrok-free.app', // スマホ実機検証用（ngrok無料枠のランダムサブドメインを許可）
      '.ngrok-free.dev', // スマホ実機検証用（ngrok無料枠の新ドメインサフィックス）
      'hanabi.nutfes.net',
      'hanabi-stg.nutfes.net',
    ],
    proxy: {
      // スマホ実機検証用: ngrokでフロントのみ公開した際、同一オリジンでSeaweedFS(画像)へ中継する
      // ('/fireworks'より先に定義し、'/fireworks/images'を優先的にマッチさせる)
      '/fireworks/images': {
        target: 'http://seaweedfs:8333',
        changeOrigin: true,
      },
      // スマホ実機検証用: ngrokでフロントのみ公開した際、同一オリジンでAPIへ中継する
      '/fireworks': {
        target: 'http://app:8080',
        changeOrigin: true,
      },
    },
  }
})