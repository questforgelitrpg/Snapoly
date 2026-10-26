import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, exposedFaces, sameFace, squareFace, LEVELS, ALIGNMENT_COS, touchingBlocks, connectedColorGroup, settleBlocks, CLEAR_HOLD, NORMALS, fitsFace, CHAPTERS, chapterUnlocked, SLOW_SECONDS, SLOW_FACTOR, TOOL_CAP, SHOP_PRICES, purchaseTool, COLORS, levelUnlocked, chapterBadges, MAX_LIFE_POOL, flowShapeUnlocked, magnetUnlocked, isFlowMode } from '../src/rules.js';
import {Quaternion,Euler,Vector3} from 'three';
import {MagnetLatch,MAGNET_ANGLE,MAGNET_COS,MAGNET_START_EULER,withinMagnetCatch,magnetRotation} from '../src/magnet.js';
import {loadProfile,grantToolIntroductions} from '../src/profile.js';
import {ECONOMY,completionCoins} from '../src/rules.js';
import {clearRewardMarkup,playClearReward} from '../src/clear-rewards.js';
import {ContinuousPace,PACE_EVERY} from '../src/continuous-pace.js';
import {captureMagnet,restoreMagnet} from '../src/magnet-save.js';
import {TOOL_IDS,normalizeLoadout,researchTool} from '../src/tool-catalog.js';
import {createMusicPlayer,musicVolume} from '../src/music.js';
import { SHAPES, polyBlock, facesOf, reflectedCandidate, verticesOf, shareFace, overlaps, neighborsOf, length, sub } from '../src/polyhedra.js';

test('two introduction charges arrive once, with a one-charge upgrade for old saves',()=>{
  const profile=loadProfile({coins:123});
  assert.equal(grantToolIntroductions(profile,[]),false);
  assert.equal(grantToolIntroductions(profile,['slow']),true);assert.deepEqual(profile.tools,{slow:2,bomb:0,shield:0,recolor:0});
  profile.tools.slow=0;
  const resumed=loadProfile(JSON.parse(JSON.stringify(profile)));
  assert.equal(grantToolIntroductions(resumed,['slow']),false);assert.equal(resumed.tools.slow,0);
  assert.equal(grantToolIntroductions(resumed,['slow','bomb']),true);assert.deepEqual(resumed.tools,{slow:0,bomb:2,shield:0,recolor:0});
  assert.equal(resumed.coins,123);
  const legacy=loadProfile({schema:2,introduced:{slow:true,bomb:true},tools:{slow:0,bomb:3},coins:999});
  assert.equal(grantToolIntroductions(legacy,['slow','bomb']),true);assert.deepEqual(legacy.tools,{slow:1,bomb:3,shield:0,recolor:0});
  legacy.tools.bomb=0;assert.equal(grantToolIntroductions(legacy,['slow','bomb']),false);assert.equal(legacy.tools.bomb,0);assert.equal(legacy.coins,999);
  for(const mode of ['endless','magnet'])assert.deepEqual(new Game(0,mode).tools,{slow:2,bomb:2});
});

test('coin balance rewards clears on replay but pays the completion bonus only on a first win',()=>{
  assert.deepEqual(SHOP_PRICES,{slow:45,bomb:55,shield:65,recolor:80});assert.equal(ECONOMY.clearPerJewel,2);
  assert.equal(completionCoins(0),10);assert.equal(completionCoins(19),48);assert.equal(completionCoins(19,true),0);
  const replay=new Game(0,'classic',()=>.9,null,{completed:true});
  for(let i=0;i<9;i++)snapNext(replay,i%3);
  assert.equal(replay.status,'won');assert.equal(replay.coinsEarned,0);assert.equal(replay.drainEvents().find(e=>e.type==='won').coins,0);
  const clearReplay=new Game(0,'classic',()=>.9,null,{completed:true});clearReplay.config={...clearReplay.config,total:3};
  for(let i=0;i<3;i++)snapNext(clearReplay,0);
  assert.equal(clearReplay.status,'won');assert.equal(clearReplay.coinsEarned,6);
  assert.equal(purchaseTool({coins:7*6,tools:{slow:0,bomb:0}},'slow'),null);
  assert.equal(purchaseTool({coins:8*6,tools:{slow:0,bomb:0}},'slow').coins,3);
  assert.equal(purchaseTool({coins:9*6,tools:{slow:0,bomb:0}},'bomb'),null);
  assert.equal(purchaseTool({coins:10*6,tools:{slow:0,bomb:0}},'bomb').coins,5);
});

test('clear reward art distinguishes the one-color triple from a full four-plus sweep',()=>{
  const triple=clearRewardMarkup({color:1,fullClear:false,matchCount:3,bonus:900});
  assert.ok(triple.includes('COLOR CLEAR'));assert.ok(triple.includes('ONE COLOR'));assert.ok(triple.includes('+900'));
  assert.equal((triple.match(/<g transform=/g)||[]).length,3);assert.ok(!triple.includes('ALL CELLS'));
  const full=clearRewardMarkup({color:0,fullClear:true,matchCount:5,bonus:2500});
  assert.ok(full.includes('FULL CLEAR'));assert.ok(full.includes('5 MATCH · ALL CELLS'));assert.ok(full.includes('+2,500'));
  assert.equal((full.match(/<g transform=/g)||[]).length,4);
});

