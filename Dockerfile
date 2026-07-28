FROM --platform=$BUILDPLATFORM alpine:3.20 AS downloader

ARG TARGETARCH
# The CI workflow resolves the latest stable release and passes it at build
# time. Keep a recent version here as a fallback for local docker builds.
ARG CLOUDFLARED_VERSION=2026.7.2
ARG XRAY_VERSION=v26.3.27

RUN apk add --no-cache curl unzip

RUN set -eux; \
    mkdir -p /out; \
    case "${TARGETARCH}" in \
      amd64) \
        CLOUDFLARED_ARCH='amd64'; \
        XRAY_ASSET='Xray-linux-64.zip'; \
        ;; \
      arm64) \
        CLOUDFLARED_ARCH='arm64'; \
        XRAY_ASSET='Xray-linux-arm64-v8a.zip'; \
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
    chmod 0755 /out/xray

FROM node:alpine3.20

WORKDIR /tmp

ENV BIN_PATH=/usr/local/bin

COPY --from=downloader /out/cloudflared /usr/local/bin/cloudflared
COPY --from=downloader /out/xray /usr/local/bin/xray

COPY . .

EXPOSE 80/tcp 443/tcp 3000/tcp 8001/tcp

RUN apk add --no-cache bash ca-certificates certbot coreutils curl gcompat iproute2 nginx openssl && \
    chmod +x index.js /usr/local/bin/cloudflared /usr/local/bin/xray && \
    npm install --omit=dev

CMD ["node", "index.js"]
