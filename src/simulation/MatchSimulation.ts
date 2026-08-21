export type Team = 'blue' | 'orange';
export type Role = 'striker' | 'anchor';
export type RobotShape = 'circle' | 'square' | 'diamond' | 'hex';
export type Action = 'PRESS' | 'COVER' | 'CARRY' | 'SHOOT' | 'RESET';
export interface Robot { id:string; team:Team; role:Role; shape:RobotShape; x:number; y:number; vx:number; vy:number; action:Action; target:string; }
export interface MatchState { elapsed:number; status:'ready'|'running'|'paused'|'finished'; score:Record<Team,number>; ball:{x:number;y:number;vx:number;vy:number}; robots:Robot[]; }
const roles:Role[]=['striker','anchor'];
export class MatchSimulation {
  readonly field={width:540,height:960}; readonly duration=90; private seed:number; private paused=false;
  state:MatchState;
  constructor(seed=42){ this.seed=seed; this.state={elapsed:0,status:'ready',score:{blue:0,orange:0},ball:{x:270,y:480,vx:0,vy:0},robots:[this.robot('blue',0,180,790),this.robot('blue',1,360,650),this.robot('orange',0,360,170),this.robot('orange',1,180,310)]}; }
  private random(){ this.seed=(this.seed*1664525+1013904223)>>>0; return this.seed/4294967296; }
  private robot(team:Team,index:number,x:number,y:number):Robot {
    const shapes:RobotShape[] = ['circle','square','diamond','hex'];
    const shape = shapes[(team === 'blue' ? index : index + 2) % shapes.length];
    return {id:`${team}-${index}`,team,role:roles[index],shape,x,y,vx:0,vy:0,action:'RESET',target:'BALL'};
  }
  start(){ if(this.state.status==='ready') { this.paused=false; this.state.status='running'; } }
  setPaused(value:boolean){
    if(this.state.status==='finished') return;
    if(value && this.state.status==='running'){ this.paused=true; this.state.status='paused'; }
    if(!value && this.state.status==='paused'){ this.paused=false; this.state.status='running'; }
  }
  setSpeed(_speed:number){ /* presentation controls the tick cadence */ }
  swapComposition(team:Team){ const teamRobots=this.state.robots.filter(r=>r.team===team); teamRobots.forEach((r,i)=>r.role=roles[(i+1)%2]); }
  tick(dt:number){ if(this.paused||this.state.status==='finished'||this.state.status==='ready'||this.state.status==='paused') return; this.state.elapsed=Math.min(this.duration,this.state.elapsed+Math.max(0,dt));
    const b=this.state.ball; b.x+=b.vx*dt; b.y+=b.vy*dt; b.vx*=Math.pow(.18,dt); b.vy*=Math.pow(.18,dt);
    if(b.x<18||b.x>this.field.width-18){b.x=Math.max(18,Math.min(this.field.width-18,b.x));b.vx*=-.7;}
    if(b.y<-2){this.state.score.blue++;this.resetBall(1);} else if(b.y>this.field.height+2){this.state.score.orange++;this.resetBall(-1);} else { this.moveRobots(dt); }
    if(this.state.elapsed>=this.duration)this.state.status='finished';
  }
  private resetBall(direction:number){const b=this.state.ball;b.x=this.field.width/2;b.y=this.field.height/2;b.vx=(this.random()-.5)*100;b.vy=direction*140;}
  private moveRobots(dt:number){const b=this.state.ball; for(const r of this.state.robots){const attack=(r.team==='blue'?-1:1); const isStriker=r.role==='striker'; const targetX=isStriker?b.x:(this.field.width/2+(r.id.endsWith('1')?90:-90)); const targetY=isStriker?b.y:(this.field.height/2-attack*150); const dx=targetX-r.x,dy=targetY-r.y,len=Math.hypot(dx,dy)||1; const speed=isStriker?105:72; r.vx=dx/len*speed;r.vy=dy/len*speed;r.x=Math.max(28,Math.min(this.field.width-28,r.x+r.vx*dt));r.y=Math.max(28,Math.min(this.field.height-28,r.y+r.vy*dt));r.target=isStriker?'BALL':'LANE';r.action=isStriker?(Math.hypot(dx,dy)<48?'CARRY':'PRESS'):'COVER'; if(isStriker&&Math.hypot(r.x-b.x,r.y-b.y)<30){b.vx=(b.x-this.field.width/2)*.35;b.vy=attack*190;r.action='SHOOT';}}
    for(let i=0;i<this.state.robots.length;i++) for(let j=i+1;j<this.state.robots.length;j++){
      const a=this.state.robots[i],b2=this.state.robots[j],dx=b2.x-a.x,dy=b2.y-a.y,dist=Math.hypot(dx,dy)||1;
      if(dist<38){const push=(38-dist)/2,nx=dx/dist,ny=dy/dist;a.x=Math.max(28,Math.min(this.field.width-28,a.x-nx*push));a.y=Math.max(28,Math.min(this.field.height-28,a.y-ny*push));b2.x=Math.max(28,Math.min(this.field.width-28,b2.x+nx*push));b2.y=Math.max(28,Math.min(this.field.height-28,b2.y+ny*push));}
    }
  }
  snapshot(){ return JSON.parse(JSON.stringify(this.state)); }
}
