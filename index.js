const express = require("express");
const app = express();
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const UPLOAD_URL = process.env.UPLOAD_URL || '';      // 节点或订阅自动上传地址,需填写部署Merge-sub项目后的首页地址,例如：https://merge.xxx.com
const PROJECT_URL = process.env.PROJECT_URL || '';    // 需要上传订阅或保活时需填写项目分配的url,例如：https://google.com
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; // false关闭自动保活，true开�?需同时填写PROJECT_URL变量
const FILE_PATH = process.env.FILE_PATH || '.tmp';   // 运行目录,sub节点文件保存目录
const SUB_PATH = process.env.SUB_PATH || 'sub';       // 订阅路径
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;        // http服务订阅端口
const UUID = process.env.UUID || '9afd1229-b893-40c1-84dd-51e7ce204913'; // 使用哪吒v1,在不同的平台运行需修改UUID,否则会覆�?
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';        // 哪吒v1填写形式: nz.abc.com:8008  哪吒v0填写形式：nz.abc.com
const NEZHA_PORT = process.env.NEZHA_PORT || '';            // 使用哪吒v1请留空，哪吒v0需填写
const NEZHA_KEY = process.env.NEZHA_KEY || '';              // 哪吒v1的NZ_CLIENT_SECRET或哪吒v0的agent密钥
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';          // 固定隧道域名,留空即启用临时隧�?
const ARGO_AUTH = process.env.ARGO_AUTH || '';              // 固定隧道密钥json或token,留空即启用临时隧�?json获取地址：https://json.zone.id
const ARGO_PORT = process.env.ARGO_PORT || 8001;            // 固定隧道端口,使用token需在cloudflare后台设置和这里一�?
const CFIP = process.env.CFIP || 'saas.sin.fan';            // 节点优选域名或优选ip  
const CFPORT = process.env.CFPORT || 443;                   // 节点优选域名或优选ip对应的端�?
const NAME = process.env.NAME || '';                        // 节点名称

// 创建运行文件�?
const BIN_PATH = process.env.BIN_PATH || '/usr/local/bin';  // Docker 鏋勫缓鏃跺唴缃殑浜屽埗鏂囦欢鐩綍
const XRAY_BIN = process.env.XRAY_BIN || path.join(BIN_PATH, 'xray');
const CLOUDFLARED_BIN = process.env.CLOUDFLARED_BIN || path.join(BIN_PATH, 'cloudflared');
const NEZHA_AGENT_BIN = process.env.NEZHA_AGENT_BIN || path.join(BIN_PATH, 'nezha-agent');
const NEZHA_AGENT_LEGACY_BIN = process.env.NEZHA_AGENT_LEGACY_BIN || path.join(BIN_PATH, 'nezha-agent-legacy');

if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

// 全局常量
const npmPath = NEZHA_AGENT_LEGACY_BIN;
const phpPath = NEZHA_AGENT_BIN;
const webPath = XRAY_BIN;
const botPath = CLOUDFLARED_BIN;
const npmName = path.basename(npmPath, path.extname(npmPath));
const webName = path.basename(webPath, path.extname(webPath));
const botName = path.basename(botPath, path.extname(botPath));
const phpName = path.basename(phpPath, path.extname(phpPath));
const subPath = path.join(FILE_PATH, 'sub.txt');
const listPath = path.join(FILE_PATH, 'list.txt');
const bootLogPath = path.join(FILE_PATH, 'boot.log');
const configPath = path.join(FILE_PATH, 'config.json');
const nezhaConfigPath = path.join(FILE_PATH, 'config.yaml');
const tunnelJsonPath = path.join(FILE_PATH, 'tunnel.json');
const tunnelYamlPath = path.join(FILE_PATH, 'tunnel.yml');

// 如果订阅器上存在历史运行节点则先删除
function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;

    let fileContent;
    try {
      fileContent = fs.readFileSync(subPath, 'utf-8');
    } catch {
      return null;
    }

    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => 
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line)
    );

    if (nodes.length === 0) return;

    axios.post(`${UPLOAD_URL}/api/delete-nodes`, 
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    ).catch((error) => { 
      return null; 
    });
    return null;
  } catch (err) {
    return null;
  }
}

