<div align="center">
  <h2>
    <img src="https://cdn.nodeimage.com/i/NXz3ah3zTwikq3AdQOU0dYw3uyaBiGVj.webp" width="40" height="40" style="vertical-align: middle;"/> 
    nodejs-argo隧道代理
  </h2>
  nodejs-argo是一个强大的Argo隧道部署工具，专为PaaS平台和游戏玩具平台设计。它支持多种代理协议（VLESS、VMess、Trojan等）。

---

Telegram交流反馈群组：https://t.me/eooceu
</div>

## 郑重声明
* 本项目自2025年10月29日15时45分起,已更改开源协议,并包含以下特定要求
* 此项目仅限个人使用，禁止用于商业行为(包括但不限于：youtube,bilibili,tiktok,facebook..等等)
* 禁止新建项目将代码复制到自己仓库中用做商业行为
* 请遵守当地法律法规,禁止滥用做公共代理行为
* 如有违反以上条款者将追究法律责任

## 说明 （部署前请仔细阅读）

* 本项目是针对node环境的paas平台和游戏玩具而生，采用Argo隧道部署节点。
* node玩具平台只需上传index.js和package.json即可，paas平台需要docker部署的才上传Dockerfile。
* 不填写ARGO_DOMAIN和ARGO_AUTH两个变量即启用临时隧道，反之则使用固定隧道。

### Docker 路由模式

Docker 默认使用 **Cloudflare Tunnel 模式**，同时保留显式启用的直连模式、平台代理模式和直连 DNS 自动维护能力。三种路线不会自动互相切换：不设置 `DIRECT_MODE` 或 `PLATFORM_PROXY_MODE` 时才走 Tunnel。

固定 Tunnel 至少配置 `ARGO_AUTH`、`ARGO_DOMAIN` 和 `UUID`；`ARGO_PORT` 默认 `8001`，Cloudflare Tunnel 后台的 Service 应指向 `http://localhost:8001`。容器只需具备出站 TCP/UDP 7844 和访问 `install.lemon.vin:443` 的能力，不需要向公网开放入站 7844。

启用监控时，三种模式都会向 `install.lemon.vin` 注册、心跳和上报当前路线：

1. 每 2 分钟向 `install.lemon.vin` 注册或发送心跳；
2. Tunnel 上报 cloudflared、实际协议和 7844；直连按 IPv4/IPv6 回访公开端口；平台代理回访平台公网入口；
3. 请求 Worker 从公网回访当前域名的首页及 VLESS/VMess/Trojan WebSocket；
4. 每 15 秒领取一次面板“立即检测”指令并回传结果。

Tunnel 首次公网回访暂未完成时只显示“正在确认”，连续失败达到阈值后才标记异常，避免刚启动或短暂网络抖动造成误隔离。直连和平台代理则直接显示各自的公网回访结果。

#### 可选直连模式

设置 `DIRECT_MODE=true` 后使用 Nginx 在 `DIRECT_HTTP_PORT`/`DIRECT_PORT`（默认 80/443）接收流量，可挂载 `DIRECT_CERT_FILE`、`DIRECT_KEY_FILE`，或由 `DIRECT_LETSENCRYPT_EMAIL` 配合 Certbot 申请证书。启用 `CF_DNS_ENABLED=true` 时，可用 `CF_API_TOKEN` 自动维护 `ARGO_DOMAIN` 的 DNS-only A 记录。Nginx 会在系统具备 IPv6 时同时监听 IPv4/IPv6，Worker 会分别回访并上报可用地址族。

#### 可选平台代理模式

设置 `PLATFORM_PROXY_MODE=true` 后，平台负责公网 HTTPS 和证书，容器通过 `ARGO_PORT` 接收平台转发；`PLATFORM_PUBLIC_DOMAIN` 和 `PLATFORM_PUBLIC_PORT` 用于生成并验证公网路线。该模式不启动 cloudflared、Nginx 或 Certbot。

