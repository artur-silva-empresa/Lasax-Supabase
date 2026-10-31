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

// Plugin inline que assegura que as variantes dos ícones PWA da Lasa (192x192, 512x512, maskable e favicon)
// são replicadas e sincronizadas corretamente para a pasta dist e mantidas em public/icons/
const overrideDefaultIcons = () => ({
  name: 'override-default-icons',
  buildStart() {
    const icone512 = path.resolve(__dirname, 'public/icons/icon-512x512.png');
    const icone192 = path.resolve(__dirname, 'public/icons/icon-192x192.png');
    const iconeSrc = path.resolve(__dirname, 'public/icons/icone.png');

    // Se icone.png não existir, replica de icon-512x512.png
    if (!existsSync(iconeSrc) && existsSync(icone512)) {
      copyFileSync(icone512, iconeSrc);
    }

    // Se icon-512x512.png não existir, replica de icone.png
    if (!existsSync(icone512) && existsSync(iconeSrc)) {
      copyFileSync(iconeSrc, icone512);
    }

    // Se icon-192x192.png não existir, cria a partir de iconeSrc
    if (!existsSync(icone192) && existsSync(iconeSrc)) {
      copyFileSync(iconeSrc, icone192);
    }

    // Replicar para tamanhos genéricos que não existam
    const masterSrc = existsSync(icone512) ? icone512 : iconeSrc;
    if (existsSync(masterSrc)) {
      const fallbackTargets = [
        'public/icons/icon-256x256.png',
        'public/icons/icon-384x384.png',
      ];
      fallbackTargets.forEach(target => {
        const dest = path.resolve(__dirname, target);
        if (!existsSync(dest)) {
          copyFileSync(masterSrc, dest);
        }
      });
      console.log('✅ Ícones PWA (192x192 e 512x512) validados e replicados com sucesso.');
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
