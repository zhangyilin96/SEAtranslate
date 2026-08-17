# Dota Scout Native Overlay PoC

这是一个与 Electron 主程序完全独立的 Windows Overlay 测试工具。

技术链路：

`Win32 HWND → D3D11 device → DXGI flip-sequential composition swap chain → Direct2D/DirectWrite → DirectComposition visual`

窗口属性：Per-Monitor-V2 DPI aware、topmost、layered、no activate、click-through、tool window、no redirection bitmap。输入穿透使用 `WS_EX_LAYERED | WS_EX_TRANSPARENT`，并同时处理 `WM_NCHITTEST`、`WM_MOUSEACTIVATE`、`WM_SETCURSOR`；窗口类不注册光标，也不 capture mouse。透明度来自 DirectComposition 的 premultiplied-alpha swap chain，不使用 Dota 注入、Hook 或进程内存读取。

快捷键：

- `Ctrl+Shift+F9`：显示 / 隐藏 Overlay。
- `Ctrl+Shift+F10`：退出测试工具。
- `Ctrl+Shift+F11`：背景透明度降低 10%。
- `Ctrl+Shift+F12`：背景透明度提高 10%。

启动后默认显示 `DOTA SCOUT NATIVE TEST`，背景不透明度为 38%。可使用 `--opacity=0` 至 `--opacity=100` 覆盖初始值。日志写入 EXE 同目录的 `logs` 文件夹，包含 CPU/GPU、message、mouse move、render、Present 与 SetWindowPos 频率。渲染为事件驱动，静止时不持续重绘或 Present。修复后 Windowed、Borderless 的透明、穿透和体感性能保持 `WAITING_FOR_USER_RETEST`，必须由用户肉眼和实际操作确认。

构建使用 SharpDX 4.2.0（MIT，已停止维护）作为 DirectX COM 的托管绑定。五个运行库被作为资源嵌入单个 EXE，运行时不需要 Node.js、pnpm、Electron 或单独 DLL。
