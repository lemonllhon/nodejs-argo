FROM --platform=$BUILDPLATFORM alpine:3.20 AS downloader

ARG TARGETARCH
ARG CLOUDFLARED_VERSION=2026.2.1
ARG XRAY_VERSION=v26.3.27
ARG NEZHA_AGENT_VERSION=v2.1.2

RUN apk add --no-cache curl unzip

RUN set -eux; \
    mkdir -p /out; \
    case "${TARGETARCH}" in \
      amd64) \
        CLOUDFLARED_ARCH='amd64'; \
        XRAY_ASSET='Xray-linux-64.zip'; \
        NEZHA_ASSET='nezha-agent_linux_amd64.zip'; \
        NEZHA_FALLBACK=''; \
        ;; \
      arm64) \
        CLOUDFLARED_ARCH='arm64'; \
        XRAY_ASSET='Xray-linux-arm64-v8a.zip'; \
        NEZHA_ASSET='nezha-agent_linux_arm64.zip'; \
        NEZHA_FALLBACK='nezha-agent_linux_arm.zip'; \
        ;; \
      *) \
        echo "Unsupported TARGETARCH: ${TARGETARCH}"; \
        exit 1; \
        ;; \
    esac; \
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${CLOUDFLARED_ARCH}" -o /out/cloudflared; \
    chmod 0755 /out/cloudflared; \
    curl -fsSL "https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/${XRAY_ASSET}" -o /tmp/xray.zip; \
    unzip -j /tmp/xray.zip xray -d /out; \
    chmod 0755 /out/xray; \
    if [ -n "${NEZHA_FALLBACK}" ]; then \
      curl -fsSL "https://github.com/nezhahq/agent/releases/download/${NEZHA_AGENT_VERSION}/${NEZHA_ASSET}" -o /tmp/nezha-agent.zip || \
      curl -fsSL "https://github.com/nezhahq/agent/releases/download/${NEZHA_AGENT_VERSION}/${NEZHA_FALLBACK}" -o /tmp/nezha-agent.zip; \
    else \
      curl -fsSL "https://github.com/nezhahq/agent/releases/download/${NEZHA_AGENT_VERSION}/${NEZHA_ASSET}" -o /tmp/nezha-agent.zip; \
    fi; \
    unzip -j /tmp/nezha-agent.zip nezha-agent -d /out; \
    chmod 0755 /out/nezha-agent; \
    cp /out/nezha-agent /out/nezha-agent-legacy

FROM node:alpine3.20

WORKDIR /tmp

ENV BIN_PATH=/usr/local/bin

COPY --from=downloader /out/cloudflared /usr/local/bin/cloudflared
COPY --from=downloader /out/xray /usr/local/bin/xray
COPY --from=downloader /out/nezha-agent /usr/local/bin/nezha-agent
COPY --from=downloader /out/nezha-agent-legacy /usr/local/bin/nezha-agent-legacy

COPY . .

EXPOSE 3000/tcp

RUN apk add --no-cache bash ca-certificates coreutils curl gcompat iproute2 openssl && \
    chmod +x index.js /usr/local/bin/cloudflared /usr/local/bin/xray /usr/local/bin/nezha-agent /usr/local/bin/nezha-agent-legacy && \
    npm install --omit=dev

CMD ["node", "index.js"]
