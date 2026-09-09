简体中文 · [English](DEPLOYMENT.md)

# OpenSwiftUI Playground 在线部署

GH Pages 可以托管前端，浏览器可以运行预编译的 WASM。Pages 是
[静态托管服务](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)，
不能运行 `swiftc` 或 Python 编译服务。

| 方案 | 查看并操作示例 | 任意编辑 ContentView 后编译 | 需要作者电脑在线 |
| --- | --- | --- | --- |
| Pages 静态导出 | 可以 | 不支持，源码只读 | 不需要 |
| Pages + 远端编译 API | 可以 | 部署兼容 API 后支持 | 不需要 |
| 当前本地服务 | 可以 | 可以 | 需要 |

## 静态导出

先按 [README](README.zh_CN.md) 准备构建，在 `playground/` 执行：

```sh
python3 export_static.py --output ../dist/playground
node smoke.mjs
node verify-static.mjs ../dist/playground
```

输出目录需要为空。导出会重编译默认 Swift 示例和编辑器，并打包 HTML、CSS、JS、
WASM、对应 Swift 源码、SHA-256、第三方许可和 `.nojekyll`，同时生成相邻 ZIP。
访问者不需要 Python、Node.js、Swift 或编译服务。编辑器和运行依赖都随包提供，
不依赖 CDN。

可将目录内容作为 GitHub Pages Actions artifact 发布，或放入单独 `gh-pages`
分支，在仓库 Settings → Pages 选择该分支的根目录。需要目标仓库写权限。
本地导出不会执行 workflow、push 或修改 Pages 配置。

所有资源、Worker、配置和 WASM 都使用相对路径，兼容站点根目录及
`/FoloToy-Passport-Simulator/` 这样的项目路径。在仓库根目录模拟测试：

```sh
python3 -m http.server 4192 --bind 127.0.0.1 --directory dist
```

打开 `http://127.0.0.1:4192/playground/`。该服务器仅提供静态文件。
源码带高亮且只读，UP/DOWN/OK 仍可操作示例；Restart example 重建 WASM 实例。
页面会校验 WASM 及显示源码的 SHA-256。

QEMU 模拟器是另一套应用。本导出不包含它的 Node 网络/社区后端，也不会显示
指向 localhost 的模拟器链接。

## 完整在线编辑

可以把前端配置为调用独立部署的 HTTPS 编译服务：

```sh
python3 export_static.py --output ../dist/online-editor \
  --compile-endpoint https://your-compiler.example/compile
```

这只配置前端，不会创建或保护远端服务。本次没有部署或测试远端编译 API。
页面会显示代码将发送到哪个主机，编辑后的首次构建成功前保持预编译示例。

API 约定：

- `POST` JSON `{"source":"import OpenSwiftUI\n..."}`，Content-Type 为 application/json。
- 成功返回 HTTP 200 和 application/wasm，包含当前的
  `preview_init/button/tick/framebuffer/revision` 导出并兼容现有 WASI shim。
- 错误返回非 2xx 状态及 JSON `{"error":"编译诊断"}`。
- CORS 允许准确的 Pages origin、POST/OPTIONS 和 JSON Content-Type。
- 服务使用匹配版本的 OSUI/Passport，预构建 LVGL 等依赖，每次只重编译用户的 View。

公网服务需要一次性非特权编译容器、CPU/内存/时间配额、请求大小与并发限制、限流
和合适的访问控制。不要把本地可信开发用的 `server.py` 直接暴露到公网，也不要把
凭据放进前端配置。可以按源码、工具链和依赖的 hash 缓存结果。GitHub Actions
适合发布预编译示例，其任务队列不适合作为低延迟编辑编译循环。

## 为什么不能直接把当前编译器放进 Pages

[官方 Swift WASM SDK](https://www.swift.org/documentation/articles/wasm-getting-started.html)
是在原生主机上交叉编译应用，并不包含运行在浏览器里的 Swift 编译器。
OSUI 编译为 WASM 与把 `swiftc` 自身编译为 WASM 是两项工作。

[MiniSwift](https://forums.swift.org/t/miniswift-swift-compiler-that-runs-in-the-browser-via-webassembly/85808)
是用 C 独立实现的编译器，兼容性目标不同。作者明确说明尚未完整兼容 Swift；
公开的前端也未提供这里使用的 Swift Embedded module/link 流程。本次未验证它能
构建 OSUI，不能将其当成直接替代方案。官方编译器完全运行在浏览器仍需单独研究。

## 本次验证

- 已在浏览器确认 Swift 高亮；编辑后成功编译并上屏，Reset example 恢复原始 View。
- 仅用静态文件服务器，在非根路径运行导出包；未配置编译 API，源码只读。
- 导出包校验通过，初始、DOWN、隐藏图片三帧与已有原生 LVGL fixture 一致。
- 基线 State/按键测试包含 1,000 次输入/刷新。
- 实际 GitHub Pages 部署及远端编译服务：尚未执行。