test('full-clear audio has a longer distinct fanfare and releases all audio nodes',()=>{
  function context(){
    const nodes=[],voices=[];
    const param=()=>({value:0,setValueAtTime(v){assert.ok(Number.isFinite(v));},linearRampToValueAtTime(v){assert.ok(v>=0);},exponentialRampToValueAtTime(v){assert.ok(v>0);}});
    const node=()=>{const n={connect(){},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
    return {currentTime:1,sampleRate:48000,destination:{},nodes,voices,
      createGain(){return Object.assign(node(),{gain:param()});},
      createOscillator(){const n=Object.assign(node(),{frequency:param(),start(t){this.startTime=t;},stop(t){this.stopTime=t;}});voices.push(n);return n;},
      createBiquadFilter(){return Object.assign(node(),{frequency:param()});},
      createBuffer(c,n){return {getChannelData(){return new Float32Array(n);}};},
      createBufferSource(){const n=Object.assign(node(),{start(t){this.startTime=t;},stop(t){this.stopTime=t;}});voices.push(n);return n;}};
  }
  const group=context(),full=context();playClearReward(group,false,0);playClearReward(full,true,0);
  assert.ok(full.voices.length>group.voices.length);
  assert.ok(Math.max(...full.voices.map(n=>n.stopTime))>Math.max(...group.voices.map(n=>n.stopTime))+.4);
  for(const ctx of [group,full]){assert.ok(ctx.nodes[0].gain.value<=.25);for(const n of ctx.voices)n.onended();assert.ok(ctx.nodes.every(n=>n.disconnected));}
});

function snapAt(game, color, position, settle=true) {
  if(!game.incoming.length)game.spawn();
  const piece=game.incoming[0];piece.color=color;
  const face=exposedFaces(game.blocks).find(f=>f.destination.every((n,i)=>n===position[i]));
  assert.ok(face,`No exposed face at ${position}`);
  assert.ok(game.snap(piece.id,face,1,true));
  if(settle&&game.settleRemaining)game.tick(game.settleRemaining);
  return piece.id;
}

function snapNext(game, color) {
  if(!game.incoming.length) game.spawn();
  const p=game.incoming[0];if(color!==undefined)p.color=color;
  const faces=exposedFaces(game.blocks).filter(f=>!f.blocked);
  const face=game.shape==='cube'?faces.find(f=>f.normal[0]===1):faces.sort((a,b)=>Number(game.blocks.find(v=>v.id===b.blockId)?.color===p.color)-Number(game.blocks.find(v=>v.id===a.blockId)?.color===p.color))[0];
  assert.ok(game.snap(p.id,face,1,true));
  if(game.settleRemaining)game.tick(game.settleRemaining);
  return p;
}

test('new shapes have broad regular faces, preserve old campaign indexes and extend saved flow scores',()=>{
  assert.equal(SHAPES.hexprism.faces.filter(f=>f.length===6).length,2);
  assert.equal(SHAPES.hexprism.faces.filter(f=>f.length===4).length,6);
  assert.equal(SHAPES.dodecahedron.faces.length,12);assert.ok(SHAPES.dodecahedron.faces.every(f=>f.length===5));
  assert.deepEqual(CHAPTERS.map(c=>c.shape),['cube','pyramid','diamond','hexprism','dodecahedron']);
  const records=[];for(const i of [3,23,43])records[i]={stars:1,score:100};
  assert.equal(chapterUnlocked(3,records),true);assert.equal(chapterUnlocked(4,records),false);
  records[63]={stars:1};assert.equal(chapterUnlocked(4,records),true);
  const restored=loadProfile({schema:2,records,coins:999,endless:{diamond:55},magnet:{cube:77}});
  assert.equal(restored.records[43].score,100);assert.equal(restored.coins,999);assert.equal(restored.endless.diamond,55);
  assert.equal(restored.endless.hexprism,0);assert.equal(restored.magnet.dodecahedron,0);
});

test('research spends coins once, requires a badge in one shape and preserves stored charges',()=>{
  const records=Array.from({length:15},()=>({stars:1}));
  const fresh=loadProfile({schema:2,records,coins:400,tools:{slow:1,bomb:3}}),before=structuredClone(fresh);
  const shield=researchTool(fresh,'shield');assert.deepEqual(fresh,before);assert.equal(shield.coins,260);
  assert.equal(shield.tools.shield,2);assert.equal(shield.tools.bomb,3);assert.equal(shield.unlockedTools.shield,true);
  assert.equal(researchTool(shield,'shield'),null);
  const recolor=researchTool({...shield,coins:300},'recolor');assert.equal(recolor.coins,80);assert.equal(recolor.tools.recolor,2);
  assert.equal(researchTool({...fresh,coins:139},'shield'),null);
  assert.equal(researchTool(loadProfile({schema:2,coins:999,records:Array.from({length:9},()=>({stars:1}))}),'shield'),null);
  assert.equal(purchaseTool(fresh,'shield'),null);assert.equal(purchaseTool(shield,'shield').tools.shield,3);
  assert.equal(purchaseTool({...shield,tools:{...shield.tools,shield:3}},'shield'),null);
  const reloaded=loadProfile(JSON.parse(JSON.stringify(recolor)));assert.equal(grantToolIntroductions(reloaded,['shield','recolor']),false);
  assert.equal(reloaded.coins,80);assert.equal(reloaded.tools.recolor,2);
});

test('loadout has at most two valid unique tools and keeps stowed stock unusable but collectible',()=>{
  assert.deepEqual(normalizeLoadout(['shield','shield','invalid','recolor','slow']),['shield','recolor']);
  const options={unlockedTools:{shield:true,recolor:true},equipped:['shield','recolor','bomb']};
  const game=new Game(9,'classic',()=>.9,{slow:2,bomb:2,shield:2,recolor:2},options);
  assert.deepEqual(game.equipped,['shield','recolor']);assert.equal(game.useSlow(),false);game.spawn();assert.equal(game.bomb(game.incoming[0].id),false);
  assert.equal(game.tools.slow,2);assert.equal(game.tools.bomb,2);
  for(let i=0;i<3;i++){if(!game.incoming.length)game.spawn();game.incoming[0].drop='bomb';snapNext(game,0);}
  assert.equal(game.tools.bomb,3);assert.equal(game.equipped.length,2);
  const early=new Game(0,'classic',()=>.9,{shield:3},options);assert.equal(early.useShield(),false);assert.deepEqual(early.equipped,[]);
});

test('Shield protects exactly one missed cell without life, combo or speed progress loss',()=>{
  const game=new Game(9,'classic',()=>.9,{shield:2,slow:0,bomb:0},{unlockedTools:{shield:true},equipped:['shield']});
  game.combo=7;assert.equal(game.useShield(),true);assert.equal(game.useShield(),false);assert.equal(game.tools.shield,1);
  game.spawn();game.miss(game.incoming[0].id);assert.equal(game.lives,3);assert.equal(game.combo,7);assert.equal(game.misses,0);
  assert.equal(game.shieldActive,false);assert.equal(game.shieldDeflections,1);assert.equal(game.snaps,0);assert.equal(game.resolved,1);
  game.spawn();game.miss(game.incoming[0].id);assert.equal(game.lives,2);assert.equal(game.combo,0);assert.equal(game.misses,1);
});

test('Recolor changes only the selected color, spends once and preserves its timer, lane and marked tool',()=>{
  const game=new Game(10,'classic',()=>.9,{recolor:2},{unlockedTools:{recolor:true},equipped:['recolor']});
  game.spawn();game.spawn();const piece=game.incoming[0],other=structuredClone(game.incoming[1]);piece.color=0;piece.drop='slow';
  const before=structuredClone(piece);assert.equal(game.recolor(piece.id,0),false);assert.equal(game.recolor(piece.id,4),false);
  assert.equal(game.recolor(piece.id,1),true);assert.deepEqual(piece,{...before,color:1});assert.deepEqual(game.incoming[1],other);
  assert.equal(game.tools.recolor,1);assert.equal(game.snaps,0);assert.equal(game.resolved,0);assert.equal(game.coinsEarned,0);
  assert.equal(game.recolor(-1,2),false);game.settleRemaining=.5;assert.equal(game.recolor(piece.id,2),false);
});

test('geometric compatibility checks polygon type, side count and edge size independently of color',()=>{
  assert.equal(sameFace(squareFace,{kind:'regular',sides:4,size:1,color:2}),true);
  assert.equal(sameFace(squareFace,{kind:'regular',sides:3,size:1}),false);
  assert.equal(sameFace(squareFace,{kind:'regular',sides:4,size:2}),false);
  assert.equal(sameFace(squareFace,{kind:'irregular',sides:4,size:1}),false);
});
test('attaching a cube removes both occupied faces and exposes five new faces',()=>{
  const game=new Game();assert.equal(exposedFaces(game.blocks).length,6);
  snapNext(game,0);assert.equal(exposedFaces(game.blocks).length,10);
  const all=exposedFaces(game.blocks);assert.ok(!all.find(f=>f.blockId===0&&f.index===0));
  assert.ok(!all.find(f=>f.blockId===1&&f.index===1));
});
test('a corner-filling cube connects to several existing cubes and earns a join bonus',()=>{
  const game=new Game(0,'growth');
  game.blocks.push({id:90,position:[1,0,0],color:0},{id:91,position:[0,1,0],color:1});
  game.spawn();game.incoming[0].color=2;
  const corner=exposedFaces(game.blocks).find(f=>f.blockId===90&&f.index===2);
  assert.deepEqual(corner.destination,[1,1,0]);
  assert.equal(game.snap(game.incoming[0].id,corner,1,false),true);
  assert.equal(touchingBlocks([1,1,0],game.blocks).length,2);
  const event=game.drainEvents().find(e=>e.type==='snap');
  assert.equal(event.contacts,2);assert.equal(event.points,175);
  assert.equal(game.blocks.length,4);assert.equal(exposedFaces(game.blocks).length,16);
});
test('a three-face junction closes a pocket without overlapping any cube',()=>{
  const game=new Game(0,'growth');
  game.blocks=[{id:0,position:[0,1,1],color:-1},{id:90,position:[1,0,1],color:0},{id:91,position:[1,1,0],color:1}];
  game.spawn();const face=exposedFaces(game.blocks).find(f=>f.blockId===0&&f.index===0);
  assert.equal(game.snap(game.incoming[0].id,face,1,false),true);
  const event=game.drainEvents().find(e=>e.type==='snap');assert.equal(event.contacts,3);assert.equal(event.points,250);
  assert.equal(new Set(game.blocks.map(b=>b.position.join(','))).size,4);
});
test('a stale or invalid face cannot create overlapping geometry',()=>{
  const game=new Game();game.spawn();const face=exposedFaces(game.blocks)[0];
  assert.equal(game.snap(game.incoming[0].id,face,1),true);game.spawn();
  assert.equal(game.snap(game.incoming[0].id,face,1),false);assert.equal(game.blocks.length,2);assert.equal(game.lives,2);
});
test('a touching triple clears only its group and preserves separate cubes of the same color',()=>{
  const game=new Game(3);
  const first=snapAt(game,0,[1,0,0]),second=snapAt(game,0,[2,0,0]);
  const rose=snapAt(game,1,[-1,0,0]),remote=snapAt(game,0,[-2,0,0]),amber=snapAt(game,2,[0,1,0]);
  const third=snapAt(game,0,[2,1,0]); // Bent, face-connected triples count.
  assert.equal(game.clears,1);assert.equal(game.snaps,6);assert.equal(game.combo,6);
  assert.deepEqual(game.blocks.map(b=>b.id),[0,rose,remote,amber]);
  assert.deepEqual(game.blocks.map(b=>b.color),[-1,1,0,2]);
  const clear=game.drainEvents().find(e=>e.type==='clear');
  assert.deepEqual(clear.removed.map(b=>b.id).sort((a,b)=>a-b),[first,second,third]);
  assert.ok(clear.bonus>0);assert.ok(game.score>1000);
});

test('separated same-color cubes do not clear until the incoming cube makes a touching triple',()=>{
  const game=new Game(3);
  for(const color of [0,1,0,2,0])snapNext(game,color);
  assert.equal(game.clears,0);assert.equal(game.blocks.length,6);
  const remote=game.blocks.filter(b=>b.color===0).slice(0,2).map(b=>b.id);
  snapNext(game,0);assert.equal(game.clears,0);snapNext(game,0);
  assert.equal(game.clears,1);
  assert.deepEqual(game.blocks.filter(b=>b.color===0).map(b=>b.id),remote);
  assert.equal(game.blocks.filter(b=>b.color===1).length,1);
  assert.equal(game.blocks.filter(b=>b.color===2).length,1);
});

test('matches use face contact in all six directions, never edge, corner, core or other-color bridges',()=>{
  for(const normal of NORMALS){
    const game=new Game(3);
    for(let n=1;n<=3;n++)snapAt(game,0,normal.map(v=>v*n));
    assert.equal(game.clears,1);assert.equal(game.blocks.length,1);
  }
  const blocks=[{id:0,color:-1,position:[0,0,0]},
    {id:1,color:0,position:[1,0,0]},{id:2,color:0,position:[0,1,0]},
    {id:3,color:0,position:[0,0,1]},{id:4,color:0,position:[-1,0,0]},
    {id:5,color:1,position:[2,0,0]},{id:6,color:0,position:[3,0,0]}];
  for(const block of blocks.filter(b=>b.color===0))assert.deepEqual(connectedColorGroup(blocks,block.id),[block]);
  assert.deepEqual(connectedColorGroup(blocks,0),[]);
  assert.deepEqual(connectedColorGroup(blocks,-1),[]);
  assert.equal(connectedColorGroup([{id:1,color:0,position:[0,0,0]},{id:2,color:0,position:[1,1,1]}],1).length,1);
});

test('a four-piece match clears every attached color, preserves the core and awards a full-clear bonus',()=>{
  const game=new Game(3);
  game.blocks=[{id:0,color:-1,position:[0,0,0]},
    {id:90,color:0,position:[1,0,0]},{id:91,color:0,position:[2,1,0]},{id:92,color:0,position:[1,2,0]},
    {id:93,color:2,position:[2,0,0]},{id:94,color:1,position:[0,1,0]},{id:95,color:2,position:[0,2,0]}];
  snapAt(game,0,[1,1,0]);
  const clear=game.drainEvents().find(e=>e.type==='clear');
  assert.equal(clear.matchCount,4);assert.equal(clear.fullClear,true);
  assert.equal(clear.removed.length,7);assert.equal(clear.bonus,1000);assert.equal(clear.coins,14);
  assert.deepEqual(game.blocks,[{id:0,color:-1,position:[0,0,0]}]);
});

test('five-piece full clear increases the bonus, collects swept tools and leaves other incoming pieces alone',()=>{
  const game=new Game(7,'classic',()=>.9,{slow:0,bomb:0});
  game.blocks.push({id:90,color:0,position:[1,0,0]},{id:91,color:0,position:[2,1,0]},
    {id:92,color:0,position:[1,2,0]},{id:93,color:0,position:[1,1,1]},
    {id:94,color:1,position:[-1,0,0],drop:'bomb'},{id:95,color:2,position:[-2,0,0],drop:'slow'});
  game.spawn();game.spawn();const waiting=structuredClone(game.incoming[1]);
  snapAt(game,0,[1,1,0],false);
  const clear=game.drainEvents().find(e=>e.type==='clear');
  assert.equal(clear.matchCount,5);assert.equal(clear.fullClear,true);assert.equal(clear.bonus,1250);
  assert.deepEqual(clear.rewards,{slow:1,bomb:1});assert.deepEqual(game.tools,{slow:1,bomb:1});
  assert.deepEqual(game.incoming,[waiting]);assert.equal(game.lives,3);assert.equal(game.resolved,1);
  assert.equal(game.blocks.length,1);assert.equal(game.settleRemaining,.55);
  game.tick(.55);assert.deepEqual(game.incoming,[waiting]);assert.equal(game.status,'playing');
});

test('full clears preserve each shape core and finish their effect before the final stage reward',()=>{
  for(const level of [0,20,40]){
    const game=new Game(level,'classic',()=>.9);game.config={...game.config,total:1};
    const core=structuredClone(game.blocks[0]);
    let last=0;
    // A valid face-connected geometry fixture isolates the four-match boundary.
    for(let n=0;n<3;n++){
      const face=exposedFaces(game.blocks).find(f=>f.blockId===last&&!f.blocked);
      const block=face.candidate?{...structuredClone(face.candidate),id:90+n,color:0}:{id:90+n,color:0,position:[...face.destination]};
      game.blocks.push(block);last=block.id;
    }
    game.spawn();const piece=game.incoming[0];piece.color=0;
    const face=exposedFaces(game.blocks).find(f=>f.blockId===last&&!f.blocked);
    assert.equal(game.snap(piece.id,face,1),true);
    assert.equal(game.drainEvents().find(e=>e.type==='clear').fullClear,true);
    assert.deepEqual(game.blocks,[core]);assert.equal(game.status,'playing');assert.equal(game.coinsEarned,8);
    game.checkEnd();assert.equal(game.status,'playing');game.tick(.55);
    assert.equal(game.status,'won');assert.equal(game.coinsEarned,18);
    game.checkEnd();assert.equal(game.coinsEarned,18);
  }
});

test('settling closes gaps in a mixed-color line with collision-free, one-cell slides',()=>{
  const blocks=[{id:0,color:-1,position:[0,0,0]},{id:2,color:1,position:[2,0,0]},{id:4,color:2,position:[4,0,0]}];
  const original=structuredClone(blocks);
  const result=settleBlocks(blocks);
  assert.deepEqual(blocks,original);
  assert.deepEqual(result.blocks.map(b=>b.position),[[0,0,0],[1,0,0],[2,0,0]]);
  assert.deepEqual(result.steps.map(s=>s.id),[2,4,4]);
  const occupied=new Map(blocks.map(b=>[b.id,[...b.position]]));
  for(const step of result.steps){
    assert.deepEqual(occupied.get(step.id),step.from);
    assert.ok(![...occupied.values()].some(p=>p.join(',')===step.to.join(',')));
    assert.equal(step.from.reduce((sum,n,i)=>sum+Math.abs(n-step.to[i]),0),1);
    occupied.set(step.id,step.to);
  }
});
test('settling reattaches detached branches on all three axes without discarding cubes',()=>{
  const blocks=[{id:0,color:-1,position:[0,0,0]},{id:1,color:1,position:[-3,0,0]},{id:2,color:2,position:[0,2,0]},{id:3,color:1,position:[1,1,-3]},{id:4,color:2,position:[0,-2,1]}];
  const result=settleBlocks(blocks);
  assert.equal(result.blocks.length,blocks.length);
  const connected=new Set([0]);let changed;
  do{changed=false;for(const block of result.blocks)if(!connected.has(block.id)&&touchingBlocks(block.position,result.blocks).some(b=>connected.has(b.id))){connected.add(block.id);changed=true;}}while(changed);
  assert.equal(connected.size,blocks.length);
  assert.deepEqual(result.blocks[0].position,[0,0,0]);
  assert.equal(new Set(result.blocks.map(b=>b.position.join(','))).size,blocks.length);
});
test('arrival clocks and snap inputs wait until the clear and slide sequence finishes',()=>{
  const game=new Game(1);
  game.blocks.push({id:90,color:0,position:[1,0,0]},{id:91,color:0,position:[2,0,0]},{id:92,color:1,position:[3,0,0]},{id:93,color:2,position:[4,0,0]});
  game.spawn();game.spawn();const first=game.incoming[0],waiting=game.incoming[1];first.color=0;
  const face=exposedFaces(game.blocks).find(f=>f.blockId===90&&f.index===2);
  game.snap(first.id,face,1);
  assert.ok(game.settleRemaining>CLEAR_HOLD);
  const before={time:game.elapsed,spawnTimer:game.spawnTimer,spawned:game.spawned,remaining:waiting.remaining,lives:game.lives,resolved:game.resolved};
  assert.deepEqual(game.tick(game.settleRemaining/2),[]);
  assert.equal(game.snap(waiting.id,exposedFaces(game.blocks)[0],1),false);
  game.miss(waiting.id);game.spawn();
  assert.deepEqual({time:game.elapsed,spawnTimer:game.spawnTimer,spawned:game.spawned,remaining:waiting.remaining,lives:game.lives,resolved:game.resolved},before);
  game.tick(game.settleRemaining);assert.equal(game.settleRemaining,0);
  assert.ok(game.drainEvents().some(e=>e.type==='settled'));
  assert.equal(game.snap(waiting.id,exposedFaces(game.blocks)[0],1),true);
});
test('the final clear finishes settling before a level win, and retry has no pending slides',()=>{
  const game=new Game();game.blocks.push({id:90,color:0,position:[1,0,0]},{id:91,color:0,position:[2,0,0]},{id:92,color:1,position:[3,0,0]});
  game.resolved=game.config.total-1;game.spawned=game.config.total-1;
  game.spawn();game.incoming[0].color=0;
  game.snap(game.incoming[0].id,exposedFaces(game.blocks).find(f=>f.blockId===90&&f.index===2),1);
  assert.equal(game.status,'playing');assert.equal(game.stars(),0);
  game.tick(game.settleRemaining);assert.equal(game.status,'won');
  assert.equal(game.blocks.length,2);assert.equal(game.blocks[1].color,1);
  assert.equal(new Game().settleRemaining,0);
});

test('level completion preserves the sculpture and never acts as a color clear',()=>{
  const game=new Game();
  // Nine resolved pieces end the level even when none form a touching triple.
  for(let i=0;i<game.config.total;i++)snapNext(game,i%3);
  assert.equal(game.status,'won');assert.equal(game.clears,0);
  assert.equal(game.blocks.length,10);
  const final=structuredClone(game.blocks),events=game.drainEvents();
  assert.equal(events.filter(e=>e.type==='won').length,1);
  assert.equal(events.filter(e=>e.type==='clear').length,0);
  game.tick(100);game.spawn();game.miss(-1);
  assert.deepEqual(game.blocks,final);
  assert.equal(new Game(1).blocks.length,1); // Only explicitly starting another run resets it.
  assert.deepEqual(game.blocks,final);
});
test('settling preserves identity, color, connectivity and vacant-cell paths over 200 generated sculptures',()=>{
  let seed=197;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let run=0;run<200;run++){
    const blocks=[{id:0,color:-1,position:[0,0,0]}];
    for(let id=1;id<=18;id++){const faces=exposedFaces(blocks);const f=faces[Math.floor(random()*faces.length)];blocks.push({id,color:Math.floor(random()*3),position:[...f.destination]});}
    const clearing=run%3;const survivors=blocks.filter(b=>b.color!==clearing);
    const before=structuredClone(survivors),result=settleBlocks(survivors);
    assert.deepEqual(survivors,before);
    assert.deepEqual(result.blocks.map(b=>[b.id,b.color]),before.map(b=>[b.id,b.color]));
    const positions=new Map(before.map(b=>[b.id,b.position]));
    for(const step of result.steps){
      assert.deepEqual(positions.get(step.id),step.from);
      assert.ok(![...positions.values()].some(p=>p.join(',')===step.to.join(',')));
      assert.equal(step.from.reduce((n,v,i)=>n+Math.abs(v-step.to[i]),0),1);
      assert.equal(step.to.reduce((n,v)=>n+Math.abs(v),0),step.from.reduce((n,v)=>n+Math.abs(v),0)-1);
      positions.set(step.id,step.to);
    }
    const connected=new Set([0]);let changed;
    do{changed=false;for(const b of result.blocks)if(!connected.has(b.id)&&touchingBlocks(b.position,result.blocks).some(n=>connected.has(n.id))){connected.add(b.id);changed=true;}}while(changed);
    assert.equal(connected.size,survivors.length);
    assert.equal(new Set(result.blocks.map(b=>b.position.join(','))).size,survivors.length);
    assert.equal(settleBlocks(result.blocks).steps.length,0);
  }
});
test('geometric failure consumes one life and resets combo, without attaching the piece',()=>{
  const game=new Game();snapNext(game,0);game.spawn();
  assert.equal(game.snap(game.incoming[0].id,exposedFaces(game.blocks)[0],ALIGNMENT_COS-.001),false);
  assert.equal(game.lives,2);assert.equal(game.combo,0);assert.equal(game.blocks.length,2);
  assert.equal(game.misses,1);assert.equal(game.incoming.length,0);
});
test('three misses end a run; further inputs cannot change score or lives',()=>{
  const game=new Game();for(let i=0;i<3;i++){game.spawn();game.miss(game.incoming[0].id);}
  assert.equal(game.status,'lost');assert.equal(game.lives,0);const score=game.score;
  assert.equal(game.snap(-1,null,1),false);game.tick(100);assert.equal(game.score,score);assert.equal(game.lives,0);
});
test('each chapter scales to four lanes with more travel time for each added side',()=>{
  LEVELS.forEach((cfg,index)=>{
    const game=new Game(index);for(let n=0;n<cfg.concurrent;n++)game.tick(n?cfg.interval+.001:0);
    assert.equal(game.incoming.length,cfg.concurrent);assert.equal(new Set(game.incoming.map(p=>p.lane)).size,cfg.concurrent);
    assert.ok(game.incoming.every(p=>p.lane>=0&&p.lane<=3));
    const firstDuration=game.incoming[0].duration;game.incoming=[];game.spawned=cfg.total-1;game.spawn();
    assert.ok(game.incoming[0].duration<firstDuration);
    if(cfg.stage>0&&cfg.stage<4)assert.ok(cfg.travel>LEVELS[index-1].travel);
    assert.ok(game.incoming[0].duration>=cfg.travel*.92);
  });
});
test('growth mode retains matching colors, tolerates misses and stops after 100 attached cubes',()=>{
  const game=new Game(0,'growth');for(let i=0;i<5;i++)snapNext(game,0);
  assert.equal(game.blocks.length,6);assert.equal(game.clears,0);game.spawn();game.miss(game.incoming[0].id);
  assert.equal(game.lives,3);assert.equal(game.status,'playing');
  for(let i=5;i<100;i++)snapNext(game,0);assert.equal(game.blocks.length,101);assert.equal(game.status,'won');
});
test('every classic level can finish with three stars; retry state is fresh',()=>{
  LEVELS.forEach((cfg,index)=>{
    const game=new Game(index);for(let i=0;i<cfg.total;i++)snapNext(game,Math.floor(i/3)%3);
    assert.equal(game.status,'won');assert.equal(game.resolved,cfg.total);assert.equal(game.stars(),3);
    const retry=new Game(index);assert.equal(retry.score,0);assert.equal(retry.lives,3);assert.equal(retry.blocks.length,1);assert.equal(retry.elapsed,0);
  });
});
test('natural arrivals are reported for the renderer to resolve once against current geometry',()=>{
  const game=new Game();game.tick(0);const p=game.incoming[0];
  const expired=game.tick(p.duration+.01);assert.deepEqual(expired,[p.id]);
  assert.equal(game.incoming.length,1);game.snap(p.id,exposedFaces(game.blocks)[0],1,false);
  assert.equal(game.snaps,1);assert.equal(game.incoming.length,0);assert.equal(game.score,100);
});

test('three 20-level chapters keep the four-side shape unlock and sequential levels',()=>{
  assert.equal(LEVELS.length,100);assert.equal(CHAPTERS.length,5);
  const records=[];assert.equal(chapterUnlocked(0,records),true);assert.equal(levelUnlocked(0,records),true);assert.equal(levelUnlocked(1,records),false);
  assert.equal(chapterUnlocked(1,records),false);records[3]={stars:1};assert.equal(chapterUnlocked(1,records),true);
  assert.equal(levelUnlocked(4,records),true);assert.equal(chapterUnlocked(2,records),false);records[23]={stars:2};assert.equal(chapterUnlocked(2,records),true);
  assert.equal(chapterUnlocked(3,records),false);assert.equal(chapterUnlocked(undefined,records),false);
  for(let chapter=0;chapter<CHAPTERS.length;chapter++){assert.ok(LEVELS.slice(chapter*20,chapter*20+20).every(l=>l.shape===CHAPTERS[chapter].shape));}
  assert.deepEqual(LEVELS.slice(0,4).map(l=>l.travel),[14,16,18,20]);assert.ok(LEVELS[3].travel>7.5*2);
});

test('Slow Time scales only incoming/spawn clocks and handles its expiry exactly',()=>{
  const game=new Game(7,'classic',Math.random,{slow:1,bomb:1});game.spawn();const piece=game.incoming[0],remaining=piece.remaining;
  assert.equal(game.useSlow(),true);assert.equal(game.tools.slow,0);assert.equal(game.useSlow(),false);
  game.tick(10);assert.equal(game.slowRemaining,0);
  assert.ok(Math.abs(piece.remaining-(remaining-SLOW_SECONDS*SLOW_FACTOR-2))<1e-8);
  assert.equal(game.elapsed,10);
  const settling=new Game(7);settling.useSlow();settling.settleRemaining=.5;settling.tick(.25);
  assert.equal(settling.slowRemaining,8);
  assert.equal(new Game(0,'growth').useSlow(),false);
});

test('Bomb removes only the selected incoming piece with no loss, combo reset or board clear',()=>{
  const game=new Game(7,'classic',Math.random,{slow:1,bomb:1});for(let n=0;n<4;n++)game.spawn();game.combo=5;
  const target=game.incoming[2],others=game.incoming.filter(p=>p.id!==target.id).map(p=>structuredClone(p)),board=structuredClone(game.blocks);
  assert.equal(game.bomb(target.id),true);assert.deepEqual(game.incoming,others);assert.deepEqual(game.blocks,board);
  assert.equal(game.lives,3);assert.equal(game.combo,5);assert.equal(game.snaps,0);assert.equal(game.clears,0);
  assert.equal(game.resolved,1);assert.equal(game.bombs,1);assert.equal(game.score,75);assert.equal(game.tools.bomb,0);
  assert.equal(game.bomb(others[0].id),false);assert.equal(game.bomb(target.id),false);
  const final=new Game(7);final.resolved=final.config.total-1;final.spawned=final.config.total-1;final.spawn();
  assert.equal(final.bomb(final.incoming[0].id),true);assert.equal(final.status,'won');
  assert.equal(final.useSlow(),false);assert.equal(final.bomb(-1),false);
});

test('only tools inside the cleared touching group enter inventory; overflow becomes coins',()=>{
  const game=new Game(7,'classic',Math.random,{slow:1,bomb:1});game.blocks.push({id:90,color:1,position:[-1,0,0],drop:null},{id:91,color:0,position:[-2,0,0],drop:'bomb'});
  game.spawn();game.incoming[0].drop='slow';snapNext(game,0);
  assert.deepEqual(game.tools,{slow:1,bomb:1}); // Placing the marked jewel does not award it.
  game.spawn();game.incoming[0].drop=null;snapNext(game,0);
  game.spawn();game.incoming[0].drop='bomb';snapNext(game,0);
  assert.deepEqual(game.tools,{slow:2,bomb:2});assert.equal(game.coinsEarned,6);assert.equal(game.blocks.find(b=>b.id===91).drop,'bomb');
  const first=game.drainEvents().find(e=>e.type==='clear');assert.deepEqual(first.rewards,{slow:1,bomb:1});
  game.tools={slow:TOOL_CAP,bomb:TOOL_CAP};
  for(let n=0;n<3;n++){game.spawn();game.incoming[0].drop='slow';snapNext(game,1);}
  assert.deepEqual(game.tools,{slow:TOOL_CAP,bomb:TOOL_CAP});assert.equal(game.coinsEarned,21);
  assert.equal(game.drainEvents().find(e=>e.type==='clear').coins,15);
  const bombed=new Game(7);bombed.spawn();bombed.incoming[0].drop='slow';bombed.bomb(bombed.incoming[0].id);
  assert.equal(bombed.tools.slow,2);assert.equal(bombed.coinsEarned,0);
});

test('coin shop spends earned coins, rejects invalid purchases and does not mutate the wallet',()=>{
  const wallet={coins:100,tools:{slow:1,bomb:0}},before=structuredClone(wallet);
  const bought=purchaseTool(wallet,'bomb');assert.deepEqual(wallet,before);
  assert.equal(bought.coins,100-SHOP_PRICES.bomb);assert.equal(bought.tools.bomb,1);assert.equal(bought.tools.slow,1);
  assert.equal(purchaseTool({coins:SHOP_PRICES.slow-1,tools:{slow:0}},'slow'),null);
  assert.equal(purchaseTool({coins:100,tools:{slow:TOOL_CAP}},'slow'),null);
  assert.equal(purchaseTool(wallet,'unknown'),null);assert.equal(purchaseTool({coins:-10,tools:{slow:0}},'slow'),null);
  const run=new Game(7,'classic',Math.random,bought.tools);assert.deepEqual(run.tools,bought.tools);run.useSlow();
  const next=new Game(8,'classic',Math.random,run.tools);assert.deepEqual(next.tools,run.tools);
});

test('stage coin reward is paid once, while larger touching groups earn extra score',()=>{
  const game=new Game();for(let n=0;n<9;n++)snapNext(game,n%3);
  assert.equal(game.coinsEarned,10);game.checkEnd();game.tick(100);assert.equal(game.coinsEarned,10);
  const group=new Game(3);group.blocks.push({id:90,color:0,position:[1,0,0]},{id:91,color:0,position:[2,1,0]},{id:92,color:0,position:[1,2,0]},{id:93,color:1,position:[2,0,0]});
  snapAt(group,0,[1,1,0]);assert.equal(group.drainEvents().find(e=>e.type==='clear').bonus,1000);
});

test('Pyramid and Diamond have true polygon faces and rigid, nonoverlapping face attachments',()=>{
  for(const shape of ['pyramid','diamond','hexprism','dodecahedron']){
    const core=polyBlock(shape,0,-1),faces=facesOf(core);
    assert.equal(faces.length,{pyramid:5,diamond:8,hexprism:8,dodecahedron:12}[shape]);
    assert.equal(faces.filter(f=>f.geometry.sides===4).length,shape==='pyramid'?1:shape==='hexprism'?6:0);
    for(const face of faces){
      assert.ok(Math.abs(length(face.normal)-1)<1e-8);assert.ok(Math.abs(face.geometry.size-(shape==='dodecahedron'?.85:1))<1e-8);
      const candidate={...reflectedCandidate(core,face),id:1,color:0};
      assert.equal(shareFace(core,candidate),true);assert.equal(overlaps(core,candidate),false);
      for(let a=0;a<core.vertices.length;a++)for(let b=0;b<core.vertices.length;b++)assert.ok(Math.abs(length(sub(core.vertices[a],core.vertices[b]))-length(sub(candidate.vertices[a],candidate.vertices[b])))<1e-8);
      assert.equal(overlaps(core,{...candidate,position:core.position,vertices:core.vertices}),true);
    }
  }
  const cube=facesOf(polyBlock('cube',0,-1))[0],triangle=facesOf(polyBlock('diamond',0,-1))[0];
  assert.equal(fitsFace({shape:'diamond',geometry:squareFace},cube),false);
  assert.equal(fitsFace({shape:'pyramid',geometry:squareFace},cube),true);
  assert.equal(fitsFace({shape:'pyramid',geometry:squareFace},triangle),true);
  assert.equal(fitsFace({shape:'cube',geometry:squareFace},triangle),false);
});

test('generated Pyramid and Diamond sculptures retain every survivor and avoid solid intersections',()=>{
  let seed=518;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(const shape of ['pyramid','diamond','hexprism','dodecahedron'])for(let run=0;run<8;run++){
    const blocks=[polyBlock(shape,0,-1)];
    for(let id=1;id<=11;id++){
      const faces=exposedFaces(blocks).filter(f=>!f.blocked);assert.ok(faces.length>0);
      const face=faces[Math.floor(random()*faces.length)],block={...face.candidate,id,color:id%3};
      assert.equal(blocks.some(b=>overlaps(block,b)),false);blocks.push(block);
    }
    const survivors=blocks.filter(b=>b.color!==run%3),before=structuredClone(survivors),result=settleBlocks(survivors);
    assert.deepEqual(survivors,before);assert.deepEqual(result.blocks.map(b=>[b.id,b.color]),before.map(b=>[b.id,b.color]));
    for(let a=0;a<result.blocks.length;a++)for(let b=a+1;b<result.blocks.length;b++)assert.equal(overlaps(result.blocks[a],result.blocks[b]),false);
    const connected=new Set([0]);let changed;do{changed=false;for(const block of result.blocks)if(!connected.has(block.id)&&neighborsOf(block,result.blocks).some(b=>connected.has(b.id))){connected.add(block.id);changed=true;}}while(changed);
    assert.equal(connected.size,result.blocks.length,`${shape} survivors must reconnect`);
  }
});


test('campaign introduces one category per later level and retains the beginner pacing',()=>{
  for(let chapter=0;chapter<CHAPTERS.length;chapter++){
    const levels=LEVELS.slice(chapter*20,chapter*20+20);
    for(const cfg of levels.slice(0,4)){assert.deepEqual(cfg.toolTypes,[]);assert.equal(cfg.dropRate,0);assert.equal(cfg.colorCount,3);assert.equal(cfg.clearsPerLife,0);}
    assert.deepEqual(levels[4].toolTypes,['slow']);assert.equal(levels[4].total,24);assert.ok(Math.abs(levels[3].travel/levels[4].travel-1.08)<1e-10);
    for(const stage of [6,11,16])assert.ok(Math.abs(levels[stage-1].travel/levels[stage].travel-1.10)<1e-10);
    assert.deepEqual(levels[7].toolTypes,['slow','bomb']);assert.equal(levels[9].clearsPerLife,3);assert.equal(levels[14].clearsPerLife,2);
    assert.equal(levels[10].colorCount,4);assert.equal(levels[15].colorCount,5);assert.equal(levels[19].colorCount,6);
    for(let i=5;i<20;i++){
      const prev=levels[i-1],cfg=levels[i];
      const changes=[cfg.travel!==prev.travel,cfg.total!==prev.total,JSON.stringify(cfg.toolTypes)!==JSON.stringify(prev.toolTypes)||cfg.dropRate!==prev.dropRate,cfg.colorCount!==prev.colorCount,cfg.clearsPerLife!==prev.clearsPerLife];
      assert.equal(changes.filter(Boolean).length,1,`one category at level ${i+1}`);
      assert.ok(cfg.briefing.title&&cfg.briefing.description&&cfg.briefing.icon);
    }
  }
  assert.equal(new Set(COLORS.map(c=>c.hex)).size,6);assert.equal(new Set(COLORS.map(c=>c.symbol)).size,6);
});

test('starter levels withhold tools and drops even when saved stock exists',()=>{
  for(let chapter=0;chapter<CHAPTERS.length;chapter++)for(let n=0;n<4;n++){
    const game=new Game(chapter*20+n,'classic',()=>0,{slow:3,bomb:3});
    game.spawn();assert.deepEqual(game.tools,{slow:0,bomb:0});assert.equal(game.incoming[0].drop,null);
    assert.equal(game.useSlow(),false);assert.equal(game.bomb(game.incoming[0].id),false);
  }
  const slow=new Game(4,'classic',()=>.9,{slow:1,bomb:3});assert.deepEqual(slow.tools,{slow:1,bomb:0});
  for(let i=0;i<3;i++){slow.incoming=[];slow.spawn();}assert.equal(slow.incoming[0].drop,'slow');
});

test('profile migration preserves all legacy shapes, stocks and separate music preferences',()=>{
  const old={records:Array.from({length:12},(_,i)=>({stars:i%3+1,score:i*100})),tools:{slow:2,bomb:1},coins:60,muted:true};
  const p=loadProfile(old);for(let i=0;i<12;i++)assert.deepEqual(p.records[Math.floor(i/4)*20+i%4],old.records[i]);
  assert.deepEqual(p.tools,{...old.tools,shield:0,recolor:0});assert.equal(p.coins,60);assert.equal(p.muted,true);assert.equal(p.musicMuted,false);assert.equal(p.musicVolume,.2);
  assert.deepEqual(loadProfile(JSON.parse(JSON.stringify(p))),p);
  const malformed=loadProfile({schema:2,records:[{score:-1,stars:90}],musicVolume:1,lifePool:90,lifeProgress:90});
  assert.equal(malformed.musicVolume,.2);assert.equal(malformed.lifePool,5);assert.equal(malformed.records[0].stars,3);
});

test('badges count distinct wins independently for every shape and survive replays',()=>{
  const records=[];
  for(let chapter=0;chapter<CHAPTERS.length;chapter++)for(let count=0;count<=20;count++){
    for(let i=0;i<count;i++)records[chapter*20+i]={stars:1};
    assert.deepEqual(chapterBadges(chapter,records).map(b=>b.earned),[count>=5,count>=10,count>=15,count>=20]);
  }
  records[0]={stars:3};assert.equal(chapterBadges(0,records).filter(b=>b.earned).length,4);
});

test('three match clears earn a spare at level 10; level 15 needs two, caps at five and carries progress',()=>{
  const game=new Game(9,'classic',()=>.9,null,{lifePool:0,lifeProgress:0});
  for(let n=0;n<8;n++)snapNext(game,Math.floor(n/3)%3);assert.equal(game.lifePool,0);snapNext(game,2);
  assert.equal(game.lifePool,1);assert.equal(game.lifeProgress,0);assert.equal(game.drainEvents().filter(e=>e.type==='life-earned').length,1);
  const saved=new Game(14,'classic',()=>.9,null,{lifePool:4,lifeProgress:1});
  for(let n=0;n<3;n++)snapNext(saved,0);assert.equal(saved.lifePool,5);assert.equal(saved.lifeProgress,0);
  for(let n=0;n<6;n++)snapNext(saved,1);assert.equal(saved.lifePool,5);assert.equal(saved.lifeProgress,0);
  const early=new Game(8,'classic',()=>.9,null,{lifePool:3,lifeProgress:2});for(let n=0;n<3;n++)snapNext(early,0);
  assert.equal(early.lifePool,3);assert.equal(early.lifeProgress,2);assert.equal(early.config.clearsPerLife,0);
});

test('spare lives auto-spend only when active lives reach zero, without refilling on retry',()=>{
  const game=new Game(9,'classic',()=>.9,null,{lifePool:1});
  for(let i=0;i<3;i++){game.spawn();game.miss(game.incoming[0].id);}
  assert.equal(game.status,'playing');assert.equal(game.lives,1);assert.equal(game.lifePool,0);
  game.spawn();game.miss(game.incoming[0].id);assert.equal(game.status,'lost');
  const retry=new Game(9,'classic',()=>.9,null,{lifePool:game.lifePool,lifeProgress:game.lifeProgress});assert.equal(retry.lifePool,0);assert.equal(retry.lives,3);
  const early=new Game(0,'classic',()=>.9,null,{lifePool:3});for(let i=0;i<3;i++){early.spawn();early.miss(early.incoming[0].id);}assert.equal(early.status,'lost');assert.equal(early.lifePool,3);
});

test('endless supports every shape, matching clears, tool refills and infinite incoming',()=>{
  for(const shape of Object.keys(SHAPES)){
    const game=new Game(0,'endless',()=>.9,{slow:1,bomb:1},{shape});assert.equal(game.shape,shape);assert.equal(game.config.total,Infinity);
    assert.deepEqual(game.tools,{slow:1,bomb:1});
    for(let n=0;n<66;n++)snapNext(game,Math.floor(n/3)%3);
    assert.equal(game.status,'playing');assert.ok(game.clears>=20);assert.equal(game.resolved,66);assert.ok(game.lifePool>0);assert.ok(game.tools.slow>1);assert.ok(game.tools.bomb>1);
    assert.equal(game.useSlow(),true);game.spawn();assert.equal(game.bomb(game.incoming[0].id),true);
  }
});

test('all continuous modes compound random 3-10 percent steps every 25 placements, never from misses or Bombs',()=>{
  const pace=new ContinuousPace(()=>0);assert.deepEqual(pace.advance(24),[]);
  assert.equal(pace.advance(25)[0].percent,3);assert.equal(pace.multiplier,1.03);assert.deepEqual(pace.advance(25),[]);
  const changes=pace.advance(100);assert.equal(changes.length,3);assert.ok(Math.abs(pace.multiplier-1.03**4)<1e-12);
  const max=new ContinuousPace(()=>1);assert.equal(max.advance(25)[0].percent,10);assert.equal(max.multiplier,1.1);
  for(const mode of ['growth','endless','magnet']){
    const game=new Game(0,mode,()=>.9,null,{paceRandom:()=>1});
    for(let i=0;i<25;i++)snapNext(game,Math.floor(i/3)%3);
    assert.equal(game.snaps,25);assert.equal(game.pace.multiplier,1.1);
    assert.equal(game.drainEvents().filter(e=>e.type==='speed-up').length,1);
    game.spawn();const p=game.incoming[0],before=p.remaining;game.tick(.5);assert.ok(Math.abs(before-p.remaining-.55)<1e-9);
    game.miss(p.id);assert.equal(game.pace.steps,1);assert.equal(game.snaps,25);
    if(mode!=='growth'){game.spawn();game.bomb(game.incoming[0].id);assert.equal(game.pace.steps,1);}
  }
});

class FakeMedia{constructor(){this.events={};this.plays=0;this.pauses=0;this.paused=true;}addEventListener(k,fn){this.events[k]=fn;}play(){this.plays++;this.paused=false;return Promise.resolve();}pause(){this.pauses++;this.paused=true;}}
test('music starts at no more than 20 percent, routes through gain, mutes independently and advances tracks',()=>{
  const element=new FakeMedia(),gain={gain:{value:1},connect(){}},context={destination:{},createMediaElementSource(){return{connect(){}};},createGain(){return gain;}};
  const player=createMusicPlayer([{title:'One',url:'1.mp3'},{title:'Two',url:'2.mp3'}],{element,volume:1,getContext:()=>context});
  assert.equal(element.volume,.2);assert.equal(element.plays,0);player.unlock();assert.equal(gain.gain.value,.2);assert.equal(element.plays,1);
  player.setVolume(.99);assert.equal(player.volume,.2);assert.equal(gain.gain.value,.2);player.setVolume(.1);assert.equal(gain.gain.value,.1);
  player.setMuted(true);assert.equal(element.paused,true);player.setMuted(false);assert.equal(element.paused,false);
  element.events.ended();assert.equal(player.track,'Two');assert.equal(element.src,'2.mp3');element.events.ended();assert.equal(player.track,'One');
  player.pause();assert.equal(element.paused,true);player.resume();assert.equal(element.paused,false);
  assert.equal(musicVolume(NaN),.2);assert.equal(musicVolume(-1),0);
  const muted=createMusicPlayer([{title:'One',url:'1.mp3'}],{element:new FakeMedia(),muted:true});muted.unlock();assert.equal(muted.media.plays,0);
});


test('offline music serves valid byte ranges, suffixes and unsatisfiable requests',async()=>{
  const {readFile}=await import('node:fs/promises'),{runInNewContext}=await import('node:vm');
  const listeners={},bytes=Uint8Array.from({length:10},(_,i)=>i);
  const self={location:new URL('https://game.test/sw.js'),addEventListener:(name,fn)=>listeners[name]=fn};
  runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL,Response,Promise,caches:{match:async()=>new Response(bytes)},fetch:()=>{throw Error('cached range must work offline');}});
  async function request(range){let response;listeners.fetch({request:new Request('https://game.test/music/controlled-groove.mp3',{headers:{range}}),respondWith:r=>response=r});return await response;}
  const middle=await request('bytes=2-5');assert.equal(middle.status,206);assert.equal(middle.headers.get('content-range'),'bytes 2-5/10');assert.deepEqual([...new Uint8Array(await middle.arrayBuffer())],[2,3,4,5]);
  const suffix=await request('bytes=-3');assert.deepEqual([...new Uint8Array(await suffix.arrayBuffer())],[7,8,9]);
  assert.equal((await request('bytes=20-')).status,416);assert.equal((await request('bytes=8-2')).status,416);
});

