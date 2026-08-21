export type Team = 'blue' | 'orange';
export type Role = RobotArchetype;
export type RobotShape = 'circle' | 'square' | 'diamond' | 'hex';
export type RobotArchetype = 'striker' | 'bulwark' | 'scout' | 'dribbler' | 'cannon' | 'sweeper';
export type Action = 'PRESS' | 'COVER' | 'CARRY' | 'KICK' | 'SHOOT' | 'RESET';

type MatchStatus = 'ready' | 'running' | 'paused' | 'finished';
type EventType = 'robot-ball-collision' | 'robot-robot-collision' | 'kick' | 'goal' | 'kickoff' | 'wall-bounce';

export interface Robot {
  id:string; team:Team; role:Role; shape:RobotShape; archetype:RobotArchetype;
  x:number; y:number; vx:number; vy:number; facingX:number; facingY:number;
  radius:number; mass:number; maxSpeed:number; acceleration:number;
  action:Action; target:string; kickCooldown:number; kickLockout:number;
}

export interface MatchState {
  elapsed:number; status:MatchStatus; score:Record<Team,number>; goalResetTimer:number;
  ball:{x:number;y:number;vx:number;vy:number;radius:number;mass:number}; robots:Robot[];
}

export interface SimulationEvent {
  type:EventType; tick:number; elapsed:number; ids?:string[];
  candidate?:string; reason?:string;
  x:number; y:number; impulse?:number; vxBefore?:number; vyBefore?:number; vxAfter?:number; vyAfter?:number;
}

export interface TelemetryFrame {
  tick:number; elapsed:number; status:MatchStatus; goalResetTimer:number; score:Record<Team,number>;
  ball:{x:number;y:number;vx:number;vy:number};
  robots:Array<{id:string;team:Team;role:Role;archetype:RobotArchetype;x:number;y:number;vx:number;vy:number;facingX:number;facingY:number;kickCooldown:number;kickLockout:number;target:string;action:Action}>;
  events:SimulationEvent[];
}

export const ARCHETYPES:RobotArchetype[]=['striker','bulwark','scout','dribbler','cannon','sweeper'];
export type TeamComposition={blue:[RobotArchetype,RobotArchetype];orange:[RobotArchetype,RobotArchetype]};
const FIXED_DT=1/60;
const GOAL_LEFT=190;
const GOAL_RIGHT=350;
const BALL_RADIUS=10;
const ROBOT_RADIUS=20;
const MAX_SPEED=520;

export class MatchSimulation {
  readonly field={width:540,height:860}; readonly duration=90; readonly seed:number; private paused=false; private accumulator=0; private tickIndex=0;
  private kickoffTimer=0; private ballKickInvuln=0; private lastKickTeam:Team|undefined; private lastKickX=0; private lastKickY=0; private lastKickElapsed=-10; private kickBurstCount=0; private kickBurstStart=-10; private events:SimulationEvent[]=[]; private telemetry:TelemetryFrame[]=[];
  state:MatchState;

  constructor(seed=42,composition?:Partial<TeamComposition>){
    this.seed=seed;
    const formationOffset=((seed*37)%121)-60;
    const blue=composition?.blue??['striker','bulwark'];
    const orange=composition?.orange??['striker','bulwark'];
    this.state={elapsed:0,status:'ready',score:{blue:0,orange:0},goalResetTimer:0,ball:{x:270,y:this.field.height/2,vx:0,vy:0,radius:BALL_RADIUS,mass:1},robots:[
      this.robot('blue',0,180+formationOffset,790,blue[0]), this.robot('blue',1,360-formationOffset,650,blue[1]),
      this.robot('orange',0,360-formationOffset,170,orange[0]), this.robot('orange',1,180+formationOffset,310,orange[1]),
    ]};
  }


  private robot(team:Team,index:number,x:number,y:number,archetype:RobotArchetype):Robot {
    const role:Role=archetype;
    const profile=this.profileForArchetype(archetype);
    return {id:`${team}-${index}`,team,role,shape:this.shapeForRole(role),archetype,x,y,vx:0,vy:0,facingX:team==='blue'?0:0,facingY:team==='blue'?-1:1,radius:ROBOT_RADIUS,
      mass:profile.mass,maxSpeed:profile.maxSpeed,acceleration:profile.acceleration,
      action:'RESET',target:'BALL',kickCooldown:0,kickLockout:0};
  }