### Docker 镜像中的 cloudflared 自动更新

GitHub Actions 会在每日定时构建、推送代码变更或手动执行工作流时，读取 cloudflared 官方最新稳定版本并重新构建 `ghcr.io/lemonllhon/nodejs:latest`。容器运行期间，cloudflared 也会每 24 小时自动检查并更新自身；重新创建容器后则使用镜像内置的最新版本。Dockerfile 中的版本仅作为本地构建时的兜底值。cloudflared 自更新会重启 Tunnel，单连接可能产生短暂重连。

Docker 镜像继续由 Dockerfile 根据 `TARGETARCH` 安装对应的 cloudflared 和 Xray 二进制；GitHub Actions 同时构建并推送 `linux/amd64` 与 `linux/arm64` 镜像。

### 运行日志

Xray 和 cloudflared 的运行日志会写入 `FILE_PATH` 目录下的 `xray-access.log`、`xray-error.log` 和 `cloudflared.log`；由 Node.js 进程管理器捕获的标准输出和启动错误分别写入 `xray-process.log`、`cloudflared-process.log`，直连时 Nginx 日志写入 `nginx-process.log`。临时 Tunnel 的域名发现日志保留在 `boot.log`，不会在运行期间被定时删除。生产环境默认关闭 Xray access log，排障时再临时打开，避免每个连接产生额外磁盘 I/O。

### 进程托管与后台运行

当前 `index.js` 会直接托管 Xray 和 cloudflared 子进程：启动后检查三种协议端口 `3002/3003/3004`，子进程异常退出时自动重启，并在 Node.js 收到 `SIGTERM`/`SIGINT` 时先停止子进程、关闭网关再退出。相同 `FILE_PATH` 不能同时启动两个 Node.js 实例，运行锁保存在 `nodejs-argo.pid`。

因此不需要再使用 `start_lemon.py`、`nohup` 或 `pkill` 来包裹 Xray/cloudflared；这些方式会让子进程脱离 Node.js，容易产生孤儿进程、端口冲突和环境变量不一致。Node.js 主进程本身仍建议由 Docker `--restart unless-stopped`、systemd、PM2 或平台的进程管理功能负责开机启动。

可选的运行参数：

* `MANAGED_PROCESS_RESTART_DELAY_MS`：子进程退出后的重启等待时间，默认 `5000` 毫秒；
* `PROCESS_START_TIMEOUT_MS`：启动进程和检查协议端口的超时时间，默认 `15000` 毫秒；
* `TEMP_TUNNEL_DISCOVERY_TIMEOUT_MS`：每次等待临时 Tunnel 域名的时间，默认 `90000` 毫秒；
* `TEMP_TUNNEL_MAX_ATTEMPTS`：临时 Tunnel 域名发现失败后的最大重启次数，默认 `3`。

### 性能优化建议

- VLESS、VMess、Trojan 目前都通过 WebSocket 入口工作；通常优先使用 VLESS，协议开销更低，其他两个保留用于客户端兼容性。
- WebSocket 节点默认关闭 Xray sniffing，因为本项目只需要按路径分流，不需要透明代理域名识别。若依赖域名路由或透明代理，再设置 `XRAY_SNIFFING_ENABLED=true`。
- Tunnel 模式可用 `CLOUDFLARED_PROTOCOL=quic` 做 A/B 测试；默认仍为 `http2`，如果握手失败、丢包或吞吐下降就恢复 `http2`。协议选择受网络到 Cloudflare 边缘的路径影响，不保证 QUIC 一定更快。
- `ed=2560` 已用于生成的 WebSocket 节点链接，不建议盲目增大；更换 XHTTP、gRPC 或 REALITY 会改变客户端链接格式，应单独做兼容性测试。

这些调整主要减少容器内部的 CPU、日志 I/O 和代理缓冲开销。平台 HTTPS Proxy、Cloudflare Tunnel、跨境线路和平台限流仍可能是吞吐瓶颈，项目内参数不能绕过这些边缘限制。