// 清理历史文件
function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(FILE_PATH);
    files.forEach(file => {
      const filePath = path.join(FILE_PATH, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        // 忽略所有错误，不记录日�?
      }
    });
  } catch (err) {
    // 忽略所有错误，不记录日�?
  }
}

// 生成xr-ay配置文件
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [ { protocol: "freedom", tag: "direct" }, {protocol: "blackhole", tag: "block"} ]
  };
  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

// 检查镜像内置二进文�?
function ensureBinaryExists(binaryPath, label) {
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`${label} binary not found: ${binaryPath}`);
  }
}

// 下载对应系统架构的依赖文�?
function authorizeFiles(filePaths) {
  const newPermissions = 0o775;

  filePaths.forEach((absoluteFilePath) => {
    if (!fs.existsSync(absoluteFilePath) || process.platform === 'win32') {
      return;
    }

    fs.chmodSync(absoluteFilePath, newPermissions);
  });
}

function buildCloudflaredArgs() {
  if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
    return `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
  }

  if (ARGO_AUTH.match(/TunnelSecret/)) {
    return `tunnel --edge-ip-version auto --config "${tunnelYamlPath}" run`;
  }

  return `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile "${bootLogPath}" --loglevel info --url http://localhost:${ARGO_PORT}`;
}

async function startProcesses() {
  try {
    ensureBinaryExists(webPath, 'xray');
    ensureBinaryExists(botPath, 'cloudflared');
    authorizeFiles([webPath, botPath]);
  } catch (error) {
    console.error(`Binary check failed: ${error.message}`);
    throw error;
  }

  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      try {
        ensureBinaryExists(phpPath, 'nezha-agent');
        authorizeFiles([phpPath]);

        const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
        const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
        const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
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
        console.log(`${phpName} is running`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`php running error: ${error}`);
      }
    } else {
      try {
        ensureBinaryExists(npmPath, 'nezha-agent-legacy');
        authorizeFiles([npmPath]);

        let NEZHA_TLS = '';
        const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
        if (tlsPorts.includes(NEZHA_PORT)) {
          NEZHA_TLS = '--tls';
        }

        await exec(`nohup "${npmPath}" -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`);
        console.log(`${npmName} is running`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`npm running error: ${error}`);
      }
    }
  } else {
    console.log('NEZHA variable is empty,skip running');
  }

  try {
    await exec(`nohup "${webPath}" -c "${configPath}" >/dev/null 2>&1 &`);
    console.log(`${webName} is running`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`web running error: ${error}`);
  }

  try {
    const args = buildCloudflaredArgs();
    await exec(`nohup "${botPath}" ${args} >/dev/null 2>&1 &`);
    console.log(`${botName} is running`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error) {
    console.error(`Error executing command: ${error}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
}

function argoType() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) {
    console.log('ARGO_DOMAIN or ARGO_AUTH variable is empty, use quick tunnels');
    return;
  }

  if (ARGO_AUTH.includes('TunnelSecret')) {
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
    console.log('ARGO_AUTH mismatch TunnelSecret,use token connect to tunnel');
  }
}

async function extractDomains() {
  let argoDomain;

  if (ARGO_AUTH && ARGO_DOMAIN) {
    argoDomain = ARGO_DOMAIN;
    console.log('ARGO_DOMAIN:', argoDomain);
    await generateLinks(argoDomain);
  } else {
    try {
      const fileContent = fs.readFileSync(bootLogPath, 'utf-8');
      const lines = fileContent.split('\n');
      const argoDomains = [];
      lines.forEach((line) => {
        const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (domainMatch) {
          argoDomains.push(domainMatch[1]);
        }
      });

      if (argoDomains.length > 0) {
        argoDomain = argoDomains[0];
        console.log('ArgoDomain:', argoDomain);
        await generateLinks(argoDomain);
      } else {
        console.log('ArgoDomain not found, re-running bot to obtain ArgoDomain');
        fs.unlinkSync(bootLogPath);

        async function killBotProcess() {
          try {
            if (process.platform === 'win32') {
              await exec(`taskkill /f /im ${botName}.exe > nul 2>&1`);
            } else {
              await exec(`pkill -f "[${botName.charAt(0)}]${botName.substring(1)}" > /dev/null 2>&1`);
            }
          } catch (error) {
            return null;
          }
        }

        await killBotProcess();
        await new Promise((resolve) => setTimeout(resolve, 3000));

        try {
          const args = buildCloudflaredArgs();
          await exec(`nohup "${botPath}" ${args} >/dev/null 2>&1 &`);
          console.log(`${botName} is running`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await extractDomains();
        } catch (error) {
          console.error(`Error executing command: ${error}`);
        }
      }
    } catch (error) {
      console.error('Error reading boot.log:', error);
    }
  }
}

async function getMetaInfo() {
  try {
    const response1 = await axios.get('https://api.ip.sb/geoip', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 3000
    });

    if (response1.data && response1.data.country_code && response1.data.isp) {
      return `${response1.data.country_code}-${response1.data.isp}`.replace(/\s+/g, '_');
    }
  } catch (error) {
    try {
      const response2 = await axios.get('http://ip-api.com/json', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 3000
      });

      if (response2.data && response2.data.status === 'success' && response2.data.countryCode && response2.data.org) {
        return `${response2.data.countryCode}-${response2.data.org}`.replace(/\s+/g, '_');
      }
    } catch (backupError) {
      return 'Unknown';
    }
  }

  return 'Unknown';
}

async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;

  return new Promise((resolve) => {
    setTimeout(() => {
      const VMESS = {
        v: '2',
        ps: `${nodeName}`,
        add: CFIP,
        port: CFPORT,
        id: UUID,
        aid: '0',
        scy: 'auto',
        net: 'ws',
        type: 'none',
        host: argoDomain,
        path: '/vmess-argo?ed=2560',
        tls: 'tls',
        sni: argoDomain,
        alpn: '',
        fp: 'firefox'
      };

      const subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}

vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}

trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}
      `;

      console.log(Buffer.from(subTxt).toString('base64'));
      fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
      console.log(`${FILE_PATH}/sub.txt saved successfully`);
      uploadNodes();

      app.get(`/${SUB_PATH}`, (req, res) => {
        const encodedContent = Buffer.from(subTxt).toString('base64');
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(encodedContent);
      });

      resolve(subTxt);
    }, 2000);
  });
}

