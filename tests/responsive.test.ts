import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOAL_GEOMETRY } from '../src/simulation/MatchSimulation';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const scene = readFileSync(new URL('../src/presentation/GameScene.ts', import.meta.url), 'utf8');

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
    expect(css).toContain('calc(52.7273vh - 32px)');
    expect(css).toContain('max-height:100%');
    expect(css).toContain('overflow-y:auto');
    expect(css).not.toContain('height:calc(100vh - 100px)');
    expect(css).toContain('width:min(100%');
  });

  it('uses one shared goal geometry contract for frame, bar, mouth, and net depth', () => {
    expect(GOAL_GEOMETRY.mouthRight-GOAL_GEOMETRY.mouthLeft).toBe(150);
    expect(GOAL_GEOMETRY.postRight-GOAL_GEOMETRY.postLeft).toBe(200);
    expect(GOAL_GEOMETRY.barRight-GOAL_GEOMETRY.barLeft).toBe(250);
    expect(GOAL_GEOMETRY.depth).toBe(105);
    expect(scene).toContain('GOAL_GEOMETRY');
    expect(scene).not.toContain('this.field.y-80');
  });

  it('exposes top-level Main/Test mode tabs and keeps the internal lab switch hidden', () => {
    expect(main).toContain('id="mode-main"');
    expect(main).toContain('id="mode-test"');
    expect(main).toContain('aria-selected');
    expect(main).toContain("document.querySelector<HTMLButtonElement>('.lab-menu-button')?.click()");
    expect(css).toContain('.mode-tabs');
    expect(css).toContain('.mode-tab{min-height:48px');
    expect(css).toContain('.lab-menu-button{display:none!important}');
  });

  it('keeps the side panel bounded in landscape mode and stacks only in portrait', () => {
    expect(css).toContain('max-height:calc(100vh - 190px)');
    expect(css).toContain('@media(max-width:900px) and (orientation:landscape)');
    expect(css).toContain('main{display:flex;flex-direction:column}');
  });

  it('exposes Korean controls and role descriptions', () => {
    expect(main).toContain('경기 시작');
    expect(main).toContain('일시정지');
    expect(main).toContain('돌격대장');
    expect(main).toContain('스위퍼');
    expect(scene).toContain('압박');
    expect(scene).toContain('커버');
  });

  it('projects robot role, team, and facing direction into presentation', () => {
    expect(scene).toContain('facingX');
    expect(scene).toContain('facingY');
    expect(scene).toContain('Math.atan2');
    expect(scene).toContain('nose');
    expect(scene).toContain('0x16232f');
  });

  it('keeps long kick guidelines debug-only across scene lifecycle resets', () => {
    expect(scene).toContain('private debugEnabled=false');
    expect(scene).toContain('this.sim.setKickDebugLine(this.debugEnabled)');
    expect(scene).not.toContain('this.sim.setKickDebugLine(true)');
    expect(scene).toContain('if(this.debugEnabled){this.kickDebugGraphics.lineStyle');
  });
});