## 📋 环境变量

| 变量名 | 是否必须 | 默认值 | 说明 |
|--------|----------|--------|------|
| UPLOAD_URL | 否 | - | 订阅上传地址 |
| PROJECT_URL | 否 | https://www.google.com | 项目分配的域名 |
| AUTO_ACCESS | 否 | false | 是否开启自动访问保活 |
| PORT | 否 | 3000 | HTTP服务监听端口 |
| ARGO_PORT | 否 | 8001 | Argo隧道端口 |
| UUID | 否 | 启动时随机生成 UUID v4 | 用户 UUID；指定后始终使用指定值 |
| ARGO_DOMAIN | 否 | - | Argo固定隧道域名 |
| ARGO_AUTH | 否 | - | Argo固定隧道密钥 |
| CFIP | 否 | www.cloudflare.com | 节点优选域名或IP |
| CFPORT | 否 | 443 | 节点端口 |
| XRAY_LOG_LEVEL | 否 | warning | Xray 错误日志级别 |
| XRAY_ACCESS_LOG_ENABLED | 否 | false | 是否写入 Xray access log；生产建议关闭，排障时开启 |
| XRAY_SNIFFING_ENABLED | 否 | false | 是否启用 WebSocket 流量嗅探；需要透明代理/域名路由时开启 |
| CLOUDFLARED_LOG_LEVEL | 否 | info | cloudflared 日志级别 |
| CLOUDFLARED_PROTOCOL | 否 | http2 | Tunnel 传输协议：`auto`、`http2` 或 `quic`；`quic` 建议先做 A/B 测试 |
| DIRECT_MODE | 否 | false | 显式启用直连；不会由 Tunnel 自动切换 |
| DIRECT_PORT | 否 | 443 | 直连 HTTPS 和节点端口 |
| DIRECT_HTTP_PORT | 否 | 80 | 直连 HTTP、ACME 验证和跳转端口 |
| DIRECT_CERT_FILE | 否 | - | 已有 TLS 证书路径，需与 `DIRECT_KEY_FILE` 同时设置 |
| DIRECT_KEY_FILE | 否 | - | 已有 TLS 私钥路径 |
| DIRECT_LETSENCRYPT_EMAIL | 否 | admin@lemon.vin | 未挂载证书时的 Let's Encrypt 邮箱 |
| DIRECT_NGINX_ACCESS_LOG_ENABLED | 否 | false | 是否记录直连 Nginx access log |
| PLATFORM_PROXY_MODE | 否 | false | 显式启用平台代理模式 |
| PLATFORM_PUBLIC_DOMAIN | 否 | 自动读取平台变量 | 平台公网域名 |
| PLATFORM_PUBLIC_PORT | 否 | 443 | 平台公网 HTTPS 端口 |
| CF_DNS_ENABLED | 否 | false | 直连时是否自动维护 Cloudflare DNS |
| CF_API_TOKEN | 否 | - | DNS API Token，建议仅授予目标 Zone Read/DNS Write |
| CF_DNS_ZONE_ID | 否 | 自动推断 | Cloudflare Zone ID |
| CF_DNS_ZONE_NAME | 否 | 自动推断 | Cloudflare Zone 名称 |
| CF_DNS_RECORD_NAME | 否 | ARGO_DOMAIN | 自动维护的 A 记录名称 |
| CF_DNS_PUBLIC_IP | 否 | 自动获取 | 指定直连公网 IPv4 |
| CF_DNS_TTL | 否 | 120 | DNS TTL 秒数 |
| CF_DNS_SYNC_INTERVAL_MS | 否 | 300000 | DNS 检查间隔（毫秒） |
| CF_DNS_REPLACE_CNAME | 否 | true | 是否替换同名 Tunnel CNAME |
| NAME | 否 | Vls | 节点名称前缀 |
| FILE_PATH | 否 | ./tmp | 运行目录 |
| SUB_PATH | 否 | sub | 订阅路径 |
| MANAGED_PROCESS_RESTART_DELAY_MS | 否 | 5000 | Xray/cloudflared 异常退出后的自动重启等待时间（毫秒） |
| PROCESS_START_TIMEOUT_MS | 否 | 15000 | 进程启动和协议端口检查超时时间（毫秒） |
| TEMP_TUNNEL_DISCOVERY_TIMEOUT_MS | 否 | 90000 | 每次等待临时 Tunnel 域名的时间（毫秒） |
| TEMP_TUNNEL_MAX_ATTEMPTS | 否 | 3 | 临时 Tunnel 域名发现失败后的最大尝试次数 |
| TEAMNODE_SYNC_ENABLED | 否 | 自动推断 | 是否启用 TeamNode 同步；默认配置 `TEAMNODE_SYNC_ENROLL_PASSWORD` 或 `TEAMNODE_SYNC_RELAY_TOKEN` 后自动启用 |
| TEAMNODE_SYNC_BASE_URL | 否 | `https://install.lemon.vin` | Worker 中继地址；程序会访问其兑换和内部中继接口 |
| TEAMNODE_SYNC_ENROLL_PASSWORD | 使用密码兑换时必须 | - | Worker 上配置的兑换密码；只用于启动时兑换中继令牌，不会写入日志或发送给 TeamNode |
| TEAMNODE_SYNC_RELAY_TOKEN | 否 | - | 可选的预置中继令牌；配置后跳过兑换密码，优先使用该令牌 |
| TEAMNODE_SYNC_GROUP_KEY | 否 | basic | TeamNode 节点分组 Key |
| TEAMNODE_SYNC_PROVIDER | 否 | 自动生成 | TeamNode 节点供应商标识，默认按国家/地区缩写自动生成，如 `us`、`sin` |
| TEAMNODE_SYNC_LABEL_PREFIX | 否 | 空 | TeamNode 节点标签前缀，默认直接使用国家名作为节点名称 |
| TEAMNODE_SYNC_TIMEOUT_MS | 否 | 10000 | TeamNode 同步请求超时 |
| TEAMNODE_SYNC_HEARTBEAT_INTERVAL_MS | 否 | 120000 | TeamNode 心跳间隔（毫秒）；应明显短于 Worker 超时阈值 |
| TEAMNODE_SYNC_HEARTBEAT_INCLUDE_CONTENT | 否 | true | 是否在每次心跳中携带最新 `contentBase64` |
| TEAMNODE_SYNC_COMMAND_POLL_INTERVAL_MS | 否 | 15000 | 轮询面板“立即检测”命令的间隔（毫秒，最小 5000） |

