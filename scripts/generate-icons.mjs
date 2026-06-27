import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const srcImage = 'src/assets/images/lasa_logo_1782563315002.jpg';
const destDir = 'public/icons';

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const icons = [
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-96x96.png', size: 96 },
  { name: 'icon-48x48.png', size: 48 },
  { name: 'icon-72x72.png', size: 72 },
  { name: 'icon-96x96.png', size: 96 },
  { name: 'icon-128x128.png', size: 128 },
  { name: 'icon-144x144.png', size: 144 },
  { name: 'icon-152x152.png', size: 152 },
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-256x256.png', size: 256 },
  { name: 'icon-384x384.png', size: 384 },
  { name: 'icon-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icone.png', size: 512 },
  { name: 'favicon.ico', size: 32 }
];

async function generateIcons() {
  console.log('Iniciando geração de ícones PWA...');
  
  if (!fs.existsSync(srcImage)) {
    console.error(`Erro: Imagem de origem não encontrada em ${srcImage}`);
    process.exit(1);
  }

  for (const icon of icons) {
    const destPath = path.join(destDir, icon.name);
    try {
      await sharp(srcImage)
        .resize(icon.size, icon.size, {
          fit: 'contain',
          background: { r: 192, g: 14, b: 18, alpha: 1 } // #c00e12 crimson background color
        })
        .png()
        .toFile(destPath);
      console.log(`✓ Gerado: ${icon.name} (${icon.size}x${icon.size})`);
    } catch (err) {
      console.error(`✗ Erro ao gerar ${icon.name}:`, err);
    }
  }
  
  console.log('Todos os ícones foram gerados com sucesso!');
}

generateIcons();
