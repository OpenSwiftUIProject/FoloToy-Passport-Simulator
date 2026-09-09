[简体中文](DEPLOYMENT.zh_CN.md) · English

# Hosting the OpenSwiftUI playground

GitHub Pages can host the frontend and execute precompiled WASM in visitors'
browsers. It cannot run `swiftc` or the Python compile server: Pages is a
[static hosting service](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

| Deployment | View and play the example | Edit and compile arbitrary ContentView | Needs the creator's computer online |
| --- | --- | --- | --- |
| Pages static export | Yes | No; source is read-only | No |
| Pages + visitor’s local compiler | Yes | Yes, after Connect | No |
| Pages + remote compile API | Yes | Yes, once a compatible API is deployed | No |
| Entirely local editor | Yes | Yes | Runs on the visitor’s computer |

## Static export

Prepare the build as described in [README](README.md), then run from `playground/`:

```sh
python3 export_static.py --output ../dist/playground
node smoke.mjs
node verify-static.mjs ../dist/playground
```

Choose an empty output directory. The export rebuilds the default Swift example
and the editor, then includes HTML, CSS, JavaScript, the WASM, matching Swift
source, SHA-256 checksums, third-party notices and `.nojekyll`. It creates an
adjacent ZIP. No Python, Node.js, Swift toolchain or compiler server is needed by
the visitor. JavaScript, WASM and editor dependencies are bundled locally; there
are no CDN dependencies.

Upload that directory's contents using a GitHub Pages Actions artifact, or place
the contents on a dedicated `gh-pages` branch and select its root in repository
Settings → Pages. Publication requires write access to the destination repository.
No workflow, push or Pages configuration is performed by this local export.

All asset, worker, configuration and WASM URLs are relative, so both a site root
and a Pages project path such as `/FoloToy-Passport-Simulator/` work. To exercise
the project-path case locally from the repository root:

```sh
python3 -m http.server 4192 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:4192/playground/`. This server only serves static files.
The editor shows highlighted read-only source and the UP/DOWN/OK buttons remain
interactive. Restart example resets the WASM instance. The page validates both
the module and its displayed source against the export's SHA-256 values.

The QEMU simulator is a separate application. This export does not include its
Node networking/community backend or expose a localhost simulator link.

## Pages + each visitor's local compiler

The static export includes a Compiler URL field, defaulting to
`http://127.0.0.1:4191/compile`. Visitors run the setup/launch script on their own
computer, then click Connect. No shared compile backend is required.

```sh
./playground/start-compiler.sh --allow-origin https://YOUR-ACCOUNT.github.io
```

See [local compiler setup](LOCAL_COMPILER.md) for prerequisites, pinned dependency
bootstrap, browser permissions and troubleshooting. The page remembers the last
successful endpoint; `?compiler=http%3A%2F%2F127.0.0.1%3A4191%2Fcompile` can also
prefill it. URL parameters and remembered endpoints never connect automatically.
The service supports exact-origin CORS, health checks, and loopback preflights.
The static example stays usable while disconnected.

## Full online editing

A frontend can be exported against an independently hosted HTTPS compiler:

```sh
python3 export_static.py --output ../dist/online-editor \
  --compile-endpoint https://your-compiler.example/compile
```

This only configures the frontend; it does not provision or secure a service.
No remote compiler endpoint has been deployed or tested in this experiment.
Click Connect to use the prefilled address. The page identifies the destination
host before edits are submitted and retains
the precompiled example until the first successful edited build.

The API contract is:

- `GET /health`: JSON `{"service":"openswiftui-passport-compiler","protocolVersion":1}`.
- `POST` JSON `{"source":"import OpenSwiftUI\n..."}` with `Content-Type: application/json`.
- On success: HTTP 200 with `Content-Type: application/wasm`, built for the
  `preview_init/button/tick/framebuffer/revision` exports and the existing WASI shim.
- On error: a non-2xx status and JSON `{"error":"compiler diagnostics"}`.
- CORS permits the exact Pages origin, `GET`, `POST`, `OPTIONS` and the JSON content type.
- The backend uses the matching OSUI/Passport source versions and prebuilt LVGL
  dependencies; only the user's view needs to be recompiled for each request.

Use disposable unprivileged compiler containers, CPU/memory/time quotas, bounded
requests, build concurrency limits, rate limits and suitable access control.
Do not expose the trusted local `server.py` to the Internet. Keep credentials out
of frontend configuration. Shared results may be cached by source + toolchain +
dependency hashes. GitHub Actions is useful for publishing prebuilt examples,
but its job queue is not the low-latency editor compile loop.

## Why the current compiler cannot simply move into Pages

The [official Swift WASM SDK](https://www.swift.org/documentation/articles/wasm-getting-started.html)
cross-compiles applications on a native host; it does not ship a browser-hosted
Swift compiler. Compiling OSUI to WASM and compiling `swiftc` itself to WASM are
different tasks.

[MiniSwift](https://forums.swift.org/t/miniswift-swift-compiler-that-runs-in-the-browser-via-webassembly/85808)
is an independent C implementation with different compatibility goals. Its
author describes incomplete Swift compatibility; the published frontend alone
does not supply this project's Swift Embedded module/linking pipeline. It has
not been validated against OSUI and is not a drop-in replacement here. A fully
browser-hosted official compiler remains separate research work.

## Validation for this change

- Swift highlighting visibly verified in the browser; edited view compiled and
  rendered, then Reset example restored the original view.
- Static export served successfully beneath a non-root path using only a static
  file server, with the compiler endpoint absent and source read-only.
- Export integrity and its initial, DOWN and hidden-image WASM frames match the
  existing native LVGL fixtures.
- The separate baseline State/input smoke test runs 1,000 button/tick cycles.
- Local API access tests cover approved/rejected origins, preflight, host validation,
  malformed/oversized requests, and busy responses. Endpoint tests cover loopback
  and HTTPS URLs and reject credentials and insecure remote addresses.
- Actual public GitHub Pages deployment and a remote compile service: not performed.
