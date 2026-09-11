# Deployment

This fork supports a static GitHub Pages edition and the full Node.js edition.
The Node service provides community imports and the emulated Wi-Fi bridge.

## GitHub Pages

Public URL: https://openswiftuiproject.github.io/FoloToy-Passport-Simulator/

```sh
npm ci
npm test
npm run build:pages
python3 -m http.server 4194 --bind 127.0.0.1 --directory dist-pages
```

The exporter requires an empty output destination (or pass a fresh path to
`node tools/build-pages.mjs /path/to/export`). Pages serves the browser shell,
Worker, QEMU WASM, bundled images and local file picker. No Node endpoints,
WebSocket bridge, shared memory or cross-origin isolation headers are required.
Community-link import and firmware networking remain features of the Node edition.

Choose GitHub Actions in repository Settings → Pages. `.github/workflows/pages.yml`
validates both editions, builds `dist-pages/`, and deploys this fork's main branch.
All browser asset paths resolve beneath the project URL, including the Worker.

The published Playground on `/ai-passport/` shares this origin. It discovers
`playground-config.json` (`service: openswiftui-passport-simulator`, protocol 1,
`transport: indexeddb`), then stages a full image in browser storage. The explicit
`?playground=<48-hex-id>` link reads and verifies it before launching QEMU. It is
valid for ten minutes in that browser/profile, not a public firmware download.
The `browser-handoff.js` module is also shipped in ai-passport; keep its protocol
compatible. See the [wire format](https://github.com/OpenSwiftUIProject/ai-passport/blob/main/tools/playground/DEPLOYMENT.md#compiler-and-simulator-contracts).

To test both project paths together, export both sites beneath one static HTTP
root, fill the local Simulator URL on Playground, and build/send a view. Different
origins use the downloaded full.bin file picker or the optional local Node API.

## Node.js edition

## Build

```bash
npm test
npm run build
npm run verify:release
```

`dist/` is the complete release artifact. It contains the browser application,
ESP-EMU runtime, bundled firmware assets, community import proxy, deployment
metadata, and `SHA256SUMS`.

The release server disables local firmware selection by default. Production
users can only load firmware through the server-verified FoloToy community
import flow. Set `EMULATOR_ALLOW_LOCAL_FIRMWARE_UPLOAD=1` only for a trusted
local deployment that explicitly needs local `.bin` files.

## Run The Release

```bash
cd dist
HOST=0.0.0.0 PORT=4190 npm start
```

The health check endpoint is `GET /healthz`.

## Runtime Logs

The server writes one JSON object per line to standard output or standard
error. HTTP requests emit an `http_access` record with a request ID, method,
path, status, response size, client address, and duration. Query strings and
request bodies are intentionally omitted.

Failures emit a separate record using the same `request_id`. Community import
failures include the upstream stage, HTTP status, request ID, retry count, and
`Retry-After` value when those fields are available. WebSocket upgrades and
network bridge connection failures are logged as separate events.

Reverse proxies may supply `X-Request-ID`; valid values are returned to the
client and used in all related records. Otherwise, the server generates an ID.

## Embed In An Iframe

The server allows iframe embedding from any parent origin, including local
development pages. It omits CSP `frame-ancestors` and `X-Frame-Options` while
preserving the other security headers. Reverse proxies must not add restrictive
`frame-ancestors` or `X-Frame-Options` headers if embedding should remain available.

```html
<iframe
  src="https://folotoy-passport-simulator.onrender.com/?play=100"
  title="AI Passport 在线试玩"
  allow="microphone; autoplay; fullscreen"
></iframe>
```

The embedding page's own CSP must also permit the simulator in `frame-src`.
Sound still requires a user click, and microphone access requires browser
permission in a secure context. To test before deploying community changes,
temporarily insert the iframe in a community page using browser DevTools, or
use a local preview page. This changes only the test browser's DOM; refreshing
restores the original page. The deployed simulator must include this header
change before remote embedding can work.

## Environment Variables

| Variable | Default | Production recommendation | Description |
| --- | --- | --- | --- |
| `HOST` | `127.0.0.1` | `0.0.0.0` | Address on which the HTTP server listens. |
| `PORT` | `4190` | Platform-provided value | HTTP and WebSocket port. Railway supplies this automatically. |
| `EMULATOR_ALLOW_LOCAL_FIRMWARE_UPLOAD` | Disabled | `0` | Set to `1` only when users should be able to select arbitrary local `.bin` files. |
| `EMULATOR_NETWORK_ALLOW_PRIVATE` | Disabled | `0` | Set to `1` only in a trusted environment to allow emulated firmware to reach private, loopback, and reserved addresses. |

Environment variables take precedence over command-line defaults. The source
development command, `npm start`, passes `--allow-local-firmware-upload`.
The generated `dist/package.json` does not pass that flag, so release
deployments remain fail-closed unless
`EMULATOR_ALLOW_LOCAL_FIRMWARE_UPLOAD=1` is explicitly configured.

Recommended Railway variables:

```env
HOST=0.0.0.0
EMULATOR_ALLOW_LOCAL_FIRMWARE_UPLOAD=0
EMULATOR_NETWORK_ALLOW_PRIVATE=0
```

Do not set `PORT` on Railway unless the platform configuration specifically
requires it. Railway injects `PORT` for the service.

`EMULATOR_ALLOW_LOCAL_FIRMWARE_UPLOAD` controls the product UI and local file
handling path. It is not authentication for `/api/emulator-network`. Keep the
network bridge protected by its destination restrictions and by access control
at the deployment or reverse-proxy layer.

## Docker

```bash
docker build -t folotoy-passport-simulator .
docker run --rm -p 4190:4190 folotoy-passport-simulator
```

Terminate TLS at the reverse proxy and forward requests to port `4190`.
The server emits the cross-origin isolation headers required by the WASM
runtime and restricts community imports to published firmware from
`https://ai-passport.folotoy.cn`.