test('the installed web game keeps offline navigation, music and icons within its /play/ scope',async()=>{
  const {readFile}=await import('node:fs/promises'),{runInNewContext}=await import('node:vm');
  const listeners={},stored=[],matched=[],self={location:new URL('https://snapoly.net/play/sw.js'),addEventListener:(name,fn)=>listeners[name]=fn};
  runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL,Response,Promise,caches:{open:async()=>({addAll:async assets=>stored.push(...assets)}),match:async key=>{matched.push(key);return new Response('saved game');}},fetch:()=>Promise.reject(Error('offline'))});
  let installing;listeners.install({waitUntil:p=>installing=p});self.skipWaiting=()=>{};await installing;
  assert.ok(stored.length>=7);assert.ok(stored.every(p=>p.startsWith('/play/')));assert.ok(stored.includes('/play/music/controlled-groove.mp3'));
  let response;listeners.fetch({request:{url:'https://snapoly.net/play/?source=iphone',method:'GET',mode:'navigate'},respondWith:p=>response=p});assert.equal(await (await response).text(),'saved game');assert.deepEqual(matched,['/play/']);
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(new URL(manifest.start_url,'https://snapoly.net/play/manifest.webmanifest').pathname,'/play/');
  assert.ok(manifest.icons.every(i=>new URL(i.src,'https://snapoly.net/play/manifest.webmanifest').pathname.startsWith('/play/icons/')));
});


