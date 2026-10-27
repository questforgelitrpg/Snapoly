import { SHAPES, isPoly, polyBlock, polyExposedFaces, neighborsOf, settlePolyBlocks, facesOf } from './polyhedra.js';
import {TOOL_IDS,TOOL_DEFS,BASE_TOOLS,normalizeLoadout} from './tool-catalog.js';
import {ContinuousPace} from './continuous-pace.js';
export { SHAPES } from './polyhedra.js';
// Renderer-independent game rules. A polygon face and its size determine fit;
// color is considered only after a successful geometric connection.
export const COLORS = [
  { name: 'Aqua', hex: '#37e7d0', symbol: '○' },
  { name: 'Rose', hex: '#f25a99', symbol: '△' },
  { name: 'Amber', hex: '#ffc15c', symbol: 'Ⅱ' },
  { name: 'Violet', hex: '#b58aff', symbol: '◇' },
  { name: 'Sapphire', hex: '#55a6ff', symbol: '≈' },
  { name: 'Lime', hex: '#b9ee62', symbol: '+' }
];
export const CHAPTERS=Object.values(SHAPES).map(({id:shape,name,symbol})=>({shape,name,symbol}));
export const LEVELS_PER_SHAPE=20,MAX_LIFE_POOL=5,GROWTH_TARGET=100;
const STARTERS=[
  {name:'First contact',lanes:[0],concurrent:1,travel:13,interval:1.5,total:9,gold:2500},
  {name:'Cross current',lanes:[0,2],concurrent:2,travel:15,interval:2.8,total:12,gold:4000},
  {name:'Triple threat',lanes:[0,1,3],concurrent:3,travel:17,interval:2.3,total:15,gold:5800},
  {name:'Four fronts',lanes:[0,1,2,3],concurrent:4,travel:20,interval:2,total:20,gold:8500}
];
// One-based level numbers. A speed step tightens both the deadline and cadence.
export const CAMPAIGN_SPEED_STEPS=Object.freeze({5:15,7:10,12:15,16:25,18:25,20:25});
export const FLOW_STARTS=Object.freeze({
  endless:Object.freeze({travel:16,interval:1.8,colorCount:3}),
  magnet:Object.freeze({travel:14,interval:1.6,colorCount:COLORS.length})
});
const CHANGES=[
  ['sides','First contact','One incoming side. Tap a face, then Snap.','→'],
  ['sides','Two sides','Choose between two incoming cells.','↔'],
  ['sides','Three sides','A third side joins. Watch the next arrival.','↗'],
  ['sides','Four sides','Four sides, with more time per cell. Keep a steady rhythm.','✥'],
  ['tool','Speed up + Slow Time','24 cells. Movement and arrivals are 15% faster. First unlock: 2 Slow charges.','◷'],
  ['cells','More cells','30 cells to resolve. Keep making room.','◇'],
  ['speed','Speed up','Movement and arrivals are another 10% faster.','»'],
  ['tool','Bomb unlocked','First unlock: 2 Bombs. Remove a selected incoming cell.','✦'],
  ['cells','A longer run','36 cells. Build, match and clear.','◇'],
  ['lives','Earn spare lives','Every 3 match clears earns a spare. Hold up to 5.','♥'],
  ['colors','Violet joins','A fourth color, with its own diamond symbol.','◇'],
  ['speed','Speed up','Movement and arrivals are another 15% faster. Plan quick color clears.','»'],
  ['colors','Sapphire joins','Five colors. Follow color and symbol together.','≈'],
  ['cells','More to fit','48 cells. Plan your next connection.','◇'],
  ['colors','Full prism palette','Lime joins. All six colors are in play for Expert.','+'],
  ['speed','Beyond Expert','Movement and arrivals are 25% faster. Choose your tools before Play.','»'],
  ['cells','The long game','60 cells. Make every connection count.','◇'],
  ['speed','Speed up','Another 25% faster. Keep room for all six colors.','»'],
  ['tool','Tool bonus','28% of random cells now carry a tool.','✦'],
  ['speed','Master tempo','Another 25% faster. Six colors, four sides, 60 cells.','»']
];
export const LEVELS=CHAPTERS.flatMap((chapter,chapterIndex)=>{
  let travel=20+(chapterIndex?2:0),interval=2,total=20,toolTypes=[],dropRate=0,colorCount=3,clearsPerLife=0;
  return CHANGES.map(([change,title,description,icon],stage)=>{
    const speed=CAMPAIGN_SPEED_STEPS[stage+1];
    if(speed){travel/=1+speed/100;interval/=1+speed/100;}
    if(stage===4){total=24;toolTypes=['slow'];dropRate=.12;}
    if(stage===5)total=30;
    if(stage===7){toolTypes=['slow','bomb'];dropRate=.16;}
    if(stage===8)total=36;
    if(stage===9)clearsPerLife=3;
    if(stage===10)colorCount=4;
    if(stage===12)colorCount=5;
    if(stage===13)total=48;
    if(stage===14)colorCount=COLORS.length;
    if(stage===16)total=60;
    if(stage===18)dropRate=.28;
    const starter=STARTERS[stage];
    return {...(starter||{lanes:[0,1,2,3],concurrent:4,interval,total,travel,gold:Math.round(total*350)}),
      ...(starter?{travel:starter.travel+(chapterIndex?2:0)}:{}),name:starter?.name||title,subtitle:description,
      shape:chapter.shape,chapter:chapterIndex,stage,toolTypes:[...toolTypes],dropRate,colorCount,clearsPerLife,
      briefing:{change,title,description,icon},grantTool:stage===4?'slow':stage===7?'bomb':null};
  });
});
export const SLOW_SECONDS=8,SLOW_FACTOR=.45,TOOL_CAP=3;
export const ECONOMY=Object.freeze({clearPerJewel:2,toolOverflow:3,completionBase:10,completionStep:2,startingTools:2});
export const SHOP_PRICES=Object.fromEntries(TOOL_IDS.map(t=>[t,TOOL_DEFS[t].price]));
export const completionCoins=(stage,completed=false)=>completed?0:ECONOMY.completionBase+stage*ECONOMY.completionStep;
export function purchaseTool(profile,tool){
  const price=SHOP_PRICES[tool],count=profile.tools?.[tool];
  if(!BASE_TOOLS.includes(tool)&&!profile.unlockedTools?.[tool])return null;
  if(!price||!Number.isSafeInteger(profile.coins)||profile.coins<price||!Number.isSafeInteger(count)||count<0||count>=TOOL_CAP)return null;
  return {coins:profile.coins-price,tools:{...profile.tools,[tool]:count+1}};
}
export const chapterUnlocked=(chapter,records=[])=>Number.isInteger(chapter)&&chapter>=0&&chapter<CHAPTERS.length&&Array.from({length:chapter},(_,i)=>i).every(i=>records[i*LEVELS_PER_SHAPE+3]?.stars>0);
export const levelUnlocked=(index,records=[])=>!!LEVELS[index]&&chapterUnlocked(LEVELS[index].chapter,records)&&(LEVELS[index].stage===0||records[index]?.stars>0||records[index-1]?.stars>0);
export const BADGES=[{at:5,name:'Beginner',symbol:'◇'},{at:10,name:'Novice',symbol:'✧'},{at:15,name:'Expert',symbol:'✦'},{at:20,name:'Master',symbol:'♛'}];
export function chapterBadges(chapter,records=[]){const completed=records.slice(chapter*20,chapter*20+20).filter(r=>r?.stars>0).length;return BADGES.map(b=>({...b,earned:completed>=b.at,completed}));}
export const isFlowMode=mode=>mode==='endless'||mode==='magnet';
export const magnetUnlocked=(records=[])=>CHAPTERS.some((_,i)=>chapterBadges(i,records)[1].earned);
export function flowShapeUnlocked(shape,records=[],mode='endless'){
  const chapter=CHAPTERS.findIndex(c=>c.shape===shape);
  return chapter>=0&&isFlowMode(mode)&&(mode!=='magnet'||magnetUnlocked(records))&&(chapter===0||chapterBadges(chapter,records)[0].earned);
}
export const NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export const LANE_NAMES = ['Right', 'Top', 'Left', 'Bottom'];
export const ALIGNMENT_COS = Math.cos(9 * Math.PI / 180);
export const CLEAR_HOLD = 0.18;
export const SLIDE_SECONDS = 0.12;
const key = p => p.join(',');
export const sameFace = (a, b) => a.kind === b.kind && a.sides === b.sides && Math.abs(a.size - b.size) < 0.001;
export const squareFace = { kind: 'regular', sides: 4, size: 1 };
export function fitsFace(piece,face){
  if(!piece.shape||piece.shape==='cube')return sameFace(piece.geometry,face.geometry);
  return facesOf(polyBlock(piece.shape,0,-1)).some(f=>sameFace(f.geometry,face.geometry));
}
export const contactsForFace=(face,blocks)=>face.candidate?neighborsOf({...face.candidate,id:-100},blocks):touchingBlocks(face.destination,blocks);
export function touchingBlocks(position, blocks) {
  return blocks.filter(b => b.position.reduce((sum,n,i) => sum + Math.abs(n-position[i]),0) === 1);
}

