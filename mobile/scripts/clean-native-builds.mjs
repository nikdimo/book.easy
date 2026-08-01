import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const modulesRoot = path.resolve('node_modules');
const entries = await readdir(modulesRoot, { withFileTypes: true });
const packageDirs = [];

for (const entry of entries) {
  if (entry.name.startsWith('@') && entry.isDirectory()) {
    const scoped = await readdir(path.join(modulesRoot, entry.name), { withFileTypes: true });
    packageDirs.push(...scoped.filter((item) => item.isDirectory()).map((item) => path.join(modulesRoot, entry.name, item.name)));
  } else if (entry.isDirectory()) {
    packageDirs.push(path.join(modulesRoot, entry.name));
  }
}

let cleaned = 0;
for (const packageDir of packageDirs) {
  const androidRoot = path.join(packageDir, 'android');
  const androidBuild = path.join(androidRoot, 'build');
  const androidCxx = path.join(androidRoot, '.cxx');
  try {
    await rm(androidBuild, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    await rm(androidCxx, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    cleaned += 1;
  } catch {
    // A package without an Android build directory is expected.
  }
}

console.log(`Cleaned native package build folders (${cleaned} checked).`);
