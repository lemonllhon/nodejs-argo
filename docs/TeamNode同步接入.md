# TeamNode Worker 中继同步

## 1. 目标

Docker 版 `nodejs-argo` 不再直接访问 `teamnode.lemon.vin`，而是通过已经部署好的 Worker 完成注册、心跳和下线：

```text
nodejs-argo Docker → https://install.lemon.vin Worker → https://teamnode.lemon.vin
```

Docker 只持有兑换密码，Worker 才持有 `TEAMNODE_SYNC_SECRET`。这样外层 Docker 不需要保存 TeamNode 的上游签名密钥。

## 2. Worker 配置

在 `install.lemon.vin` 对应的 Worker 运行机密中配置：

- `TEAMNODE_SYNC_SECRET`：Worker 转发到 `teamnode.lemon.vin` 时使用；
- `TEAMNODE_SYNC_ENROLL_PASSWORD`：Docker 节点启动时用于兑换中继令牌。

这两个值只配置在 Worker，不要复制到 Docker 的环境变量中。Worker 提供以下接口：

- `POST /api/teamnode/redeem`：使用 `{ password, uuid }` 兑换中继令牌；
- `POST /api/internal/nodejs-argo/registrations`：注册节点；
- `POST /api/internal/nodejs-argo/heartbeats`：发送心跳；
- `POST /api/internal/nodejs-argo/offline`：发送下线通知；
- `POST /api/internal/nodejs-argo/public-route-probe`：由 Worker 从公网回访 Tunnel、直连或平台代理的当前域名和三种 WebSocket；
- `POST /api/internal/nodejs-argo/tunnel-test-commands`：领取面板“立即检测”指令；
- `POST /api/internal/nodejs-argo/tunnel-test-results`：回传立即检测结果。

## 3. Docker 环境变量

| 变量名 | 是否必须 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `TEAMNODE_SYNC_ENABLED` | 否 | 自动推断 | 配置兑换密码或中继令牌后自动启用 |
| `TEAMNODE_SYNC_BASE_URL` | 否 | `https://install.lemon.vin` | Worker 中继地址 |
| `TEAMNODE_SYNC_ENROLL_PASSWORD` | 使用密码兑换时必须 | - | Worker 上配置的兑换密码，只在兑换请求中使用，不写入日志 |
| `TEAMNODE_SYNC_RELAY_TOKEN` | 否 | - | 可选预置中继令牌；配置后跳过密码兑换 |
| `UUID` | 否 | 启动时随机生成 UUID v4 | 指定后用于 Xray、三种协议订阅和 Worker 注册/心跳 |
| `TEAMNODE_SYNC_GROUP_KEY` | 否 | `basic` | TeamNode 节点分组 Key |
| `TEAMNODE_SYNC_PROVIDER` | 否 | 自动生成 | 默认按地区缩写生成，如 `us`、`kr`、`sin` |
| `TEAMNODE_SYNC_LABEL_PREFIX` | 否 | 空 | 节点标签前缀 |
| `TEAMNODE_SYNC_TIMEOUT_MS` | 否 | `10000` | 单次 Worker 请求超时 |
| `TEAMNODE_SYNC_HEARTBEAT_INTERVAL_MS` | 否 | `120000` | 心跳间隔，默认 2 分钟，避免与 Worker 超时阈值发生竞态 |
| `TEAMNODE_SYNC_HEARTBEAT_INCLUDE_CONTENT` | 否 | `true` | 心跳是否携带最新 `contentBase64` |
| `TEAMNODE_SYNC_COMMAND_POLL_INTERVAL_MS` | 否 | `15000` | 轮询监控面板“立即检测”命令的间隔 |

推荐配置：

```bash
TEAMNODE_SYNC_BASE_URL=https://install.lemon.vin
TEAMNODE_SYNC_ENROLL_PASSWORD=Worker上配置的兑换密码
```

如果使用预置令牌，则改为：

```bash
TEAMNODE_SYNC_BASE_URL=https://install.lemon.vin
TEAMNODE_SYNC_RELAY_TOKEN=relay_v1_...
```

不要在 Docker 中设置 `TEAMNODE_SYNC_SECRET` 或旧的 `TEAMNODE_SYNC_KEY_ID`。

## 4. 上报数据

注册和心跳会携带：

- 节点 UUID、标签、`ARGO_DOMAIN`、供应商和分组；
- 三种协议生成的最新订阅内容（按 `TEAMNODE_SYNC_HEARTBEAT_INCLUDE_CONTENT` 控制心跳内容）；
- IP 地理信息中的国家/地区、供应商和节点时区；
- Docker 运行时信息：`platform`、`arch`、`osType`、`osRelease`、CPU 核数、内存；
- `deploymentType=docker`、实际心跳周期、`bootId`、运行状态和本地配置元数据；
- `tunnelConnectivity`：按当前路线标记 `mode=tunnel/direct/platform`。Tunnel 携带 cloudflared、协议和出站 7844；直连携带 IPv4/IPv6、公开端口和 HTTP/HTTPS；平台代理携带平台公网入口；三者都包含 Worker 公网 HTTP/WebSocket 回访结果和检查时间。

Worker 根据实际收到请求的 Cloudflare 信息补充：

- 来源 IP（`CF-Connecting-IP`）；
- Cloudflare 国家和接入 colo；
- Worker 记录的最后心跳时间。

节点时区优先使用 IP 地理信息返回的时区，未获取时才回退到容器的 `NODE_TIMEZONE` 或 Node.js 默认时区。中国与节点时间是否显示两行由面板根据时区差异判断。

## 5. 运行流程

1. Docker 启动 Node.js、Xray 和当前路线需要的 cloudflared、Nginx/Certbot 或平台入口，并生成 VLESS、VMess、Trojan 三种节点。
2. 首次同步前，使用兑换密码和当前 UUID 请求 Worker 兑换令牌；密码不会写入日志。
3. Docker 按当前模式检查 Tunnel 7844、直连 IPv4/IPv6 端口或平台公网入口，并请求 Worker 回访当前域名。
4. 使用 `x-teamnode-sync-relay-token` 请求 Worker 的注册接口，同时上报当前路线检测结果。
5. 注册成功后默认每 2 分钟重新检测并发送心跳；Worker 再转发到 `teamnode.lemon.vin`。
6. 每 15 秒领取面板“立即检测”指令，收到后立即复检并回传。
7. Worker 返回未注册时自动重新注册；返回 401 时密码模式会重新兑换一次令牌。
8. 进程收到 `SIGINT` 或 `SIGTERM` 时，尽力发送一次下线通知。

兑换令牌只保存在当前 Node.js 进程内。进程重启后，密码模式会重新兑换，因此不会依赖旧进程内存中的令牌。

未设置 `UUID` 时，每次 Node.js 进程启动会生成新的 UUID v4。若希望容器重启后仍显示为同一个节点，请显式设置并持久化 `UUID`。

## 6. 兼容性与范围

- 不影响 `UPLOAD_URL`、`/sub`、临时/固定 Tunnel、显式直连和平台代理；
- TeamNode Worker 不可用时，Xray、cloudflared 和订阅服务仍继续运行；
- Docker 镜像继续支持 `linux/amd64` 与 `linux/arm64` 多架构构建；
- 外层项目不再需要额外的 Agent、`start_lemon.py` 或 `nohup` 包裹进程。
