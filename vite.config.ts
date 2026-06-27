import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'fs';

// Plugin inline que copia o sql-wasm.wasm do node_modules para public/
// Garante que o ficheiro está disponível tanto em dev como em build
const copySqlWasm = () => ({
  name: 'copy-sql-wasm',
  buildStart() {
    const src = path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
    const dest = path.resolve(__dirname, 'public/sql-wasm.wasm');
    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log('✅ sql-wasm.wasm copiado para public/');
    } else {
      console.warn('⚠️  sql-wasm.wasm não encontrado — execute npm install');
    }
  }
});

// Plugin inline que copia o logótipo oficial (icone.png) para todas as outras variantes de ícones
// garantindo que nenhum ícone padrão ou de template (ex: ícone Vite "V") seja carregado pelo browser.
const overrideDefaultIcons = () => ({
  name: 'override-default-icons',
  buildStart() {
    const iconeSrc = path.resolve(__dirname, 'public/icons/icone.png');
    if (existsSync(iconeSrc)) {
      const targets = [
        'public/icons/apple-touch-icon.png',
        'public/icons/icon-48x48.png',
        'public/icons/icon-72x72.png',
        'public/icons/icon-96x96.png',
        'public/icons/icon-128x128.png',
        'public/icons/icon-144x144.png',
        'public/icons/icon-152x152.png',
        'public/icons/icon-192x192.png',
        'public/icons/icon-256x256.png',
        'public/icons/icon-384x384.png',
        'public/icons/icon-512x512.png',
        'public/icons/favicon-32x32.png',
        'public/icons/favicon-96x96.png',
      ];
      targets.forEach(target => {
        const dest = path.resolve(__dirname, target);
        copyFileSync(iconeSrc, dest);
      });
      console.log('✅ Ícones padrão substituídos por public/icons/icone.png');
    } else {
      console.warn('⚠️  public/icons/icone.png não encontrado!');
    }
  }
});

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },

  plugins: [
    react(),
    copySqlWasm(),
    overrideDefaultIcons(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
    dedupe: ['react', 'react-dom']
  },

  // Incluir wasm como asset estático para o Vite não tentar processar
  assetsInclude: ['**/*.wasm'],

  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
});