async function uploadNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    const subscriptionUrl = `${PROJECT_URL}/${SUB_PATH}`;
    const jsonData = {
      subscription: [subscriptionUrl]
    };

    try {
      const response = await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, jsonData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response && response.status === 200) {
        console.log('Subscription uploaded successfully');
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

    const content = fs.readFileSync(listPath, 'utf-8');
    const nodes = content.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));
    if (nodes.length === 0) return;

    const jsonData = JSON.stringify({ nodes });

    try {
      const response = await axios.post(`${UPLOAD_URL}/api/add-nodes`, jsonData, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response && response.status === 200) {
        console.log('Nodes uploaded successfully');
        return response;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  return null;
}

function cleanFiles() {
  setTimeout(() => {
    try {
      if (fs.existsSync(bootLogPath)) {
        fs.unlinkSync(bootLogPath);
      }
    } catch (error) {
      return null;
    }

    console.clear();
    console.log('App is running');
    console.log('Thank you for using this script, enjoy!');
  }, 90000);
}
cleanFiles();
async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) {
    console.log("Skipping adding automatic access task");
    return;
  }

  try {
    const response = await axios.post('https://oooo.serv00.net/add-url', {
      url: PROJECT_URL
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    // console.log(`${JSON.stringify(response.data)}`);
    console.log(`automatic access task added successfully`);
    return response;
  } catch (error) {
    console.error(`Add automatic access task faild: ${error.message}`);
    return null;
  }
}

// 主运行逻辑
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
    console.error('Error in startserver:', error);
  }
}
startserver().catch(error => {
  console.error('Unhandled error in startserver:', error);
});

// 根路�?
app.get("/", async function(req, res) {
  try {
    const filePath = path.join(__dirname, 'index.html');
    const data = await fs.promises.readFile(filePath, 'utf8');
    res.send(data);
  } catch (err) {
    res.send("Hello world!<br><br>You can access /{SUB_PATH}(Default: /sub) to get your nodes!");
  }
});

app.listen(PORT, () => console.log(`http server is running on port:${PORT}!`));


