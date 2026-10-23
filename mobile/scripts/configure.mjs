// Writes capacitor.config.json and www/app-config.js from APP_URL (the page the app opens).
// Default: the live portal login. Change it per build, e.g. APP_URL=https://staging.example.com/login npm run sync
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = (process.env.APP_URL || 'https://moonlightneurocare.com/login').trim();
let parsed;
try {
  parsed = new URL(appUrl);
} catch {
  console.error(`APP_URL is not a valid URL: ${appUrl}`);
  process.exit(1);
}
if (parsed.protocol !== 'https:') {
  console.error('APP_URL must use https:// (sign-in cookies are secure-only).');
  process.exit(1);
}
const host = parsed.hostname;
const bare = host.replace(/^www\./, '');
// The app may move between the main domain and www; every other site opens outside the app.
const allowNavigation = [...new Set([bare, `www.${bare}`, host])];

const config = {
  appId: 'com.moonlightneurocare.app',
  appName: 'Moonlight Neurocare',
  webDir: 'www',
  appendUserAgent: 'MoonlightApp/1.0',
  backgroundColor: '#f8f7f2',
  server: {
    url: appUrl,
    allowNavigation,
    errorPath: 'error.html',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#123f46',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    SystemBars: {
      insetsHandling: 'native',
      style: 'DARK',
    },
  },
};

writeFileSync(join(root, 'capacitor.config.json'), JSON.stringify(config, null, 2) + '\n');
writeFileSync(join(root, 'www', 'app-config.js'), `window.MOONLIGHT_APP_URL = ${JSON.stringify(appUrl)};\n`);
console.log(`App opens ${appUrl}; in-app hosts: ${allowNavigation.join(', ')}`);
