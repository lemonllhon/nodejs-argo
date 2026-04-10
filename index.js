const express = require("express");
const app = express();
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const exec = promisify(require("child_process").exec);

const UPLOAD_URL = process.env.UPLOAD_URL || ""; // 节点或订阅自动上传地址，例如：https://merge.xxx.com
const PROJECT_URL = process.env.PROJECT_URL || ""; // 项目分配的访问地址，例如：https://google.com
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; // 是否开启自动保活，需要同时配置 PROJECT_URL
const FILE_PATH = process.env.FILE_PATH || ".tmp"; // 运行目录，也是订阅文件保存目录
const SUB_PATH = process.env.SUB_PATH || "sub"; // 订阅路径
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000; // HTTP 服务监听端口
const UUID = process.env.UUID || "9afd1229-b893-40c1-84dd-51e7ce204913"; // 用户 UUID
const NEZHA_SERVER = process.env.NEZHA_SERVER || ""; // 哪吒 v1 格式：nz.abc.com:8008；v0 格式：nz.abc.com
const NEZHA_PORT = process.env.NEZHA_PORT || ""; // 使用哪吒 v1 时留空，使用 v0 时填写
const NEZHA_KEY = process.env.NEZHA_KEY || ""; // 哪吒 v1 的 NZ_CLIENT_SECRET 或 v0 的 agent 密钥
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || ""; // 固定隧道域名，留空则启用临时隧道
const ARGO_AUTH = process.env.ARGO_AUTH || ""; // 固定隧道密钥 JSON 或 token，留空则启用临时隧道
const ARGO_PORT = process.env.ARGO_PORT || 8001; // 固定隧道端口，使用 token 时需和 Cloudflare 后台一致
const CFIP = process.env.CFIP || "cdst.lemon.vin"; // 节点优选域名或优选 IP
const CFPORT = process.env.CFPORT || 443; // 节点优选域名或优选 IP 对应端口
const NAME = process.env.NAME || ""; // 节点名称前缀
const TEAMNODE_SYNC_BASE_URL = process.env.TEAMNODE_SYNC_BASE_URL || "https://teamnode.lemon.vin";
const TEAMNODE_SYNC_KEY_ID = process.env.TEAMNODE_SYNC_KEY_ID || "nodejs-argo-prod";
const TEAMNODE_SYNC_SECRET = process.env.TEAMNODE_SYNC_SECRET || "";
const TEAMNODE_SYNC_GROUP_KEY = process.env.TEAMNODE_SYNC_GROUP_KEY || "basic";
const TEAMNODE_SYNC_PROVIDER = process.env.TEAMNODE_SYNC_PROVIDER || "";
const TEAMNODE_SYNC_LABEL_PREFIX = process.env.TEAMNODE_SYNC_LABEL_PREFIX || "";
const TEAMNODE_SYNC_TIMEOUT_MS = Number.parseInt(process.env.TEAMNODE_SYNC_TIMEOUT_MS || "10000", 10);
const TEAMNODE_SYNC_HEARTBEAT_INTERVAL_MS = Number.parseInt(process.env.TEAMNODE_SYNC_HEARTBEAT_INTERVAL_MS || "300000", 10);
const TEAMNODE_SYNC_SHUTDOWN_TIMEOUT_MS = 3000;

// Docker 镜像内置二进制目录
const BIN_PATH = process.env.BIN_PATH || "/usr/local/bin";
const XRAY_BIN = process.env.XRAY_BIN || path.join(BIN_PATH, "xray");
const CLOUDFLARED_BIN = process.env.CLOUDFLARED_BIN || path.join(BIN_PATH, "cloudflared");
const NEZHA_AGENT_BIN = process.env.NEZHA_AGENT_BIN || path.join(BIN_PATH, "nezha-agent");
const NEZHA_AGENT_LEGACY_BIN = process.env.NEZHA_AGENT_LEGACY_BIN || path.join(BIN_PATH, "nezha-agent-legacy");

