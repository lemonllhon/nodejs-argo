# TeamNode 同步接入

## 1. 目标

为 `nodejs-argo` 增加对 TeamNode 的签名同步能力，在容器启动并生成节点订阅后：

- 自动向 TeamNode 注册节点
- 定时向 TeamNode 发送心跳
- 保持旧 `UPLOAD_URL` 上传逻辑兼容
- 未配置 TeamNode 同步参数时，按原模式运行

## 2. 连接方式

`nodejs-argo` 通过公网 HTTPS 域名访问 TeamNode，例如：

- `https://teamnode.lemon.vin/api/internal/nodejs-argo/registrations`
- `https://teamnode.lemon.vin/api/internal/nodejs-argo/heartbeats`

这里的“内部同步”是指签名协议，不要求走内网。

## 3. 环境变量

| 变量名 | 是否必须 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `TEAMNODE_SYNC_ENABLED` | 否 | 自动推断 | 是否启用 TeamNode 同步；默认只要存在 `TEAMNODE_SYNC_SECRET` 就会自动启用 |
| `TEAMNODE_SYNC_BASE_URL` | 否 | `https://teamnode.lemon.vin` | TeamNode 基础地址 |
| `TEAMNODE_SYNC_KEY_ID` | 否 | `nodejs-argo-prod` | TeamNode 内部同步 Key ID |
| `TEAMNODE_SYNC_SECRET` | 否 | - | TeamNode 内部同步签名密钥 |
| `TEAMNODE_SYNC_TIMEOUT_MS` | 否 | `10000` | 单次请求超时 |
| `TEAMNODE_SYNC_HEARTBEAT_INTERVAL_MS` | 否 | `300000` | 心跳间隔，默认 5 分钟 |
| `TEAMNODE_SYNC_GROUP_KEY` | 否 | `argo-auto` | TeamNode 节点分组 Key |
| `TEAMNODE_SYNC_PROVIDER` | 否 | `nodejs-argo` | TeamNode 供应商标识 |
| `TEAMNODE_SYNC_LABEL_PREFIX` | 否 | `NAME` 或 `Argo` | TeamNode 节点标签前缀 |

## 4. 上报数据

注册时会上报：

- `groupKey`
- `label`
- `provider`
- `uuid`
- `argoDomain`
- `projectUrl`
- `subPath`
- `contentBase64`
- `countryCode`
- `countryName`
- `ispName`
- `bootId`
- `metadata`

心跳时会上报：

- `uuid`
- `argoDomain`
- `runtimeStatus`
- `projectUrl`
- `subPath`
- `countryCode`
- `countryName`
- `ispName`
- `bootId`
- `metadata`

## 5. 运行逻辑

1. `nodejs-argo` 启动并生成订阅
2. 若配置了 TeamNode 同步参数，则先发送注册请求
3. 注册成功后，启动定时心跳
4. 若注册失败，不影响原有服务继续运行，只记录日志
5. 若心跳返回“来源不存在”，下一个周期会自动重新注册

### 5.1 推荐的最简部署方式

由于当前项目是私有项目，且 TeamNode 域名固定为 `teamnode.lemon.vin`，代码内已经提供以下默认值：

- `TEAMNODE_SYNC_BASE_URL=https://teamnode.lemon.vin`
- `TEAMNODE_SYNC_KEY_ID=nodejs-argo-prod`
- `TEAMNODE_SYNC_GROUP_KEY=argo-auto`
- `TEAMNODE_SYNC_PROVIDER=nodejs-argo`
- `TEAMNODE_SYNC_TIMEOUT_MS=10000`
- `TEAMNODE_SYNC_HEARTBEAT_INTERVAL_MS=300000`

因此多数部署场景只需要配置：

```bash
TEAMNODE_SYNC_SECRET=你的签名密钥
```

如需覆盖默认行为，再单独传入对应环境变量即可。

## 6. 兼容性说明

- 不影响旧的 `UPLOAD_URL` 上传逻辑
- 不影响 `/sub` 输出
- 不影响 Cloudflare 临时隧道和固定隧道的生成逻辑
- 未配置 `TEAMNODE_SYNC_SECRET` 时，所有同步逻辑自动跳过

## 7. 当前范围

当前 `nodejs-argo` 侧仅实现：

- 签名注册
- 定时心跳
- 启动后自动接入

后续如需“主动下线通知”，需要在 TeamNode 侧先提供对应接口后再补充。