  private shapeForRole(role:Role):RobotShape { return ({striker:'circle',bulwark:'square',scout:'diamond',dribbler:'circle',cannon:'hex',sweeper:'square'} as Record<Role,RobotShape>)[role]; }
  private profileForArchetype(archetype:RobotArchetype){return ({striker:{mass:2,maxSpeed:230,acceleration:1000},bulwark:{mass:3.2,maxSpeed:156,acceleration:600},scout:{mass:1.6,maxSpeed:290,acceleration:1240},dribbler:{mass:2.1,maxSpeed:210,acceleration:920},cannon:{mass:2.5,maxSpeed:184,acceleration:760},sweeper:{mass:3,maxSpeed:172,acceleration:680}} as const)[archetype];}

  start(){
    if(this.state.status==='ready') { this.paused=false; this.kickoffTimer=0.75; this.state.status='running'; this.recordEvent({type:'kickoff',x:this.state.ball.x,y:this.state.ball.y}); }
  }

  setPaused(value:boolean){
    if(this.state.status==='finished') return;
    if(this.state.goalResetTimer>0) return;
    if(value && this.state.status==='running'){ this.paused=true; this.state.status='paused'; }
    if(!value && this.state.status==='paused'){ this.paused=false; this.state.status='running'; }
  }

  setSpeed(_speed:number){ /* presentation controls render cadence; physics remains fixed-step */ }

  swapComposition(team:Team){
    const teamRobots=this.state.robots.filter(r=>r.team===team);
    const next=teamRobots.map(robot=>(robot.archetype==='striker'?'bulwark':'striker') as RobotArchetype);
    teamRobots.forEach((r,i)=>this.applyArchetype(r,next[i]));
  }

  setComposition(team:Team,archetypes:[RobotArchetype,RobotArchetype]){this.state.robots.filter(r=>r.team===team).forEach((robot,i)=>this.applyArchetype(robot,archetypes[i]));}
  private applyArchetype(robot:Robot,archetype:RobotArchetype){const profile=this.profileForArchetype(archetype);robot.role=archetype;robot.archetype=archetype;robot.shape=this.shapeForRole(archetype);robot.mass=profile.mass;robot.maxSpeed=profile.maxSpeed;robot.acceleration=profile.acceleration;}

  tick(dt:number){
    if(this.paused||this.state.status==='finished'||this.state.status==='ready'||this.state.status==='paused') return;
    const safeDt=Math.max(0,Math.min(dt,120));
    this.accumulator+=safeDt;
    while(this.accumulator+1e-9>=FIXED_DT){ this.stepFixed(); this.accumulator-=FIXED_DT; }
  }

  private stepFixed(){
    const dt=FIXED_DT;
    this.tickIndex++;
    this.state.elapsed=Math.min(this.duration,this.state.elapsed+dt);
    this.kickoffTimer=Math.max(0,this.kickoffTimer-dt);
    this.ballKickInvuln=Math.max(0,this.ballKickInvuln-dt);
    if(this.state.elapsed-this.kickBurstStart>0.8){this.kickBurstCount=0;this.kickBurstStart=this.state.elapsed;}
    for(const robot of this.state.robots){ robot.kickCooldown=Math.max(0,robot.kickCooldown-dt); robot.kickLockout=Math.max(0,robot.kickLockout-dt); }

    if(this.state.goalResetTimer>0){
      this.state.goalResetTimer=Math.max(0,this.state.goalResetTimer-dt);
      if(this.state.goalResetTimer===0){this.resetBall();if(this.state.elapsed>=this.duration-1e-9)this.state.status='finished';}
      this.recordTelemetry();
      return;
    }

    this.decideAndMoveRobots(dt);
    this.resolveRobotRobotCollisions();
    if(this.kickoffTimer<=0) this.resolveRobotBallCollisions();
    this.integrateBall(dt);
    this.resolveGoalOrWalls();
    this.recordTelemetry();
    if(this.state.elapsed>=this.duration-1e-9&&this.state.goalResetTimer===0) this.state.status='finished';
  }

