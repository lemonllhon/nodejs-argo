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

### 直连模式（绕过 Cloudflare Tunnel）

如果 Cloudflare 边缘节点拦截 WebSocket，或希望节点直接连接 Docker 主机，可以设置 `DIRECT_MODE=true`。此模式使用 Nginx 接收 HTTPS，再把三个 WebSocket 路径转发给容器内的 Xray，同时保留根路径网页。

直连模式不需要 `ARGO_AUTH`、`CFIP` 或用户配置的 `ARGO_PORT`。请将 `ARGO_DOMAIN` 的 DNS A/AAAA 记录直接指向服务器公网 IP，并在 Docker 主机发布 80、443 端口；如果 DNS 仍然是 Cloudflare 橙云，流量仍会经过 Cloudflare。

证书有两种方式：

* 配置 `DIRECT_CERT_FILE` 和 `DIRECT_KEY_FILE`，挂载已有证书；
* 配置 `DIRECT_LETSENCRYPT_EMAIL`（默认 `admin@lemon.vin`），容器会通过 80 端口自动申请并每 12 小时检查续期。

如果希望直连模式自动维护 Cloudflare DNS，先设置 `CF_DNS_ENABLED=true`，再配置一个只允许目标 Zone 使用的 API Token。默认不会调用 Cloudflare DNS API：

* `CF_DNS_ENABLED`：是否启用 Cloudflare DNS 自动解析，默认 `false`；仅在 `DIRECT_MODE=true` 时生效；
* `CF_API_TOKEN`：Cloudflare API Token，权限建议为目标 Zone 的 `Zone Read` 和 `DNS Write`；
* `CF_DNS_ZONE_ID`：可选，填写后不需要自动推断 Zone；
* `CF_DNS_ZONE_NAME`：可选，复杂后缀域名可以显式填写，例如 `lemon.vin`；
* `CF_DNS_PUBLIC_IP`：可选，默认通过公网服务自动获取本机 IPv4；
* `CF_DNS_RECORD_NAME`：可选，默认使用 `ARGO_DOMAIN`；启用 `CF_DNS_ENABLED=true` 时必须与 `ARGO_DOMAIN` 一致；关闭时不生效；
* `CF_DNS_TTL`：可选，默认 120 秒；
* `CF_DNS_SYNC_INTERVAL_MS`：可选，默认 300000（5 分钟），公网 IP 变化后的检查间隔，最小 60000；
* `CF_DNS_REPLACE_CNAME`：可选，默认 `true`，直连切换时自动删除同名 Tunnel CNAME；设置为 `false` 可禁止。

同时启用 `DIRECT_MODE=true`、`CF_DNS_ENABLED=true` 并配置 `CF_API_TOKEN` 后，启动时会自动创建或更新 `ARGO_DOMAIN` 的 A 记录，并强制设置为 DNS-only（灰云），避免再次经过 Cloudflare WebSocket 边缘。Token 不会写入日志。

示例（自动申请 Let's Encrypt 证书）：

```bash
docker run -d --name lemon-node --restart unless-stopped \
  -p 80:80 -p 443:443 \
  -v /srv/lemon-node/letsencrypt:/etc/letsencrypt \
  -e DIRECT_MODE=true \
  -e ARGO_DOMAIN=justrunmy.lemon.vin \
  -e DIRECT_LETSENCRYPT_EMAIL=you@example.com \
  -e CF_DNS_ENABLED=true \
  -e CF_API_TOKEN=你的Cloudflare_DNS_API_Token \
  -e UUID=你的UUID \
  ghcr.io/lemonllhon/nodejs:latest
```

直连模式生成的 VLESS、VMess、Trojan 节点地址统一为 `ARGO_DOMAIN:DIRECT_PORT`，其中 `DIRECT_PORT` 默认是 443，`DIRECT_HTTP_PORT` 默认是 80。原有 Cloudflare Tunnel 模式保持不变。

#### 公网 80/443 可访问时自动申请证书

如果 Docker 主机拥有真正可入站的公网 IP，并且防火墙、云安全组和端口映射均已放行 TCP 80、443，可以使用直连模式自动申请和续期 Let's Encrypt 证书：

```bash
docker run -d --name lemon-node --restart unless-stopped \
  -p 80:80 -p 443:443 \
  -v /srv/lemon-node/letsencrypt:/etc/letsencrypt \
  -e DIRECT_MODE=true \
  -e ARGO_DOMAIN=node.example.com \
  -e DIRECT_LETSENCRYPT_EMAIL=admin@example.com \
  -e CF_DNS_ENABLED=false \
  -e UUID=你的UUID \
  ghcr.io/lemonllhon/nodejs:latest
```