if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
  console.log(`${FILE_PATH} 已创建`);
} else {
  console.log(`${FILE_PATH} 已存在`);
}

// 全局路径常量
const npmPath = NEZHA_AGENT_LEGACY_BIN;
const phpPath = NEZHA_AGENT_BIN;
const webPath = XRAY_BIN;
const botPath = CLOUDFLARED_BIN;
const npmName = path.basename(npmPath, path.extname(npmPath));
const webName = path.basename(webPath, path.extname(webPath));
const botName = path.basename(botPath, path.extname(botPath));
const phpName = path.basename(phpPath, path.extname(phpPath));
const subPath = path.join(FILE_PATH, "sub.txt");
const listPath = path.join(FILE_PATH, "list.txt");
const bootLogPath = path.join(FILE_PATH, "boot.log");
const configPath = path.join(FILE_PATH, "config.json");
const nezhaConfigPath = path.join(FILE_PATH, "config.yaml");
const tunnelJsonPath = path.join(FILE_PATH, "tunnel.json");
const tunnelYamlPath = path.join(FILE_PATH, "tunnel.yml");

let teamnodeSyncTimer = null;
let teamnodeSyncRegistered = false;
let teamnodeSyncContext = null;
let teamnodeShutdownPromise = null;
let processShutdownRequested = false;
let bootInstanceId = createRandomToken();
const PROVIDER_CODE_OVERRIDES = {
  SG: "sin"
};

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

const TEAMNODE_SYNC_ENABLED = parseBoolean(
  process.env.TEAMNODE_SYNC_ENABLED,
  Boolean(TEAMNODE_SYNC_SECRET)
);

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeRequestPath(value) {
  const raw = String(value || "/").trim() || "/";
  const withoutQuery = raw.split("?")[0] || "/";
  const collapsed = withoutQuery.replace(/\/{2,}/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }
  return collapsed || "/";
}

function sha256Hex(value = "") {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function createRandomToken() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

function createTeamNodeSyncHeaders({ method = "GET", path: requestPath = "/", rawBody = "", eventPrefix = "nodejs_argo" }) {
  const timestamp = Date.now().toString();
  const nonce = createRandomToken();
  const eventId = `${eventPrefix}_${createRandomToken().replace(/-/g, "")}`;
  const normalizedMethod = String(method || "GET").trim().toUpperCase();
  const normalizedPath = normalizeRequestPath(requestPath);
  const signaturePayload = [
    normalizedMethod,
    normalizedPath,
    sha256Hex(rawBody),
    timestamp,
    nonce,
    eventId
  ].join("\n");
  const signature = crypto
    .createHmac("sha256", String(TEAMNODE_SYNC_SECRET || ""))
    .update(signaturePayload, "utf8")
    .digest("hex");

  return {
    eventId,
    nonce,
    timestamp,
    signature,
    headers: {
      "x-sync-key-id": TEAMNODE_SYNC_KEY_ID,
      "x-sync-timestamp": timestamp,
      "x-sync-nonce": nonce,
      "x-event-id": eventId,
      "x-sync-signature": signature
    }
  };
}

function isTeamNodeSyncConfigured() {
  return Boolean(
    TEAMNODE_SYNC_ENABLED
    && normalizeBaseUrl(TEAMNODE_SYNC_BASE_URL)
    && TEAMNODE_SYNC_KEY_ID
    && TEAMNODE_SYNC_SECRET
  );
}

function normalizeCountryCode(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveCountryLabel(meta = {}) {
  const countryCode = normalizeCountryCode(meta.countryCode);
  if (countryCode && typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
    try {
      const displayNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });
      const localized = String(displayNames.of(countryCode) || "").trim();
      if (localized && localized.toLowerCase() !== countryCode.toLowerCase()) {
        return localized;
      }
    } catch {
      // Ignore locale lookup failures and fall back to API text.
    }
  }

  const countryName = String(meta.countryName || "").trim();
  if (countryName && !/^unknown$/i.test(countryName)) {
    return countryName;
  }

  return countryCode || "未知地区";
}

