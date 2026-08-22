import * as Phaser from 'phaser';
import { MatchSimulation, GOAL_GEOMETRY, type Robot, type Team } from '../simulation/MatchSimulation';
import { robotDebug } from '../simulation/SimulationQA';

export class GameScene extends Phaser.Scene {
  private sim = new MatchSimulation(2025);
  private robotGraphics = new Map<string, Phaser.GameObjects.Container>();
  private ball!: Phaser.GameObjects.Arc;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private kickDebugGraphics!: Phaser.GameObjects.Graphics;
  private debugEnabled=false;
  private speed = 1;
  private field = { x: 20, y: 110, w: 540, h: 860 };
  private onReady: ((scene: GameScene) => void) | undefined;
  private onFinish: (() => void) | undefined;
  constructor(onReady?: (scene: GameScene) => void, onFinish?: () => void) { super('match'); this.onReady = onReady; this.onFinish = onFinish; }
  create(): void {
    this.cameras.main.setBackgroundColor('#08111d');
    this.kickDebugGraphics=this.add.graphics().setDepth(9);
    this.sim.setKickDebugLine(this.debugEnabled);
    const g=this.add.graphics(); g.fillStyle(0x102b37);g.fillRoundedRect(this.field.x,this.field.y,this.field.w,this.field.h,18); g.lineStyle(2,0x3c7180,1);g.strokeRoundedRect(this.field.x,this.field.y,this.field.w,this.field.h,18); g.lineStyle(2,0x5b98a1,.55);g.strokeRect(this.field.x,this.field.y+this.field.h/2-1,this.field.w,2);g.strokeCircle(this.field.x+this.field.w/2,this.field.y+this.field.h/2,78); const topBarY=this.field.y-GOAL_GEOMETRY.depth;const bottomBarY=this.field.y+this.field.h+GOAL_GEOMETRY.depth;g.beginPath();g.moveTo(this.field.x+GOAL_GEOMETRY.postLeft,this.field.y);g.lineTo(this.field.x+GOAL_GEOMETRY.barLeft,topBarY);g.lineTo(this.field.x+GOAL_GEOMETRY.barRight,topBarY);g.lineTo(this.field.x+GOAL_GEOMETRY.postRight,this.field.y);g.strokePath();g.beginPath();g.moveTo(this.field.x+GOAL_GEOMETRY.postLeft,this.field.y+this.field.h);g.lineTo(this.field.x+GOAL_GEOMETRY.barLeft,bottomBarY);g.lineTo(this.field.x+GOAL_GEOMETRY.barRight,bottomBarY);g.lineTo(this.field.x+GOAL_GEOMETRY.postRight,this.field.y+this.field.h);g.strokePath();
    // Goals use the owning team's color: orange owns the top goal, blue owns the bottom goal.
    this.add.rectangle(this.field.x+270,topBarY,GOAL_GEOMETRY.barRight-GOAL_GEOMETRY.barLeft,12,0xff9f43); this.add.rectangle(this.field.x+270,bottomBarY,GOAL_GEOMETRY.barRight-GOAL_GEOMETRY.barLeft,12,0x53d6df); const postHeight=GOAL_GEOMETRY.depth; this.add.rectangle(this.field.x+GOAL_GEOMETRY.postLeft,this.field.y-GOAL_GEOMETRY.depth/2,GOAL_GEOMETRY.postThickness,postHeight,0xff9f43); this.add.rectangle(this.field.x+GOAL_GEOMETRY.postRight,this.field.y-GOAL_GEOMETRY.depth/2,GOAL_GEOMETRY.postThickness,postHeight,0xff9f43); this.add.rectangle(this.field.x+GOAL_GEOMETRY.postLeft,this.field.y+this.field.h+GOAL_GEOMETRY.depth/2,GOAL_GEOMETRY.postThickness,postHeight,0x53d6df); this.add.rectangle(this.field.x+GOAL_GEOMETRY.postRight,this.field.y+this.field.h+GOAL_GEOMETRY.depth/2,GOAL_GEOMETRY.postThickness,postHeight,0x53d6df);
    this.ball=this.add.circle(this.field.x+270,this.field.y+this.field.h/2,10,0xf6f3dc).setStrokeStyle(3,0xffd16b);
    this.scoreText=this.add.text(10,20,'점수 0 : 0',{fontFamily:'monospace',fontSize:'18px',color:'#e6f7f5',fontStyle:'bold'}); this.timeText=this.add.text(420,30,'01:30',{fontFamily:'monospace',fontSize:'22px',color:'#9ad4d3'}); this.statusText=this.add.text(430,62,'준비 · 시작',{fontFamily:'monospace',fontSize:'12px',color:'#72a9af'}); this.debugText=this.add.text(285,120,'',{fontFamily:'monospace',fontSize:'8px',color:'#d8f0ec',backgroundColor:'#08111d',padding:{x:6,y:4},lineSpacing:2}).setDepth(10).setVisible(false);
    for(const r of this.sim.state.robots) this.createRobot(r);
    this.onReady?.(this);
    this.onReady = undefined;
  }
  update(_time:number,delta:number):void { this.sim.tick(delta/1000*this.speed); this.render(); if(this.sim.state.status==='finished'&&this.onFinish)this.onFinish(); }
  start():void { this.sim.start(); }
  togglePause():void { this.sim.setPaused(this.sim.state.status!=='paused'); }
  setMatchSpeed(speed:number):void { this.speed=speed; }

