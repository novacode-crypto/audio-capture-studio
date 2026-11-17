// Resolvedor unico de FFmpeg y FFprobe para todos los componentes.
// Prioridad: rutas explicitas > binarios locales del proyecto > PATH > paquetes npm.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './config.mjs';

const require = createRequire(import.meta.url);

function cleanPath(value) {
  return String(value || '').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

function validFile(file) {
  if (!file) return null;
  const candidate = path.isAbsolute(file) ? file : path.resolve(ROOT, file);
  try {
    return fs.statSync(candidate).isFile() ? path.resolve(candidate) : null;
  } catch {
    return null;
  }
}

function fromPath(name) {
  const isWin = process.platform === 'win32';
  const names = isWin ? [`${name}.exe`, name] : [name];
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const filename of names) {
      const found = validFile(path.join(dir.replace(/^"(.*)"$/, '$1'), filename));
      if (found) return found;
    }
  }
  return null;
}

function fromProject(name) {
  const names = process.platform === 'win32' ? [`${name}.exe`, name] : [name];
  const dirs = [
    path.join(ROOT, 'bin'),
    path.join(ROOT, 'binaries'),
    path.join(ROOT, 'vendor', 'ffmpeg', 'bin'),
    path.join(ROOT, 'ffmpeg', 'bin'),
  ];
  for (const dir of dirs) {
    for (const filename of names) {
      const found = validFile(path.join(dir, filename));
      if (found) return found;
    }
  }
  return null;
}

function fromPackage(pkg, pick) {
  try {
    const value = pick(require(pkg));
    return validFile(value);
  } catch {
    return null;
  }
}

function versionOf(bin) {
  if (!bin) return null;
  try {
    const { execFileSync } = require('node:child_process');
    return execFileSync(bin, ['-version'], {
      encoding: 'utf8', windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'],
    }).split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  }
}

export function resolveMediaBinaries(app = {}) {
  const explicitFfmpeg = validFile(cleanPath(app.FFMPEG_PATH));
  const explicitFfprobe = validFile(cleanPath(app.FFPROBE_PATH));

  let ffmpeg = explicitFfmpeg || fromProject('ffmpeg') || fromPath('ffmpeg');
  let ffprobe = explicitFfprobe || fromProject('ffprobe') || fromPath('ffprobe');

  // Si solo se configuró uno, priorizar su ejecutable hermano para mantener versiones alineadas.
  if (ffmpeg && !explicitFfprobe && !ffprobe) {
    ffprobe = validFile(path.join(path.dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'));
  }
  if (ffprobe && !explicitFfmpeg && !ffmpeg) {
    ffmpeg = validFile(path.join(path.dirname(ffprobe), process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
  }

  // Último recurso: paquetes npm locales. Nunca desplazan una instalación del PATH.
  if (!ffmpeg) ffmpeg = fromPackage('ffmpeg-static', (m) => m);
  if (!ffprobe) ffprobe = fromPackage('ffprobe-static', (m) => m.path);

  return {
    ffmpeg,
    ffprobe,
    ffmpegVersion: versionOf(ffmpeg),
    ffprobeVersion: versionOf(ffprobe),
    ffmpegSource: explicitFfmpeg ? 'config/app.env' : ffmpeg && fromProject('ffmpeg') === ffmpeg ? 'proyecto' : ffmpeg && fromPath('ffmpeg') === ffmpeg ? 'PATH' : ffmpeg ? 'paquete npm' : null,
    ffprobeSource: explicitFfprobe ? 'config/app.env' : ffprobe && fromProject('ffprobe') === ffprobe ? 'proyecto' : ffprobe && fromPath('ffprobe') === ffprobe ? 'PATH' : ffprobe ? 'paquete npm' : null,
  };
}
