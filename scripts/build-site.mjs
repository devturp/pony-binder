import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildSite(configJson, source = fileURLToPath(new URL('../', import.meta.url)), output = resolve(source, 'dist')) {
  let config;
  try { config = JSON.parse(configJson); }
  catch { throw new Error('FIREBASE_WEB_CONFIG must contain a valid JSON object.'); }
  const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
  const allowed = [...required, 'storageBucket', 'messagingSenderId', 'measurementId'];
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      required.some(key => typeof config[key] !== 'string' || !config[key].trim()) ||
      Object.keys(config).some(key => !allowed.includes(key) || typeof config[key] !== 'string')) {
    throw new Error('FIREBASE_WEB_CONFIG must contain only Firebase web configuration fields, including apiKey, authDomain, projectId and appId.');
  }
  // Validate before changing output; never log configuration values.
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const path of ['index.html', 'app.js', 'styles.css', 'favicon.svg', 'CNAME', '.nojekyll', 'data', 'js']) {
    cpSync(resolve(source, path), resolve(output, path), { recursive: true,
      filter: path => !path.endsWith('/firebase-config.js') && !path.endsWith('/firebase-config.example.js') });
  }
  writeFileSync(resolve(output, 'js/firebase-config.js'), `export const firebaseConfig = ${JSON.stringify(config)};\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { buildSite(process.env.FIREBASE_WEB_CONFIG); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
