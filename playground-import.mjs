import { createHash, randomBytes } from 'node:crypto';

const ROUTE = '/api/playground-firmware';
const MAX_BYTES = 8 * 1024 * 1024;

export function playgroundOrigins(argv = process.argv) {
  const origins = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--playground-origin') continue;
    const value = argv[++i];
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
        || (url.protocol !== 'https:' && !(url.protocol === 'http:'
          && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
      throw new Error('--playground-origin requires an HTTPS origin or HTTP loopback origin');
    }
    origins.push(url.origin);
  }
  return origins;
}

// Ephemeral handoff: three images for ten minutes, never written to disk.
export function createPlaygroundImport({ enabled, origins = [], headers = {}, now = Date.now }) {
  const allowed = new Set(playgroundOrigins(origins.flatMap(origin => ['--playground-origin', origin])));
  const images = new Map();
  let uploading = false;
  return async function handle(request, response, pathname) {
    if (pathname !== ROUTE && !pathname.startsWith(`${ROUTE}/`)) return false;
    const origin = request.headers.origin;
    const cors = allowed.has(origin) ? { 'access-control-allow-origin': origin } : {};
    const reply = (status, body, extra = {}) => {
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
      response.writeHead(status, { ...headers, ...cors, vary: 'Origin', 'cache-control': 'no-store',
        'content-type': 'application/json', 'content-length': bytes.length, ...extra });
      response.end(bytes);
    };
    if (!enabled || !allowed.size) { reply(403, { error: 'Playground import is disabled' }); return true; }
    const sameOrigin = origin && origin === `http://${request.headers.host}`;
    if (origin && !allowed.has(origin) && !sameOrigin) {
      reply(403, { error: 'Playground origin is not allowed' }); return true;
    }
    for (const [id, item] of images) if (item.expires <= now()) images.delete(id);
    if (request.method === 'GET' && pathname.startsWith(`${ROUTE}/`)) {
      const item = images.get(pathname.slice(ROUTE.length + 1));
      if (!item) reply(404, { error: 'Firmware handoff expired; send it again from Playground' });
      else reply(200, item.bytes, { 'content-type': 'application/octet-stream', 'x-firmware-sha256': item.sha256 });
      return true;
    }
    if (pathname !== ROUTE) { reply(404, { error: 'Not found' }); return true; }
    // A browser POST must come from an explicitly enabled website.
    if (!allowed.has(origin)) { reply(403, { error: 'An allowed Playground Origin is required' }); return true; }
    if (request.method === 'OPTIONS') {
      const requested = (request.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (request.headers['access-control-request-method'] !== 'POST'
          || requested.some(h => !['content-type', 'x-firmware-sha256'].includes(h))) {
        reply(403, { error: 'Preflight not allowed' }); return true;
      }
      reply(204, Buffer.alloc(0), { 'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'Content-Type, X-Firmware-SHA256',
        ...(request.headers['access-control-request-private-network'] === 'true'
          ? { 'access-control-allow-private-network': 'true' } : {}) });
      return true;
    }
    if (request.method !== 'POST') { reply(405, { error: 'POST required' }); return true; }
    if (request.headers['content-type'] !== 'application/octet-stream') { reply(415, { error: 'Binary firmware required' }); return true; }
    const sha256 = request.headers['x-firmware-sha256'];
    if (!/^[a-f0-9]{64}$/.test(sha256 || '')) { reply(400, { error: 'SHA-256 required' }); return true; }
    if (uploading) { reply(429, { error: 'Another firmware upload is in progress' }); return true; }
    uploading = true;
    try {
      request.setTimeout(30000, () => request.destroy());
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BYTES) { reply(413, { error: 'Firmware exceeds 8 MiB' }); return true; }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.length <= 0x10000 || bytes[0] !== 0xe9 || bytes[0x10000] !== 0xe9
          || bytes[0x8000] !== 0xaa || bytes[0x8001] !== 0x50) {
        reply(422, { error: 'Expected a full ESP32-C3 image (bootloader, partition table and app), not WASM or app-only firmware' });
      } else if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
        reply(422, { error: 'Firmware checksum mismatch' });
      } else {
        const id = randomBytes(24).toString('hex');
        if (images.size >= 3) images.delete(images.keys().next().value);
        images.set(id, { bytes, sha256, expires: now() + 600000 });
        reply(201, { id, url: `/?playground=${id}`, sha256 });
      }
    } finally { uploading = false; request.setTimeout(0); }
    return true;
  };
}