test('Endless starts with Cube; each other shape requires its own Beginner badge',()=>{
  const records=[];assert.equal(flowShapeUnlocked('cube',records),true);
  assert.equal(flowShapeUnlocked('pyramid',records),false);assert.equal(flowShapeUnlocked('diamond',records),false);
  for(let i=0;i<5;i++)records[i]={stars:3};assert.equal(flowShapeUnlocked('pyramid',records),false);
  for(let i=0;i<4;i++)records[20+i]={stars:1};assert.equal(flowShapeUnlocked('pyramid',records),false);
  records[24]={stars:1};assert.equal(flowShapeUnlocked('pyramid',records),true);assert.equal(flowShapeUnlocked('diamond',records),false);
  records[24]={stars:3};assert.equal(chapterBadges(1,records)[0].completed,5);
  assert.equal(flowShapeUnlocked('unknown',records),false);assert.equal(flowShapeUnlocked('cube',records,'growth'),false);
});

test('MagnetFlow unlocks on a Novice badge in one shape, with the same shape gates',()=>{
  const records=[];assert.equal(magnetUnlocked(records),false);assert.equal(flowShapeUnlocked('cube',records,'magnet'),false);
  for(let i=0;i<5;i++){records[i]={stars:1};records[20+i]={stars:1};}
  assert.equal(magnetUnlocked(records),false); // ten split between shapes do not qualify
  for(let i=5;i<10;i++)records[20+i]={stars:1};
  assert.equal(magnetUnlocked(records),true);assert.equal(flowShapeUnlocked('cube',records,'magnet'),true);
  assert.equal(flowShapeUnlocked('pyramid',records,'magnet'),true);assert.equal(flowShapeUnlocked('diamond',records,'magnet'),false);
  const restored=loadProfile({schema:2,records,endless:{pyramid:500},magnet:{cube:700}});
  assert.equal(magnetUnlocked(restored.records),true);assert.equal(restored.endless.pyramid,500);assert.equal(restored.magnet.cube,700);
});

