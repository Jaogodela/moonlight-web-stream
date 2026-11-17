import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const repo = resolve(process.cwd(), "../..");
const file = (...parts: string[]) => resolve(repo, ...parts);

test("T-UI-02 preloads and loads Geist once with a cacheable 200 response", async ({ page, baseURL }) => {
  const htmlPages = await Promise.all(["index.html", "admin.html", "stream.html"].map(name => readFile(file("web", name), "utf8")));
  for (const html of htmlPages) {
    expect(html).toMatch(/rel="preload"[^>]*href="[^"]*Geist-Variable\.woff2[^"]*"[^>]*as="font"[^>]*crossorigin/i);
  }

  const fontURL = `${baseURL}/web/resources/fonts/Geist-Variable.woff2`;
  await page.goto(`${baseURL}/web/index.html`);
  const sourceHTML = await readFile(file("web/index.html"), "utf8");
  const renderedHTML = sourceHTML
    .replace(/<%= require\('\.\/resources\/fonts\/Geist-Variable\.woff2'\) %>/g, fontURL)
    .replace("</head>", `<link rel="stylesheet" href="${baseURL}/web/styles/fonts.css"></head>`);
  expect(renderedHTML).not.toContain("<%= require(");
  const requests: string[] = [];
  page.on("request", request => {
    if (request.url() === fontURL) requests.push(request.url());
  });
  const responsePromise = page.waitForResponse(response => response.url() === fontURL);
  await page.setContent(renderedHTML);
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("font/woff2");
  expect(response.headers()["cache-control"]).toMatch(/max-age=\d+/);
  await page.evaluate(async () => {
    await document.fonts.load("16px Geist");
    await document.fonts.ready;
  });
  expect(await page.evaluate(() => document.fonts.check("16px Geist"))).toBe(true);
  expect(requests).toHaveLength(1);
});

test("T-UI-02 shipped font files fit the 230 KB budget", async () => {
  const names = await readdir(file("web/resources/fonts"));
  const files = names.filter(name => name.endsWith(".woff2"));
  const totalBytes = (await Promise.all(files.map(name => stat(file("web/resources/fonts", name))))).reduce((sum, item) => sum + item.size, 0);
  expect(files.sort()).toEqual([
    "BricolageGrotesque-Variable.woff2",
    "Geist-Variable.woff2",
    "GeistMono-Variable.woff2",
  ]);
  expect(totalBytes).toBeLessThanOrEqual(230 * 1024);
  expect(totalBytes).toBe(172592);
});

test("T-UI-02 icon wrapper creates a labeled currentColor SVG", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/web/index.html`);
  await page.setContent(`<script type="importmap">{"imports":{"lucide":"${baseURL}/tests/redesign/node_modules/lucide/dist/esm/lucide.mjs"}}</script><body></body>`);
  let source = await readFile(file("web/component/icon.ts"), "utf8");
  source = source.replace(/^import \{[\s\S]*?\} from "lucide";/m,
    `import createElement from "${baseURL}/tests/redesign/node_modules/lucide/dist/esm/createElement.mjs";\nimport Play from "${baseURL}/tests/redesign/node_modules/lucide/dist/esm/icons/play.mjs";`);
  source = source.replace(/const ICONS = \{[\s\S]*?\} as const;/, 'const ICONS = { "play": Play } as const;');
  const moduleCode = ts.transpileModule(`${source}\n(window as any).__qaIcon = icon("play", { label: "Jogar" });`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  await page.addScriptTag({ type: "module", content: moduleCode });
  await page.waitForFunction(() => Boolean((window as any).__qaIcon));
  const svg = await page.evaluate(() => {
    const icon = (window as any).__qaIcon as SVGElement;
    return { tag: icon.tagName.toLowerCase(), role: icon.getAttribute("role"), label: icon.getAttribute("aria-label"), stroke: icon.getAttribute("stroke") };
  });
  expect(svg).toEqual({ tag: "svg", role: "img", label: "Jogar", stroke: "currentColor" });
});
