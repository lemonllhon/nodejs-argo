<div align="center">
  <h2>
    <img src="https://cdn.nodeimage.com/i/NXz3ah3zTwikq3AdQOU0dYw3uyaBiGVj.webp" width="40" height="40" style="vertical-align: middle;"/> 
    nodejs-argo隧道代理
  </h2>
  nodejs-argo是一个强大的Argo隧道部署工具，专为PaaS平台和游戏玩具平台设计。它支持多种代理协议（VLESS、VMess、Trojan等），并集成了哪吒探针功能。

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

* 本项目是针对node环境的paas平台和游戏玩具而生，采用Argo隧道部署节点，集成哪吒探针v0或v1可选。
* node玩具平台只需上传index.js和package.json即可，paas平台需要docker部署的才上传Dockerfile。
* 不填写ARGO_DOMAIN和ARGO_AUTH两个变量即启用临时隧道，反之则使用固定隧道。
* 哪吒v0/v1可选,当哪吒端口为{443,8443,2096,2087,2083,2053}其中之一时，自动开启tls。

### Docker 镜像中的 cloudflared 自动更新

GitHub Actions 会在每日定时构建、推送代码变更或手动执行工作流时，读取 cloudflared 官方最新稳定版本并重新构建 `ghcr.io/lemonllhon/nodejs:latest`。容器运行期间，cloudflared 也会每 24 小时自动检查并更新自身；重新创建容器后则使用镜像内置的最新版本。Dockerfile 中的版本仅作为本地构建时的兜底值。cloudflared 自更新会重启 Tunnel，单连接可能产生短暂重连。

## 📋 环境变量

| 变量名 | 是否必须 | 默认值 | 说明 |
|--------|----------|--------|------|
| UPLOAD_URL | 否 | - | 订阅上传地址 |
| PROJECT_URL | 否 | https://www.google.com | 项目分配的域名 |
| AUTO_ACCESS | 否 | false | 是否开启自动访问保活 |
| PORT | 否 | 3000 | HTTP服务监听端口 |
| ARGO_PORT | 否 | 8001 | Argo隧道端口 |
| UUID | 否 | 89c13786-25aa-4520-b2e7-12cd60fb5202 | 用户UUID |
| NEZHA_SERVER | 否 | - | 哪吒面板域名 |
| NEZHA_PORT | 否 | - | 哪吒端口 |
| NEZHA_KEY | 否 | - | 哪吒密钥 |
| ARGO_DOMAIN | 否 | - | Argo固定隧道域名 |
| ARGO_AUTH | 否 | - | Argo固定隧道密钥 |
| CFIP | 否 | www.visa.com.tw | 节点优选域名或IP |
| CFPORT | 否 | 443 | 节点端口 |
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
export NEZHA_SERVER="nz.your-domain.com:8008"
export NEZHA_KEY="your-nezha-key"
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