使用前请确认：

* `ARGO_DOMAIN` 的 A/AAAA 记录已解析到该 Docker 主机的公网 IP；
* 外部访问 `http://ARGO_DOMAIN/.well-known/acme-challenge/` 可以到达容器的 80 端口；
* 443 端口未被其他服务占用；
* `DIRECT_LETSENCRYPT_EMAIL` 只是 Let's Encrypt 证书通知和续期邮箱，不是 Cloudflare 或 cloudflared 邮箱；
* 直连模式不需要 `ARGO_AUTH`、`ARGO_PORT`、`CFIP` 或 `CF_API_TOKEN`。

证书申请成功后，容器使用 Nginx 在 443 接收 HTTPS/WebSocket，并将三个协议路径转发给 Xray。证书会保存到 `/etc/letsencrypt`，建议保留挂载卷以便容器重建后继续使用；容器每 12 小时检查一次证书续期。

如果希望程序自动维护 Cloudflare DNS，将 DNS 记录切换为 DNS-only，可以改为：

```bash
-e CF_DNS_ENABLED=true \
-e CF_DNS_RECORD_NAME=node.example.com \
-e CF_API_TOKEN=你的Cloudflare_DNS_API_Token
```

此时 `CF_DNS_RECORD_NAME` 必须与 `ARGO_DOMAIN` 完全一致，API Token 只需要目标 Zone 的 `Zone Read` 和 `DNS Write` 权限。若主机处于 NAT、平台随机端口转发或无法从公网访问 80/443，请使用上面的平台代理模式，不要使用直连证书模式。

### 平台边缘代理模式（Railway 等平台）

如果部署平台可以提供 HTTPS 域名，并将域名的 443 请求转发到容器的非标准端口，可以设置 `PLATFORM_PROXY_MODE=true`。此模式复用 `ARGO_PORT` 作为容器唯一入口：Xray 在该端口接收普通 HTTP/WebSocket 请求，平台边缘负责公网 HTTPS、证书和转发，容器不会启动 Cloudflare Tunnel、Nginx 或 Certbot。

此模式下，`ARGO_DOMAIN` 应填写平台分配的域名或已经绑定到平台的自定义域名，平台的 Target Port 选择与 `ARGO_PORT` 相同的端口（例如 8001）。生成的节点仍然使用公网 `ARGO_DOMAIN:PLATFORM_PUBLIC_PORT`、TLS 和 WebSocket；TLS 只在平台边缘终止，容器内部不需要证书。`CF_API_TOKEN`、`CFIP`、`CFPORT`、`DIRECT_MODE` 和 `ARGO_AUTH` 在此模式下不需要配置。

示例（容器使用 8001，平台外部使用 HTTPS 443）：

```bash
docker run -d --name lemon-node --restart unless-stopped \
  -p 8001:8001 \
  -e PLATFORM_PROXY_MODE=true \
  -e ARGO_PORT=8001 \
  -e SERVER_PORT=3000 \
  -e PLATFORM_PUBLIC_PORT=443 \
  -e ARGO_DOMAIN=your-service.up.railway.app \
  -e UUID=你的UUID \
  ghcr.io/lemonllhon/nodejs:latest
```

平台代理模式环境变量（Cloudflare DNS 默认关闭）：

```json
{
  "PLATFORM_PROXY_MODE": "true",
  "CF_DNS_ENABLED": "false",
  "ARGO_PORT": "8001",
  "SERVER_PORT": "3000",
  "PLATFORM_PUBLIC_PORT": "443",
  "NAME": "<NAME>",
  "UUID": "<UUID>",
  "TEAMNODE_SYNC_SECRET": "<TEAMNODE_SYNC_SECRET>"
}
```

在 Railway 中可以不填写 `ARGO_DOMAIN`：程序会自动使用 Railway 提供的 `RAILWAY_PUBLIC_DOMAIN`。其他平台如果提供 `PLATFORM_PUBLIC_DOMAIN`、`BOXD_PUBLIC_DOMAIN` 或 `PUBLIC_DOMAIN`，程序也会自动使用；如果平台没有提供公网域名环境变量，则仍需填写 `ARGO_DOMAIN`。boxd 当前验证域名为 `lemonboxd.boxd.sh`。

在 Railway、boxd 等平台中，将平台 HTTPS Proxy 的 Target Port 指向 `ARGO_PORT`（例如 8001）。平台负责外部 HTTPS 443 和证书，容器不申请证书，也不启动 Cloudflare Tunnel。`CF_DNS_RECORD_NAME`、`CF_API_TOKEN`、`CFIP`、`CFPORT`、`ARGO_AUTH` 在 `CF_DNS_ENABLED=false` 的平台代理模式下无需配置。