function resolveTeamNodeProvider(meta = {}) {
  const configured = String(TEAMNODE_SYNC_PROVIDER || "").trim().toLowerCase();
  if (configured) {
    return configured;
  }

  const countryCode = normalizeCountryCode(meta.countryCode);
  if (!countryCode || /^unknown$/i.test(countryCode)) {
    return "auto";
  }

  return String(PROVIDER_CODE_OVERRIDES[countryCode] || countryCode).trim().toLowerCase() || "auto";
}

function buildDefaultNodeName(meta = {}) {
  const nodeSuffix = String(resolveCountryLabel(meta) || meta.display || "Unknown").trim() || "Unknown";
  return NAME ? `${NAME}-${nodeSuffix}` : nodeSuffix;
}

function buildTeamNodeLabel(nodeName, argoDomain, meta = {}) {
  const prefix = String(TEAMNODE_SYNC_LABEL_PREFIX || "").trim();
  const suffix = String(nodeName || resolveCountryLabel(meta) || argoDomain || "node").trim();
  if (!prefix) {
    return suffix.slice(0, 128);
  }
  if (suffix.toLowerCase().startsWith(`${prefix.toLowerCase()}-`)) {
    return suffix.slice(0, 128);
  }
  return `${prefix}-${suffix}`.slice(0, 128);
}

async function postTeamNodeSync(relativePath, payload, eventPrefix) {
  const baseUrl = normalizeBaseUrl(TEAMNODE_SYNC_BASE_URL);
  if (!baseUrl) return null;

  const requestUrl = new URL(relativePath, `${baseUrl}/`);
  const rawBody = JSON.stringify(payload || {});
  const { headers } = createTeamNodeSyncHeaders({
    method: "POST",
    path: requestUrl.pathname,
    rawBody,
    eventPrefix
  });

  return axios.post(requestUrl.toString(), payload, {
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    timeout: Number.isFinite(TEAMNODE_SYNC_TIMEOUT_MS) && TEAMNODE_SYNC_TIMEOUT_MS > 0
      ? TEAMNODE_SYNC_TIMEOUT_MS
      : 10000
  });
}

function buildTeamNodePayload(context, { includeContent = true, runtimeStatus = "starting" } = {}) {
  if (!context || !context.argoDomain) return null;

  const payload = {
    groupKey: TEAMNODE_SYNC_GROUP_KEY,
    label: buildTeamNodeLabel(context.nodeName, context.argoDomain, context.meta),
    provider: resolveTeamNodeProvider(context.meta),
    uuid: UUID,
    argoDomain: context.argoDomain,
    projectUrl: PROJECT_URL || null,
    subPath: SUB_PATH || null,
    runtimeStatus,
    countryCode: context.meta?.countryCode || null,
    countryName: context.meta?.countryName || null,
    ispName: context.meta?.ispName || null,
    bootId: bootInstanceId,
    metadata: {
      cfip: CFIP,
      cfport: CFPORT,
      nodeName: context.nodeName || "",
      projectUrl: PROJECT_URL || "",
      subPath: SUB_PATH || ""
    }
  };

  if (includeContent) {
    payload.contentBase64 = context.contentBase64 || null;
  }

  return payload;
}

async function syncNodeRegistrationToTeamNode(context) {
  if (!isTeamNodeSyncConfigured() || !context) return null;
  const payload = buildTeamNodePayload(context, { includeContent: true, runtimeStatus: "starting" });
  if (!payload) return null;

  const response = await postTeamNodeSync("/api/internal/nodejs-argo/registrations", payload, "nodejs_argo_register");
  if (response && response.status === 200) {
    teamnodeSyncRegistered = true;
    console.log("TeamNode 注册成功");
    return response.data || null;
  }
  return null;
}