未设置 `UUID` 时，程序会在每次 Node.js 进程启动时生成一个新的 UUID v4，并将同一个值用于 Xray、三种协议订阅以及 Worker 注册/心跳。需要在容器重启后保持节点身份不变时，请显式设置 `UUID`，并持久化该环境变量。

## 🌐 订阅地址

- 标准端口：`https://your-domain.com/sub`

## TeamNode 同步

配置 `TEAMNODE_SYNC_ENROLL_PASSWORD` 后，`nodejs-argo` 会在生成订阅后自动：

- 向 `https://install.lemon.vin/api/teamnode/redeem` 发送密码和 UUID，兑换中继令牌；
- 通过 Worker 的 `/api/internal/nodejs-argo/registrations`、`/heartbeats` 和 `/offline` 接口注册、心跳和下线；
- 由 Worker 在服务端使用其机密转发到 `https://teamnode.lemon.vin`；Docker 容器不再保存或使用 `TEAMNODE_SYNC_SECRET`；
- 上报容器操作系统、架构、CPU 核数、内存和节点时区；Worker 同时记录来源 IP、Cloudflare 地区/colo 和 Worker 收到心跳的时间；
- 在 `SIGINT / SIGTERM` 时 best-effort 发送下线通知；
- 保持原有 `UPLOAD_URL` 逻辑兼容。

