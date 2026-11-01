# syntax=docker/dockerfile:1
# Sample web app: static Vite build + PhpEditor WebSocket + devsense-php-ls on ONE port ($PORT, default 8080).
# The devsense-php-ls linux-x64 build is glibc-linked, so use a Debian (glibc) base, not Alpine (musl).
# The licence is NOT part of the image: pass DEVSENSE_PHP_LS_LICENSE at runtime (platform secret).

FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json ./
COPY packages ./packages
# No lockfile is committed. The library's `prepare` script builds it during install.
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund
RUN npx -w packages/devsense-php-editor-sampleweb vite build \
 && rm -f packages/devsense-php-editor-sampleweb/dist/php-editor-port \
 && node -e "const p=require('./node_modules/devsense-php-ls/package.json'),w=require('./node_modules/ws/package.json');require('fs').writeFileSync('/runtime-deps.json',JSON.stringify({name:'sampleweb-runtime',private:true,dependencies:{'devsense-php-ls':p.version,ws:w.version}}))"

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build /runtime-deps.json ./package.json
# Installs devsense-php-ls plus its platform binary for the image architecture (linux-x64 or linux-arm64).
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /src/packages/devsense-php-editor/package.json node_modules/devsense-php-editor/package.json
COPY --from=build /src/packages/devsense-php-editor/dist node_modules/devsense-php-editor/dist
COPY --from=build /src/packages/devsense-php-editor-sampleweb/dist sampleweb/dist
COPY packages/devsense-php-editor-sampleweb/server sampleweb/server
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "sampleweb/server/production.js"]