async function syncNodeHeartbeatToTeamNode(context) {
  if (!isTeamNodeSyncConfigured() || !context) return null;
  const payload = buildTeamNodePayload(context, { includeContent: false, runtimeStatus: "running" });
  if (!payload) return null;

  try {
    const response = await postTeamNodeSync("/api/internal/nodejs-argo/heartbeats", payload, "nodejs_argo_heartbeat");
    if (response && response.status === 200) {
      teamnodeSyncRegistered = true;
      console.log("TeamNode 心跳成功");
      return response.data || null;
    }
    return null;
  } catch (error) {
    if (error?.response?.status === 404) {
      teamnodeSyncRegistered = false;
      console.log("TeamNode 未找到来源节点，自动重新注册");
      return syncNodeRegistrationToTeamNode(context);
    }
    throw error;
  }
}

async function syncNodeOfflineToTeamNode(context, reason = "process_shutdown") {
  if (!isTeamNodeSyncConfigured() || !context || !teamnodeSyncRegistered) return null;

  const payload = {
    uuid: UUID,
    argoDomain: context.argoDomain,
    reason: String(reason || "process_shutdown").trim() || "process_shutdown"
  };

  if (!payload.argoDomain) return null;

  try {
    const response = await postTeamNodeSync("/api/internal/nodejs-argo/offline", payload, "nodejs_argo_offline");
    if (response && response.status === 200) {
      teamnodeSyncRegistered = false;
      console.log("TeamNode 下线通知成功");
      return response.data || null;
    }
    return null;
  } catch (error) {
    if (error?.response?.status === 404) {
      teamnodeSyncRegistered = false;
      console.log("TeamNode 未找到来源节点，跳过下线通知");
      return null;
    }
    throw error;
  }
}

async function syncNodeToTeamNode(context) {
  if (!isTeamNodeSyncConfigured()) {
    return null;
  }

  teamnodeSyncContext = context;

  try {
    return teamnodeSyncRegistered
      ? await syncNodeHeartbeatToTeamNode(context)
      : await syncNodeRegistrationToTeamNode(context);
  } catch (error) {
    const status = error?.response?.status ? ` (HTTP ${error.response.status})` : "";
    const message = error?.response?.data?.error || error?.message || "unknown_error";
    console.error(`TeamNode 同步失败${status}: ${message}`);
    return null;
  }
}

function stopTeamNodeHeartbeatLoop() {
  if (teamnodeSyncTimer) {
    clearInterval(teamnodeSyncTimer);
    teamnodeSyncTimer = null;
  }
}

function startTeamNodeHeartbeatLoop(context) {
  if (!isTeamNodeSyncConfigured() || !context) return;

  teamnodeSyncContext = context;
  stopTeamNodeHeartbeatLoop();

  const intervalMs = Number.isFinite(TEAMNODE_SYNC_HEARTBEAT_INTERVAL_MS) && TEAMNODE_SYNC_HEARTBEAT_INTERVAL_MS >= 30000
    ? TEAMNODE_SYNC_HEARTBEAT_INTERVAL_MS
    : 300000;

  teamnodeSyncTimer = setInterval(() => {
    if (!teamnodeSyncContext) return;
    syncNodeToTeamNode(teamnodeSyncContext).catch(() => null);
  }, intervalMs);
}

