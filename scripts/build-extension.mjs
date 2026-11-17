// Compila la extension MV3 en extension-dist/ (lista para "Cargar descomprimida").
// - Paginas (popup, sidepanel, offscreen): Vite + React + Tailwind (instalado localmente)
// - Service worker: esbuild
// - service-config.json: generado desde config/ports.env (fuente unica de puertos)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { build as esbuild } from 'esbuild';
import { ROOT, EXT_DIST } from './lib/config.mjs';

const t0 = Date.now();
const src = path.join(ROOT, 'extension');

if (!fs.existsSync(path.join(ROOT, 'icons', 'icon-128.png'))) {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'make-icons.mjs')], { stdio: 'inherit' });
}

console.log('[1/4] Paginas de la extension (Vite)...');
await build({
  configFile: false,
  root: src,
  base: './',
  logLevel: 'warn',
  plugins: [react(), tailwind()],
  build: {
    outDir: EXT_DIST,
    emptyOutDir: true,
    target: 'chrome116',
    minify: true,
    sourcemap: false,
    modulePreload: false,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        popup: path.join(src, 'popup.html'),
        sidepanel: path.join(src, 'sidepanel.html'),
        offscreen: path.join(src, 'offscreen.html'),
      },
    },
  },
});

console.log('[2/4] Service worker (esbuild)...');
await esbuild({
  entryPoints: [path.join(ROOT, 'background', 'index.ts')],
  outfile: path.join(EXT_DIST, 'background.js'),
  bundle: true,
  format: 'esm',
  target: 'chrome116',
  platform: 'browser',
  minify: true,
  logLevel: 'warning',
});

console.log('[3/4] Manifest, worklet e iconos...');
fs.copyFileSync(path.join(src, 'manifest.json'), path.join(EXT_DIST, 'manifest.json'));
fs.copyFileSync(path.join(ROOT, 'audio-engine', 'meter-processor.js'), path.join(EXT_DIST, 'meter-processor.js'));
fs.mkdirSync(path.join(EXT_DIST, 'icons'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'icons'))) {
  if (/\.(png|svg)$/.test(f)) fs.copyFileSync(path.join(ROOT, 'icons', f), path.join(EXT_DIST, 'icons', f));
}

console.log('[4/4] Configuracion de servicio (config/ports.env)...');
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'sync-extension-config.mjs')], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'validate-extension.mjs')], { stdio: 'inherit' });

console.log(`Extension compilada en ${EXT_DIST} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
