# Deploying the sample web app on Azure

The sample (`packages/devsense-php-editor-sampleweb`) runs as **one Node.js process on one port**:

| Path | What |
|---|---|
| `/` | the static Vite build (`dist/`) |
| `/lsp` | the PhpEditor WebSocket (JSON-RPC), backed by **one** `devsense-php-ls` child process |
| `/healthz` | JSON health: `200 {"status":"ok","clients":N,"licensed":bool,"uptime":s}`, `503` while the language server isn't running |

The server is `packages/devsense-php-editor-sampleweb/server/production.js` (`npm start` in that folder). It listens on
`$PORT` (default `8080`) on `0.0.0.0`. TLS is terminated by the platform. The browser derives the WebSocket URL from
its own location (`wss://<host>/lsp` on HTTPS, `ws://<host>/lsp` on HTTP). No URL needs to be configured.

The repository's [`Dockerfile`](Dockerfile) builds that server into a container image (Debian `node:22-bookworm-slim`).

> Everything below is **documentation only**. None of these commands has been run against Azure from this repository.
> Check prices in your region and currency with the [pricing calculator](https://azure.microsoft.com/pricing/calculator/)
> before creating resources.

## Requirements that drive the choice

- **Native binary.** `devsense-php-ls` ships its server as platform packages (`optionalDependencies` of
  `devsense-php-ls` 1.0.19497): `linux-x64`, `linux-arm64`, `linux-musl-x64`, `linux-musl-arm64`, `darwin-x64`,
  `darwin-arm64`, `win32-x64` and `win32-arm64`. The `linux-x64` binary is glibc-linked (`libc.so.6`, `libstdc++.so.6`;
  checked with `ldd`). Use a glibc base image such as Debian or Ubuntu. On Alpine, npm must pick the `linux-musl-*`
  package instead; that path isn't tested here. Every Azure option below runs linux-x64. An arm64 VM (`B2pts_v2`)
  would install `linux-arm64`, which is also untested.
- **Persistent process and WebSockets.** Each browser tab holds one WebSocket. Its documents live in the server
  process, and the client has **no automatic reconnect**. If the instance restarts or scales in, connected users must
  reload the page. Scale-to-zero is fine for a demo: the next visitor waits for a cold start. It's not fine if
  someone keeps a session open overnight on a platform that recycles idle instances.
- **Memory.** Measured locally (linux-x64, devsense-php-ls 1.0.19497) with 1–3 browser clients editing and requesting
  completion. `devsense.php.ls` RSS was about **150–205 MB** throughout. Node RSS was about **57 MB idle** and grew
  to about **180–190 MB with 3 clients**. Peak total was about **400 MB**, with or without a licence. In the Docker
  container: LS 150–185 MB, Node ≤ 120 MB, and `docker stats` showed 175 MiB with a 1 GiB limit.
  Size instances at **1 GiB** or more. 0.5 GiB is too tight.
- **Licence.** `DEVSENSE_PHP_LS_LICENSE` is read from the environment at start-up. It must never be baked into the
  image, committed, or put in a Dockerfile `ENV`. Store it as a platform secret: a Container Apps secret or Key Vault
  reference, or an App Service app setting with a Key Vault reference. The server never sends it to browsers or
  writes it to the log. Without it the editor works, but code actions show `(PREMIUM)`.

## Options compared

Prices: pay-as-you-go, **West Europe, USD**, from the official
[Azure Retail Prices API](https://prices.azure.com/api/retail/prices) and the pricing pages listed below. **Checked
2026-11-01.** Monthly figures use 730 h (2,628,000 s).

| Option | Unit price | ≈ per month | Fits? |
|---|---|---|---|
| App Service **F1** (Linux) | free | $0 | **No.** 60 CPU-minutes/day quota, no Always On (the process is unloaded when idle), 1 GB memory, no custom domain ([limits](https://learn.microsoft.com/azure/azure-resource-manager/management/azure-subscription-service-limits#app-service-limits)). |
| App Service **B1** (Linux, 1 core, 1.75 GB) | $0.018/h | **$13.14** | Yes. Always On, WebSockets, free managed certificate for a custom domain. |
| Container Apps consumption, **min replicas 0**, 0.5 vCPU / 1 GiB | active: vCPU $0.000034/s, memory $0.000004/GiB-s; free grant 180,000 vCPU-s + 360,000 GiB-s + 2M requests per subscription per month | **$0** up to ~100 active h/month, then ≈ $0.076 per active hour | Yes, for a demo. Cold start on the first visit after idle. |
| Container Apps consumption, **min replicas 1**, 0.5 vCPU / 1 GiB | idle: vCPU $0.000004/s, memory $0.000004/GiB-s; active rates as above | ≈ **$13.6** if idle all month (after the free grant), up to ≈ $47.6 if active all month | Yes. Always warm, but the cost depends on activity. |
| Static Web Apps **Free** (front end) + any backend above | free (100 GB bandwidth) | backend cost **+ $0** | Works, but saves nothing: the backend still needs one of the options above. It also needs a cross-origin `wss://` URL (`window.PHP_EDITOR_WS_URL` or the `php-editor-ws-url` meta tag) and a second deployment. Not recommended. |
| VM **B2ats v2** (2 vCPU, 1 GiB, x64) + E4 Standard SSD (32 GiB) + Standard static IP | $0.0108/h + $2.40/mo + $0.005/h | ≈ $7.88 + $2.40 + $3.65 = **$13.93** | Yes, but you run TLS (e.g. Caddy), patching and restarts yourself. B1s (1 vCPU, 1 GiB) is $0.012/h ≈ $8.76 + disk + IP. |
| Container registry (only for container options) | ACR Basic $0.1666/day | **≈ $5.07** | Optional. A public image on GitHub Container Registry (ghcr.io) costs nothing. |

Container Apps requests cost $0.56 per million after the free 2M. A replica counts as *active* when it uses more than
0.01 vCPU or receives more than 1,000 bytes/s. An editing session is active; an open but untouched tab mostly isn't.

Sources (checked 2026-11-01):
- Azure Retail Prices API, `https://prices.azure.com/api/retail/prices`. Filters used: `serviceName eq 'Azure App Service'`
  (skuName `F1`/`B1`, Linux), `'Azure Container Apps'` (skuName `Standard`), `'Virtual Machines'` (`Standard_B2ats_v2`,
  `Standard_B1s`), `'Storage'` (`E4 LRS`), `'Virtual Network'` (Standard static IPv4) and `'Container Registry'` (`Basic`),
  each with `armRegionName eq 'westeurope'`.
- <https://azure.microsoft.com/pricing/details/container-apps/> (free grant, active/idle rules)
- <https://azure.microsoft.com/pricing/details/app-service/linux/> (F1/B1 specs, free managed certificates)
- <https://azure.microsoft.com/pricing/details/app-service/static/> (Static Web Apps Free plan)
- <https://learn.microsoft.com/azure/azure-resource-manager/management/azure-subscription-service-limits#app-service-limits> (F1 limits)

### Recommendation

- **Cheapest viable (demo / low traffic): Azure Container Apps, consumption, min replicas 0, 0.5 vCPU / 1 GiB.**
  Expect **$0/month** while usage stays within the free grant (about 100 replica-hours at this size), plus **$0** with a
  public ghcr.io image or **≈ $5/month** with ACR Basic. The cost is a cold start of a few seconds (image pull, then
  about 1–3 s for the language server) after idle, and sessions end when the replica scales in.
- **Always-on production: App Service B1 Linux (Web App for Containers), Always On, 1 instance.** About **$13.14/month**
  flat, plus ≈ $5 if the image is in ACR. It's predictable and warm, with a built-in free TLS certificate for a custom
  domain and health-check-based instance replacement. Container Apps with min replicas 1 costs about the same when idle
  but up to ~$48 under constant use. A B-series VM costs about the same and adds operations work.

## Common steps

```bash
# Azure CLI 2.60+; log in and choose a subscription
az login
az account set --subscription "<subscription>"

RG=rg-php-editor
LOC=westeurope
APP=php-editor-sample            # globally unique for App Service (<APP>.azurewebsites.net)
ACR=phpeditor$RANDOM             # globally unique, lowercase letters/digits only
IMAGE=devsense-sampleweb:1

az group create -n $RG -l $LOC
```

### Build the image

Option A (no local Docker): build in ACR Basic, about $5/month.

```bash
az acr create -g $RG -n $ACR --sku Basic
az acr build -r $ACR -t $IMAGE .          # run from the repository root (uses ./Dockerfile)
```

Option B (free registry): push a **public** image to GitHub Container Registry and use
`ghcr.io/<owner>/devsense-sampleweb:1` as the image below, without `--registry-*` flags.

```bash
docker build -t ghcr.io/<owner>/devsense-sampleweb:1 .
docker push ghcr.io/<owner>/devsense-sampleweb:1     # after `docker login ghcr.io`; set the package to public
```

Local check, same as in CI:

```bash
docker build -t devsense-sampleweb:local .
docker run --rm -p 8080:8080 -e DEVSENSE_PHP_LS_LICENSE devsense-sampleweb:local   # passes the var from your shell, if set
curl http://localhost:8080/healthz      # {"status":"ok",...}; open http://localhost:8080/
```

### Store the licence (optional)

Keep it out of shell history: put it in the variable `DEVSENSE_PHP_LS_LICENSE` with `read -s`, not inline.

```bash
read -rs DEVSENSE_PHP_LS_LICENSE && export DEVSENSE_PHP_LS_LICENSE
KV=kv-php-editor-$RANDOM
az keyvault create -g $RG -n $KV --enable-rbac-authorization true
az role assignment create --role "Key Vault Secrets Officer" --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --scope "$(az keyvault show -n $KV --query id -o tsv)"
az keyvault secret set --vault-name $KV -n devsense-php-ls-license --value "$DEVSENSE_PHP_LS_LICENSE" -o none
SECRET_URI=$(az keyvault secret show --vault-name $KV -n devsense-php-ls-license --query id -o tsv | sed 's#/[^/]*$##')  # versionless
```

## Recommended: Container Apps (scale to zero)

```bash
az extension add -n containerapp --upgrade
az provider register -n Microsoft.App --wait
az provider register -n Microsoft.OperationalInsights --wait

az containerapp env create -g $RG -n $APP-env -l $LOC

az containerapp create -g $RG -n $APP --environment $APP-env \
  --image $ACR.azurecr.io/$IMAGE --registry-server $ACR.azurecr.io --registry-identity system \
  --ingress external --target-port 8080 --transport auto \
  --cpu 0.5 --memory 1.0Gi --min-replicas 0 --max-replicas 1 \
  --system-assigned
# ghcr.io image instead: --image ghcr.io/<owner>/devsense-sampleweb:1 and drop --registry-server/--registry-identity.

# Licence from Key Vault (optional): grant the app's identity read access, then reference the secret.
PRINCIPAL=$(az containerapp show -g $RG -n $APP --query identity.principalId -o tsv)
az role assignment create --role "Key Vault Secrets User" --assignee $PRINCIPAL \
  --scope "$(az keyvault show -n $KV --query id -o tsv)"
az containerapp secret set -g $RG -n $APP --secrets "dsls-license=keyvaultref:$SECRET_URI,identityref:system"
az containerapp update -g $RG -n $APP --set-env-vars "DEVSENSE_PHP_LS_LICENSE=secretref:dsls-license"
# Without Key Vault: az containerapp secret set -g $RG -n $APP --secrets "dsls-license=$DEVSENSE_PHP_LS_LICENSE"

URL=https://$(az containerapp show -g $RG -n $APP --query properties.configuration.ingress.fqdn -o tsv)
curl $URL/healthz
```

Ingress `--transport auto` supports WebSockets, and the browser connects to `wss://<fqdn>/lsp`. To keep it warm
(the always-on variant on Container Apps, ≈ $13.6+/month), run
`az containerapp update -g $RG -n $APP --min-replicas 1`.

Health probes: the image has a Docker `HEALTHCHECK`, but Container Apps ignores it. To probe `/healthz`, add
liveness and readiness probes (`httpGet` path `/healthz`, port 8080) to the container in YAML and apply it with
`az containerapp update --yaml`. The default TCP probe works too.

## Always-on alternative: App Service B1 (Linux, container)

```bash
az appservice plan create -g $RG -n $APP-plan --is-linux --sku B1

az webapp create -g $RG -p $APP-plan -n $APP \
  --deployment-container-image-name $ACR.azurecr.io/$IMAGE --assign-identity '[system]'
# Pull from ACR with the managed identity:
PRINCIPAL=$(az webapp identity show -g $RG -n $APP --query principalId -o tsv)
az role assignment create --role AcrPull --assignee $PRINCIPAL --scope "$(az acr show -n $ACR --query id -o tsv)"
az webapp config set -g $RG -n $APP --generic-configurations '{"acrUseManagedIdentityCreds": true}'
# (ghcr.io public image: --deployment-container-image-name ghcr.io/<owner>/devsense-sampleweb:1, skip the AcrPull lines)

az webapp config set -g $RG -n $APP --always-on true --web-sockets-enabled true --http20-enabled true \
  --generic-configurations '{"healthCheckPath": "/healthz"}'
az webapp update -g $RG -n $APP --https-only true
az webapp config appsettings set -g $RG -n $APP --settings WEBSITES_PORT=8080

# Licence as a Key Vault reference (optional)
az role assignment create --role "Key Vault Secrets User" --assignee $PRINCIPAL \
  --scope "$(az keyvault show -n $KV --query id -o tsv)"
az webapp config appsettings set -g $RG -n $APP \
  --settings "DEVSENSE_PHP_LS_LICENSE=@Microsoft.KeyVault(SecretUri=$SECRET_URI)"

curl https://$APP.azurewebsites.net/healthz
```

Without containers, App Service's Node 22 Linux runtime (glibc) can also run `npm start` from a zip deployment.
That deployment must then include `node_modules` installed on Linux x64, so that npm picked `devsense-php-ls-linux-x64`.
The container path avoids that.

## Scaling

- **One language server per instance.** Every instance starts its own `devsense-php-ls` (~200 MB) and serves all
  WebSocket clients connected to it. Clients' documents are isolated from each other inside that server.
- **Scale up before scaling out.** One small instance handled 3 concurrent editing clients at ~400 MB in the local
  test. Measure your own load. Code actions and `workspace/executeCommand` are serialized per instance (a temporary
  workaround; see the README), so heavy concurrent code-action use favours more instances.
- **Scaling out needs sticky sessions.** A WebSocket stays on the instance that accepted it, but state is per
  instance. Keep a browser on the same instance, which matters for reconnects and any HTTP requests made alongside
  the socket:
  - Container Apps (single-revision mode): `az containerapp ingress sticky-sessions set -g $RG -n $APP --affinity sticky`,
    then raise `--max-replicas`.
  - App Service: ARR affinity is on by default (`az webapp update -g $RG -n $APP --client-affinity-enabled true`);
    scale with `az appservice plan update -g $RG -n $APP-plan --number-of-workers 2`.
- **Scale-in and restarts drop sessions.** The client doesn't reconnect automatically, so users reload. Deployments
  restart the process, too.

## Custom domain and TLS

TLS ends at the platform, and the app itself serves plain HTTP on `$PORT`. Because the WebSocket URL is same-origin,
a custom domain needs no app change: the page on `https://editor.example.com` connects to
`wss://editor.example.com/lsp`.

- **Container Apps:** add a CNAME (subdomain) or an A record and TXT `asuid` record (apex), then
  `az containerapp hostname add -g $RG -n $APP --hostname editor.example.com` and
  `az containerapp hostname bind -g $RG -n $APP --hostname editor.example.com --environment $APP-env --validation-method CNAME`.
  This uses a free managed certificate.
- **App Service (B1 and up):** add a CNAME and TXT `asuid.<sub>` record, then
  `az webapp config hostname add -g $RG --webapp-name $APP --hostname editor.example.com`,
  `az webapp config ssl create -g $RG -n $APP --hostname editor.example.com` (free managed certificate) and
  `az webapp config ssl bind -g $RG -n $APP --certificate-thumbprint <thumbprint> --ssl-type SNI`.
- **VM:** run a reverse proxy with automatic certificates (e.g. Caddy: `reverse_proxy 127.0.0.1:8080`, which proxies
  WebSockets as well) and keep the Node process under systemd with `Restart=always`.

## Clean up

```bash
az group delete -n $RG --yes --no-wait
```