test('magnetic catch is forgiving at 20 degrees while strict face snaps still require 9 degrees',()=>{
  assert.equal(MAGNET_ANGLE,20);assert.equal(withinMagnetCatch(MAGNET_COS),true);
  assert.equal(withinMagnetCatch(Math.cos(19.99*Math.PI/180)),true);assert.equal(withinMagnetCatch(Math.cos(20.01*Math.PI/180)),false);
  assert.equal(withinMagnetCatch(1+Number.EPSILON),true);assert.equal(withinMagnetCatch(NaN),false);assert.equal(withinMagnetCatch(Infinity),false);
  assert.equal(withinMagnetCatch(2),false);assert.equal(withinMagnetCatch(-1),false);assert.equal(withinMagnetCatch(1,true),false);
  assert.ok(MAGNET_COS<ALIGNMENT_COS);
  const game=new Game(0,'magnet');game.spawn();assert.equal(game.snap(game.incoming[0].id,exposedFaces(game.blocks)[0],MAGNET_COS),false);
});

test('magnetic latch needs a stable current piece and face, and resets on pause, obstruction or expiry',()=>{
  const latch=new MagnetLatch(),aim={id:1,face:'0:0',dot:MAGNET_COS,blocked:false,remaining:10,enabled:true};
  assert.equal(latch.update(aim,.04),false);assert.equal(latch.update(aim,.04),false);assert.equal(latch.update(aim,.02),true);assert.equal(latch.update(aim,1),false);
  latch.reset();latch.update(aim,.08);assert.equal(latch.update({...aim,id:2},.02),false);
  assert.equal(latch.update({...aim,id:2,face:'0:1'},.07),false);
  assert.equal(latch.update({...aim,enabled:false},1),false);assert.equal(latch.update(aim,.02),false);
  assert.equal(latch.update({...aim,blocked:true},1),false);assert.equal(latch.update({...aim,remaining:0},1),false);
  assert.equal(latch.update(null,1),false);assert.equal(latch.update(aim,.05),false);assert.equal(latch.update(aim,.05),true);
});

