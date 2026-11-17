# Reproducibility

This document records the pinned inputs and known sources of nondeterminism for
`docker/sp.dockerfile`. Update it whenever a digest or toolchain pin changes.

## Pinned inputs

Resolved on **2026-11-17**:

| Input | Pin | Notes |
| --- | --- | --- |
| Node builder | `node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1` | Satisfies `engines.node >=26.4.0 <27.0.0` |
| Rust builder | `rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6` | Matches `rust-toolchain.toml` (1.99.0, rustfmt, clippy, wasm32-unknown-unknown) |
| Runtime | `gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f` | Debian 12/glibc, compatible with the bookworm builder |
| wasm-bindgen CLI | `0.2.128` | Must match `Cargo.wasm.toml` |
| Rust dependencies | `Cargo.lock` | `cargo fetch --locked`, `cargo build --locked --release` |
| JS dependencies | `package-lock.json` | `npm ci` (frozen lockfile) |
| moonlight-common | git rev `62bf8579166fd2e934b23924b2765114ab5c18e6` | Pinned in `Cargo.toml` |

## SOURCE_DATE_EPOCH

CI computes the build arg from the commit:

```sh
SOURCE_DATE_EPOCH="$(git log -1 --format=%ct)"
```

The Dockerfile exports it to the builder environment so tools that honour it
(some `-sys` build scripts, packaging steps) clamp embedded timestamps. It is
also available for external build systems; it is not baked into a label because
OCI `created` expects RFC 3339, not a Unix epoch.

## Determinism measures already in place

- Base images pinned by digest, not floating tags.
- Both dependency graphs are lockfile-driven (`--locked`, `npm ci`).
- The git dependency is pinned to a commit, not a branch.
- `CARGO_INCREMENTAL=0`, `CARGO_TERM_COLOR=never`.
- The binary is stripped (`strip --strip-unneeded`) before the runtime copy.
- `.dockerignore` keeps host `target/`, `node_modules/`, generated bindings and
  a local `static/` out of the build context, so a dirty worktree cannot leak
  artifacts into the image.

## Known nondeterminism

Byte-for-byte image reproducibility is **not** guaranteed yet:

1. **APT packages.** The builder runs `apt-get install` from Debian bookworm
   repositories at build time. Even with a digest-pinned base, package versions
   can move as Debian publishes updates. Pinning an apt snapshot would be the
   next step.
2. **Registry/toolchain fetches.** Cargo crates, npm packages, the pinned git
   dependency and the `ubrn checkout` clone are fetched at build time. Content
   is pinned by version/rev, but availability and any registry-side mutation
   (for example a re-tagged package) remain outside our control.
3. **Build paths.** Rust embeds absolute paths (for example `/src/...`) in
   panic messages/debug metadata. Builds from a different context path can
   differ. Stripping symbols reduces but does not eliminate this.
4. **BuildKit layer metadata and provenance.** Layer timestamps and the
   `provenance: true` attestation in the release workflow make the manifest and
   config digest vary even when file contents match.
5. **wasm-bindgen build.** `wasm-bindgen-cli` is compiled from source in its own
   stage; its output depends on the pinned Rust compiler but is not otherwise
   byte-pinned.

## Verifying a build

Build twice on the same runner and commit, then compare:

```sh
docker buildx imagetools inspect ghcr.io/jaogodela/sp-bridge:<tag>
cosign verify ghcr.io/jaogodela/sp-bridge@<digest>
```

Compare the `linux/amd64` manifest digest, not just the image ID. Expect
differences until apt snapshot pinning is added; the release workflow signs and
SBOMs the exact digest it published so consumers can verify what they pulled.
