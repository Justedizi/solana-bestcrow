import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = fileURLToPath(new URL('../dist-test/test/', import.meta.url));
const files = readdirSync(directory, { recursive: true })
  .filter(file => file.endsWith('.test.js'))
  .sort()
  .map(file => join(directory, file));
if (files.length === 0) throw new Error('No compiled tests found');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
