import {Game,SHAPES,squareFace} from './rules.js';
import {TOOL_IDS,BASE_TOOLS} from './tool-catalog.js';

const counters=['score','combo','maxCombo','resolved','snaps','misses','clears','spawned','nextId','laneCursor','bombs','coinsEarned','shieldDeflections'];
const clocks=['elapsed','spawnTimer','settleRemaining','slowRemaining'];
const finite=(n,min=0,max=1e12)=>Number.isFinite(n)&&n>=min&&n<=max;
const count=n=>Number.isSafeInteger(n)&&n>=0;
const vector=(a,length=3)=>Array.isArray(a)&&a.length===length&&a.every(n=>finite(n,-1e6,1e6));
const copy=value=>JSON.parse(JSON.stringify(value));

// Store rules, not meshes or animation objects. A resumed game has the same
// clocks, inventory and sculpture, and remains paused until the player resumes.
export function captureMagnet(game,rotation,selectedId){
  if(game?.mode!=='magnet'||game.status!=='playing')return null;
  const state={};
  for(const key of [...counters,...clocks,'blocks','incoming','tools','equipped','shieldActive','checkpointAt','checkpointDue','awaitingCheckpoint'])state[key]=copy(game[key]);
  return {version:1,shape:game.shape,state,pace:{steps:game.pace.steps,multiplier:game.pace.multiplier},rotation:[...rotation],selectedId,savedAt:Date.now(),available:[...game.config.toolTypes]};
}

export function restoreMagnet(snapshot,random=Math.random){
  try{
    if(!snapshot||snapshot.version!==1||!Object.hasOwn(SHAPES,snapshot.shape))return null;
    const s=snapshot.state;
    if(!s||!counters.every(k=>count(s[k]))||!clocks.every(k=>finite(s[k],k==='spawnTimer'?-1e6:0)))return null;
    if(!vector(snapshot.rotation,4)||Math.abs(Math.hypot(...snapshot.rotation)-1)>.01)return null;
    if(!count(snapshot.pace?.steps)||snapshot.pace.steps!==Math.floor(s.snaps/25)||!finite(snapshot.pace.multiplier,1))return null;
    if(!Array.isArray(snapshot.available)||snapshot.available.length>4||!BASE_TOOLS.every(k=>snapshot.available.includes(k))||!snapshot.available.every(k=>TOOL_IDS.includes(k)))return null;
    if(!Array.isArray(s.equipped)||s.equipped.length>2||new Set(s.equipped).size!==s.equipped.length||!s.equipped.every(k=>snapshot.available.includes(k)))return null;
    if(!snapshot.available.every(k=>Number.isInteger(s.tools?.[k])&&s.tools[k]>=0&&s.tools[k]<=3))return null;
    if(!count(s.checkpointAt)||s.checkpointAt<100||s.checkpointAt%100||typeof s.awaitingCheckpoint!=='boolean'||typeof s.checkpointDue!=='boolean'||typeof s.shieldActive!=='boolean')return null;
    if(s.awaitingCheckpoint&&(!s.checkpointDue||s.snaps<s.checkpointAt||s.settleRemaining))return null;
    if(!Array.isArray(s.blocks)||s.blocks.length<1||s.blocks.length>4000||!Array.isArray(s.incoming)||s.incoming.length>4)return null;
    const ids=new Set();
    for(const b of s.blocks){
      if(!count(b.id)||ids.has(b.id)||!vector(b.position)||!Number.isInteger(b.color)||b.color<(b.id===0?-1:0)||b.color>2)return null;
      ids.add(b.id);
      if(b.drop!=null&&!snapshot.available.includes(b.drop))return null;
      if(snapshot.shape!=='cube'&&(b.shape!==snapshot.shape||!Array.isArray(b.vertices)||b.vertices.length!==SHAPES[snapshot.shape].vertices.length||!b.vertices.every(v=>vector(v))))return null;
    }
    if(!s.blocks.some(b=>b.id===0&&b.color===-1))return null;
    const lanes=new Set();
    for(const p of s.incoming){
      if(!count(p.id)||ids.has(p.id)||!Number.isInteger(p.lane)||p.lane<0||p.lane>3||lanes.has(p.lane)||!Number.isInteger(p.color)||p.color<0||p.color>2||p.shape!==snapshot.shape||!finite(p.duration,.01,30)||!finite(p.remaining,-100,p.duration)||p.drop!=null&&!snapshot.available.includes(p.drop))return null;
      lanes.add(p.lane);ids.add(p.id);
    }
    if(s.nextId<=Math.max(...ids)||s.snaps>s.resolved||s.resolved>s.spawned)return null;
    const game=new Game(0,'magnet',random,s.tools,{shape:snapshot.shape,equipped:s.equipped,unlockedTools:Object.fromEntries(snapshot.available.map(k=>[k,true]))});
    for(const key of [...counters,...clocks,'blocks','incoming','tools','equipped','shieldActive','checkpointAt','checkpointDue','awaitingCheckpoint'])game[key]=copy(s[key]);
    for(const p of game.incoming)p.geometry={...squareFace};
    game.pace.steps=snapshot.pace.steps;game.pace.multiplier=snapshot.pace.multiplier;
    return {game,rotation:[...snapshot.rotation],selectedId:game.incoming.some(p=>p.id===snapshot.selectedId)?snapshot.selectedId:null};
  }catch{return null;}
}

export function validMagnetSave(value){return restoreMagnet(value)?copy(value):null;}
