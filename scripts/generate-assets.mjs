// Génère les icônes et splash screens Android + iOS à partir de src/assets/logo.png.
// 1. Prépare les images sources dans resources/ (format attendu par @capacitor/assets)
// 2. Lance @capacitor/assets qui produit toutes les tailles natives
// Usage : npm run assets
import sharp from 'sharp';
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LOGO = 'src/assets/logo.png';
const OUT = 'resources';
const DARK = '#0B0B0C';   // gdblack (tailwind.config.js)
const LIGHT = '#FFFFFF';

// Bouclier + couronne sans le texte (le texte est illisible en petit et noir sur fond sombre)
const SHIELD = { left: 276, top: 42, width: 522, height: 653 };

const shield = (size) =>
  sharp(LOGO).extract(SHIELD)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

const canvas = (size, background) =>
  sharp({ create: { width: size, height: size, channels: 4, background } });

const place = async (size, background, overlay) =>
  canvas(size, background).composite([{ input: overlay, gravity: 'center' }]).png();

mkdirSync(OUT, { recursive: true });

// Icône iOS / Android legacy : bouclier sur fond sombre (~80 % de la surface)
await (await place(1024, DARK, await shield(820))).toFile(`${OUT}/icon-only.png`);

// Icône adaptative Android : le logo doit tenir dans la zone sûre (~60 %)
await (await place(1024, { r: 0, g: 0, b: 0, alpha: 0 }, await shield(600))).toFile(`${OUT}/icon-foreground.png`);
await canvas(1024, DARK).png().toFile(`${OUT}/icon-background.png`);

// Splash clair : logo complet ; splash sombre : bouclier seul
const fullLogo = await sharp(LOGO).resize(1100, 1100, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
await (await place(2732, LIGHT, fullLogo)).toFile(`${OUT}/splash.png`);
await (await place(2732, DARK, await shield(900))).toFile(`${OUT}/splash-dark.png`);

console.log('Images sources générées dans resources/');

execSync(
  `npx capacitor-assets generate --android --ios --assetPath ${OUT}` +
  ` --iconBackgroundColor "${DARK}" --iconBackgroundColorDark "${DARK}"` +
  ` --splashBackgroundColor "${LIGHT}" --splashBackgroundColorDark "${DARK}"`,
  { stdio: 'inherit' }
);

// Les icônes Android sont générées en .png : un ancien .webp du même nom ferait échouer le build (Duplicate resources)
const res = 'android/app/src/main/res';
if (existsSync(res)) {
  for (const dir of readdirSync(res).filter((d) => d.startsWith('mipmap-'))) {
    for (const f of readdirSync(join(res, dir)).filter((f) => f.endsWith('.webp'))) {
      if (existsSync(join(res, dir, f.replace(/\.webp$/, '.png')))) rmSync(join(res, dir, f));
    }
  }
}

// iOS : splash par défaut de Capacitor, remplacés par les Default@*.png générés
const splashIos = 'ios/App/App/Assets.xcassets/Splash.imageset';
if (existsSync(splashIos)) {
  for (const f of readdirSync(splashIos).filter((f) => f.startsWith('splash-2732x2732'))) rmSync(join(splashIos, f));
}