test('magnetic pull rotates a chosen real polygon face into strict alignment for every lane and shape',()=>{
  const lanes=[[1,0,.48],[0,1,.48],[-1,0,.48],[0,-1,.48]].map(a=>new Vector3(...a).normalize());
  const start=new Quaternion().setFromEuler(new Euler(...MAGNET_START_EULER));
  for(const shape of Object.keys(SHAPES)){
    const block=polyBlock(shape,0,-1),faces=facesOf(block);
    const bestStart=Math.max(...faces.map(f=>new Vector3(...f.normal).applyQuaternion(start).dot(lanes[0])));
    assert.ok(bestStart<MAGNET_COS,`${shape} starts outside the first catch zone`);
    for(const face of faces)for(const lane of lanes){
      const normal=new Vector3(...face.normal).applyQuaternion(start),target=magnetRotation(start,normal.toArray(),lane.toArray());
      assert.ok(new Vector3(...face.normal).applyQuaternion(target).dot(lane)>1-1e-10);
    }
  }
});

test('MagnetFlow keeps clears and tools but has exactly one life with no spare earnings',()=>{
  assert.equal(isFlowMode('magnet'),true);
  for(const shape of Object.keys(SHAPES)){
    const game=new Game(0,'magnet',()=>.9,{slow:1,bomb:1},{shape});
    assert.equal(game.config.total,Infinity);assert.equal(game.config.concurrent,4);assert.equal(game.shape,shape);
    for(let n=0;n<33;n++)snapNext(game,Math.floor(n/3)%3);
    assert.ok(game.clears>=10);assert.equal(game.lifePool,0);assert.equal(game.lifeProgress,0);assert.equal(game.lives,1);assert.ok(game.tools.slow>1);assert.ok(game.tools.bomb>1);assert.equal(game.status,'playing');
    assert.equal(game.useSlow(),true);game.spawn();assert.equal(game.bomb(game.incoming[0].id),true);
    const restored=loadProfile({schema:2,magnet:{[shape]:game.score},endless:{[shape]:100}});assert.equal(restored.magnet[shape],game.score);assert.equal(restored.endless[shape],100);
  }
});