  private decideAndMoveRobots(dt:number){
    const b=this.state.ball;
    for(const robot of this.state.robots){
      const attack=robot.team==='blue'?-1:1;
      const side=robot.id.endsWith('1')?90:-90;
      const centerX=this.field.width/2;
      const centerY=this.field.height/2;
      let targetX=centerX+side,targetY=this.field.height/2-attack*150+(b.y-this.field.height/2)*0.25;
      let action:Action='COVER';
      switch(robot.archetype){
        case 'striker': {
          targetX=Math.abs(b.x-centerX)>160?b.x-Math.sign(b.x-centerX)*80:b.x+(robot.team==='blue'?-26:26); targetY=b.y-(robot.team==='blue'?-1:1)*20; action=Math.hypot(targetX-robot.x,targetY-robot.y)<48?'CARRY':'PRESS'; break;
        }
        case 'scout': {
          targetX=b.x+b.vx*0.18; targetY=b.y+b.vy*0.18; action='PRESS'; break;
        }
        case 'dribbler': {
          targetX=b.x-Math.sign(b.x-centerX||1)*28+side*0.25; targetY=b.y-attack*24; action='CARRY'; break;
        }
        case 'cannon': {
          targetX=b.x-Math.sign(b.x-centerX||1)*70; targetY=b.y-attack*34; action='SHOOT'; break;
        }
        case 'sweeper': {
          targetX=centerX+side*0.55; targetY=attack>0?this.field.height-150:150; action='RESET'; break;
        }
        case 'bulwark': {
          const homeY=attack>0?this.field.height-160:160;
          const ballInOwnHalf=attack>0?b.y>centerY:b.y<centerY;
          targetY=ballInOwnHalf?homeY+(b.y-homeY)*0.55:homeY;
          targetX=centerX+side;
          action=ballInOwnHalf?'PRESS':'COVER'; break;
        }
      }
      if(robot.archetype==='striker'){
        for(const other of this.state.robots){
          if(other.id===robot.id)continue;
          const awayX=robot.x-other.x,awayY=robot.y-other.y,dist=Math.hypot(awayX,awayY);
          if(dist>0&&dist<96){const push=(96-dist)/dist;targetX+=awayX*push*1.35;targetY+=awayY*push*1.35;}
        }
      }
      const dx=targetX-robot.x,dy=targetY-robot.y,len=Math.hypot(dx,dy)||1;
      const desiredX=dx/len*robot.maxSpeed,desiredY=dy/len*robot.maxSpeed;
      const maxDelta=robot.acceleration*dt;
      robot.vx+=this.clamp(desiredX-robot.vx,-maxDelta,maxDelta);
      robot.vy+=this.clamp(desiredY-robot.vy,-maxDelta,maxDelta);
      const speed=Math.hypot(robot.vx,robot.vy);
      if(speed>robot.maxSpeed){robot.vx=robot.vx/speed*robot.maxSpeed;robot.vy=robot.vy/speed*robot.maxSpeed;}
      if(Math.hypot(robot.vx,robot.vy)>1){const facingLen=Math.hypot(robot.vx,robot.vy);robot.facingX=robot.vx/facingLen;robot.facingY=robot.vy/facingLen;}
      robot.x=this.clamp(robot.x+robot.vx*dt,28,this.field.width-28);
      robot.y=this.clamp(robot.y+robot.vy*dt,28,this.field.height-28);
      robot.target=robot.archetype==='sweeper'?'GOAL_COVER':robot.archetype==='bulwark'?'BALL_SUPPORT':'BALL';
      robot.action=action;
    }
  }

  private resolveRobotRobotCollisions(){
    const robots=[...this.state.robots].sort((a,b)=>a.id.localeCompare(b.id));
    for(let i=0;i<robots.length;i++) for(let j=i+1;j<robots.length;j++){
      const a=robots[i],b=robots[j]; const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1;
      const minDist=a.radius+b.radius;
      if(dist<minDist){
        const nx=dx/dist,ny=dy/dist,penetration=minDist-dist;
        const correction=penetration*0.75;
        a.x=this.clamp(a.x-nx*correction,28,this.field.width-28); a.y=this.clamp(a.y-ny*correction,28,this.field.height-28);
        b.x=this.clamp(b.x+nx*correction,28,this.field.width-28); b.y=this.clamp(b.y+ny*correction,28,this.field.height-28);
        const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
        if(relative<0){const impulse=-(1+0.25)*relative/(1/a.mass+1/b.mass);a.vx-=nx*impulse/a.mass;a.vy-=ny*impulse/a.mass;b.vx+=nx*impulse/b.mass;b.vy+=ny*impulse/b.mass;this.clampRobotVelocity(a);this.clampRobotVelocity(b);}
        this.recordEvent({type:'robot-robot-collision',ids:[a.id,b.id],x:(a.x+b.x)/2,y:(a.y+b.y)/2,impulse:Math.max(0,-relative)});
      }
    }
  }

