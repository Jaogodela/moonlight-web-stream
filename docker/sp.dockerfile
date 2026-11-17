# syntax=docker/dockerfile:1
#
# Reproducible multi-stage build for the Gaspar fork of moonlight-web-stream.
#
# Image target: ghcr.io/jaogodela/sp-bridge
# Source:       https://github.com/Jaogodela/moonlight-web-stream
# Product:      https://github.com/Jaogodela/gaspar
# License:      GPL-3.0-or-later
#
# Unlike docker/Dockerfile, this build compiles from this source tree; it does
# not download a prebuilt release tarball from GitHub.
#
# Base image digests were resolved on 2026-11-17 from:
#   - Docker Hub  library/node:26.13.1-bookworm-slim (linux/amd64 multi-arch index)
#   - Docker Hub  library/rust:1.99.0-bookworm        (matches rust-toolchain.toml)
#   - gcr.io      distroless/cc-debian12:nonroot
# Refresh them deliberately (and update docs/sp/reproducibility.md) rather than
# letting floating tags drift underneath the build.

ARG NODE_IMAGE=node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1
ARG RUST_IMAGE=rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6
ARG RUNTIME_IMAGE=gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f

# ---------------------------------------------------------------------------
# wasm-bindgen-cli
#
# The frontend build (`npm run build` -> ubrn build web) shells out to the
# wasm-bindgen CLI. Keep it in its own stage so it is cached independently of
# the application source. The version must match Cargo.wasm.toml.
# ---------------------------------------------------------------------------
FROM ${RUST_IMAGE} AS wasm-bindgen

ARG WASM_BINDGEN_VERSION=0.2.128

RUN cargo install --locked --version "${WASM_BINDGEN_VERSION}" wasm-bindgen-cli

# ---------------------------------------------------------------------------
# Node
#
# Reuse the official Node image only as a source of the runtime toolchain. The
# builder below is a Rust image so that rustup honours rust-toolchain.toml
# (1.99.0 + wasm32-unknown-unknown), which the frontend bindings need.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS node

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM ${RUST_IMAGE} AS builder

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG SOURCE_DATE_EPOCH=0

ENV DEBIAN_FRONTEND=noninteractive \
    SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH} \
    CARGO_INCREMENTAL=0 \
    CARGO_HOME=/usr/local/cargo \
    CARGO_TERM_COLOR=never \
    RUSTUP_HOME=/usr/local/rustup

# Native toolchain:
#   - build-essential/cc for ring, zstd-sys and other -sys crates
#   - clang/cmake/pkg-config for the moonlight-common native dependency chain
#   - git for the pinned moonlight-common-rust git dependency and ubrn checkout
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        clang \
        cmake \
        git \
        perl \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Node + npm from the pinned Node image (both bases are Debian bookworm).
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && node --version \
    && npm --version

COPY --from=wasm-bindgen /usr/local/cargo/bin/wasm-bindgen /usr/local/bin/wasm-bindgen

WORKDIR /src

# Dependency layers: keep these above `COPY . .` so source edits do not
# invalidate the downloaded Cargo/npm graph. A placeholder target keeps Cargo
# happy while the real source tree is not present yet; `COPY . .` replaces it.
COPY Cargo.toml Cargo.lock rust-toolchain.toml Cargo.wasm.toml .gitmodules \
     package.json package-lock.json ubrn.config.yaml ./

RUN mkdir -p src \
    && printf 'fn main() {}\n' > src/main.rs \
    && cargo fetch --locked
RUN npm ci --no-audit --no-fund

# Application source. .dockerignore keeps target/, node_modules/ and generated
# bindings out of the context.
COPY . .

# Build the server binary against the committed lockfile.
RUN cargo build --locked --release

# Build the web frontend. `npm run build` runs the prebuild steps
# (ts-rs export_bindings + ubrn checkout/build web) and then webpack in
# production mode; release builds serve the output from `static/`.
RUN npm run build \
    && mv dist static

# Deterministic-ish output and a writable-by-nonroot server volume directory.
RUN strip --strip-unneeded target/release/web-server \
    && mkdir -p /src/empty-server

# ---------------------------------------------------------------------------
# Runtime
#
# Distroless has no shell, so docker/entrypoint.sh is intentionally not used.
# The binary itself is the entrypoint and WORKDIR provides the relative
# `static/` and `./server/` paths the server expects (src/web.rs and
# src/cli.rs).
# ---------------------------------------------------------------------------
FROM ${RUNTIME_IMAGE} AS runtime

ARG VERSION=dev
ARG REVISION=unknown

LABEL org.opencontainers.image.title="sp-bridge" \
      org.opencontainers.image.description="Gaspar bridge: moonlight-web-stream WebRTC server for Sunshine hosts" \
      org.opencontainers.image.source="https://github.com/Jaogodela/moonlight-web-stream" \
      org.opencontainers.image.url="https://github.com/Jaogodela/gaspar" \
      org.opencontainers.image.licenses="GPL-3.0-or-later" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

ENV MOONLIGHT_WEB_PATH=/moonlight-web \
    BIND_ADDRESS=0.0.0.0:8080 \
    WEBRTC_PORT_RANGE=40000:40100

WORKDIR /moonlight-web

COPY --from=builder --chown=65532:65532 /src/target/release/web-server /moonlight-web/web-server
COPY --from=builder --chown=65532:65532 /src/static /moonlight-web/static
COPY --from=builder --chown=65532:65532 /src/empty-server /moonlight-web/server

USER 65532:65532

VOLUME ["/moonlight-web/server"]

EXPOSE 8080
EXPOSE 40000-40100/udp

ENTRYPOINT ["/moonlight-web/web-server"]