默认 Worker 地址为 `https://install.lemon.vin`，默认分组为 `basic`。部署时通常只需要增加：

```bash
TEAMNODE_SYNC_ENROLL_PASSWORD=Worker 上配置的兑换密码
```

也可以提前获得中继令牌后配置 `TEAMNODE_SYNC_RELAY_TOKEN`，这样会跳过兑换密码。每次 Docker 进程重启时，密码模式会重新兑换令牌；兑换失败不会阻止 Xray、cloudflared 和订阅服务启动，只会记录 TeamNode 同步错误。

注意：`TEAMNODE_SYNC_SECRET` 只应配置在 Worker 的运行机密中，不要再放入 Docker 环境变量。默认节点名称会自动使用部署地国家名，例如 `美国`、`韩国`、`新加坡`；默认供应商会自动使用国家/地区缩写，例如 `us`、`kr`、`sin`。

详细说明见：`docs/TeamNode同步接入.md`

---

## 🚀 进阶使用

### 安装

```bash
# 全局安装（推荐）
npm install -g nodejs-argo

# 或者使用yarn
yarn global add nodejs-argo

# 或者使用pnpm
pnpm add -g nodejs-argo
```

### 基本使用

```bash
# 直接运行（使用默认配置）
nodejs-argo

# 使用npx运行
npx nodejs-argo

# 设置环境变量运行
 PORT=3000 npx nodejs-argo
```

### 环境变量配置

可使用 `.env` 文件来配置环境变量运行


或者直接在命令行中设置：

```bash
export UPLOAD_URL="https://your-merge-sub-domain.com"
export PROJECT_URL="https://your-project-domain.com"
export PORT=3000
export UUID="your-uuid-here"
```

## 📦 作为npm模块使用

```javascript
// CommonJS
const nodejsArgo = require('nodejs-argo');

// ES6 Modules
import nodejsArgo from 'nodejs-argo';

// 启动服务
nodejsArgo.start();
```

## 🔧 后台运行

### 使用screen（推荐）
```bash
# 创建screen会话
screen -S argo

# 运行应用
nodejs-argo

# 按 Ctrl+A 然后按 D 分离会话
# 重新连接：screen -r argo
```

### 使用tmux
```bash
# 创建tmux会话
tmux new-session -d -s argo

# 运行应用
tmux send-keys -t argo "nodejs-argo" Enter

# 分离会话：tmux detach -s argo
# 重新连接：tmux attach -t argo
```

### 使用PM2
```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start nodejs-argo --name "argo-service"

# 管理应用
pm2 status
pm2 logs argo-service
pm2 restart argo-service
```

### 使用systemd（Linux系统服务）
```bash
# 创建服务文件
sudo nano /etc/systemd/system/nodejs-argo.service

```
[Unit]
Description=Node.js Argo Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/test
Environment=ARGO_PORT=8080
Environment=PORT=3000
ExecStart=/usr/bin/npx nodejs-argo
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

# 启动服务
sudo systemctl start nodejs-argo
sudo systemctl enable nodejs-argo
```

## 🔄 更新

```bash
# 更新全局安装的包
npm update -g nodejs-argo

# 或者重新安装
npm uninstall -g nodejs-argo
npm install -g nodejs-argo
```

## 📚 更多信息

- [GitHub仓库](https://github.com/eooce/nodejs-argo)
- [npm包页面](https://www.npmjs.com/package/nodejs-argo)
- [问题反馈](https://github.com/eooce/nodejs-argo/issues)

---

## 赞助
* 感谢[VPS.Town](https://vps.town)提供赞助 <a href="https://vps.town" target="_blank"><img src="https://vps.town/static/images/sponsor.png" width="30%" alt="https://vps.town"></a>

* 感谢[ZMTO](https://zmto.com/?affid=1548)提供赞助优质双isp vps。