如果使用自定义域名，需要先在平台完成域名绑定，再将该域名填写为 `ARGO_DOMAIN`。如果域名仍由 Cloudflare 托管，建议使用 DNS-only，避免再次经过 Cloudflare 的 WebSocket 边缘处理。

### Docker 镜像中的 cloudflared 自动更新

GitHub Actions 会在每日定时构建、推送代码变更或手动执行工作流时，读取 cloudflared 官方最新稳定版本并重新构建 `ghcr.io/lemonllhon/nodejs:latest`。容器运行期间，cloudflared 也会每 24 小时自动检查并更新自身；重新创建容器后则使用镜像内置的最新版本。Dockerfile 中的版本仅作为本地构建时的兜底值。cloudflared 自更新会重启 Tunnel，单连接可能产生短暂重连。

### 运行日志

Xray 和 cloudflared 的运行日志会写入 `FILE_PATH` 目录下的 `xray-access.log`、`xray-error.log` 和 `cloudflared.log`。可通过 `XRAY_LOG_LEVEL` 与 `CLOUDFLARED_LOG_LEVEL` 调整日志级别；容器启动时会清理运行目录中的历史文件。生产环境默认关闭 Xray access log，排障时再临时打开，避免每个连接产生额外磁盘 I/O。

### 性能优化建议

- VLESS、VMess、Trojan 目前都通过 WebSocket 入口工作；通常优先使用 VLESS，协议开销更低，其他两个保留用于客户端兼容性。
- WebSocket 节点默认关闭 Xray sniffing，因为本项目只需要按路径分流，不需要透明代理域名识别。若依赖域名路由或透明代理，再设置 `XRAY_SNIFFING_ENABLED=true`。
- 直连模式已提高 Nginx worker、连接数和长连接转发参数，并关闭代理缓冲，适合持续 WebSocket 流量。
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
| UUID | 否 | 89c13786-25aa-4520-b2e7-12cd60fb5202 | 用户UUID |
| ARGO_DOMAIN | 否 | - | Argo固定隧道域名 |
| ARGO_AUTH | 否 | - | Argo固定隧道密钥 |
| CFIP | 否 | www.cloudflare.com | 节点优选域名或IP |
| CFPORT | 否 | 443 | 节点端口 |
| XRAY_LOG_LEVEL | 否 | warning | Xray 错误日志级别 |
| XRAY_ACCESS_LOG_ENABLED | 否 | false | 是否写入 Xray access log；生产建议关闭，排障时开启 |
| XRAY_SNIFFING_ENABLED | 否 | false | 是否启用 WebSocket 流量嗅探；需要透明代理/域名路由时开启 |
| CLOUDFLARED_LOG_LEVEL | 否 | info | cloudflared 日志级别 |
| CLOUDFLARED_PROTOCOL | 否 | http2 | Tunnel 传输协议：`auto`、`http2` 或 `quic`；`quic` 建议先做 A/B 测试 |
| DIRECT_NGINX_ACCESS_LOG_ENABLED | 否 | false | 直连模式是否写入 Nginx access log；生产建议关闭，排障时开启 |
| DIRECT_MODE | 否 | false | 是否启用直连模式；启用后不启动 cloudflared |
| DIRECT_PORT | 否 | 443 | 直连 HTTPS 和节点端口 |
| DIRECT_HTTP_PORT | 否 | 80 | 直连 HTTP 端口，用于 ACME 验证和跳转 |
| DIRECT_CERT_FILE | 直连模式二选一 | - | 已有 TLS 证书路径，需与 `DIRECT_KEY_FILE` 同时配置 |
| DIRECT_KEY_FILE | 直连模式二选一 | - | 已有 TLS 私钥路径，需与 `DIRECT_CERT_FILE` 同时配置 |
| DIRECT_LETSENCRYPT_EMAIL | 直连模式二选一 | admin@lemon.vin | Let's Encrypt 邮箱；可覆盖默认值，与上面证书路径二选一 |
| PLATFORM_PROXY_MODE | 否 | false | 是否启用平台边缘代理模式；启用后复用 `ARGO_PORT`，不启动 cloudflared、Nginx 或 Certbot |
| PLATFORM_PUBLIC_DOMAIN | 平台代理模式可选 | 自动读取平台变量 | 平台公网域名覆盖值；也会自动读取 `RAILWAY_PUBLIC_DOMAIN`、`BOXD_PUBLIC_DOMAIN` 或 `PUBLIC_DOMAIN` |
| PLATFORM_PUBLIC_PORT | 平台代理模式可选 | 443 | 平台外部 HTTPS 端口，仅用于生成节点链接，容器入口仍使用 `ARGO_PORT` |
| CF_DNS_ENABLED | 否 | false | 是否启用直连模式 Cloudflare DNS 自动解析；默认不调用 Cloudflare DNS API |
| CF_API_TOKEN | 否 | - | 启用 `CF_DNS_ENABLED=true` 后使用的 Cloudflare DNS API Token，需 Zone Read + DNS Write |
| CF_DNS_ZONE_ID | 否 | 自动推断 | Cloudflare Zone ID |
| CF_DNS_ZONE_NAME | 否 | 自动推断 | Cloudflare Zone 名称，复杂域名后缀时填写 |
| CF_DNS_RECORD_NAME | 否 | ARGO_DOMAIN | 自动维护的 A 记录名称；启用 DNS 同步时必须与 `ARGO_DOMAIN` 一致，关闭时不生效 |
| CF_DNS_PUBLIC_IP | 否 | 自动获取 | 指定要写入 DNS 的公网 IPv4 |
| CF_DNS_TTL | 否 | 120 | DNS TTL 秒数，范围 1-86400 |
| CF_DNS_SYNC_INTERVAL_MS | 否 | 300000 | 自动解析检查间隔，最小 60000 毫秒 |
| CF_DNS_REPLACE_CNAME | 否 | true | 是否自动替换同名 Cloudflare Tunnel CNAME |
| NAME | 否 | Vls | 节点名称前缀 |
| FILE_PATH | 否 | ./tmp | 运行目录 |
| SUB_PATH | 否 | sub | 订阅路径 |
| TEAMNODE_SYNC_ENABLED | 否 | 自动推断 | 是否启用 TeamNode 同步；默认只要配置了 `TEAMNODE_SYNC_SECRET` 就会自动启用 |
| TEAMNODE_SYNC_BASE_URL | 否 | `https://teamnode.lemon.vin` | TeamNode 地址 |
| TEAMNODE_SYNC_KEY_ID | 否 | `nodejs-argo-prod` | TeamNode 内部同步 Key ID |
| TEAMNODE_SYNC_SECRET | 否 | - | TeamNode 内部同步签名密钥 |
| TEAMNODE_SYNC_GROUP_KEY | 否 | basic | TeamNode 节点分组 Key |
| TEAMNODE_SYNC_PROVIDER | 否 | 自动生成 | TeamNode 节点供应商标识，默认按国家/地区缩写自动生成，如 `us`、`sin` |
| TEAMNODE_SYNC_LABEL_PREFIX | 否 | 空 | TeamNode 节点标签前缀，默认直接使用国家名作为节点名称 |
| TEAMNODE_SYNC_TIMEOUT_MS | 否 | 10000 | TeamNode 同步请求超时 |
| TEAMNODE_SYNC_HEARTBEAT_INTERVAL_MS | 否 | 300000 | TeamNode 心跳间隔（毫秒） |
| TEAMNODE_SYNC_HEARTBEAT_INCLUDE_CONTENT | 否 | false | 是否在每次心跳中携带最新 `contentBase64`；无 Docker 安装器默认开启 |

