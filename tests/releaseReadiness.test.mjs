import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

test('release metadata targets the production GitHub repository and NSIS installer', () => {
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.equal(packageJson.build.appId, 'com.kilsystem.pharmacy');
  assert.equal(packageJson.build.publish.provider, 'github');
  assert.equal(packageJson.build.publish.owner, 'SilveiraGomes');
  assert.equal(packageJson.build.publish.repo, 'Sistema_Farmacia');
  assert.equal(packageJson.build.win.target, 'nsis');
  assert.equal(packageJson.build.win.artifactName, 'KILSYSTEM-PHARMACY-Setup-${version}.${ext}');
});

test('release contains the production signing key and update integration', () => {
  for (const relative of [
    'resources/license-public.pem',
    'src/backend/services/updateService.js',
    'src/backend/licensing/centralLicenseService.js',
    'src/backend/licensing/supportAccessVerifier.js',
  ]) {
    assert.equal(existsSync(resolve(root, relative)), true, `missing ${relative}`);
  }
  const updateSource = readFileSync(resolve(root, 'src/backend/services/updateService.js'), 'utf8');
  assert.match(updateSource, /checkForUpdates/);
  const mainSource = readFileSync(resolve(root, 'main.js'), 'utf8');
  assert.match(mainSource, /electron-updater/);
  assert.match(mainSource, /setupAutoUpdateService/);
});

test('final release assets match the package version when requested', { skip: process.env.RELEASE_CHECK_MODE !== 'final' }, () => {
  const installer = resolve(root, 'release', `KILSYSTEM-PHARMACY-Setup-${packageJson.version}.exe`);
  const blockmap = `${installer}.blockmap`;
  const manifest = resolve(root, 'release', 'latest.yml');
  for (const file of [installer, blockmap, manifest]) {
    assert.equal(existsSync(file), true, `missing ${file}`);
    assert.ok(readFileSync(file).length > 0, `empty ${file}`);
  }
  const yaml = readFileSync(manifest, 'utf8');
  assert.match(yaml, new RegExp(`version:\\s*${packageJson.version.replaceAll('.', '\\.')}\\b`));
  assert.match(yaml, new RegExp(`KILSYSTEM-PHARMACY-Setup-${packageJson.version}\\.exe`));
  assert.match(createHash('sha256').update(readFileSync(installer)).digest('hex'), /^[a-f0-9]{64}$/);
});
