// Development-only guard for the neutral Gaspar backgrounds in both themes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const palette = new Map();
let checked = 0;
for (const [, selector, body] of blocks) {
    const values = new Map([...body.matchAll(/(--gs-[\w-]+)\s*:\s*([^;]+);/g)]
        .map(([, key, value]) => [key, value.trim()]));
    for (const [key, value] of values) {
        if (/^--gs-(gray|ember|green|amber|red)-/.test(key)) palette.set(key, value);
    }
    const resolve = value => value.replace(/var\((--gs-[\w-]+)\)/g, (_, key) => {
        assert.ok(values.has(key) || palette.has(key), `Unresolved ${key}`);
        return resolve(values.get(key) ?? palette.get(key));
    });
    for (const [key, raw] of values) {
        if (!/^--gs-(bg$|surface-|stage-bg$|hud-bg$|scrim$|glass$|cover-scrim$|skeleton-)/.test(key)) continue;
        const value = resolve(raw);
        const colors = [...value.matchAll(/#([\da-f]{6}|[\da-f]{3})\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)];
        assert.ok(colors.length, `No color found: ${key}`);
        for (const match of colors) {
            const hex = match[1]?.replace(/^([\da-f])([\da-f])([\da-f])$/i, '$1$1$2$2$3$3');
            const [r, g, b] = (hex ? [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) : match.slice(2, 5).map(Number)).map(c => c / 255);
            const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
            assert.ok(max > 0, `${key}: pure black`);
            const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(max + min - 1));
            let hue = delta === 0 ? 0 : 60 * (max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
            if (hue < 0) hue += 360;
            assert.ok(!(hue >= 180 && hue <= 260 && saturation > 0.06), `${key}: blue background in ${selector.trim()}`);
        }
        checked++;
    }
    if (selector.trim() === ':root,\n[data-theme="dark"]') assert.equal(resolve(values.get('--gs-bg')), '#161615');
    if (selector.trim() === '[data-theme="light"]') assert.equal(resolve(values.get('--gs-bg')), '#FFFFFF');
}
console.log(`Validated ${checked} background declarations, including fullscreen, and both --gs-bg values.`);
