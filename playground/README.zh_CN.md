简体中文 · [English](README.md)

# OpenSwiftUI Passport WASM Playground

2026-09-09 验证的本地 Playground，编辑器包含 Swift 高亮、行号、折叠、撤销/重做、缩进和括号匹配：在网页中修改 `ContentView.swift`，查看真实
OpenSwiftUI Embedded + Passport LVGL 绘制结果。

| 地址 | 执行路径 |
| --- | --- |
| <http://127.0.0.1:4191/> | 编辑 Swift → 本机 Swift 编译器 → WASM → LVGL → Canvas |
| <http://127.0.0.1:4190/?play=223> | 已发布 2048 的 RISC-V 固件 → QEMU WASM → 模拟显示器 |

第二条路径使用仓库已有的 [FoloToy Passport Simulator](https://github.com/VOID001/FoloToy-Passport-Simulator)，
已通过社区入口加载并启动项目 223。它运行固件，本身没有 Swift 编辑器或编译器。
第一条路径是独立的快速预览原型，编译现有 Embedded 子集，并非完整默认 OSUI Package。

## 启动

需要 Swift 6.3.1 RELEASE（含 Embedded wasm32 库、clang、wasm-ld）、Python 3.9+、
CMake、Ninja 和 Node.js 20+。当前验证环境为 macOS arm64。
默认编译器是 `~/Library/Developer/Toolchains/swift-6.3.1-RELEASE.xctoolchain/usr/bin/swiftc`，
可以用 `SWIFTC` 覆盖。

目录结构：

```text
FoloToy/
  ai-passport/                   # 已解析 managed_components/lvgl__lvgl
  framework/OpenSwiftUI/         # embed/folotoy
  toolchains/                   # 校验过的 WASI C 库
  FoloToy-Passport-Simulator/playground/
```

先按 Passport 文档配置开发环境，确保其固定版本的 LVGL 依赖已解析。构建直接读取
两个源码仓库，不需要其他 framework 仓库。可用 `PASSPORT_SOURCE_DIR`、
`OPENSWIFTUI_SOURCE_DIR`、`WASI_SYSROOT` 和 `WASI_BUILTINS` 覆盖默认路径。

在本目录执行：

```sh
npm ci
npm run build:editor
python3 setup.py
python3 build.py --prepare
node smoke.mjs
python3 server.py
```

打开 <http://127.0.0.1:4191/>。自动预览在停止输入 650 毫秒后编译；Build & Run
立即编译。编译错误会保留上一帧并展示诊断。Reset example 恢复设备上的原始
ContentView。每次成功重编译创建新 Worker 并重置 State，普通按键操作保留 State。
网页编辑内容仅保留在当前页面，不会写回源码仓库。

要运行整机模拟器，在 `../../FoloToy-Passport-Simulator` 执行
`npm run prepare:emulator` 和 `npm start`，打开表中的 4190 地址。

## 复用内容

- OSUI `Embedded/sources.txt` 的 39 个文件，生成独立 Swift module 和 WASM object，
  无需修改 OSUI 源码。
- 初始 `ContentView.swift` 与 Passport 原文件一致。
- 直接复用 `PassportSceneSink.swift`、`openswiftui_scene.c`、`ui_pixel.c`、
  `ui_pixel_math.c`、`spark_rgb565.h`、LVGL 源码及 host 配置。
- `RootGeometry` 为 240 × 320，demo inset 为上 66、左 12、下 30、右 12。
- `PreviewHost.swift` 保持 `EmbeddedViewHost`、分发按键、驱动动画时钟；
  `preview.c` 提供显示刷新和 framebuffer。
- JS 仅将 RGB565 转成 RGBA；布局、字体测量、图片和绘制均由 Swift 与 LVGL 执行。

这一实现确实链接 LVGL，因此继续使用 `OPENSWIFTUI_LVGL && hasFeature(Embedded)`。
Swift 目标为 `wasm32-unknown-none-wasm`，C 使用 WASI sysroot；`wasi.js` 提供
实际导入的六个时钟、随机数和标准输出函数，不向运行中的 WASM 提供文件或网络 API。

## 验证结果

| 项目 | 结果 |
| --- | --- |
| 模拟器资源 / 测试 | PASS，board ABI v1 / 57 个测试 |
| QEMU 中已发布的 2048 | PASS，已看到游戏启动，未作长时间游玩测试 |
| OSUI + Passport + LVGL WASM 构建 | PASS，默认产物 约 537 KiB |
| 缓存依赖后的编译 + 链接 | 约 1.5 秒；网页往返约 1.5–1.7 秒 |
| 与原生 LVGL host 像素比较 | 初始、DOWN、隐藏图片三帧，每帧 76,800 像素，差异均为 0 |
| State / 按键测试 | PASS，1,000 次输入/刷新，内存维持 4 MiB |
| 网页编辑器 | PASS，文字自动更新、按键、错误提示及恢复 |
| 本次实机测试 | NOT RUN |

像素比较使用已有的原生 host fixture。可按 Passport 的
`tools/with-env.sh tools/preview-openswiftui.sh <output.png>` 重新生成，再执行：

```sh
node smoke.mjs
python3 compare-host.py ../../work/openswiftui-preview/frame.fps1
```

可传入其他 FPS1 基础路径，需要对应 `.down`、`.hidden` 文件。
结果及 PNG 写入 `build/`。

## 范围与后续方向

已提供独立静态导出，详见[部署说明](DEPLOYMENT.zh_CN.md)。导出包含 CodeMirror 和预编译的可交互示例；没有编译服务时源码只读。

已验证快速编辑、编译、预览路径。浏览器运行 WASM，Swift 编译仍在本机。
纯静态托管的编辑器需要浏览器内 Swift 编译器，或独立编译服务。

使用设备 Embedded profile 已支持的 API：Stack、Color、字面量 Text、注册的
`Image("spark")`、几何/布局修饰器、根 State 和按键 closure。任意资源上传、
完整桌面 SwiftUI、Foundation、SF Symbols、子 View 的 State identity，以及从预览
直接烧录设备均未实现。已接入动画时钟，但本轮没有单独的动画 WASM fixture 验证。
电量固定为 73% 的 host fixture，网页内存和速度不代表 ESP32-C3。

`server.py` 仅供可信本机开发，绑定 loopback，包含 Host/Origin 校验、源码大小限制、
串行编译和超时；Worker 带看门狗。这些并不构成公网任意代码编译的隔离方案。
公开部署需要一次性编译容器、资源配额及受限构建环境。`setup.py` 将官方 WASI
库固定到 SDK 34，并按官方 release asset SHA-256 校验。

建议下一步把 WASM target 提取到 OSUI 构建工具，再给模拟器加入编辑模式，
并单独提供完整固件编译/运行入口，用 QEMU 检查同一份 View。

## 源码版本与参考

- Simulator：`250db1dda8baea21d112dba5226745e4d733226d`。
- OpenSwiftUI：`e35b91a31789c3c277e9a784b9f9b86e5eb708f5`，`embed/folotoy`。
- Passport：`80419bbda98e030afd742cdb9d11c8a8da4a5c42`，`main`。
- [Swift 官方 WASM / Embedded 说明](https://www.swift.org/documentation/articles/wasm-getting-started.html)。
- [WASI SDK 34 官方库](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-34)。

官方 Swift WASM SDK 也是可用的工具链路线。本原型使用已安装编译器的 bare Embedded
目标及固定的 C 库。源码及其许可证在原路径复用，本次没有发布新的分发包。
