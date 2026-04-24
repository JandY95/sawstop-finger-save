import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadJson(p, fallback = null) {
  if (!fs.existsSync(p)) return fallback;
  const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

export function saveJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function coreRoot() {
  const link = loadJson(path.join(projectRoot, '.harness-link.json'), {});
  return path.resolve(projectRoot, link.corePath || '..');
}

export function statePath() {
  return path.join(projectRoot, '.project-state.json');
}

export function projectState() {
  return loadJson(statePath(), {});
}

export function runCore(scriptName, args = [], options = {}) {
  const core = coreRoot();
  const scriptPath = path.join(core, 'scripts', scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: core,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe'
  });
  return result;
}

export function printAndExit(result, fallbackMessage) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(fallbackMessage || 'core command failed');
    process.exit(result.status || 1);
  }
}