async function shutdownTeamNodeSync(reason = "process_shutdown") {
  if (teamnodeShutdownPromise) {
    return teamnodeShutdownPromise;
  }

  stopTeamNodeHeartbeatLoop();

  teamnodeShutdownPromise = (async () => {
    try {
      if (!teamnodeSyncContext || !teamnodeSyncRegistered || !isTeamNodeSyncConfigured()) {
        return null;
      }

      return await Promise.race([
        syncNodeOfflineToTeamNode(teamnodeSyncContext, reason),
        new Promise((resolve) => setTimeout(() => resolve(null), TEAMNODE_SYNC_SHUTDOWN_TIMEOUT_MS))
      ]);
    } catch (error) {
      const status = error?.response?.status ? ` (HTTP ${error.response.status})` : "";
      const message = error?.response?.data?.error || error?.message || "unknown_error";
      console.error(`TeamNode 下线通知失败${status}: ${message}`);
      return null;
    } finally {
      teamnodeSyncRegistered = false;
      teamnodeSyncContext = null;
    }
  })();

  return teamnodeShutdownPromise;
}

// 如果订阅器里存在历史节点，先删除旧节点
function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;

    let fileContent;
    try {
      fileContent = fs.readFileSync(subPath, "utf-8");
    } catch {
      return null;
    }

    const decoded = Buffer.from(fileContent, "base64").toString("utf-8");
    const nodes = decoded.split("\n").filter((line) => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));
    if (nodes.length === 0) return;

    axios.post(
      `${UPLOAD_URL}/api/delete-nodes`,
      JSON.stringify({ nodes }),
      { headers: { "Content-Type": "application/json" } }
    ).catch(() => null);

    return null;
  } catch {
    return null;
  }
}

// 清理运行目录里的历史文件
function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(FILE_PATH);
    files.forEach((file) => {
      const filePath = path.join(FILE_PATH, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // 忽略单个文件删除失败
      }
    });
  } catch {
    // 忽略目录读取失败
  }
}

// 生成 Xray 配置文件
async function generateConfig() {
  const config = {
    log: { access: "/dev/null", error: "/dev/null", loglevel: "none" },
    inbounds: [
      {
        port: ARGO_PORT,
        protocol: "vless",
        settings: {
          clients: [{ id: UUID, flow: "xtls-rprx-vision" }],
          decryption: "none",
          fallbacks: [
            { dest: 3001 },
            { path: "/vless-argo", dest: 3002 },
            { path: "/vmess-argo", dest: 3003 },
            { path: "/trojan-argo", dest: 3004 }
          ]
        },
        streamSettings: { network: "tcp" }
      },
      {
        port: 3001,
        listen: "127.0.0.1",
        protocol: "vless",
        settings: { clients: [{ id: UUID }], decryption: "none" },
        streamSettings: { network: "tcp", security: "none" }
      },
      {
        port: 3002,
        listen: "127.0.0.1",
        protocol: "vless",
        settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" },
        streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } },
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false }
      },
      {
        port: 3003,
        listen: "127.0.0.1",
        protocol: "vmess",
        settings: { clients: [{ id: UUID, alterId: 0 }] },
        streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } },
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false }
      },
      {
        port: 3004,
        listen: "127.0.0.1",
        protocol: "trojan",
        settings: { clients: [{ password: UUID }] },
        streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } },
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false }
      }
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [
      { protocol: "freedom", tag: "direct" },
      { protocol: "blackhole", tag: "block" }
    ]
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// 检查镜像内置二进制是否存在
function ensureBinaryExists(binaryPath, label) {
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`${label} 二进制不存在：${binaryPath}`);
  }
}

// 非 Windows 环境下为二进制增加执行权限
function authorizeFiles(filePaths) {
  const newPermissions = 0o775;

  filePaths.forEach((absoluteFilePath) => {
    if (!fs.existsSync(absoluteFilePath) || process.platform === "win32") {
      return;
    }

    fs.chmodSync(absoluteFilePath, newPermissions);
  });
}

// 根据认证方式生成 cloudflared 启动参数
function buildCloudflaredArgs() {
  if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
    return `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
  }

  if (ARGO_AUTH.match(/TunnelSecret/)) {
    return `tunnel --edge-ip-version auto --config "${tunnelYamlPath}" run`;
  }

  return `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile "${bootLogPath}" --loglevel info --url http://localhost:${ARGO_PORT}`;
}

