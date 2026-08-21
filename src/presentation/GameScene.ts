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
  private field = { x: 20, y: 90, w: 540, h: 960 };
  private onReady: ((scene: GameScene) => void) | undefined;
  private onFinish: (() => void) | undefined;
  constructor(onReady?: (scene: GameScene) => void, onFinish?: () => void) { super('match'); this.onReady = onReady; this.onFinish = onFinish; }
  create(): void {
    this.cameras.main.setBackgroundColor('#08111d');
    const g=this.add.graphics(); g.fillStyle(0x102b37);g.fillRoundedRect(this.field.x,this.field.y,this.field.w,this.field.h,18); g.lineStyle(2,0x3c7180,1);g.strokeRoundedRect(this.field.x,this.field.y,this.field.w,this.field.h,18); g.lineStyle(2,0x5b98a1,.55);g.strokeRect(this.field.x,this.field.y+this.field.h/2-1,this.field.w,2);g.strokeCircle(this.field.x+this.field.w/2,this.field.y+this.field.h/2,78);g.beginPath();g.moveTo(this.field.x+190,this.field.y+80);g.lineTo(this.field.x+190,this.field.y);g.lineTo(this.field.x+350,this.field.y);g.lineTo(this.field.x+350,this.field.y+80);g.strokePath();g.beginPath();g.moveTo(this.field.x+190,this.field.y+this.field.h-80);g.lineTo(this.field.x+190,this.field.y+this.field.h);g.lineTo(this.field.x+350,this.field.y+this.field.h);g.lineTo(this.field.x+350,this.field.y+this.field.h-80);g.strokePath();
    this.add.rectangle(this.field.x+270,this.field.y-9,160,10,0x53d6df); this.add.rectangle(this.field.x+270,this.field.y+this.field.h+9,160,10,0xff9f43);
    this.ball=this.add.circle(this.field.x+270,this.field.y+480,10,0xf6f3dc).setStrokeStyle(3,0xffd16b);
    this.scoreText=this.add.text(20,24,'BLUE  0   —   0  ORANGE',{fontFamily:'monospace',fontSize:'25px',color:'#e6f7f5',fontStyle:'bold'}); this.timeText=this.add.text(420,30,'01:30',{fontFamily:'monospace',fontSize:'22px',color:'#9ad4d3'}); this.statusText=this.add.text(20,62,'READY // press START TO DEPLOY',{fontFamily:'monospace',fontSize:'12px',color:'#72a9af'});
    for(const r of this.sim.state.robots) this.createRobot(r);
    this.onReady?.(this);
    this.onReady = undefined;
  }
  update(_time:number,delta:number):void { this.sim.tick(delta/1000*this.speed); this.render(); if(this.sim.state.status==='finished'&&this.onFinish)this.onFinish(); }
  start():void { this.sim.start(); }
  togglePause():void { this.sim.setPaused(this.sim.state.status!=='paused'); }
  setMatchSpeed(speed:number):void { this.speed=speed; }
  swap(team:Team):void { this.sim.swapComposition(team); for(const r of this.sim.state.robots.filter(robot=>robot.team===team)){ this.robotGraphics.get(r.id)?.destroy(); this.robotGraphics.delete(r.id); this.createRobot(r); } this.render(); }
  reset():void { this.sim=new MatchSimulation(2025); for(const c of Array.from(this.robotGraphics.values()))c.destroy();this.robotGraphics.clear();for(const r of this.sim.state.robots)this.createRobot(r); }
  getState(){return this.sim.state;}
  private createRobot(r:Robot):void {
    const color=r.team==='blue'?0x48d7e1:0xff9f43;
    const ring=this.add.circle(0,0,23,color,.18).setStrokeStyle(2,color);
    const body = r.shape==='circle' ? this.add.circle(0,0,16,color)
      : r.shape==='square' ? this.add.rectangle(0,0,28,28,color)
      : r.shape==='diamond' ? this.add.polygon(0,0,[0,-18,18,0,0,18,-18,0],color)
      : this.add.polygon(0,0,[0,-18,15,-9,15,9,0,18,-15,9,-15,-9],color);
    body.setStrokeStyle(3,0xeaf7f4);
    const labelY=r.team==='blue'?27:-42;
    const label=this.add.text(-38,labelY,`${r.role.toUpperCase()}\n${r.action}`,{fontFamily:'monospace',fontSize:'8px',color:'#d8f0ec',align:'center',fixedWidth:76});
    const c=this.add.container(this.field.x+r.x,this.field.y+r.y,[ring,body,label]);
    this.robotGraphics.set(r.id,c);
  }
  private render():void { const s=this.sim.state;this.scoreText.setText(`BLUE  ${s.score.blue}   —   ${s.score.orange}  ORANGE`);const remain=Math.ceil(90-s.elapsed);this.timeText.setText(`${Math.floor(remain/60).toString().padStart(2,'0')}:${(remain%60).toString().padStart(2,'0')}`);const phase=s.goalResetTimer>0?`GOAL // RESET ${s.goalResetTimer.toFixed(1)}s`:`${s.status.toUpperCase()}  //  ${this.speed.toFixed(1)}x  //  BLUE ↑  ORANGE ↓`;this.statusText.setText(phase);this.ball.setPosition(this.field.x+s.ball.x,this.field.y+s.ball.y);for(const r of s.robots){const c=this.robotGraphics.get(r.id);if(c){c.setPosition(this.field.x+r.x,this.field.y+r.y);const label=c.list[2] as Phaser.GameObjects.Text;label.setText(`${r.role.toUpperCase()}\n${r.action}`);}}}
}
