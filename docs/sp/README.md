# Gaspar SP bridge

This directory documents the Gaspar fork's container build of
moonlight-web-stream. It is additive: the upstream `README.md`, `docker/` and
workflows are left untouched so `upstream-sync` rebases stay clean.

- Dockerfile: `docker/sp.dockerfile`
- Image: `ghcr.io/jaogodela/sp-bridge`
- CI: `.github/workflows/sp-ci.yml`
- Release: `.github/workflows/sp-release.yml`
- Reproducibility notes: [`reproducibility.md`](./reproducibility.md)

## Build locally

Requirements: Docker with BuildKit / buildx. No GPU is needed to build.

```sh
git checkout sp/main

SOURCE_DATE_EPOCH="$(git log -1 --format=%ct)"

docker buildx build \
  --file docker/sp.dockerfile \
  --tag ghcr.io/jaogodela/sp-bridge:local \
  --build-arg SOURCE_DATE_EPOCH="$SOURCE_DATE_EPOCH" \
  --build-arg VERSION=local \
  --build-arg REVISION="$(git rev-parse HEAD)" \
  --load .
```

The build is multi-stage:

1. `wasm-bindgen` installs `wasm-bindgen-cli` 0.2.128 (matches
   `Cargo.wasm.toml`).
2. `node` supplies the Node 26 toolchain.
3. `builder` uses `rust:1.99.0-bookworm` (honouring `rust-toolchain.toml`),
   runs `cargo fetch --locked` / `npm ci`, then `cargo build --locked
   --release` and `npm run build`, and serves the output as `static/`.
4. `runtime` is `gcr.io/distroless/cc-debian12:nonroot`, running the
   `web-server` binary directly.

The runtime image has **no shell**. `docker/entrypoint.sh` is intentionally not
used; the binary is PID 1 and `WORKDIR /moonlight-web` provides the relative
`static/` and `./server/` paths the server resolves at startup. Debugging with
a shell requires building a temporary `debug` variant locally.

## Run locally

Use a named volume (it inherits the image's nonroot ownership) or pre-create a
bind-mount directory owned by UID/GID `65532`:

```sh
# Named volume (recommended)
docker run --rm \
  -p 8080:8080 \
  -p 40000-40100:40000-40100/udp \
  -v moonlight-web-data:/moonlight-web/server \
  ghcr.io/jaogodela/sp-bridge:local
```

```sh
# Bind mount
mkdir -p ./moonlight-data
sudo chown -R 65532:65532 ./moonlight-data
docker run --rm \
  -p 8080:8080 \
  -p 40000-40100:40000-40100/udp \
  -v "$PWD/moonlight-data:/moonlight-web/server" \
  ghcr.io/jaogodela/sp-bridge:local
```

The container runs as `nonroot` (65532); `config.json` and `data.json` live in
`/moonlight-web/server`. No config file is created automatically on first
start. Generate one with:

```sh
docker run --rm \
  -v moonlight-web-data:/moonlight-web/server \
  ghcr.io/jaogodela/sp-bridge:local config generate
```

Then open <http://localhost:8080>. The first user to log in becomes admin.

### Ports and environment

Defaults baked into the image:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BIND_ADDRESS` | `0.0.0.0:8080` | HTTP listen address |
| `WEBRTC_PORT_RANGE` | `40000:40100` | UDP range for WebRTC media |
| `SSL_CERTIFICATE` / `SSL_PRIVATE_KEY` | unset | Enable HTTPS |
| `PATH_PREFIX` | unset | Reverse-proxy subpath |
| `LOG_LEVEL` | unset | Override log filter |

Exposed: TCP `8080`, UDP `40000-40100`. Other options (`WEBRTC_NAT_1TO1_HOST`,
`WEBRTC_ICE_SERVER_*`, `FORWARDED_HEADER`) are documented in the upstream
README and are passed through as environment variables.

## Branch model

- `sp/main` — Gaspar integration branch. All SP work lands here.
- `upstream-sync` — mirrors `upstream/master` exactly. **Never commit or push
  fork-specific changes here**; it only exists to make rebases/merges
  predictable.
- `sp/feat/*` — short-lived feature branches cut from `sp/main`.

Remotes: `origin` is `github.com/Jaogodela/moonlight-web-stream`; `upstream`
points at `MrCreativ3001/moonlight-web-stream` with its push URL disabled.
Never push to upstream or open PRs against it.

## CI and release

- `sp-ci.yml` builds the image on pushes/PRs touching `sp/main` or `sp/**`,
  with `contents: read` and no push. Code tests remain in upstream `ci.yml`,
  which already runs on every branch and PR.
- `sp-release.yml` runs on tags matching `v*-sp.*` (for example
  `v3.0.2-sp.0`) and on manual dispatch. It pushes the image, signs the digest
  with cosign keyless OIDC, generates a Syft SPDX SBOM, and publishes a
  GitHub Release with notes and the SBOM.

## Runtime validation status: PENDING

Building the image is not a runtime proof. The T-010 proof of concept must
still be repeated by the owner on a GPU-capable WSL host:

1. Pair the bridge with a Sunshine host.
2. Launch and stream SuperTuxKart in a browser through the bridge.

The machine used to author this build has no Docker daemon and no GPU, so no
`docker build`, pairing, or stream test has been performed here. A green SP-CI
run only shows that the image compiles and packages correctly.

## Upstream sync

`.github/workflows/upstream-sync.yml` runs every Monday at 06:00 UTC and on
manual dispatch. It fast-forwards the `upstream-sync` branch to
`upstream/master` and, when a new stable tag appears, rebases the commits on
`sp/main` onto that tag, then opens a PR (or an issue, if the rebase
conflicts). It never pushes to upstream. A live stream smoke test after the PR
is still manual.