// 启动镜像内置的哪吒、Xray、cloudflared
async function startProcesses() {
  try {
    ensureBinaryExists(webPath, "xray");
    ensureBinaryExists(botPath, "cloudflared");
    authorizeFiles([webPath, botPath]);
  } catch (error) {
    console.error(`二进制检查失败：${error.message}`);
    throw error;
  }

  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      try {
        ensureBinaryExists(phpPath, "nezha-agent");
        authorizeFiles([phpPath]);

        const port = NEZHA_SERVER.includes(":") ? NEZHA_SERVER.split(":").pop() : "";
        const tlsPorts = new Set(["443", "8443", "2096", "2087", "2083", "2053"]);
        const nezhatls = tlsPorts.has(port) ? "true" : "false";
        const configYaml = `
client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: true
ip_report_period: 1800
report_delay: 4
server: ${NEZHA_SERVER}
skip_connection_count: true
skip_procs_count: true
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;

        fs.writeFileSync(nezhaConfigPath, configYaml);
        await exec(`nohup "${phpPath}" -c "${nezhaConfigPath}" >/dev/null 2>&1 &`);
        console.log(`${phpName} 已启动`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`哪吒 v1 启动失败：${error}`);
      }
    } else {
      try {
        ensureBinaryExists(npmPath, "nezha-agent-legacy");
        authorizeFiles([npmPath]);

        let NEZHA_TLS = "";
        const tlsPorts = ["443", "8443", "2096", "2087", "2083", "2053"];
        if (tlsPorts.includes(NEZHA_PORT)) {
          NEZHA_TLS = "--tls";
        }

        await exec(`nohup "${npmPath}" -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`);
        console.log(`${npmName} 已启动`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`哪吒 v0 启动失败：${error}`);
      }
    }
  } else {
    console.log("未配置哪吒参数，跳过启动");
  }

  try {
    await exec(`nohup "${webPath}" -c "${configPath}" >/dev/null 2>&1 &`);
    console.log(`${webName} 已启动`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`Xray 启动失败：${error}`);
  }

  try {
    const args = buildCloudflaredArgs();
    await exec(`nohup "${botPath}" ${args} >/dev/null 2>&1 &`);
    console.log(`${botName} 已启动`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error) {
    console.error(`cloudflared 启动失败：${error}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
}

// 生成固定隧道配置文件
function argoType() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) {
    console.log("ARGO_DOMAIN 或 ARGO_AUTH 为空，将使用临时隧道");
    return;
  }

  if (ARGO_AUTH.includes("TunnelSecret")) {
    fs.writeFileSync(tunnelJsonPath, ARGO_AUTH);
    const tunnelYaml = `
  tunnel: ${ARGO_AUTH.split('"')[11]}
  credentials-file: ${tunnelJsonPath}
  protocol: http2
  
  ingress:
    - hostname: ${ARGO_DOMAIN}
      service: http://localhost:${ARGO_PORT}
      originRequest:
        noTLSVerify: true
    - service: http_status:404
  `;
    fs.writeFileSync(tunnelYamlPath, tunnelYaml);
  } else {
    console.log("ARGO_AUTH 不是 TunnelSecret JSON，将使用 token 方式连接隧道");
  }
}

