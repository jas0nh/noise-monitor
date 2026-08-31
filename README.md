# Noise Monitor

独立的本地局域网环境声音监测服务。它不属于 Family Hub，也不依赖 Cloudflare。

## 访问

- Mac mini：<http://localhost:17302>
- 局域网：`http://Jasons-Mac-mini.local:17302`
- API：`GET /api/noise?range=24h|7d|30d`
- 健康检查：`GET /api/health`

## 数据与测量口径

- 每小时采样 60 秒，只保存 dBFS、峰值、最低窗口值和时间。
- 不保存录音、音频片段或转写。
- 未校准数据仅用于比较同一设备、同一位置的相对变化。
- 配置校准偏移后显示估算 dB SPL，但仍不是计量级声级计。
- SQLite 位于 `data/noise.sqlite`，永久保留每小时摘要。

## 安装本地服务

```bash
./scripts/install-launch-agents.sh
```

安装两个 LaunchAgent：

- `com.jason.noise-monitor.server`：常驻 LAN 网页服务。
- `com.jason.noise-monitor.sampler`：每小时整点运行一次采集器。

当前 Mac mini 没有可识别的音频输入时，网页仍可使用并显示“未检测到麦克风输入”。接入 USB、显示器或其他麦克风后，重新运行安装脚本并在 macOS 中批准麦克风权限。

## 校准与 Hermes 告警

默认关闭告警。完成可靠声级计对照后，在安装到 `~/Library/LaunchAgents` 的 sampler plist 中设置：

```xml
<key>NOISE_CALIBRATION_OFFSET</key><string>96.0</string>
<key>NOISE_ALERTS_ENABLED</key><string>1</string>
<key>NOISE_ALERT_THRESHOLD</key><string>65</string>
```

告警通过 `hermes send --to weixin --json` 发送，每六小时最多一次；只有 Hermes 返回成功和消息 ID 才记录为已送达。

## 开发与验证

```bash
npm test
npm run start
```

项目使用 Node 内置 HTTP 与 SQLite，无第三方运行依赖。
