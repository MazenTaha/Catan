// Stages the complete web game into an Unreal project's WebGame folder (beside Content), where the native
// table (CatanTable.cpp) runs it: the built web app, the game server bundled into one file, and
// the Node runtime that executes it. Run `pnpm build` first (`pnpm unreal:web` does both).
//
//   node apps/unreal/stage-web-game.mjs [--project "apps/unreal 5.8"]
//
// The folder is generated output (git-ignored); CatanNight.Build.cs stages it into packaged builds
// as loose files. It is outside Content so the editor never offers to import its images as assets.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const flag = process.argv.indexOf('--project');
const project = resolve(repo, flag > 0 ? process.argv[flag + 1] : 'apps/unreal 5.8');
const dist = join(repo, 'apps/web/dist');
if (!existsSync(join(project, 'CatanNight.uproject'))) throw new Error(`No CatanNight.uproject in ${project}`);
if (!existsSync(join(dist, 'index.html'))) throw new Error('Build the web app first (pnpm build).');

const out = join(project, 'WebGame');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(dist, join(out, 'web'), { recursive: true });

// esbuild is a dev dependency of the server package (pnpm keeps it out of the root).
const esbuild = createRequire(join(repo, 'apps/server/package.json'))('esbuild');
await esbuild.build({
  entryPoints: [join(repo, 'apps/server/src/main.ts')],
  outfile: join(out, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // ws loads these optional native accelerators inside try/catch; without them it uses plain JS.
  external: ['bufferutil', 'utf-8-validate'],
  // ws is CommonJS: give the ES module bundle a real require for Node's built-in modules.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});

cpSync(process.execPath, join(out, 'node.exe'));

let commit = 'unknown';
try {
  commit = execFileSync('git', ['-c', `safe.directory=${repo.replace(/\\/g, '/')}`, 'rev-parse', '--short', 'HEAD'], { cwd: repo }).toString().trim();
} catch {
  // Staging works outside a git checkout too.
}
writeFileSync(
  join(out, 'stage.json'),
  JSON.stringify({ commit, node: process.version, staged: new Date().toISOString() }, null, 2),
);
console.log(`Staged the web game (${commit}, Node ${process.version}) into ${out}`);