// 从日志中提取临时隧道域名
async function extractDomains() {
  let argoDomain;

  if (ARGO_AUTH && ARGO_DOMAIN) {
    argoDomain = ARGO_DOMAIN;
    console.log("ARGO_DOMAIN:", argoDomain);
    await generateLinks(argoDomain);
    return;
  }

  try {
    const fileContent = fs.readFileSync(bootLogPath, "utf-8");
    const lines = fileContent.split("\n");
    const argoDomains = [];

    lines.forEach((line) => {
      const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
      if (domainMatch) {
        argoDomains.push(domainMatch[1]);
      }
    });

    if (argoDomains.length > 0) {
      argoDomain = argoDomains[0];
      console.log("ArgoDomain:", argoDomain);
      await generateLinks(argoDomain);
      return;
    }

    console.log("未找到 ArgoDomain，重新启动 cloudflared 获取域名");
    fs.unlinkSync(bootLogPath);

    async function killBotProcess() {
      try {
        if (process.platform === "win32") {
          await exec(`taskkill /f /im ${botName}.exe > nul 2>&1`);
        } else {
          await exec(`pkill -f "[${botName.charAt(0)}]${botName.substring(1)}" > /dev/null 2>&1`);
        }
      } catch {
        return null;
      }
      return null;
    }

    await killBotProcess();
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      const args = buildCloudflaredArgs();
      await exec(`nohup "${botPath}" ${args} >/dev/null 2>&1 &`);
      console.log(`${botName} 已重新启动`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await extractDomains();
    } catch (error) {
      console.error(`重新启动 cloudflared 失败：${error}`);
    }
  } catch (error) {
    console.error("读取 boot.log 失败:", error);
  }
}

// 获取当前机器的 ISP 信息，用于节点命名
async function getMetaInfo() {
  try {
    const response1 = await axios.get("https://api.ip.sb/geoip", {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 3000
    });

    if (response1.data && response1.data.country_code && response1.data.isp) {
      return {
        countryCode: String(response1.data.country_code || "").trim() || "Unknown",
        countryName: String(response1.data.country || "").trim() || null,
        ispName: String(response1.data.isp || "").trim() || "Unknown",
        display: `${response1.data.country_code}-${response1.data.isp}`.replace(/\s+/g, "_")
      };
    }
  } catch {
    try {
      const response2 = await axios.get("http://ip-api.com/json", {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 3000
      });

      if (response2.data && response2.data.status === "success" && response2.data.countryCode && response2.data.org) {
        return {
          countryCode: String(response2.data.countryCode || "").trim() || "Unknown",
          countryName: String(response2.data.country || "").trim() || null,
          ispName: String(response2.data.org || "").trim() || "Unknown",
          display: `${response2.data.countryCode}-${response2.data.org}`.replace(/\s+/g, "_")
        };
      }
    } catch {
      return {
        countryCode: "Unknown",
        countryName: null,
        ispName: "Unknown",
        display: "Unknown"
      };
    }
  }

  return {
    countryCode: "Unknown",
    countryName: null,
    ispName: "Unknown",
    display: "Unknown"
  };
}

