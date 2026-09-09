[简体中文](README.zh_CN.md) · English

# OpenSwiftUI Passport WASM playground

Local playground, verified on 2026-09-09. The Swift editor includes syntax highlighting, line numbers, folding, undo/redo, indentation and bracket matching. Edit `ContentView.swift` in
the browser and preview the real OpenSwiftUI Embedded + Passport LVGL rendering.

The two running experiments serve different purposes:

| URL | Execution path |
| --- | --- |
| <http://127.0.0.1:4191/> | Edit Swift → local Swift compiler → WASM → LVGL → canvas |
| <http://127.0.0.1:4190/?play=223> | Published Pocket 2048 RISC-V firmware → QEMU WASM → emulated display |

The firmware URL uses the existing [FoloToy Passport Simulator](https://github.com/VOID001/FoloToy-Passport-Simulator)
checkout at `../../FoloToy-Passport-Simulator`. Its community loader successfully
booted project 223. That emulator runs firmware; it does not include a Swift editor
or Swift compiler. The first URL is a separate prototype using the existing
Embedded source profile. It is not a build of the entire default OpenSwiftUI package.

## Start

Prerequisites: Swift 6.3.1 RELEASE (including Embedded wasm32 libraries, clang and
wasm-ld), Python 3.9+, CMake, Ninja, and Node.js 20+. The default Swift compiler is
`~/Library/Developer/Toolchains/swift-6.3.1-RELEASE.xctoolchain/usr/bin/swiftc`.
Override it with `SWIFTC` if installed elsewhere. This prototype was tested on macOS arm64.

Expected layout:

```text
FoloToy/
  ai-passport/                   # includes resolved managed_components/lvgl__lvgl
  framework/OpenSwiftUI/         # embed/folotoy
  toolchains/                   # verified WASI C libraries
  FoloToy-Passport-Simulator/playground/
```

The Passport checkout must already have its pinned LVGL managed component, as
created by its documented firmware environment setup. The build reads shared
files directly from both checkouts. No framework dependency checkouts are needed.
Paths can be overridden with `PASSPORT_SOURCE_DIR`, `OPENSWIFTUI_SOURCE_DIR`,
`WASI_SYSROOT`, and `WASI_BUILTINS`.

From this directory:

```sh
npm ci
npm run build:editor
python3 setup.py                 # pinned official WASI sysroot and compiler builtins
python3 build.py --prepare       # cache OpenSwiftUI and C/LVGL; build default view
node smoke.mjs
python3 server.py
```

Open <http://127.0.0.1:4191/>. Auto preview waits 650 ms after editing. Build & Run
rebuilds immediately. Compilation failure leaves the previous preview visible.
Reset example restores the original device ContentView. Every successful rebuild
creates a fresh WASM worker and resets State; normal button clicks retain State.
Edits live only in the browser tab and are not saved to the source checkout.

To start the firmware emulator, run `npm run prepare:emulator` and `npm start`
from `../../FoloToy-Passport-Simulator`, then open its URL above.

## Reused implementation

- The 39 files in OpenSwiftUI `Embedded/sources.txt`, compiled as a separate
  `OpenSwiftUI.swiftmodule` and WASM object. No OSUI source changes were required.
- `ContentView.swift` is initially identical to Passport `main/swift/ContentView.swift`.
- The actual `PassportSceneSink.swift`, `openswiftui_scene.c`, `ui_pixel.c`,
  `ui_pixel_math.c`, `spark_rgb565.h`, LVGL sources and host LVGL configuration.
- `RootGeometry`: 240 × 320, demo insets top 66 / leading 12 / bottom 30 / trailing 12.
- `PreviewHost.swift` retains an `EmbeddedViewHost`, dispatches physical buttons,
  and advances animation time. `preview.c` supplies display flush and a framebuffer.
- Browser JavaScript converts the RGB565 framebuffer to RGBA. Swift and LVGL own
  layout, fonts, images and drawing; JavaScript does not reimplement these rules.

`OPENSWIFTUI_LVGL && hasFeature(Embedded)` remains appropriate for this path because
it actually links LVGL. Swift targets `wasm32-unknown-none-wasm`; C uses the WASI
sysroot. `wasi.js` supplies the six imported clock, entropy and stdout functions.
The runtime receives no filesystem or network API.

## Results

| Check | Result |
| --- | --- |
| Simulator resources / tests | PASS, board ABI v1 / 57 tests |
| Published 2048 in QEMU | PASS, game visibly started; not an extended play test |
| OpenSwiftUI + Passport + LVGL WASM build | PASS, default artifact approximately 537 KiB |
| Warm example compile + link | Approximately 1.5 seconds; browser round trip 1.5–1.7 seconds |
| Native LVGL pixel comparison | Initial, DOWN and hidden-image states: 76,800 pixels each, zero differences |
| State/input smoke test | PASS, 1,000 input/tick cycles, memory stayed at 4 MiB |
| Browser editor | PASS, automatic text update, buttons, compile diagnostics and recovery |
| Device tests in this experiment | NOT RUN |

Native comparisons use the existing host fixture; reproduce it using Passport's
`tools/with-env.sh tools/preview-openswiftui.sh <output.png>` and then run:

```sh
node smoke.mjs
python3 compare-host.py ../../work/openswiftui-preview/frame.fps1
```

Results and native-matching PNGs are written to `build/`. The relative argument
above points to the usual FoloToy host build directory; another FPS1 base path is
also accepted. It expects adjacent `.down` and `.hidden` fixtures.

## Scope and next steps

A self-contained static export is available; see [Deployment](DEPLOYMENT.md). It includes the CodeMirror bundle and a precompiled interactive example. Source is read-only when no compiler endpoint is configured.

This establishes the fast edit/compile/preview route. The browser executes WASM;
Swift compilation still runs on the local computer. A fully static hosted editor
would need a browser-hosted compiler or a separate compile service.

Use only the Embedded APIs supported by the device: stacks, Color, literal Text,
registered `Image("spark")`, geometry/layout modifiers, root State and button
closures. Arbitrary asset uploads, full desktop SwiftUI, Foundation, SF Symbols,
child State identity and preview-to-device flashing are not implemented here.
The animation clock is connected, but a separate animated WASM fixture was not
part of this validation. Battery is a 73% host fixture. Browser memory and speed
are not measurements of the ESP32-C3.

`server.py` is a trusted local development tool bound to loopback, with Host and
Origin checks, a source-size bound, serialized builds and a compiler timeout.
Workers have a watchdog. These controls do not make arbitrary public compilation
safe: a public deployment needs disposable compiler containers, resource quotas
and a restricted build environment. The downloaded libraries are pinned and
checked against the official release asset SHA-256 values in `setup.py`.

Recommended next integration: extract this WASM build target into OSUI tooling,
add an editor mode beside the firmware emulator, then offer a separate full
firmware build-and-run action to check the same view in QEMU.

## Source versions and references

- Simulator: `250db1dda8baea21d112dba5226745e4d733226d`.
- OpenSwiftUI: `e35b91a31789c3c277e9a784b9f9b86e5eb708f5` (`embed/folotoy`).
- Passport: `80419bbda98e030afd742cdb9d11c8a8da4a5c42` (`main`).
- [Official Swift WASM / Embedded overview](https://www.swift.org/documentation/articles/wasm-getting-started.html).
- [Official WASI SDK 34 libraries](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-34).

The official Swift WASM SDK is another supported toolchain route. This proof uses
the already-installed compiler's bare Embedded target plus the pinned C libraries.
Source checkouts and their licenses are reused in place; no new distribution was published.
