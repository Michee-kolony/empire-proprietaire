// Recopie appId et appName de capacitor.config.ts dans le projet iOS
// (Capacitor ne les met à jour qu'au "cap add ios").
// Côté Android c'est android/app/build.gradle qui s'en charge au build.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const config = readFileSync('capacitor.config.ts', 'utf8');
const read = (key) => {
  const m = config.match(new RegExp(`^\\s*${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`, 'm'));
  if (!m) throw new Error(`${key} introuvable dans capacitor.config.ts`);
  return m[1];
};
const appId = read('appId');
const appName = read('appName');

const plist = 'ios/App/App/Info.plist';
const pbxproj = 'ios/App/App.xcodeproj/project.pbxproj';
if (!existsSync(plist)) process.exit(0);

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

writeFileSync(plist, readFileSync(plist, 'utf8').replace(
  /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
  `$1${escapeXml(appName)}$2`
));
writeFileSync(pbxproj, readFileSync(pbxproj, 'utf8').replace(
  /PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g,
  `PRODUCT_BUNDLE_IDENTIFIER = ${appId};`
));

console.log(`iOS : ${appName} (${appId})`);