// 生成 list 和 sub 订阅内容
async function generateLinks(argoDomain) {
  const metaInfo = await getMetaInfo();
  const nodeName = buildDefaultNodeName(metaInfo);

  return new Promise((resolve) => {
    setTimeout(() => {
      const VMESS = {
        v: "2",
        ps: `${nodeName}`,
        add: CFIP,
        port: CFPORT,
        id: UUID,
        aid: "0",
        scy: "auto",
        net: "ws",
        type: "none",
        host: argoDomain,
        path: "/vmess-argo?ed=2560",
        tls: "tls",
        sni: argoDomain,
        alpn: "",
        fp: "firefox"
      };

      const subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}

vmess://${Buffer.from(JSON.stringify(VMESS)).toString("base64")}

trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}
      `;

      const contentBase64 = Buffer.from(subTxt).toString("base64");
      console.log(contentBase64);
      fs.writeFileSync(subPath, contentBase64);
      console.log(`${FILE_PATH}/sub.txt 保存成功`);
      uploadNodes();
      syncNodeToTeamNode({
        argoDomain,
        nodeName,
        meta: metaInfo,
        contentBase64
      }).finally(() => {
        startTeamNodeHeartbeatLoop({
          argoDomain,
          nodeName,
          meta: metaInfo,
          contentBase64
        });
      });

      app.get(`/${SUB_PATH}`, (req, res) => {
        res.set("Content-Type", "text/plain; charset=utf-8");
        res.send(contentBase64);
      });

      resolve(subTxt);
    }, 2000);
  });
}

// 自动上传节点或订阅
async function uploadNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    const subscriptionUrl = `${PROJECT_URL}/${SUB_PATH}`;
    const jsonData = {
      subscription: [subscriptionUrl]
    };

    try {
      const response = await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, jsonData, {
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (response && response.status === 200) {
        console.log("订阅上传成功");
        return response;
      }

      return null;
    } catch (error) {
      if (error.response && error.response.status === 400) {
        return null;
      }
    }
  } else if (UPLOAD_URL) {
    if (!fs.existsSync(listPath)) return;

    const content = fs.readFileSync(listPath, "utf-8");
    const nodes = content.split("\n").filter((line) => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));
    if (nodes.length === 0) return;

    const jsonData = JSON.stringify({ nodes });

    try {
      const response = await axios.post(`${UPLOAD_URL}/api/add-nodes`, jsonData, {
        headers: { "Content-Type": "application/json" }
      });

      if (response && response.status === 200) {
        console.log("节点上传成功");
        return response;
      }

      return null;
    } catch {
      return null;
    }
  }

  return null;
}

// 延迟清理临时日志文件
function cleanFiles() {
  setTimeout(() => {
    try {
      if (fs.existsSync(bootLogPath)) {
        fs.unlinkSync(bootLogPath);
      }
    } catch {
      return null;
    }

    console.clear();
    console.log("应用已运行");
    console.log("感谢使用，祝你使用愉快！");
    return null;
  }, 90000);
}
cleanFiles();

// 自动添加项目保活任务
async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) {
    console.log("跳过自动保活任务");
    return;
  }

  try {
    const response = await axios.post(
      "https://oooo.serv00.net/add-url",
      { url: PROJECT_URL },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    console.log("自动保活任务添加成功");
    return response;
  } catch (error) {
    console.error(`自动保活任务添加失败：${error.message}`);
    return null;
  }
}

// 主启动流程
async function startserver() {
  try {
    deleteNodes();
    cleanupOldFiles();
    argoType();
    await generateConfig();
    await startProcesses();
    await extractDomains();
    await AddVisitTask();
  } catch (error) {
    console.error("startserver 执行失败:", error);
  }
}

function handleProcessShutdownSignal(signal) {
  if (processShutdownRequested) {
    return;
  }

  processShutdownRequested = true;
  shutdownTeamNodeSync(`signal_${String(signal || "shutdown").toLowerCase()}`)
    .catch(() => null)
    .finally(() => {
      process.exit(0);
    });
}

process.on("SIGINT", () => {
  handleProcessShutdownSignal("SIGINT");
});

process.on("SIGTERM", () => {
  handleProcessShutdownSignal("SIGTERM");
});

if (require.main === module) {
  startserver().catch((error) => {
    console.error("startserver 未捕获异常:", error);
  });
}

module.exports = {
  createTeamNodeSyncHeaders,
  resolveCountryLabel,
  resolveTeamNodeProvider,
  buildDefaultNodeName,
  buildTeamNodePayload,
  syncNodeToTeamNode,
  syncNodeRegistrationToTeamNode,
  syncNodeHeartbeatToTeamNode,
  syncNodeOfflineToTeamNode,
  shutdownTeamNodeSync,
  startTeamNodeHeartbeatLoop,
  stopTeamNodeHeartbeatLoop,
  getMetaInfo
};

// 根路由
app.get("/", async function(req, res) {
  try {
    const filePath = path.join(__dirname, "index.html");
    const data = await fs.promises.readFile(filePath, "utf8");
    res.send(data);
  } catch {
    res.send("Hello world!<br><br>You can access /{SUB_PATH}(Default: /sub) to get your nodes!");
  }
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`HTTP 服务已运行，端口：${PORT}`));
}
