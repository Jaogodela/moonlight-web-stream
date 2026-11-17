import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const repo = resolve(process.cwd(), "../..");

test("T-UI-04 stream stage contains the complete source frame across viewport shapes", async ({ page, baseURL }) => {
  const css = await readFile(resolve(repo, "web/styles/gaspar.css"), "utf8");
  const stream = await readFile(resolve(repo, "web/stream.ts"), "utf8");
  const canvas = await readFile(resolve(repo, "web/stream/video/canvas.ts"), "utf8");
  expect(css).toMatch(/\.stream-stage\s*\{[^}]*overflow:\s*hidden/s);
  expect(css).toMatch(/\.stream-stage \.video-stream\s*\{[^}]*object-fit:\s*contain/s);
  expect(css).toMatch(/\.stream-stage \.video-stream\s*\{[^}]*transition:\s*none/s);
  expect(css).toContain("background: var(--gs-stage-bg)");
  expect(stream).toContain('this.div.classList.add("stream-stage")');
  expect(stream).toContain("Math.abs(height - this.streamVideoHeightPx) < 1");
  expect(stream).toContain("height = visibleBottom - visibleTop");
  expect(canvas).toContain("[this.canvas.width, this.canvas.height]");

  await page.goto(`${baseURL}/web/stream.html`);
  await page.setContent(`<div class="stream-stage"><img class="video-stream" id="frame" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1024' height='768'%3E%3Cpath stroke='%23ff00ff' stroke-width='4' d='M2 2h1020v764H2z'/%3E%3C/svg%3E"></div>`);
  await page.addStyleTag({ url: `${baseURL}/web/styles/tokens.css` });
  await page.addStyleTag({ url: `${baseURL}/web/styles/gaspar.css` });
  for (const viewport of [
    { width: 1920, height: 1080 }, { width: 1280, height: 1024 },
    { width: 800, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const rendered = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>(".stream-stage")!;
      const frame = document.querySelector<HTMLImageElement>("#frame")!;
      const stageRect = stage.getBoundingClientRect();
      const style = getComputedStyle(frame);
      return {
        stage: { x: stageRect.x, y: stageRect.y, width: stageRect.width, height: stageRect.height },
        frame: { width: frame.naturalWidth, height: frame.naturalHeight },
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        transition: style.transitionDuration,
        background: getComputedStyle(stage).backgroundColor,
      };
    });
    expect(rendered.stage).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
    expect(rendered.frame).toEqual({ width: 1024, height: 768 });
    expect(rendered.objectFit).toBe("contain");
    expect(rendered.objectPosition).toBe("50% 50%");
    expect(rendered.transition).toBe("0s");
    expect(rendered.background).toBe("rgb(18, 18, 17)");
  }
});

test.skip("T-UI-04 Sunshine border visibility and corner input mapping across renderers", async () => {
  // Requires the Sunshine test stream on Xvfb (frame source, canvas/video-element
  // renderer selection, simulated keyboard, rotation and host-side input capture).
});