  private resolveRobotBallCollisions(){
    const b=this.state.ball;
    const candidates:Array<{robot:Robot;nx:number;ny:number;distance:number;score:number}>=[];
    for(const robot of [...this.state.robots].sort((a,b2)=>a.id.localeCompare(b2.id))){
      const dx=b.x-robot.x,dy=b.y-robot.y,dist=Math.hypot(dx,dy)||1,minDist=robot.radius+b.radius;
      if(dist>minDist+1) continue;
      const nx=dx/dist,ny=dy/dist;
      const penetration=minDist-dist;
      if(penetration>0){const invBall=1/b.mass,invRobot=1/robot.mass,total=invBall+invRobot;b.x+=nx*penetration*invBall/total;b.y+=ny*penetration*invBall/total;robot.x=this.clamp(robot.x-nx*penetration*invRobot/total,28,this.field.width-28);robot.y=this.clamp(robot.y-ny*penetration*invRobot/total,28,this.field.height-28);}
      const relative=b.vx*nx+b.vy*ny-(robot.vx*nx+robot.vy*ny);
      if(relative<0){
        const impulse=-(1+0.55)*relative/(1/b.mass+1/robot.mass);
        const beforeX=b.vx,beforeY=b.vy;
        b.vx=this.clamp(b.vx+nx*impulse/b.mass,-MAX_SPEED,MAX_SPEED); b.vy=this.clamp(b.vy+ny*impulse/b.mass,-MAX_SPEED,MAX_SPEED);
        robot.vx-=nx*impulse/robot.mass; robot.vy-=ny*impulse/robot.mass;
        this.clampRobotVelocity(robot);
        this.recordEvent({type:'robot-ball-collision',ids:[robot.id],x:b.x,y:b.y,impulse,vxBefore:beforeX,vyBefore:beforeY,vxAfter:b.vx,vyAfter:b.vy});
      }
      const forward=robot.facingX*nx+robot.facingY*ny;
      if((robot.archetype==='striker'||robot.archetype==='cannon')&&dist<=32&&forward>=Math.cos(35*Math.PI/180)) candidates.push({robot,nx,ny,distance:dist,score:forward-dist/100});
    }
    candidates.sort((a,b2)=>b2.score-a.score||a.robot.id.localeCompare(b2.robot.id));
    if(candidates[0])this.tryKick(candidates[0].robot,candidates[0].nx,candidates[0].ny);
  }

  private tryKick(robot:Robot,nx:number,ny:number){
    const b=this.state.ball;
    if((robot.archetype!=='striker'&&robot.archetype!=='cannon')||robot.kickCooldown>0||robot.kickLockout>0||this.kickoffTimer>0||this.ballKickInvuln>0) return;
    const forward=robot.facingX*nx+robot.facingY*ny;
    if(forward<Math.cos(35*Math.PI/180)||Math.hypot(b.x-robot.x,b.y-robot.y)>32||this.kickBurstCount>=3) return;
    if(this.lastKickTeam===robot.team&&this.state.elapsed-this.lastKickElapsed<0.24&&Math.hypot(b.x-this.lastKickX,b.y-this.lastKickY)<40)return;
    const attackY=robot.team==='blue'?-1:1;
    const goalX=this.field.width/2;
    const goalBias=this.clamp((goalX-b.x)/160,-1,1)*0.55;
    const aimX=robot.facingX*0.35+goalBias,aimY=robot.facingY*0.25+attackY*0.85;
    const aimLen=Math.hypot(aimX,aimY)||1;
    const power=robot.archetype==='cannon'?205:180;
    const beforeX=b.vx,beforeY=b.vy;
    b.vx=this.clamp(b.vx+aimX/aimLen*power/b.mass,-MAX_SPEED,MAX_SPEED);
    b.vy=this.clamp(b.vy+aimY/aimLen*power/b.mass,-MAX_SPEED,MAX_SPEED);
    robot.vx*=0.55;robot.vy*=0.55;robot.kickCooldown=robot.archetype==='cannon'?1.1:0.85;robot.kickLockout=0.10;robot.action=robot.archetype==='cannon'?'SHOOT':'KICK';
    this.ballKickInvuln=0.12;this.lastKickTeam=robot.team;this.lastKickX=b.x;this.lastKickY=b.y;this.lastKickElapsed=this.state.elapsed;if(this.state.elapsed-this.kickBurstStart>0.8)this.kickBurstStart=this.state.elapsed;this.kickBurstCount++;
    this.recordEvent({type:'kick',ids:[robot.id],x:b.x,y:b.y,impulse:power,vxBefore:beforeX,vyBefore:beforeY,vxAfter:b.vx,vyAfter:b.vy});
  }

