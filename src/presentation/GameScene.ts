import * as Phaser from 'phaser';
import { MatchSimulation, GOAL_GEOMETRY, GOAL_AREA, KICK_RANGE_PROFILES, type MatchState, type Robot, type Team, type RobotArchetype, type StartSlot, type TeamComposition } from '../simulation/MatchSimulation';
import { robotDebug } from '../simulation/SimulationQA';

export class GameScene extends Phaser.Scene {
  private selectedComposition:TeamComposition=MatchSimulation.default3v3Composition();
  private seedEnabled=false;
  private seedValue=2025;
  private sim = new MatchSimulation(2025, MatchSimulation.default3v3Composition(), {seedEnabled:false});
  private robotGraphics = new Map<string, Phaser.GameObjects.Container>();
  private ball!: Phaser.GameObjects.Arc;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private kickDebugGraphics!: Phaser.GameObjects.Graphics;
  private kickRangeGraphics!: Phaser.GameObjects.Graphics;
  private debugEnabled=false;
  private speed = 1;
  private labMode=false;
  private labBrain:RobotArchetype='striker';
  private labOpponentBrain:RobotArchetype='striker';
  private labBody:'standard'|'light'|'heavy'|'wide'|'kick-plate'='standard';
  private labOpponentBody:'standard'|'light'|'heavy'|'wide'|'kick-plate'='standard';
  private labVisibleIds=new Set<string>();
  private onLabRobotMove?: (team:Team,index:number,x:number|null,y:number|null)=>void;
  private onLabRobotSelect?: (team:Team,index:number)=>void;
  private selectedLabRobotId?:string;
  private field = { x: 20, y: 110, w: 540, h: 860 };
  private onReady: ((scene: GameScene) => void) | undefined;
  private onFinish: (() => void) | undefined;
  constructor(onReady?: (scene: GameScene) => void, onFinish?: () => void) { super('match'); this.onReady = onReady; this.onFinish = onFinish; }
  create(): void {
    this.cameras.main.setBackgroundColor('#08111d');
    this.kickDebugGraphics=this.add.graphics().setDepth(9);
    this.kickRangeGraphics=this.add.graphics().setDepth(8);
    this.sim.setKickDebugLine(this.debugEnabled);
    const g=this.add.graphics(); g.fillStyle(0x102b37);g.fillRoundedRect(this.field.x,this.field.y,this.field.w,this.field.h,18); g.lineStyle(2,0x3c7180,1);g.strokeRoundedRect(this.field.x,this.field.y,this.field.w,this.field.h,18); g.lineStyle(2,0x5b98a1,.55);g.strokeRect(this.field.x,this.field.y+this.field.h/2-1,this.field.w,2);g.strokeCircle(this.field.x+this.field.w/2,this.field.y+this.field.h/2,78); const topBarY=this.field.y-GOAL_GEOMETRY.depth;const bottomBarY=this.field.y+this.field.h+GOAL_GEOMETRY.depth;g.beginPath();g.moveTo(this.field.x+GOAL_GEOMETRY.postLeft,this.field.y);g.lineTo(this.field.x+GOAL_GEOMETRY.barLeft,topBarY);g.lineTo(this.field.x+GOAL_GEOMETRY.barRight,topBarY);g.lineTo(this.field.x+GOAL_GEOMETRY.postRight,this.field.y);g.strokePath();g.beginPath();g.moveTo(this.field.x+GOAL_GEOMETRY.postLeft,this.field.y+this.field.h);g.lineTo(this.field.x+GOAL_GEOMETRY.barLeft,bottomBarY);g.lineTo(this.field.x+GOAL_GEOMETRY.barRight,bottomBarY);g.lineTo(this.field.x+GOAL_GEOMETRY.postRight,this.field.y+this.field.h);g.strokePath();
    // Goals use the owning team's color: orange owns the top goal, blue owns the bottom goal.
    this.add.rectangle(this.field.x+270,topBarY,GOAL_GEOMETRY.barRight-GOAL_GEOMETRY.barLeft,12,0xff9f43); this.add.rectangle(this.field.x+270,bottomBarY,GOAL_GEOMETRY.barRight-GOAL_GEOMETRY.barLeft,12,0x53d6df); const postHeight=GOAL_GEOMETRY.depth; this.add.rectangle(this.field.x+GOAL_GEOMETRY.postLeft,this.field.y-GOAL_GEOMETRY.depth/2,GOAL_GEOMETRY.postThickness,postHeight,0xff9f43); this.add.rectangle(this.field.x+GOAL_GEOMETRY.postRight,this.field.y-GOAL_GEOMETRY.depth/2,GOAL_GEOMETRY.postThickness,postHeight,0xff9f43); this.add.rectangle(this.field.x+GOAL_GEOMETRY.postLeft,this.field.y+this.field.h+GOAL_GEOMETRY.depth/2,GOAL_GEOMETRY.postThickness,postHeight,0x53d6df); this.add.rectangle(this.field.x+GOAL_GEOMETRY.postRight,this.field.y+this.field.h+GOAL_GEOMETRY.depth/2,GOAL_GEOMETRY.postThickness,postHeight,0x53d6df);
    const goalArea=this.add.graphics().setDepth(1);
    const areaWidth=GOAL_AREA.right-GOAL_AREA.left;
    goalArea.fillStyle(0xff9f43,0.045); goalArea.fillRect(this.field.x+GOAL_AREA.left,this.field.y,areaWidth,GOAL_AREA.depth);
    goalArea.lineStyle(2,0xff9f43,0.42); goalArea.strokeRect(this.field.x+GOAL_AREA.left,this.field.y,areaWidth,GOAL_AREA.depth);
    goalArea.fillStyle(0x48d7e1,0.045); goalArea.fillRect(this.field.x+GOAL_AREA.left,this.field.y+this.field.h-GOAL_AREA.depth,areaWidth,GOAL_AREA.depth);
    goalArea.lineStyle(2,0x48d7e1,0.42); goalArea.strokeRect(this.field.x+GOAL_AREA.left,this.field.y+this.field.h-GOAL_AREA.depth,areaWidth,GOAL_AREA.depth);
    this.ball=this.add.circle(this.field.x+270,this.field.y+this.field.h/2,10,0xf6f3dc).setDepth(30).setStrokeStyle(3,0xffd16b);
    this.scoreText=this.add.text(10,20,'점수 0 : 0',{fontFamily:'monospace',fontSize:'18px',color:'#e6f7f5',fontStyle:'bold'}); this.timeText=this.add.text(420,30,'01:30',{fontFamily:'monospace',fontSize:'22px',color:'#9ad4d3'}); this.statusText=this.add.text(430,62,'준비 · 시작',{fontFamily:'monospace',fontSize:'12px',color:'#72a9af'});
    for(const r of this.sim.state.robots) this.createRobot(r);
    this.onReady?.(this);
    this.onReady = undefined;
  }
  update(_time:number,delta:number):void { this.sim.tick(delta/1000*this.speed); this.render(); if(this.sim.state.status==='finished'&&this.onFinish)this.onFinish(); }
  start():void { this.selectedLabRobotId=undefined; this.render(); this.sim.start(); }
  togglePause():void { this.sim.setPaused(this.sim.state.status!=='paused'); }
  setMatchSpeed(speed:number):void { this.speed=speed; }
  setSeedMode(enabled:boolean,seed=2025):void { this.seedEnabled=enabled; this.seedValue=seed; this.reset(); }
  setLabRobotMoveHandler(handler:(team:Team,index:number,x:number|null,y:number|null)=>void):void { this.onLabRobotMove=handler; }
  setLabRobotSelectHandler(handler:(team:Team,index:number)=>void):void { this.onLabRobotSelect=handler; }

