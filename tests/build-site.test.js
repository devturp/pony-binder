import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSite } from '../scripts/build-site.mjs';

test('deployment fails safely without valid web config and excludes private credentials', () => {
  for (const config of [undefined, '', 'bad-json', '{}', 'null', '[]', JSON.stringify({apiKey:'fixture',authDomain:'fixture',projectId:'fixture',appId:'fixture',private_key:'fixture'})]) {
    assert.throws(() => buildSite(config), /FIREBASE_WEB_CONFIG/);
  }
});

test('deployment generates browser config and copies only runtime assets', () => {
  const output = mkdtempSync(join(tmpdir(), 'pony-build-'));
  const config = {apiKey:'test-fixture',authDomain:'fixture.example',projectId:'fixture',appId:'fixture'};
  try {
    buildSite(JSON.stringify(config), undefined, output);
    assert.equal(readFileSync(join(output, 'js/firebase-config.js'), 'utf8'), `export const firebaseConfig = ${JSON.stringify(config)};\n`);
    for (const path of ['index.html','app.js','styles.css','favicon.svg','CNAME','data/catalog.json','js/firebase.js']) assert.ok(existsSync(join(output,path)));
    for (const path of ['README.md','tests','scripts','.github','firestore.rules','js/firebase-config.example.js']) assert.equal(existsSync(join(output,path)), false);
    assert.match(readFileSync(join(output, 'js/firebase.js'), 'utf8'), /initializeApp\(firebaseConfig\)/);
    assert.equal(readFileSync(join(output,'CNAME'),'utf8').trim(),'ponybinder.app');
  } finally { rmSync(output, {recursive:true,force:true}); }
});
