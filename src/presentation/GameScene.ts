import * as Phaser from 'phaser';
import { MatchSimulation, type Robot, type Team } from '../simulation/MatchSimulation';

export class GameScene extends Phaser.Scene {
  private sim = new MatchSimulation(2025);
  private robotGraphics = new Map<string, Phaser.GameObjects.Container>();
  private ball!: Phaser.GameObjects.Arc;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private speed = 1;
  private field = { x: 40, y: 106, w: 960, h: 540 };
  private onReady: ((scene: GameScene) => void) | undefined;
  private onFinish: (() => void) | undefined;
  constructor(onReady?: (scene: GameScene) => void, onFinish?: () => void) { super('match'); this.onReady = onReady; this.onFinish = onFinish; }
  create(): void {
    this.cameras.main.setBackgroundColor('#08111d');
    const g=this.add.graphics(); g.fillStyle(0x102b37);g.fillRoundedRect(this.field.x,this.field.y,this.field.w,this.field.h,18); g.lineStyle(2,0x3c7180,1);g.strokeRoundedRect(this.field.x,this.field.y,this.field.w,this.field.h,18); g.lineStyle(2,0x5b98a1,.55);g.strokeRect(this.field.x+this.field.w/2-1,this.field.y,2,this.field.h);g.strokeCircle(this.field.x+this.field.w/2,this.field.y+this.field.h/2,78); g.strokeRect(this.field.x-1,this.field.y+190,82,160);g.strokeRect(this.field.x+this.field.w-81,this.field.y+190,82,160);
    this.add.rectangle(this.field.x-9,this.field.y+225,10,90,0x53d6df); this.add.rectangle(this.field.x+this.field.w+9,this.field.y+225,10,90,0xff9f43);
    this.ball=this.add.circle(this.field.x+480,this.field.y+270,10,0xf6f3dc).setStrokeStyle(3,0xffd16b);
    this.scoreText=this.add.text(40,28,'BLUE  0   —   0  ORANGE',{fontFamily:'monospace',fontSize:'30px',color:'#e6f7f5',fontStyle:'bold'}); this.timeText=this.add.text(800,36,'01:30',{fontFamily:'monospace',fontSize:'24px',color:'#9ad4d3'}); this.statusText=this.add.text(40,74,'READY // press START TO DEPLOY',{fontFamily:'monospace',fontSize:'13px',color:'#72a9af'});
    for(const r of this.sim.state.robots) this.createRobot(r);
    this.onReady?.(this);
    this.onReady = undefined;
  }
  update(_time:number,delta:number):void { this.sim.tick(delta/1000*this.speed); this.render(); if(this.sim.state.status==='finished'&&this.onFinish)this.onFinish(); }
  start():void { this.sim.start(); }
  togglePause():void { this.sim.setPaused(this.sim.state.status!=='paused'); }
  setMatchSpeed(speed:number):void { this.speed=speed; }
  swap(team:Team):void { this.sim.swapComposition(team); }
  reset():void { this.sim=new MatchSimulation(2025); for(const c of Array.from(this.robotGraphics.values()))c.destroy();this.robotGraphics.clear();for(const r of this.sim.state.robots)this.createRobot(r); }
  getState(){return this.sim.state;}
  private createRobot(r:Robot):void { const color=r.team==='blue'?0x48d7e1:0xff9f43;const ring=this.add.circle(0,0,23,color,.18).setStrokeStyle(2,color);const body=this.add.circle(0,0,16,color).setStrokeStyle(3,0xeaf7f4);const label=this.add.text(-24,27,`${r.role.toUpperCase()}\n${r.action}`,{fontFamily:'monospace',fontSize:'9px',color:'#d8f0ec',align:'center'});const c=this.add.container(this.field.x+r.x,this.field.y+r.y,[ring,body,label]);this.robotGraphics.set(r.id,c); }
  private render():void { const s=this.sim.state;this.scoreText.setText(`BLUE  ${s.score.blue}   —   ${s.score.orange}  ORANGE`);const remain=Math.ceil(90-s.elapsed);this.timeText.setText(`${Math.floor(remain/60).toString().padStart(2,'0')}:${(remain%60).toString().padStart(2,'0')}`);this.statusText.setText(`${s.status.toUpperCase()}  //  ${this.speed.toFixed(1)}x  //  ROLES: STRIKER + ANCHOR`);this.ball.setPosition(this.field.x+s.ball.x,this.field.y+s.ball.y);for(const r of s.robots){const c=this.robotGraphics.get(r.id);if(c){c.setPosition(this.field.x+r.x,this.field.y+r.y);const label=c.list[2] as Phaser.GameObjects.Text;label.setText(`${r.role.toUpperCase()}\n${r.action}\n→ ${r.target}`);}}}
}
