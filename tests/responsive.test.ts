import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

describe('responsive portrait presentation contract', () => {
  it('keeps the DOM container aligned with the Phaser portrait canvas', () => {
    expect(css).toContain('aspect-ratio:580/1100');
    expect(css).not.toContain('aspect-ratio:1040/700');
    expect(css).not.toContain('min-width:1100px');
    expect(main).toContain('width:580,height:1100');
  });

  it('fits the portrait field inside short landscape viewports without distortion', () => {
    expect(css).toContain('orientation:landscape');
    expect(css).toContain('height:auto');
    expect(css).toContain('calc(52.7273vh - 58px)');
    expect(css).not.toContain('height:calc(100vh - 100px)');
    expect(css).toContain('width:min(100%');
  });
});