  swap(team:Team):void { this.sim.swapComposition(team); for(const r of this.sim.state.robots.filter(robot=>robot.team===team)){ this.robotGraphics.get(r.id)?.destroy(); this.robotGraphics.delete(r.id); this.createRobot(r); } this.render(); }
  configureRoster(team:Team, archetypes:RobotArchetype[], _slots:StartSlot[]=[]):void { this.labMode=false; this.selectedComposition[team]=[...archetypes]; this.sim=new MatchSimulation(this.seedValue,this.selectedComposition,{seedEnabled:this.seedEnabled}); for(const c of Array.from(this.robotGraphics.values()))c.destroy(); this.robotGraphics.clear(); for(const r of this.sim.state.robots)this.createRobot(r); this.render(); }
  setLabMode(enabled:boolean):void { this.labMode=enabled; if(enabled)this.configureLab(this.labBrain,this.labBody,this.labOpponentBrain,this.labOpponentBody,true); else this.reset(); }
  configureLab(brain:RobotArchetype,body:'standard'|'light'|'heavy'|'wide'|'kick-plate',opponentBrain:RobotArchetype='striker',opponentBody:'standard'|'light'|'heavy'|'wide'|'kick-plate'='standard',opponentEnabled=true,blueRoster?:RobotArchetype[],orangeRoster?:RobotArchetype[],bluePlacement:Array<{x:number;y:number}>=[],orangePlacement:Array<{x:number;y:number}>=[]):void {
    this.labMode=true; this.labBrain=brain; this.labBody=body; this.labOpponentBrain=opponentBrain; this.labOpponentBody=opponentBody;
    const blue=blueRoster?.length?blueRoster:[brain]; const orange=orangeRoster?.length?orangeRoster:[opponentBrain];
    this.sim=new MatchSimulation(this.seedValue,{blue,orange:opponentEnabled?orange:[]},{seedEnabled:this.seedEnabled});
    this.labVisibleIds=new Set([...((blueRoster??[]).map((_,index)=>`blue-${index}`)),...((opponentEnabled?orangeRoster??[]:[]).map((_,index)=>`orange-${index}`))]);
    for(const [team,placements] of [['blue',bluePlacement] as const,['orange',orangePlacement] as const])placements.forEach((placement,index)=>{const robot=this.sim.state.robots.find(candidate=>candidate.id===`${team}-${index}`);if(robot){robot.x=placement.x;robot.y=placement.y;robot.homeX=placement.x;robot.homeY=placement.y;robot.moveTargetX=placement.x;robot.moveTargetY=placement.y;}});
    this.applyLabBody(); this.sim.setKickDebugLine(this.debugEnabled);
    for(const c of Array.from(this.robotGraphics.values()))c.destroy(); this.robotGraphics.clear(); for(const r of this.sim.state.robots)this.createRobot(r); this.render();
  }
  private applyLabBody():void {
    const profiles={standard:{mass:2,maxSpeed:460,acceleration:2000,radius:20},light:{mass:1.2,maxSpeed:560,acceleration:2400,radius:18},heavy:{mass:3.8,maxSpeed:360,acceleration:1300,radius:23},wide:{mass:2.4,maxSpeed:420,acceleration:1700,radius:28},'kick-plate':{mass:2.1,maxSpeed:440,acceleration:1900,radius:20}};
    const profile=profiles[this.labBody]; const opponentProfile=profiles[this.labOpponentBody];
    for(const robot of this.sim.state.robots.filter(candidate=>candidate.team==='blue'))Object.assign(robot,profile);
    for(const opponent of this.sim.state.robots.filter(candidate=>candidate.team==='orange'))Object.assign(opponent,opponentProfile);
  }
  reset():void { if(this.labMode){this.configureLab(this.labBrain,this.labBody,this.labOpponentBrain,this.labOpponentBody);return;} this.sim=new MatchSimulation(this.seedValue,this.selectedComposition,{seedEnabled:this.seedEnabled});this.sim.setKickDebugLine(this.debugEnabled); for(const c of Array.from(this.robotGraphics.values()))c.destroy();this.robotGraphics.clear();for(const r of this.sim.state.robots)this.createRobot(r); this.render(); }
  toggleDebug():boolean { this.debugEnabled=!this.debugEnabled; this.sim.setKickDebugLine(this.debugEnabled); this.render(); return this.debugEnabled; }
  inspect(){return this.sim.state.robots.map(robot=>robotDebug(robot));}
  getTelemetry(){return this.sim.getTelemetry();}
  getState(){return this.sim.state;}
  private createRobot(r:Robot):void {
    const color=r.team==='blue'?0x48d7e1:0xff9f43;
    const body = r.shape==='circle' ? this.add.circle(0,0,16,color)
      : r.shape==='square' ? this.add.rectangle(0,0,28,28,color)
      : r.shape==='diamond' ? this.add.polygon(0,0,[0,-18,18,0,0,18,-18,0],color)
      : this.add.polygon(0,0,[0,-18,15,-9,15,9,0,18,-15,9,-15,-9],color);
    body.setStrokeStyle(3,0x16232f);
    const accent=this.add.graphics();
    if(this.labMode&&r.archetype!=='goalkeeper'){
      const preset=r.team==='blue'?this.labBody:this.labOpponentBody;
      accent.lineStyle(3,r.team==='blue'?0xb5f7ff:0xffd08a,0.95);
      if(preset==='heavy')accent.strokeCircle(0,0,24);
      if(preset==='wide')accent.strokeRect(-25,-25,50,50);
      if(preset==='light')accent.lineStyle(2,r.team==='blue'?0x8be8ff:0xffb56b,0.7).strokeCircle(0,0,19);
      if(preset==='kick-plate'){accent.lineStyle(5,0xffe66d,0.95);accent.beginPath();accent.moveTo(-13,-22);accent.lineTo(13,-22);accent.strokePath();}
    }
    const nose=this.add.graphics();
    nose.fillStyle(0xf6f3dc,1); nose.lineStyle(2,0x16232f,1);
    if(r.archetype!=='goalkeeper'){
      nose.beginPath(); nose.moveTo(0,-24); nose.lineTo(-10,-3); nose.lineTo(10,-3); nose.closePath(); nose.fillPath(); nose.strokePath();
      nose.lineStyle(1.5,0x182a36,1); nose.beginPath(); nose.moveTo(0,0); nose.lineTo(0,-38); nose.strokePath();
    }
    const labelY=r.team==='blue'?27:-42;
    const label=this.add.text(-48,labelY,`${this.roleLabel(r)}\n${this.actionLabel(r.action)}`,{fontFamily:'monospace',fontSize:'11px',color:'#d8f0ec',align:'center',fixedWidth:96});
    const visual=this.add.container(0,0,[accent,body,nose]);
    const selectionRing=this.add.graphics(); selectionRing.lineStyle(4,r.team==='blue'?0x9ffff7:0xffd27a,1); selectionRing.strokeCircle(0,0,29); selectionRing.setVisible(false);
    visual.setRotation(Math.atan2(r.facingY,r.facingX)+Math.PI/2);
    const c=this.add.container(this.field.x+r.x,this.field.y+r.y,[visual,label,selectionRing]);
    c.setSize(54,54).setInteractive({draggable:true,useHandCursor:true});
    this.input.setDraggable(c);
    c.on('pointerdown',()=>{if(this.labMode&&this.sim.state.status==='ready'){this.selectedLabRobotId=r.id;this.onLabRobotSelect?.(r.team,Number(r.id.split('-')[1]));this.render();}});
    let dragGhost:Phaser.GameObjects.Container|undefined;
    c.on('dragstart',()=>{if(!this.labMode||this.sim.state.status!=='ready')return;const ghostBody=this.add.graphics();ghostBody.fillStyle(r.team==='blue'?0x48d7e1:0xff9f43,.75);if(r.shape==='circle')ghostBody.fillCircle(0,0,23);else if(r.shape==='hex')ghostBody.fillPoints([new Phaser.Geom.Point(0,-24),new Phaser.Geom.Point(22,-12),new Phaser.Geom.Point(22,12),new Phaser.Geom.Point(0,24),new Phaser.Geom.Point(-22,12),new Phaser.Geom.Point(-22,-12)],true);else ghostBody.fillRoundedRect(-22,-22,44,44,6);const ghostRing=this.add.graphics();ghostRing.lineStyle(3,0xffffff,.75);ghostRing.strokeCircle(0,0,29);dragGhost=this.add.container(c.x,c.y,[ghostBody,ghostRing]).setAlpha(.82);c.setAlpha(.28);});
    c.on('drag',(_pointer:Phaser.Input.Pointer,dragX:number,dragY:number)=>{
      if(this.sim.state.status!=='ready')return;
      if(this.labMode){dragGhost?.setPosition(dragX,dragY);return;}
      const minY=r.team==='blue'?this.field.y+this.field.h/2+28:this.field.y+28;
      const maxY=r.team==='blue'?this.field.y+this.field.h-28:this.field.y+this.field.h/2-28;
      const x=this.clamp(dragX,this.field.x+28,this.field.x+this.field.w-28);
      const y=this.clamp(dragY,minY,maxY);
      c.setPosition(x,y); r.x=x-this.field.x; r.y=y-this.field.y; r.homeX=r.x; r.homeY=r.y; r.moveTargetX=r.x; r.moveTargetY=r.y;
    });
    c.on('dragend',(pointer:Phaser.Input.Pointer)=>{if(this.sim.state.status!=='ready')return;if(this.labMode){const inside=pointer.x>=this.field.x&&pointer.x<=this.field.x+this.field.w&&pointer.y>=this.field.y&&pointer.y<=this.field.y+this.field.h;if(inside){r.x=this.clamp(pointer.x-this.field.x,28,this.field.w-28);r.y=this.clamp(pointer.y-this.field.y,28,this.field.h-28);r.homeX=r.x;r.homeY=r.y;r.moveTargetX=r.x;r.moveTargetY=r.y;c.setPosition(this.field.x+r.x,this.field.y+r.y);this.onLabRobotMove?.(r.team,Number(r.id.split('-')[1]),r.x,r.y);}else this.onLabRobotMove?.(r.team,Number(r.id.split('-')[1]),null,null);c.setAlpha(1);dragGhost?.destroy(true);dragGhost=undefined;this.render();return;}r.homeX=r.x;r.homeY=r.y;this.render();});
    this.robotGraphics.set(r.id,c);
  }
  private clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,value));}
  private roleLabel(r:Robot):string { return r.archetype==='goalkeeper'?'골키퍼':r.archetype==='bulwark'||r.archetype==='sweeper'?'스위퍼':r.archetype==='striker'?'돌격대장':r.archetype==='scout'?'정찰봇':r.archetype==='dribbler'?'운반봇':'포격봇'; }
  private actionLabel(action:Robot['action']):string { return ({PRESS:'압박',COVER:'커버',CARRY:'운반',KICK:'킥',SHOOT:'강슛',RESET:'복귀'} as Record<Robot['action'],string>)[action]; }
  private renderKickRanges(s:MatchState):void {
    this.kickRangeGraphics.clear();
    for(const r of s.robots){ if(this.labMode&&!this.labVisibleIds.has(r.id)) continue; if(r.archetype==='goalkeeper') continue;
      const profile=KICK_RANGE_PROFILES[r.archetype];
      const color=r.team==='blue'?0x48d7e1:0xff9f43;
      const distance=Math.hypot(s.ball.x-r.x,s.ball.y-r.y);
      const facingX=distance>0?(s.ball.x-r.x)/distance:0;
      const facingY=distance>0?(s.ball.y-r.y)/distance:0;
      const inRange=distance<=profile.distance && r.facingX*facingX+r.facingY*facingY>=Math.cos(profile.halfAngleDeg*Math.PI/180);
      const ready=r.archetype==='bulwark'||r.archetype==='sweeper' ? r.clearCooldown<=0 : r.kickCooldown<=0&&r.kickLockout<=0;
      const canKickNow=ready&&inRange;
      const alpha=canKickNow?0.32:ready?0.16:0.06;
      const cx=this.field.x+r.x,cy=this.field.y+r.y;
      const facing=Math.atan2(r.facingY,r.facingX);
      const halfAngle=profile.halfAngleDeg*Math.PI/180;
      this.kickRangeGraphics.fillStyle(color,alpha);
      this.kickRangeGraphics.beginPath();
      this.kickRangeGraphics.moveTo(cx,cy);
      this.kickRangeGraphics.lineTo(cx+Math.cos(facing-halfAngle)*profile.distance,cy+Math.sin(facing-halfAngle)*profile.distance);
      this.kickRangeGraphics.arc(cx,cy,profile.distance,facing-halfAngle,facing+halfAngle,false);
      this.kickRangeGraphics.lineTo(cx,cy);
      this.kickRangeGraphics.closePath();
      this.kickRangeGraphics.fillPath();
    }
  }
  private render():void { const s=this.sim.state; this.renderKickRanges(s); this.kickDebugGraphics.clear(); if(this.debugEnabled){this.kickDebugGraphics.lineStyle(5,0xffe66d,1);for(const r of s.robots){if(r.archetype==='goalkeeper')continue;const length=72;this.kickDebugGraphics.beginPath();this.kickDebugGraphics.moveTo(this.field.x+r.x,this.field.y+r.y);this.kickDebugGraphics.lineTo(this.field.x+r.x+r.facingX*length,this.field.y+r.y+r.facingY*length);this.kickDebugGraphics.strokePath();}}this.scoreText.setText(`점수  ${s.score.blue} : ${s.score.orange}`);const remain=Math.ceil(90-s.elapsed);this.timeText.setText(`${Math.floor(remain/60).toString().padStart(2,'0')}:${(remain%60).toString().padStart(2,'0')}`);const status=s.goalResetTimer>0?`골인 · ${s.goalResetTimer.toFixed(1)}초`:s.status==='ready'?'준비 · 시작':s.status==='running'?`경기 중 · ${this.speed.toFixed(1)}배`:s.status==='paused'?'일시정지':'경기 종료';this.statusText.setText(status);this.ball.setPosition(this.field.x+s.ball.x,this.field.y+s.ball.y);for(const r of s.robots){const c=this.robotGraphics.get(r.id);if(c){c.setVisible(!this.labMode||this.labVisibleIds.has(r.id));c.setPosition(this.field.x+r.x,this.field.y+r.y);c.setScale(this.selectedLabRobotId===r.id?1.12:1);const visual=c.list[0] as Phaser.GameObjects.Container;visual.setRotation(Math.atan2(r.facingY,r.facingX)+Math.PI/2);const body=visual.list[1] as Phaser.GameObjects.Shape;const nose=visual.list[2] as Phaser.GameObjects.Graphics;const flashing=r.lastKickAt!==undefined&&s.elapsed-r.lastKickAt<0.12;body.setFillStyle(flashing?0xffffff:r.team==='blue'?0x48d7e1:0xff9f43);nose.setAlpha(flashing?1:0.92);const label=c.list[1] as Phaser.GameObjects.Text;label.setText(`${this.roleLabel(r)}\n${this.actionLabel(r.action)}`);const ring=c.list[2] as Phaser.GameObjects.Graphics;ring.setVisible(this.selectedLabRobotId===r.id);}}}
}
