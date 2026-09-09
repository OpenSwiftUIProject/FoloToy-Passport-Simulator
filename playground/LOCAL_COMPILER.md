[简体中文](LOCAL_COMPILER.zh_CN.md) · English

# Connect your own Swift compiler

The hosted playground can send Swift source to a compiler running on **your**
computer. The resulting WASM runs in your browser. The website author does not
need to host a compiler or keep their computer online. You can always play the
bundled example without installing anything.

## Start

Use a checkout of the simulator containing `playground/start-compiler.sh`.
Install [Swift 6.3.1 RELEASE](https://www.swift.org/install/) with Embedded wasm32
libraries and LLVM tools, Python 3.9+, Git, CMake, Ninja and Node.js 20+ (with npm).
On macOS, `brew install cmake ninja node` supplies the latter build tools.
macOS arm64 is the tested host; Linux and Windows/WSL are not yet validated.
The launcher does not install or replace your system Swift toolchain.

From the simulator repository root:

```sh
# A completely local editor:
./playground/start-compiler.sh

# Or allow a hosted playground to use your compiler:
./playground/start-compiler.sh --allow-origin https://YOUR-ACCOUNT.github.io
```

Use the **origin** shown in the playground's setup instructions: scheme + host +
optional port, with no project path. For `https://you.github.io/simulator/`, use
`https://you.github.io`. Origins are shared by all pages on that host; only allow
websites you trust with local compilation. Repeat `--allow-origin` for additional
origins. For this repository's local static export:

```sh
./playground/start-compiler.sh --allow-origin http://127.0.0.1:4192
```

The launcher downloads pinned source checkouts into `playground/build/local-compiler/`,
verifies/downloads WASI SDK 34 C libraries into the sibling `toolchains/` directory,
installs the locked editor packages, and prepares the shared Swift/LVGL objects.
The first launch needs Internet access and takes longer. Later launches reuse
source checkouts and build caches. No ESP-IDF, OAG checkout, device or firmware
installation is needed. Existing sibling source repositories are not modified.

The preferred Swift compiler on macOS is
`~/Library/Developer/Toolchains/swift-6.3.1-RELEASE.xctoolchain/usr/bin/swiftc`.
Otherwise the launcher checks `swiftc` on PATH. Override the path explicitly:

```sh
SWIFTC=/path/to/swift-6.3.1/usr/bin/swiftc ./playground/start-compiler.sh \
  --allow-origin https://YOUR-ACCOUNT.github.io
```

Leave the terminal open. The service listens on `127.0.0.1:4191`; Ctrl-C stops it.
If that port is occupied, use `--port 4201` and change the compiler URL accordingly.
The terminal also prints a local editor URL as a browser-compatibility fallback.

## Connect from the website

1. Open the hosted playground. The bundled example starts without contacting a compiler.
2. The Compiler URL defaults to `http://127.0.0.1:4191/compile`. Click **Connect**.
3. Allow the site's local/loopback network permission if the browser asks.
4. Once connected, edit `ContentView.swift`. Auto preview compiles after 650 ms;
   **Build & Run** compiles immediately. Successful builds reset the preview's State.

A connection checks `GET /health` before enabling editing. The last successful
URL is remembered for that page. You can also prefill the URL in a link:

```text
https://YOUR-ACCOUNT.github.io/simulator/?compiler=http%3A%2F%2F127.0.0.1%3A4191%2Fcompile
```

A link or remembered address **does not automatically connect**. The Connect
button is still required before any source is sent. A base URL such as
`http://localhost:4191` is accepted and normalized to `/compile`. Remote addresses
must use HTTPS; plain HTTP is accepted only for `localhost` and `127.0.0.1`.
Disconnect stops further builds and preserves the current interactive preview.
Edits stay in the tab, including after disconnect/reconnect; they are not saved
to your source checkout. Refreshing the page discards them.

## Connection problems

- **Connection refused:** start the script and check the port printed in the terminal.
- **Origin/CORS error:** restart with the exact page origin using `--allow-origin`.
  `localhost` and `127.0.0.1` are different origins, as are different ports.
- **Browser blocks localhost:** allow local/loopback network access in site settings.
  Supporting browsers use a permission gate for HTTPS-to-loopback requests;
  behavior varies by browser and embedded webview. See the
  [browser guidance](https://developer.chrome.com/blog/local-network-access).
  If unavailable, open `http://127.0.0.1:4191/` and use the local editor instead.
  Do not disable browser security or expose this service through a public tunnel.
- **Wrong service:** `/health` must identify `openswiftui-passport-compiler`, protocol 1.
- **Compile error:** diagnostics appear below the editor; the last good preview remains.
- **Changed cached checkout:** the launcher refuses to overwrite it. Choose a fresh
  `--cache-dir /path/to/cache`, or use an explicit source override for development.

## Developer details

Pinned inputs:

| Dependency | Revision |
| --- | --- |
| OpenSwiftUI | `e35b91a31789c3c277e9a784b9f9b86e5eb708f5` |
| AI Passport | `80419bbda98e030afd742cdb9d11c8a8da4a5c42` |
| LVGL 9.5.0 | `85aa60d18b3d5e5588d7b247abf90198f07c8a63` |

`--prepare-only` prepares the environment and exits. `--cache-dir` selects the
source/object cache. `PASSPORT_SOURCE_DIR`, `OPENSWIFTUI_SOURCE_DIR` and
`LVGL_SOURCE_DIR` explicitly opt into local source overrides; those directories
are not changed or pinned by the launcher. `WASI_SYSROOT` / `WASI_BUILTINS` may
point at alternate C libraries. Their compatibility is the caller's responsibility.

The API accepts at most 64 KiB JSON bodies and one compilation at a time, with a
30-second compilation timeout. Host validation prevents hostname rebinding;
CORS allows only explicitly named origins and the local editor. The compiler
runs as your user and is intended for trusted development, not sandboxed public
compilation. No submitted program is executed natively: the output runs as WASM
in the browser, with the existing limited WASI shim.

For a static release, follow [DEPLOYMENT.md](DEPLOYMENT.md). The exported page
already includes compiler connection controls; no hosted compile service is required.

## Validation

On macOS arm64: downloaded all three pinned source checkouts into a fresh cache,
built the preview, then restarted with cached dependencies. The resulting compile
API passed exact-origin CORS and source hash checks; three rendered frames matched
the existing native LVGL fixtures, and 1,000 State/input cycles retained stable
WASM memory. Browser checks covered cross-origin editing, URL prefill, unavailable
service feedback, compile errors/recovery, and interactive preview after disconnect.
The HTTP access suite has 6 passing tests; the root Node suite has 59 passing tests.
Public HTTPS Pages-to-loopback permissions across browsers and Linux/WSL hosts
have not been tested. No physical device was involved.
