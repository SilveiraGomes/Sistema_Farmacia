// Impede montar uma release com um número de versão já publicado: os clientes
// que já têm essa versão nunca receberiam a actualização automática.
// Uso: node scripts/check-release-version.mjs   (corre automaticamente no predist)
// Excepção consciente: ALLOW_SAME_VERSION=1 npm run dist
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = `v${version}`;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim();
}

if (process.env.ALLOW_SAME_VERSION === '1') {
  console.log(`[versão] ALLOW_SAME_VERSION=1: verificação da versão ${version} ignorada.`);
  process.exit(0);
}

let published = false;
let where = '';
try {
  if (git(['tag', '-l', tag])) { published = true; where = 'tag local'; }
} catch { /* sem git: segue para a verificação remota */ }

if (!published) {
  try {
    if (git(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])) { published = true; where = 'GitHub'; }
  } catch {
    console.warn(`[versão] Aviso: não foi possível consultar o GitHub; verificada apenas a tag local.`);
  }
}

if (published) {
  console.error(`\n[versão] A versão ${version} já foi publicada (${where}: ${tag}).`);
  console.error('[versão] Suba a versão antes de montar a release, por exemplo:');
  console.error('           npm version patch --no-git-tag-version\n');
  process.exit(1);
}

console.log(`[versão] ${version} ainda não publicada — pode montar a release.`);
