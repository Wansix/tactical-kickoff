import * as Phaser from 'phaser';
import { GameScene } from './presentation/GameScene';
import './style.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<header><div><span class="kicker">ROBO CUP / SIMULATION LAB</span><h1>TACTICAL KICKOFF</h1></div><div class="legend"><span class="blue-dot"></span> BLUE UNIT <span class="orange-dot"></span> ORANGE UNIT</div></header><main><div id="game"></div><aside><div class="panel"><h2>MATCH CONTROL</h2><button id="start">▶ START MATCH</button><button id="pause">Ⅱ PAUSE</button><button id="restart">↻ RESTART</button><label>SIMULATION SPEED <select id="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div><div class="panel"><h2>COMPOSITION</h2><p class="hint">Swap the blue unit's duties after the whistle. Every team stays 2v2 — no keeper.</p><button id="swap-blue">⇄ SWAP BLUE ROLES</button><button id="replay">⟲ REPLAY MATCH</button></div><div class="panel telemetry"><h2>LIVE TELEMETRY</h2><p><b>STRIKER</b><br>presses ball carrier, attacks goal</p><p><b>ANCHOR</b><br>covers lane, stabilizes shape</p><small>SEE ACTION TAGS ON FIELD<br>DETERMINISTIC SEED / 2025</small></div></aside></main><footer>90 SECOND WATCH MODE <span>•</span> ENGINE-INDEPENDENT MATCH LOGIC <span>•</span> PHASER 3 PRESENTATION</footer>`;
const button=(id:string)=>document.querySelector<HTMLButtonElement>(`#${id}`)!;
const controls=[button('start'),button('pause'),button('restart'),button('replay'),button('swap-blue')];
const speed=document.querySelector<HTMLSelectElement>('#speed')!;
controls.forEach((control)=>control.disabled=true);speed.disabled=true;
const bindControls=(scene:GameScene)=>{
  button('start').onclick=()=>scene.start();
  button('pause').onclick=()=>scene.togglePause();
  button('restart').onclick=()=>scene.reset();
  button('replay').onclick=()=>scene.reset();
  button('swap-blue').onclick=()=>scene.swap('blue');
  speed.onchange=()=>scene.setMatchSpeed(Number(speed.value));
  controls.forEach((control)=>control.disabled=false);speed.disabled=false;
};
new Phaser.Game({type:Phaser.AUTO,width:1040,height:700,parent:'game',backgroundColor:'#08111d',scene:[new GameScene(bindControls)]});