test('one missed Magnet cell ends the run even when an old spare pool is supplied',()=>{
  const game=new Game(0,'magnet',()=>.9,null,{lifePool:5,lifeProgress:2});
  game.spawn();game.miss(game.incoming[0].id);assert.equal(game.status,'lost');assert.equal(game.lives,0);assert.equal(game.lifePool,0);
  assert.equal(game.endMagnet(),false);assert.equal(game.useSlow(),false);
});

test('100-placement breaks freeze arrivals and tools, continue at 200, and ending keeps the score',()=>{
  const game=new Game(0,'magnet',()=>.9);game.snaps=99;game.resolved=99;game.spawned=99;game.nextId=100;game.pace.advance(99);
  snapNext(game,0);assert.equal(game.snaps,100);assert.equal(game.awaitingCheckpoint,true);
  const before=JSON.stringify(captureMagnet(game,[0,0,0,1],null).state);
  game.tick(1000);game.spawn();assert.equal(game.useSlow(),false);assert.equal(game.bomb(999),false);
  assert.equal(JSON.stringify(captureMagnet(game,[0,0,0,1],null).state),before);
  assert.equal(game.drainEvents().filter(e=>e.type==='checkpoint').length,1);
  const restored=restoreMagnet(captureMagnet(game,[0,0,0,1],null)).game;
  assert.equal(restored.awaitingCheckpoint,true);assert.equal(restored.continueMagnet(),true);assert.equal(restored.checkpointAt,200);assert.equal(restored.continueMagnet(),false);
  restored.tick(.1);assert.ok(restored.elapsed>game.elapsed);const score=restored.score;
  assert.equal(restored.endMagnet(),true);assert.equal(restored.status,'ended');assert.equal(restored.score,score);assert.equal(captureMagnet(restored,[0,0,0,1],null),null);
});

