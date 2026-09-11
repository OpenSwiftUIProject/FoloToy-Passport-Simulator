import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Refuse to overwrite a review artifact; choose a fresh directory to export again.
const output = resolve(process.argv[2] || 'dist-pages');
await mkdir(output);
await cp(new URL('../public/', import.meta.url), output, { recursive: true });
await writeFile(resolve(output, 'playground-config.json'), JSON.stringify({
  service: 'openswiftui-passport-simulator', protocolVersion: 1,
  transport: 'indexeddb', networkEnabled: false,
}, null, 2) + '\n');
await writeFile(resolve(output, '.nojekyll'), '');
console.log(`Built static Simulator: ${output}`);