// A match starts at the newly snapped cube. Only face-connected cubes of its
// color belong to the trigger group: corners, edges, the core and other colors
// cannot bridge it. Three clears only this group; four or more sweep the board.
export function connectedColorGroup(blocks, startId) {
  const start = blocks.find(b => b.id === startId);
  if (!start || start.color < 0 || start.id === 0) return [];
  if(isPoly(start)){
    const group=[start],visited=new Set([start.id]);
    for(let cursor=0;cursor<group.length;cursor++)for(const b of neighborsOf(group[cursor],blocks))if(b.id!==0&&b.color===start.color&&!visited.has(b.id)){visited.add(b.id);group.push(b);}
    return group;
  }
  const cells = new Map(blocks.map(b => [key(b.position),b]));
  const group = [start], visited = new Set([start.id]);
  for (let cursor=0;cursor<group.length;cursor++) {
    for (const normal of NORMALS) {
      const neighbor = cells.get(key(group[cursor].position.map((n,i) => n+normal[i])));
      if (neighbor && neighbor.id !== 0 && neighbor.color === start.color && !visited.has(neighbor.id)) {
        visited.add(neighbor.id);group.push(neighbor);
      }
    }
  }
  return group;
}

// Settle toward the core on the sculpture's own lattice, independent of camera
// orientation. Each recorded slide is one axis step into a vacant cell. Its
// distance to the core strictly decreases, so the process must terminate and
// cannot swap, overlap or erase surviving cubes. At rest every cube has a path
// of occupied, inward neighbors back to the core.
export function settleBlocks(blocks) {
  if(blocks.some(isPoly))return settlePolyBlocks(blocks);
  const settled = blocks.map(b => ({ ...b, position:[...b.position] }));
  const core = settled.find(b => b.id === 0);
  if (!core) throw new Error('Settling requires a core.');
  const distance = b => b.position.reduce((sum,n,i) => sum + Math.abs(n-core.position[i]),0);
  const occupied = new Set(settled.map(b => key(b.position)));
  const steps = [];
  let moved;
  do {
    moved = false;
    // Inner cubes close their gaps first, making space for the outer cubes.
    const candidates = settled.filter(b => b.id !== 0).sort((a,b) => distance(a)-distance(b) || a.id-b.id);
    for (const block of candidates) {
      const axes = [0,1,2].sort((a,b) => Math.abs(block.position[b]-core.position[b])-Math.abs(block.position[a]-core.position[a]) || a-b);
      for (const axis of axes) {
        const offset = block.position[axis]-core.position[axis];
        if (!offset) continue;
        const to = [...block.position];
        to[axis] -= Math.sign(offset);
        if (occupied.has(key(to))) continue;
        const from = [...block.position];
        occupied.delete(key(from));occupied.add(key(to));
        block.position = to;
        steps.push({ id:block.id, from, to:[...to] });
        moved = true;
        break;
      }
      if (moved) break;
    }
  } while (moved);
  return { blocks:settled, steps };
}