  swap(team:Team):void { this.sim.swapComposition(team); for(const r of this.sim.state.robots.filter(robot=>robot.team===team)){ this.robotGraphics.get(r.id)?.destroy(); this.robotGraphics.delete(r.id); this.createRobot(r); } this.render(); }
  reset():void { this.sim=new MatchSimulation(2025);this.sim.setKickDebugLine(this.debugEnabled); for(const c of Array.from(this.robotGraphics.values()))c.destroy();this.robotGraphics.clear();for(const r of this.sim.state.robots)this.createRobot(r); this.debugText.setVisible(this.debugEnabled); this.render(); }
  toggleDebug():boolean { this.debugEnabled=!this.debugEnabled; this.sim.setKickDebugLine(this.debugEnabled); this.debugText.setVisible(this.debugEnabled); this.render(); return this.debugEnabled; }
  inspect(){return this.sim.state.robots.map(robot=>robotDebug(robot));}
  getTelemetry(){return this.sim.getTelemetry();}
  getState(){return this.sim.state;}
  private createRobot(r:Robot):void {
    const color=r.team==='blue'?0x48d7e1:0xff9f43;
    const ring=this.add.circle(0,0,23,color,.18).setStrokeStyle(2,color);
    const body = r.shape==='circle' ? this.add.circle(0,0,16,color)
      : r.shape==='square' ? this.add.rectangle(0,0,28,28,color)
      : r.shape==='diamond' ? this.add.polygon(0,0,[0,-18,18,0,0,18,-18,0],color)
      : this.add.polygon(0,0,[0,-18,15,-9,15,9,0,18,-15,9,-15,-9],color);
    body.setStrokeStyle(3,0x16232f);
    const nose=this.add.polygon(0,-25,[0,-10,-9,8,9,8],0xf6f3dc).setStrokeStyle(2,0x16232f);
    const noseCenterLine=this.add.line(0,-25,0,-8,0,6,0x4b6570,1).setLineWidth(1.5);
    const labelY=r.team==='blue'?27:-42;
    const label=this.add.text(-48,labelY,`${this.roleLabel(r)}\n${this.actionLabel(r.action)}`,{fontFamily:'monospace',fontSize:'11px',color:'#d8f0ec',align:'center',fixedWidth:96});
    const visual=this.add.container(0,0,[ring,body,nose,noseCenterLine]);
    visual.setRotation(Math.atan2(r.facingY,r.facingX)+Math.PI/2);
    const c=this.add.container(this.field.x+r.x,this.field.y+r.y,[visual,label]);
    this.robotGraphics.set(r.id,c);
  }
  private roleLabel(r:Robot):string { return r.archetype==='bulwark'||r.archetype==='sweeper'?'스위퍼':r.archetype==='striker'?'돌격대장':r.archetype==='scout'?'정찰봇':r.archetype==='dribbler'?'운반봇':'포격봇'; }
  private actionLabel(action:Robot['action']):string { return ({PRESS:'압박',COVER:'커버',CARRY:'운반',KICK:'킥',SHOOT:'강슛',RESET:'복귀'} as Record<Robot['action'],string>)[action]; }
  private render():void { const s=this.sim.state; this.kickDebugGraphics.clear(); if(this.debugEnabled){this.kickDebugGraphics.lineStyle(5,0xffe66d,1);for(const r of s.robots){const length=72;this.kickDebugGraphics.beginPath();this.kickDebugGraphics.moveTo(this.field.x+r.x,this.field.y+r.y);this.kickDebugGraphics.lineTo(this.field.x+r.x+r.facingX*length,this.field.y+r.y+r.facingY*length);this.kickDebugGraphics.strokePath();}}this.scoreText.setText(`점수  ${s.score.blue} : ${s.score.orange}`);const remain=Math.ceil(90-s.elapsed);this.timeText.setText(`${Math.floor(remain/60).toString().padStart(2,'0')}:${(remain%60).toString().padStart(2,'0')}`);const status=s.goalResetTimer>0?`골인 · ${s.goalResetTimer.toFixed(1)}초`:s.status==='ready'?'준비 · 시작':s.status==='running'?`경기 중 · ${this.speed.toFixed(1)}배`:s.status==='paused'?'일시정지':'경기 종료';this.statusText.setText(status);this.ball.setPosition(this.field.x+s.ball.x,this.field.y+s.ball.y);for(const r of s.robots){const c=this.robotGraphics.get(r.id);if(c){c.setPosition(this.field.x+r.x,this.field.y+r.y);const visual=c.list[0] as Phaser.GameObjects.Container;visual.setRotation(Math.atan2(r.facingY,r.facingX)+Math.PI/2);const body=visual.list[1] as Phaser.GameObjects.Shape;const nose=visual.list[2] as Phaser.GameObjects.Shape;const flashing=r.lastKickAt!==undefined&&s.elapsed-r.lastKickAt<0.12;body.setFillStyle(flashing?0xffffff:r.team==='blue'?0x48d7e1:0xff9f43);nose.setFillStyle(flashing?0xffffff:0xf6f3dc);const label=c.list[1] as Phaser.GameObjects.Text;label.setText(`${this.roleLabel(r)}\n${this.actionLabel(r.action)}`);}}if(this.debugEnabled)this.debugText.setText(this.inspect().map(d=>`${d.id} ${d.action} ${d.target}\nΔball ${d.distanceToBall.toFixed(0)} target(${d.targetPosition.x.toFixed(0)},${d.targetPosition.y.toFixed(0)})\n${d.reason}`).join('\n\n'));}
}
