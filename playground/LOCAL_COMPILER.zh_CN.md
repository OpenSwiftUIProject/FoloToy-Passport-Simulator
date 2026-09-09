简体中文 · [English](LOCAL_COMPILER.md)

# 连接自己的 Swift 编译器

在线 Playground 可以把 Swift 源码发送给运行在**访问者自己电脑**上的编译器，
返回的 WASM 在浏览器中执行。网站作者不必托管编译服务，也不需要保持电脑在线。
不安装任何东西也能操作随页面打包的示例。

## 启动

使用包含 `playground/start-compiler.sh` 的模拟器源码 checkout。
需要 [Swift 6.3.1 RELEASE](https://www.swift.org/install/)（含 Embedded wasm32 库
与 LLVM 工具）、Python 3.9+、Git、CMake、Ninja、Node.js 20+ 和 npm。
macOS 可用 `brew install cmake ninja node` 安装这些构建工具。
已验证 macOS arm64；Linux 和 Windows/WSL 尚未验证。
脚本不会自动安装或替换系统 Swift 工具链。

在模拟器仓库根目录执行：

```sh
# 完全本地的编辑器：
./playground/start-compiler.sh

# 或者允许指定网站调用自己的编译器：
./playground/start-compiler.sh --allow-origin https://YOUR-ACCOUNT.github.io
```

使用网页启动提示中显示的 **origin**，即协议、主机名和可选端口，不带项目路径。
例如 `https://you.github.io/simulator/` 应填写 `https://you.github.io`。
同一个主机上的所有页面共享 origin，只允许你信任的网站使用本地编译器。
多次传入 `--allow-origin` 可以允许多个 origin。测试本仓库的静态导出：

```sh
./playground/start-compiler.sh --allow-origin http://127.0.0.1:4192
```

脚本会把固定版本的源码下载到 `playground/build/local-compiler/`，下载并校验
WASI SDK 34 C 库到仓库旁的 `toolchains/`，安装锁定版本的编辑器依赖，并预构建
共享 Swift/LVGL 对象。首次启动需要联网，耗时较长；后续复用源码与构建缓存。
不需要 ESP-IDF、OAG 仓库、设备连接或烧录；不会修改旁边已有的源码仓库。

macOS 优先使用
`~/Library/Developer/Toolchains/swift-6.3.1-RELEASE.xctoolchain/usr/bin/swiftc`，
否则检查 PATH 上的 swiftc。可显式覆盖：

```sh
SWIFTC=/path/to/swift-6.3.1/usr/bin/swiftc ./playground/start-compiler.sh \
  --allow-origin https://YOUR-ACCOUNT.github.io
```

保持终端运行，服务监听 `127.0.0.1:4191`，Ctrl-C 停止。
端口被占用时传 `--port 4201`，同时修改网页中的编译器 URL。
终端还会打印本地编辑器地址，作为浏览器不支持跨域访问本机时的替代入口。

## 网页连接

1. 打开在线 Playground，预编译示例直接运行，不会自动访问本机编译器。
2. Compiler URL 默认 `http://127.0.0.1:4191/compile`，点击 **Connect**。
3. 浏览器询问本地/回环网络访问权限时允许该网站。
4. 连接成功后可编辑 `ContentView.swift`。Auto preview 在停止输入 650 毫秒后编译；
   **Build & Run** 立即编译。每次成功构建会重置预览中的 State。

连接会先检查 `GET /health`，成功后才启用编辑。页面记住上次连接成功的 URL，
也可以在链接里预填地址：

```text
https://YOUR-ACCOUNT.github.io/simulator/?compiler=http%3A%2F%2F127.0.0.1%3A4191%2Fcompile
```

链接参数和记忆地址**不会自动连接**；点击 Connect 后才发送源码。
也支持 `http://localhost:4191` 这样的服务根地址，会补为 `/compile`。
远端地址必须使用 HTTPS，只有 localhost 和 127.0.0.1 接受 HTTP。
Disconnect 停止后续编译，保留当前可交互预览。
编辑内容保留在当前标签页，断开重连也保留，但不会保存回源码仓库；刷新页面会丢弃修改。

## 连接问题

- **拒绝连接**：启动脚本，确认终端显示的端口。
- **Origin/CORS 错误**：用准确的网页 origin 重新传入 `--allow-origin`。
  localhost、127.0.0.1 和不同端口都视为不同 origin。
- **浏览器阻止访问本机**：在网站设置中允许本地/回环网络访问。支持的浏览器会对
  HTTPS 网页访问本机增加权限检查；浏览器和内嵌 WebView 的行为可能不同，参见
  [浏览器说明](https://developer.chrome.com/blog/local-network-access)。
  如果仍不支持，直接打开 `http://127.0.0.1:4191/` 使用本地编辑器。
  不要关闭浏览器安全设置，也不要通过公共隧道暴露本地服务。
- **服务不匹配**：`/health` 应返回 openswiftui-passport-compiler 和协议版本 1。
- **编译失败**：编辑器下方显示诊断，保留最后成功的预览。
- **缓存源码被修改**：脚本拒绝覆盖它，可指定新 `--cache-dir /path/to/cache`，
  或在开发时显式使用源码路径覆盖。

## 开发说明

固定依赖：

| 依赖 | Revision |
| --- | --- |
| OpenSwiftUI | `e35b91a31789c3c277e9a784b9f9b86e5eb708f5` |
| AI Passport | `80419bbda98e030afd742cdb9d11c8a8da4a5c42` |
| LVGL 9.5.0 | `85aa60d18b3d5e5588d7b247abf90198f07c8a63` |

`--prepare-only` 只准备环境，`--cache-dir` 指定源码与对象缓存。
`PASSPORT_SOURCE_DIR`、`OPENSWIFTUI_SOURCE_DIR`、`LVGL_SOURCE_DIR` 可显式使用已有
源码目录；脚本不修改这些目录，也不校验其 revision。`WASI_SYSROOT`、`WASI_BUILTINS`
可以覆盖 C 库，调用者负责确认兼容性。

API 接受最多 64 KiB JSON，每次只编译一个请求，超时 30 秒。
Host 校验阻止主机名重新绑定，CORS 仅允许明确指定的 origin 和本地编辑器。
编译器以当前用户身份运行，供可信开发使用，不是隔离的公网编译服务。
提交的程序不会在本机原生执行；输出在浏览器中作为 WASM 运行，使用已有的受限 WASI shim。

静态发布见 [DEPLOYMENT.md](DEPLOYMENT.zh_CN.md)。导出页面已经包含编译器连接控件，
不需要作者部署远端编译服务。

## 验证

macOS arm64 已验证：在新缓存中下载三个固定版本的源码仓库，成功构建预览，再用
缓存启动服务。编译 API 的准确 origin CORS 和源码 hash 校验通过；三帧与已有
原生 LVGL fixture 相同，1,000 次 State/按键更新的 WASM 内存稳定。网页已验证
跨域编辑、URL 预填、服务未启动提示、编译错误及恢复、断开后继续操作预览。
HTTP 访问测试 6 项通过，根目录 Node 测试 59 项通过。尚未在公网 HTTPS Pages
上验证各浏览器的回环访问权限，也未验证 Linux/WSL；本次未涉及实机。