test('a checkpoint waits for a triple clear to settle before pausing',()=>{
  const game=new Game(0,'magnet',()=>.9);snapNext(game,0);snapNext(game,0);
  game.snaps=99;game.resolved=99;game.spawned=99;game.nextId=100;game.pace.advance(99);
  game.spawn();const piece=game.incoming.at(-1);piece.color=0;
  const last=game.blocks.at(-1),face=exposedFaces(game.blocks).find(f=>f.blockId===last.id&&!f.blocked);
  assert.ok(game.snap(piece.id,face,1));assert.ok(game.settleRemaining>0);assert.equal(game.awaitingCheckpoint,false);
  const timer=game.spawnTimer;game.tick(game.settleRemaining);assert.equal(game.awaitingCheckpoint,true);assert.equal(game.spawnTimer,timer);
  assert.ok(game.drainEvents().some(e=>e.type==='checkpoint'));
});

test('Magnet saves round-trip all five sculptures, clocks, score, pace, choice and spent tools without refilling',()=>{
  for(const shape of Object.keys(SHAPES)){
    const game=new Game(0,'magnet',()=>.9,{slow:1,bomb:1,shield:2,recolor:2},{shape,unlockedTools:{shield:true,recolor:true},equipped:['shield','recolor']});
    for(let i=0;i<26;i++)snapNext(game,Math.floor(i/3)%3);
    game.spawn();game.useShield();game.tick(.3);const selected=game.incoming[0]?.id??null;
    const rotation=new Quaternion().setFromEuler(new Euler(.3,.4,.5)).toArray();
    const snapshot=captureMagnet(game,rotation,selected),profile=loadProfile({schema:2,coins:77,magnetRun:snapshot,magnet:{[shape]:game.score}});
    const restored=restoreMagnet(profile.magnetRun);assert.ok(restored,shape);
    const round=captureMagnet(restored.game,restored.rotation,restored.selectedId);round.savedAt=snapshot.savedAt;assert.deepEqual(round,snapshot);
    assert.equal(restored.game.lives,1);assert.equal(restored.game.lifePool,0);assert.equal(restored.game.tools.shield,1);assert.equal(restored.game.shieldActive,true);assert.equal(profile.coins,77);
    restored.game.spawnTimer=0;restored.game.tick(.1);assert.equal(game.elapsed+.1,restored.game.elapsed);
  }
});

test('corrupt Magnet snapshots are discarded while campaign records and best scores survive',()=>{
  const game=new Game(0,'magnet');game.spawn();const snapshot=captureMagnet(game,[0,0,0,1],1);
  for(const change of [s=>s.version=99,s=>s.state.tools.slow=99,s=>s.state.incoming[0].remaining=Infinity,s=>s.rotation=[0,0,0,0],s=>s.shape='unknown',s=>s.state.blocks=[],s=>s.state.awaitingCheckpoint=true,s=>s.pace.steps=50]){
    const invalid=structuredClone(snapshot);change(invalid);assert.equal(restoreMagnet(invalid),null);
    const loaded=loadProfile({schema:2,records:[{score:44,stars:2}],magnet:{cube:123},magnetRun:invalid});assert.equal(loaded.magnetRun,null);assert.equal(loaded.records[0].score,44);assert.equal(loaded.magnet.cube,123);
  }
});
