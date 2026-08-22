import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
    expect(css).toContain('calc(52.7273vh - 80px)');
    expect(css).toContain('max-height:100%');
    expect(css).toContain('overflow-y:auto');
    expect(css).not.toContain('height:calc(100vh - 100px)');
    expect(css).toContain('width:min(100%');
  });

  it('uses the same 200px width for the goal frame, bar, and goal mouth', () => {
    expect(scene).toContain('g.moveTo(this.field.x+170,this.field.y)');
    expect(scene).toContain('g.lineTo(this.field.x+145,this.field.y-80)');
    expect(scene).toContain('this.add.rectangle(this.field.x+270,this.field.y-80,250,12');
    expect(scene).toContain('this.add.rectangle(this.field.x+170,this.field.y-40,50,80');
    expect(scene).not.toContain('strokeRect(this.field.x+190,this.field.y-1,160,82)');
  });

  it('exposes Korean controls and role descriptions', () => {
    expect(main).toContain('경기 시작');
    expect(main).toContain('일시정지');
    expect(main).toContain('돌격대장');
    expect(main).toContain('앵커');
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