## 🌐 订阅地址

- 标准端口：`https://your-domain.com/sub`
- 非标端口：`http://your-domain.com:port/sub`

## TeamNode 同步

配置 `TEAMNODE_SYNC_BASE_URL`、`TEAMNODE_SYNC_KEY_ID`、`TEAMNODE_SYNC_SECRET` 后，`nodejs-argo` 会在生成订阅后自动：

- 向 TeamNode 注册节点
- 定时向 TeamNode 发送心跳
- 在 `SIGINT / SIGTERM` 时 best-effort 发送下线通知
- 保持原有 `UPLOAD_URL` 逻辑兼容

如果你使用默认 TeamNode：

- `TEAMNODE_SYNC_BASE_URL=https://teamnode.lemon.vin`
- `TEAMNODE_SYNC_KEY_ID=nodejs-argo-prod`
- `TEAMNODE_SYNC_GROUP_KEY=basic`

那么部署时通常只需要配置：

```bash
TEAMNODE_SYNC_SECRET=你的签名密钥
```

注意：

- `TEAMNODE_SYNC_SECRET` 必须是专门给 `nodejs-argo` 使用的一组独立签名密钥
- 代码内不再内置默认签名密钥；未配置时不会自动同步到 TeamNode
- 默认节点名称会自动使用部署地国家名，例如 `美国`、`韩国`、`新加坡`
- 默认供应商会自动使用国家/地区缩写，例如 `us`、`kr`、`sin`

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