export function exposedFaces(blocks) {
  if(blocks.some(isPoly))return polyExposedFaces(blocks);
  const occupied = new Set(blocks.map(b => key(b.position)));
  return blocks.flatMap(block => NORMALS.flatMap((normal, index) => {
    const neighbor = block.position.map((n, i) => n + normal[i]);
    return occupied.has(key(neighbor)) ? [] : [{
      blockId: block.id, index, normal, position: block.position,
      destination: neighbor, geometry: squareFace
    }];
  }));
}

export class Game {
  constructor(level = 0, mode = 'classic', random = Math.random, loadout=null, options={}) {
    this.level = level;
    this.mode = mode;
    this.completed = options.completed===true;
    this.config = mode === 'growth'
      ? {name:'Growth lab',shape:'cube',chapter:0,stage:0,lanes:[0,1,2,3],concurrent:1,travel:18,interval:.8,total:Infinity,gold:Infinity,toolTypes:[],dropRate:0,colorCount:3,clearsPerLife:0}
      : isFlowMode(mode)?{name:mode==='magnet'?'MagnetFlow':'Endless flow',shape:Object.hasOwn(SHAPES,options.shape)?options.shape:'cube',chapter:0,stage:0,lanes:[0,1,2,3],concurrent:4,...FLOW_STARTS[mode],total:Infinity,gold:Infinity,toolTypes:['slow','bomb'],dropRate:.22,clearsPerLife:3}
      : LEVELS[level];
    if(!this.config)throw new Error('Unknown level.');
    this.config={...this.config,toolTypes:[...this.config.toolTypes]};
    if(mode==='magnet')this.config.clearsPerLife=0;
    if(isFlowMode(mode)||(mode==='classic'&&this.config.stage>=6)){
      for(const kind of TOOL_IDS)if(!BASE_TOOLS.includes(kind)&&options.unlockedTools?.[kind])this.config.toolTypes.push(kind);
    }
    this.equipped=normalizeLoadout(options.equipped,this.config.toolTypes);
    this.pace=new ContinuousPace(options.paceRandom||random);this.shieldActive=false;this.shieldDeflections=0;
    this.shape=this.config.shape;
    this.random = random;
    this.blocks = [this.shape==='cube'?{id:0,position:[0,0,0],color:-1}:polyBlock(this.shape,0,-1)];
    this.incoming = [];
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.lives = mode==='magnet'?1:3; this.resolved = 0; this.snaps = 0; this.misses = 0;
    this.checkpointAt=100;this.checkpointDue=false;this.awaitingCheckpoint=false;
    this.clears = 0; this.spawned = 0; this.elapsed = 0;
    this.nextId = 1; this.spawnTimer = 0; this.laneCursor = 0;
    this.settleRemaining = 0;
    const stock=kind=>!this.config.toolTypes.includes(kind)?0:Number.isFinite(loadout?.[kind])?Math.max(0,Math.min(TOOL_CAP,Math.floor(loadout[kind]))):loadout?0:ECONOMY.startingTools;
    this.tools=Object.fromEntries([...new Set([...BASE_TOOLS,...this.config.toolTypes])].map(t=>[t,stock(t)]));this.slowRemaining=0;this.bombs=0;this.coinsEarned=0;
    this.lifePool=Number.isFinite(options.lifePool)?Math.max(0,Math.min(MAX_LIFE_POOL,Math.floor(options.lifePool))):0;
    this.lifeProgress=Number.isFinite(options.lifeProgress)?Math.max(0,Math.min(2,Math.floor(options.lifeProgress))):0;
    if(mode==='magnet'){this.lifePool=0;this.lifeProgress=0;}
    this.status = 'playing';
    this.events = [];
  }
  event(type, detail = {}) { this.events.push({ type, ...detail }); }
  drainEvents() { return this.events.splice(0); }
  spawn() {
    if (this.status !== 'playing' || this.settleRemaining > 0 || this.awaitingCheckpoint) return;
    const cfg = this.config;
    const available = cfg.lanes.filter(lane => !this.incoming.some(p => p.lane === lane));
    if (!available.length || this.spawned >= cfg.total) return;
    const preferred = cfg.lanes[this.laneCursor++ % cfg.lanes.length];
    const lane = available.includes(preferred) ? preferred : available[0];
    // The first three tutorial pieces teach the color clear through play.
    const color = this.config.stage === 0 && this.mode === 'classic' && this.spawned < 3
      ? 0 : Math.min(cfg.colorCount-1,Math.floor(this.random() * cfg.colorCount));
    const progress = this.mode === 'classic' ? this.spawned / cfg.total : 0;
    const duration = cfg.travel * (1 - progress * 0.08);
    const tools=cfg.toolTypes;
    const teaching=cfg.grantTool&&this.spawned===2?cfg.grantTool:isFlowMode(this.mode)&&this.spawned===2?'slow':isFlowMode(this.mode)&&this.spawned===5?'bomb':null;
    const drop=teaching||(tools.length&&this.random()<cfg.dropRate?tools[Math.min(tools.length-1,Math.floor(this.random()*tools.length))]:null);
    const piece = { id: this.nextId++, color, lane, remaining: duration, duration, shape:this.shape,drop,geometry: squareFace };
    this.incoming.push(piece); this.spawned++;
    this.event('spawn', { piece });
  }
  tick(dt) {
    if (this.status !== 'playing' || this.awaitingCheckpoint) return [];
    if (this.settleRemaining > 0) {
      this.settleRemaining = Math.max(0,this.settleRemaining-dt);
      if (this.settleRemaining === 0) {
        this.event('settled');this.checkEnd();this.checkpoint();
      }
      return [];
    }
    const slowed=Math.min(dt,this.slowRemaining),clockDt=slowed*SLOW_FACTOR+(dt-slowed);
    this.slowRemaining=Math.max(0,this.slowRemaining-dt);
    this.elapsed += dt;
    const runClock=clockDt*(this.mode==='classic'?1:this.pace.multiplier);
    this.spawnTimer -= runClock;
    if (this.spawnTimer <= 0 && this.incoming.length < this.config.concurrent && this.spawned < this.config.total) {
      this.spawn(); this.spawnTimer = this.config.interval;
    }
    for (const piece of this.incoming) piece.remaining -= runClock;
    return this.incoming.filter(p => p.remaining <= 0).map(p => p.id);
  }
  snap(id, face, alignment, quick = false) {
    if (this.status !== 'playing' || this.settleRemaining > 0 || this.awaitingCheckpoint) return false;
    const piece = this.incoming.find(p => p.id === id);
    if (!piece) return false;
    const exists = face && exposedFaces(this.blocks).find(f => f.blockId === face.blockId && f.index === face.index);
    if (!exists || exists.blocked || !fitsFace(piece,exists) || alignment < ALIGNMENT_COS) {
      this.miss(id, 'Face not aligned'); return false;
    }
    this.incoming = this.incoming.filter(p => p.id !== id);
    const block = { id: piece.id, position: [...exists.destination], color: piece.color,drop:piece.drop,...(exists.candidate?{shape:this.shape,vertices:exists.candidate.vertices.map(v=>[...v])}:{}) };
    this.blocks.push(block);
    this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.snaps++; this.resolved++;
    const multiplier = 1 + Math.min(4, Math.floor(this.combo / 3));
    const contacts = isPoly(block)?neighborsOf(block,this.blocks).length:touchingBlocks(block.position,this.blocks.filter(b=>b.id!==block.id)).length;
    const points = Math.round((100 + 75 * Math.max(0,contacts-1) + (quick ? 75 * Math.max(0, piece.remaining / piece.duration) : 0)) * multiplier);
    this.score += points;
    this.event('snap', { block, piece, points, multiplier, contacts });
    const matching = connectedColorGroup(this.blocks, block.id);
    if (this.mode !== 'growth' && matching.length >= 3) {
      const fullClear = matching.length >= 4;
      const removed = fullClear ? this.blocks.filter(b=>b.id!==0) : matching;
      const bonus = (fullClear ? 1000+250*(matching.length-4) : 450) * multiplier;
      const rewards=Object.fromEntries(Object.keys(this.tools).map(t=>[t,0]));let coins=removed.length*ECONOMY.clearPerJewel;
      for(const matched of removed)if(matched.drop&&this.config.toolTypes.includes(matched.drop)&&Object.hasOwn(rewards,matched.drop)){
        if(this.tools[matched.drop]<TOOL_CAP){this.tools[matched.drop]++;rewards[matched.drop]++;}else coins+=ECONOMY.toolOverflow;
      }
      this.coinsEarned+=coins;
      this.score += bonus; this.clears++;
      if(this.config.clearsPerLife){
        this.lifeProgress++;
        if(this.lifeProgress>=this.config.clearsPerLife){this.lifeProgress=0;if(this.lifePool<MAX_LIFE_POOL){this.lifePool++;this.event('life-earned',{pool:this.lifePool});}}
      }
      const removedIds = new Set(removed.map(b => b.id));
      const result = settleBlocks(this.blocks.filter(b => !removedIds.has(b.id)));
      this.blocks = result.blocks;
      this.settleRemaining = (fullClear ? .55 : CLEAR_HOLD) + result.steps.length * SLIDE_SECONDS;
      this.event('clear', { color:piece.color, fullClear, matchCount:matching.length, bonus, rewards, coins, removed, steps:result.steps, duration:this.settleRemaining });
    }
    if (this.mode === 'growth' && this.blocks.length >= GROWTH_TARGET+1) {
      this.status = 'won'; this.event('won');
    } else this.checkEnd();
    if(this.mode!=='classic')for(const change of this.pace.advance(this.snaps))this.event('speed-up',change);
    if(this.mode==='magnet'&&this.snaps>=this.checkpointAt){this.checkpointDue=true;this.checkpoint();}
    return true;
  }
  miss(id, reason = 'Missed connection') {
    const piece = this.incoming.find(p => p.id === id);
    if (!piece || this.status !== 'playing' || this.settleRemaining > 0 || this.awaitingCheckpoint) return;
    this.incoming = this.incoming.filter(p => p.id !== id);
    if(this.shieldActive){this.shieldActive=false;this.shieldDeflections++;this.resolved++;this.event('shield-block',{piece});this.checkEnd();return;}
    this.combo = 0; this.misses++; this.resolved++;
    if(this.mode!=='growth'){this.lives--;if(this.lives===0&&this.config.clearsPerLife&&this.lifePool>0){this.lifePool--;this.lives=1;this.event('life-used',{pool:this.lifePool});}}
    this.event('miss', { piece, reason });
    this.checkEnd();
  }
  useSlow(){
    if(!this.canUseTool('slow')||this.slowRemaining>0)return false;
    this.tools.slow--;this.slowRemaining=SLOW_SECONDS;this.event('slow',{duration:SLOW_SECONDS});return true;
  }
  bomb(id){
    const piece=this.incoming.find(p=>p.id===id);
    if(!this.canUseTool('bomb')||!piece)return false;
    this.tools.bomb--;this.incoming=this.incoming.filter(p=>p.id!==id);this.bombs++;this.resolved++;
    this.score+=75;this.event('bomb',{piece,points:75});this.checkEnd();return true;
  }
  canUseTool(kind){return this.equipped.includes(kind)&&this.config.toolTypes.includes(kind)&&this.status==='playing'&&!this.awaitingCheckpoint&&!this.settleRemaining&&this.tools[kind]>0;}
  checkpoint(){if(this.mode==='magnet'&&this.checkpointDue&&!this.settleRemaining&&!this.awaitingCheckpoint&&this.status==='playing'){this.awaitingCheckpoint=true;this.event('checkpoint',{placed:this.snaps});}}
  continueMagnet(){if(this.mode!=='magnet'||!this.awaitingCheckpoint||this.status!=='playing')return false;this.awaitingCheckpoint=false;this.checkpointDue=false;this.checkpointAt=(Math.floor(this.snaps/100)+1)*100;return true;}
  endMagnet(){if(this.mode!=='magnet'||this.status!=='playing')return false;this.status='ended';this.event('ended');return true;}
  useShield(){
    if(!this.canUseTool('shield')||this.shieldActive)return false;
    this.tools.shield--;this.shieldActive=true;this.event('shield');return true;
  }
  recolor(id,color){
    const piece=this.incoming.find(p=>p.id===id);
    if(!this.canUseTool('recolor')||!piece||!Number.isInteger(color)||color<0||color>=this.config.colorCount||piece.color===color)return false;
    this.tools.recolor--;piece.color=color;this.event('recolor',{piece});return true;
  }
  checkEnd() {
    if (this.settleRemaining > 0 || this.status!=='playing') return;
    if (this.lives <= 0) { this.status = 'lost'; this.event('lost'); }
    else if (this.mode==='classic' && this.resolved >= this.config.total) { this.status = 'won';const coins=completionCoins(this.config.stage,this.completed);this.coinsEarned+=coins;this.event('won',{coins}); }
  }
  stars() {
    if (this.status !== 'won') return 0;
    return 1 + Number(this.misses <= 1) + Number(this.score >= this.config.gold && this.misses === 0);
  }
}