  private integrateBall(dt:number){
    const b=this.state.ball;b.x+=b.vx*dt;b.y+=b.vy*dt;
    b.vx*=Math.pow(0.88,dt);b.vy*=Math.pow(0.88,dt);
    const speed=Math.hypot(b.vx,b.vy);if(speed>MAX_SPEED){b.vx=b.vx/speed*MAX_SPEED;b.vy=b.vy/speed*MAX_SPEED;}
    if(Math.hypot(b.vx,b.vy)<2){b.vx=0;b.vy=0;}
  }

  private resolveGoalOrWalls(){
    const b=this.state.ball; const inGoalMouth=b.x>=GOAL_LEFT&&b.x<=GOAL_RIGHT;
    if(b.y<=18&&b.vy<0&&inGoalMouth){this.state.score.blue++;this.beginGoalReset('blue');return;}
    if(b.y>=this.field.height-18&&b.vy>0&&inGoalMouth){this.state.score.orange++;this.beginGoalReset('orange');return;}
    if(b.x<18){b.x=18;b.vx=Math.abs(b.vx)*0.7;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});}
    if(b.x>this.field.width-18){b.x=this.field.width-18;b.vx=-Math.abs(b.vx)*0.7;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});}
    if(b.y<18){b.y=18;b.vy=Math.abs(b.vy)*0.7;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});}
    if(b.y>this.field.height-18){b.y=this.field.height-18;b.vy=-Math.abs(b.vy)*0.7;this.recordEvent({type:'wall-bounce',x:b.x,y:b.y});}
  }

  private beginGoalReset(scoringTeam:Team){const b=this.state.ball;b.y=scoringTeam==='blue'?-35:this.field.height+35;b.vx=0;b.vy=0;this.state.goalResetTimer=1;this.recordEvent({type:'goal',x:b.x,y:b.y});}
  private resetBall(){const b=this.state.ball;b.x=this.field.width/2;b.y=this.field.height/2;b.vx=0;b.vy=0;this.state.goalResetTimer=0;this.kickoffTimer=0.75;this.recordEvent({type:'kickoff',x:b.x,y:b.y});}

  private recordEvent(event:Omit<SimulationEvent,'tick'|'elapsed'>){
    this.events.push({...event,tick:this.tickIndex,elapsed:this.state.elapsed});
    if(this.events.length>20000)this.events.shift();
  }

  private recordTelemetry(){
    const frame:TelemetryFrame={tick:this.tickIndex,elapsed:this.state.elapsed,status:this.state.status,goalResetTimer:this.state.goalResetTimer,score:{...this.state.score},ball:{x:this.state.ball.x,y:this.state.ball.y,vx:this.state.ball.vx,vy:this.state.ball.vy},robots:this.state.robots.map(r=>({id:r.id,team:r.team,role:r.role,archetype:r.archetype,x:r.x,y:r.y,vx:r.vx,vy:r.vy,facingX:r.facingX,facingY:r.facingY,kickCooldown:r.kickCooldown,kickLockout:r.kickLockout,target:r.target,action:r.action})),events:this.events.filter(e=>e.tick===this.tickIndex).map(e=>({...e}))};
    this.telemetry.push(frame);if(this.telemetry.length>10000)this.telemetry.shift();
  }

  getEvents(){return this.events.map(event=>({...event}));}
  getTelemetry(){return this.telemetry.map(frame=>({...frame,score:{...frame.score},ball:{...frame.ball},robots:frame.robots.map(robot=>({...robot})),events:frame.events.map(event=>({...event}))}));}
  private clampRobotVelocity(robot:Robot){const speed=Math.hypot(robot.vx,robot.vy);if(speed>robot.maxSpeed){robot.vx=robot.vx/speed*robot.maxSpeed;robot.vy=robot.vy/speed*robot.maxSpeed;}}
  private clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}
  snapshot(){ return JSON.parse(JSON.stringify(this.state)); }
}
