# Gaspar redesign browser QA

This suite is isolated from the application dependencies and lockfile. It serves the checked-out source HTML and CSS locally, uses no live API, and never connects to a Gaspar host. Chromium is the required browser; the config can be extended with other Playwright projects.

## Run locally

```sh
cd tests/redesign
npm ci
npx playwright install chromium   # omit if Chromium is already installed
npm test
```

To point browser checks at a locally built web client, start that client with mock API responses and run:

```sh
BASE_URL=http://127.0.0.1:PORT npm test
```

The default local server exposes only repository files at `http://127.0.0.1:4179`; it does not create a build or require Rust/WASM bindings. The theme boot tests exercise the actual inline scripts in `web/index.html`, `web/admin.html`, and `web/stream.html`; token checks read `web/styles/tokens.css`. A full interaction pass over generated client screens requires the Webpack output and mocked API routes, which are not included in this source-only checkout.

Test output and reports stay under this directory and are ignored by Git.
