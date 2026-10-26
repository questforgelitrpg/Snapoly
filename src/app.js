import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Game, COLORS, LEVELS, CHAPTERS, SHAPES, LANE_NAMES, exposedFaces, ALIGNMENT_COS, contactsForFace, fitsFace, chapterUnlocked, purchaseTool, SHOP_PRICES, TOOL_CAP, LEVELS_PER_SHAPE, MAX_LIFE_POOL, GROWTH_TARGET, levelUnlocked, chapterBadges, flowShapeUnlocked, magnetUnlocked, isFlowMode, CLEAR_HOLD, SLIDE_SECONDS } from './rules.js';
import { facesOf, isPoly } from './polyhedra.js';
import { setupPwa, installInstructions } from './pwa.js';
import {loadProfile,grantToolIntroductions} from './profile.js';
import {clearRewardMarkup,playClearReward} from './clear-rewards.js';
import {ECONOMY} from './rules.js';
import {TOOL_DEFS,TOOL_IDS,BASE_TOOLS,normalizeLoadout,researchTool,bestChapterWins} from './tool-catalog.js';
import {PACE_EVERY} from './continuous-pace.js';
import {captureMagnet,restoreMagnet} from './magnet-save.js';
import {createMusicPlayer} from './music.js';
import {MagnetLatch,MAGNET_COS,MAGNET_ANGLE,MAGNET_PULL,MAGNET_START_EULER,withinMagnetCatch,magnetRotation} from './magnet.js';

const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const V = (a = [0,0,0]) => new THREE.Vector3(...a);
const initialRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.32, -.48, .18));
const magnetInitialRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...MAGNET_START_EULER));
const laneVectors = [[1,0,.48],[0,1,.48],[-1,0,.48],[0,-1,.48]].map(a => V(a).normalize());
const laneKeys = ['1','2','3','4'];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let levelChapter=0,levelPage=0,newChapterUnlocked=false,newBadge=null,bankedCoins=0,pendingRun=null,endlessShape='cube',soundReturn=null,flowMenuMode='endless';
let game = null, selectedId = null, paused = false, lastTime = 0, uiClock = 0;
let aiming = null, dragging = null, toastTimeout, audio = null, muted = false, snapAnimation = null, settleAnimation = null;
let clearCelebration=null;
let width = 1, height = 1, viewHeight = 8.6, lastFocused = null, modalType = 'welcome';
const keys = new Set(), docks = new Map(), blockMeshes = new Map(), pieceMeshes = new Map(), effects = [];
const touchPoints = new Map();
const targetFaces = new Map();
let tapGesture = null;
setupPwa();
const saved = (() => { try { return JSON.parse(localStorage.getItem('polysnap-v1')) || {}; } catch { return {}; } })();
const profile=loadProfile(saved),records=profile.records;
muted=profile.muted;
let coins=profile.coins;
const toolBank=profile.tools;
const tracks=JSON.parse($('music-catalog')?.textContent||'[]');
const music=createMusicPlayer(tracks,{element:$('music-player'),muted:profile.musicMuted,volume:profile.musicVolume,getContext:()=>audio});
function save(){try{Object.assign(profile,{records,muted,coins,tools:toolBank});localStorage.setItem('polysnap-v1',JSON.stringify(profile));return true;}catch{return false;}}
document.addEventListener('pointerdown',()=>{unlockAudio();music.unlock();});
window.addEventListener('blur',()=>music.pause());
window.addEventListener('focus',()=>{if(!document.hidden)music.resume();});
document.addEventListener('visibilitychange',()=>document.hidden?music.pause():music.resume());
music.media.addEventListener('ended',()=>{if($('track-name'))$('track-name').textContent=music.track;});

// All art is procedural: bevelled solids, linework, face glyphs and particles.
const renderer = (() => {
  try {
    const r = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.08;
    $('canvas-host').appendChild(r.domElement);
    return r;
  } catch {
    $('fatal').hidden = false;
    $('modal').classList.add('hidden');
    return null;
  }
})();

if (renderer) init();
function init() {
  let saveClock=0;
  const magnetLatch=new MagnetLatch();
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8,8,5,-5,.1,100);
  camera.position.set(0,0,25);
  camera.lookAt(0,0,0);
  const root = new THREE.Group();
  root.quaternion.copy(initialRotation); scene.add(root);
  const incomingRoot = new THREE.Group(); scene.add(incomingRoot);
  scene.add(new THREE.AmbientLight(0xd9edff, 1.1));
  const key = new THREE.DirectionalLight(0xf3ffff, 2.4); key.position.set(-3,5,8); scene.add(key);
  const rim = new THREE.DirectionalLight(0x52e9df, 1.5); rim.position.set(4,0,-3); scene.add(rim);
  const pink = new THREE.DirectionalLight(0xcd8de8, 1.0); pink.position.set(-3,-4,2); scene.add(pink);
  const geo = new RoundedBoxGeometry(.98,.98,.98,2,.048);
  const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(.925,.925,.925));
  const faceTextures = COLORS.map((c,i) => makeFaceTexture(c.hex,i));
  const coreTexture = makeFaceTexture('#193a4b',-1);
  const materials = COLORS.map((c,i) => new THREE.MeshPhysicalMaterial({
    map:faceTextures[i], color:0xffffff, roughness:.26, metalness:.25, clearcoat:.6, clearcoatRoughness:.22,
    emissive:new THREE.Color(c.hex), emissiveIntensity:.055
  }));
  const coreMaterial = new THREE.MeshPhysicalMaterial({ map:coreTexture, color:0xffffff, roughness:.5, metalness:.2, clearcoat:.25 });
  const particleGeo = new THREE.OctahedronGeometry(.042);
  let targetViewHeight = 9.4, shake = 0, orbitTime = 0;

  // Decorative orbital ticks give the playfield a quiet, precise instrument feel.
  const orbit = new THREE.Group(); scene.add(orbit);
  for (let i=0;i<72;i++) {
    const angle = i / 72 * Math.PI * 2;
    const radius = 2.4;
    const length = i % 6 === 0 ? .095 : .035;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(angle)*radius,Math.sin(angle)*radius,-2.0),
      new THREE.Vector3(Math.cos(angle)*(radius+length),Math.sin(angle)*(radius+length),-2.0)
    ]), new THREE.LineBasicMaterial({color:0x578997,transparent:true,opacity:i%6===0?.32:.12}));
    orbit.add(line);
  }
  const glowCanvas = document.createElement('canvas'); glowCanvas.width=128;glowCanvas.height=128;
  const gctx=glowCanvas.getContext('2d');const gradient=gctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'#35d9c533');gradient.addColorStop(.4,'#35d9c519');gradient.addColorStop(1,'#35d9c500');
  gctx.fillStyle=gradient;gctx.fillRect(0,0,128,128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowCanvas),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  glow.position.z=-3;glow.scale.set(6,6,1);scene.add(glow);

  const shapeGeometries=new Map(),shapeEdges=new Map();
  function geometryFor(shape) {
    if(shape==='cube')return geo;
    if(shapeGeometries.has(shape))return shapeGeometries.get(shape);
    const positions=[],uv=[];
    for(const face of facesOf({shape,position:[0,0,0]})) {
      const points=face.vertices.map(v=>V(v)),u=points[1].clone().sub(points[0]).normalize(),v=V(face.normal).cross(u).normalize();
      const flat=points.map(p=>[p.dot(u),p.dot(v)]),min=[Math.min(...flat.map(p=>p[0])),Math.min(...flat.map(p=>p[1]))],span=[Math.max(...flat.map(p=>p[0]))-min[0],Math.max(...flat.map(p=>p[1]))-min[1]];
      for(let i=1;i<points.length-1;i++)for(const n of [0,i,i+1]){positions.push(...points[n].clone().multiplyScalar(.975).toArray());uv.push(.05+.9*(flat[n][0]-min[0])/span[0],.05+.9*(flat[n][1]-min[1])/span[1]);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
    shapeGeometries.set(shape,geometry);shapeEdges.set(shape,new THREE.EdgesGeometry(geometry));return geometry;
  }
  function poseQuaternion(block) {
    if(!block||!isPoly(block))return new THREE.Quaternion();
    const basis=vertices=>{
      const a=V(vertices[1]).sub(V(vertices[0])).normalize(),b=V(vertices[2]).sub(V(vertices[0]));b.addScaledVector(a,-b.dot(a)).normalize();
      return new THREE.Matrix4().makeBasis(a,b,a.clone().cross(b));
    };
    return new THREE.Quaternion().setFromRotationMatrix(basis(block.vertices).multiply(basis(SHAPES[block.shape].vertices).invert()));
  }
  const giftMaterials=Object.fromEntries(TOOL_IDS.map(kind=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const ctx=canvas.getContext('2d');
    ctx.fillStyle=kind==='slow'?'#103d48':'#483719';ctx.strokeStyle=kind==='slow'?'#9cfff2':'#ffdc8c';ctx.lineWidth=5;ctx.beginPath();ctx.arc(48,48,41,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.font='bold 62px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(TOOL_DEFS[kind].symbol,48,51);
    return [kind,new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthTest:false})];
  }));
  function jewel(color, isCore=false, block=null, drop=null) {
    const group = new THREE.Group();
    const shape=block?.shape||game?.shape||'cube',geometry=geometryFor(shape);
    const mesh = new THREE.Mesh(geometry,isCore?coreMaterial:materials[color]);group.add(mesh);
    const edge = new THREE.LineSegments(shape==='cube'?edgeGeo:shapeEdges.get(shape),new THREE.LineBasicMaterial({color:isCore?0x70d4df:COLORS[color].hex,transparent:true,opacity:isCore?.6:.27}));
    group.add(edge);
    const gift=block?.drop||drop;if(gift){const badge=new THREE.Sprite(giftMaterials[gift]);badge.scale.set(.34,.34,1);badge.renderOrder=10;group.add(badge);}
    group.quaternion.copy(poseQuaternion(block));return group;
  }
  function removeGroup(group) {
    group.parent?.remove(group);
    // Geometry and surface materials are shared. Only the edge material is unique.
    group.children[1]?.material?.dispose();
  }
  function syncBlocks() {
    const blocks = game?.blocks || [{id:0,position:[0,0,0],color:-1}];
    for (const [id,mesh] of blockMeshes) if (!blocks.some(b=>b.id===id)) { removeGroup(mesh);blockMeshes.delete(id); }
    for (const block of blocks) if (!blockMeshes.has(block.id)) {
      const mesh=jewel(block.color,block.id===0,block);mesh.position.copy(V(block.position));
      mesh.userData.blockId=block.id;
      root.add(mesh);blockMeshes.set(block.id,mesh);
      if (block.id!==0) {mesh.scale.setScalar(.8);mesh.userData.born=performance.now();}
    }
  }
  function finishSettling() {
    for(const block of game?.blocks||[]){const mesh=blockMeshes.get(block.id);if(mesh){mesh.position.copy(V(block.position));mesh.quaternion.copy(poseQuaternion(block));mesh.scale.setScalar(1);}}
    settleAnimation=null;
  }
  function animateSettling(dt) {
    if(!settleAnimation||paused)return;
    if(reducedMotion){finishSettling();return;}
    const animation=settleAnimation;
    animation.elapsed+=dt;
    const progress=Math.max(0,animation.elapsed-CLEAR_HOLD)/SLIDE_SECONDS;
    const completed=Math.min(animation.steps.length,Math.floor(progress));
    // Finish earlier slides before starting the next one. No two cubes move
    // through the same cell, including during the visible interpolation.
    while(animation.completed<completed){
      const step=animation.steps[animation.completed++];
      const mesh=blockMeshes.get(step.id);if(mesh){mesh.position.copy(V(step.to));if(step.toVertices)mesh.quaternion.copy(poseQuaternion({shape:step.shape,vertices:step.toVertices}));mesh.scale.setScalar(1);}
    }
    const step=animation.steps[completed];
    if(step&&animation.elapsed>=CLEAR_HOLD){
      const t=clamp(progress-completed,0,1);
      const mesh=blockMeshes.get(step.id);mesh?.position.lerpVectors(V(step.from),V(step.to),t*t*(3-2*t));
      if(mesh&&step.toVertices){mesh.quaternion.slerpQuaternions(poseQuaternion({shape:step.shape,vertices:step.fromVertices}),poseQuaternion({shape:step.shape,vertices:step.toVertices}),t*t*(3-2*t));mesh.scale.setScalar(.12+.88*Math.abs(2*t-1));}
    }
    if(animation.elapsed>=animation.duration)finishSettling();
  }
  function clearPieces() {
    for (const mesh of pieceMeshes.values()) removeGroup(mesh);
    pieceMeshes.clear();
    for (const dock of docks.values()) { disposeDock(dock); }
    docks.clear();
  }
  function disposeDock(dock) {
    scene.remove(dock.group);
    dock.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
  function makeDock(face) {
    const source=face.vertices?face:facesOf(game.blocks.find(b=>b.id===face.blockId)).find(f=>f.index===face.index);
    const group=new THREE.Group(),toPlane=new THREE.Quaternion().setFromUnitVectors(V(source.normal),V([0,0,1]));
    const points=source.vertices.map(v=>V(v).sub(V(source.center)).applyQuaternion(toPlane));
    const positions=[];for(let i=1;i<points.length-1;i++)for(const n of [0,i,i+1])positions.push(...points[n].clone().multiplyScalar(.88).toArray());
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
    const fill=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x55efda,transparent:true,opacity:.14,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));group.add(fill);
    const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points.map(p=>p.clone().multiplyScalar(.98).add(V([0,0,.009])))),new THREE.LineBasicMaterial({color:0x55efda,transparent:true,opacity:.95,depthTest:false}));outline.renderOrder=4;group.add(outline);
    const beam=new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(),V()]),new THREE.LineDashedMaterial({color:0x55efda,transparent:true,opacity:.38,dashSize:.09,gapSize:.1,depthTest:false}));beam.renderOrder=3;group.add(beam);scene.add(group);
    return {group,fill,outline,beam,pulsePhase:0,key:face.key||`${face.blockId}:${face.index}`};
  }
  let cachedBlocks=null,cachedLength=-1,cachedFaces=[];
  function currentFaces(){if(cachedBlocks!==game.blocks||cachedLength!==game.blocks.length){cachedBlocks=game.blocks;cachedLength=game.blocks.length;cachedFaces=exposedFaces(game.blocks);}return cachedFaces;}
  function getDock(piece,rotation=root.quaternion) {
    const direction=laneVectors[piece.lane];
    let faces=currentFaces().filter(face=>fitsFace(piece,face));
    const pinned=targetFaces.get(piece.id);
    const pinnedFace=pinned&&faces.find(f=>f.blockId===pinned.blockId&&f.index===pinned.index);
    if(pinnedFace) faces=[pinnedFace];else if(pinned)targetFaces.delete(piece.id);
    let best=null, bestScore=-Infinity;
    for (const face of faces) {
      const normal=V(face.normal).applyQuaternion(rotation);
      const dot=normal.dot(direction);
      const center=(face.center?V(face.center):V(face.position).addScaledVector(V(face.normal),.5)).applyQuaternion(rotation);
      // Prefer a facing surface at the leading edge of the sculpture. A center
      // behind another cube cannot be reached by a piece from this lane.
      const destination=V(face.destination).applyQuaternion(rotation);
      let occluded=!!face.blocked;
      for (const block of game.blocks) {
        if (block.id===face.blockId) continue;
        const delta=V(block.position).applyQuaternion(rotation).sub(destination);
        const along=delta.dot(direction);
        const across=delta.clone().addScaledVector(direction,-along).length();
        if (along>.25 && across<(game.shape==='cube'?.73:.42)) {occluded=true;break;}
      }
      if (occluded && !pinnedFace) continue;
      const score=dot*30+center.dot(direction)*.85;
      if (score>bestScore) {bestScore=score;best={face,normal,center,destination,dot,direction,blocked:occluded};}
    }
    return best;
  }
  function chooseSelected() {
    if (!game) return;
    if (!game.incoming.some(p=>p.id===selectedId)) {
      selectedId=game.incoming.slice().sort((a,b)=>a.remaining-b.remaining)[0]?.id ?? null;
      aiming=null;
    }
  }
  function quickSnap() {
    if (!game || game.mode==='magnet' || paused || game.status!=='playing' || game.settleRemaining>0) return;
    chooseSelected();
    const piece=game.incoming.find(p=>p.id===selectedId);
    if (!piece) return;
    if (snapAnimation) {
      if(snapAnimation.canSnap) snapAnimation.queuedSnap=true;
      else toast('Resetting the view. Snap when the face is aligned.');
      return;
    }
    const dock=getDock(piece);
    if(!dock||!targetFaces.has(piece.id)){toast('Tap an exposed face first · then Snap','good');return;}
    if(dock&&targetFaces.has(piece.id)) {
      // Explicitly choosing a face authorizes a turn-and-snap. Check the final
      // approach before turning: the current screen projection may be occluded
      // even though the chosen face will be clear after rotation.
      const target=new THREE.Quaternion().setFromUnitVectors(dock.normal,dock.direction).multiply(root.quaternion.clone());
      const finalDock=getDock(piece,target);
      if(!finalDock||finalDock.blocked){toast('That face has a blocked approach · tap another exposed face');return;}
      if(dock.dot<.99999) {
        snapAnimation={from:root.quaternion.clone(),to:target,elapsed:0,duration:reducedMotion?.08:.22,canSnap:true,queuedSnap:true};
        aiming={pieceId:piece.id,face:dock.face};
        toast('Turning to your selected face…','good');sound('align');return;
      }
    }
    if (!dock || dock.blocked) {game.miss(piece.id,'Connection path blocked');}
    else game.snap(piece.id,dock.face,dock.dot,true);
    handleEvents();chooseSelected();updateHUD();
  }
  function finishMagnetPull(capture){
    const piece=game?.incoming.find(p=>p.id===capture.pieceId);
    if(piece&&game.status==='playing'&&!game.settleRemaining){
      const dock=getDock(piece);
      if(dock&&!dock.blocked&&dock.dot>=ALIGNMENT_COS)game.snap(piece.id,dock.face,dock.dot,true);
    }
    targetFaces.delete(capture.pieceId);magnetLatch.reset();aiming=null;
    handleEvents();chooseSelected();updateHUD();
  }
  function tryMagnetPull(dt){
    if(game?.mode!=='magnet'||paused||game.status!=='playing'||game.awaitingCheckpoint||game.settleRemaining||snapAnimation){magnetLatch.reset();return;}
    chooseSelected();const piece=game.incoming.find(p=>p.id===selectedId),dock=piece&&getDock(piece);
    if(!piece||!dock||!withinMagnetCatch(dock.dot,dock.blocked)){magnetLatch.reset();return;}
    const target=magnetRotation(root.quaternion,dock.normal.toArray(),dock.direction.toArray());
    targetFaces.set(piece.id,{blockId:dock.face.blockId,index:dock.face.index});
    const finalDock=getDock(piece,target);
    if(!finalDock||finalDock.blocked){targetFaces.delete(piece.id);magnetLatch.reset();return;}
    const caught=magnetLatch.update({id:piece.id,face:`${dock.face.blockId}:${dock.face.index}`,dot:dock.dot,blocked:false,remaining:piece.remaining,enabled:true},dt);
    if(!caught){targetFaces.delete(piece.id);return;}
    const mesh=pieceMeshes.get(piece.id);
    snapAnimation={from:root.quaternion.clone(),to:target,elapsed:0,duration:reducedMotion?.08:MAGNET_PULL,magnetic:true,pieceId:piece.id,pullStart:mesh?.position.clone()||dock.destination.clone()};
    aiming={pieceId:piece.id,face:dock.face};dragging=null;tapGesture=null;touchPoints.clear();keys.clear();
    sound('align');navigator.vibrate?.(10);
  }
  function resetView() {
    if(game?.settleRemaining>0||snapAnimation?.magnetic)return;
    magnetLatch.reset();
    snapAnimation={from:root.quaternion.clone(),to:(game?.mode==='magnet'?magnetInitialRotation:initialRotation).clone(),elapsed:0,duration:.35};
    aiming=null;
    targetFaces.delete(selectedId);
  }

  function particleBurst(position,color,count=24) {
    const material = new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9});
    const group = new THREE.Group();scene.add(group);
    for(let i=0;i<count;i++) {
      const m=new THREE.Mesh(particleGeo,material);m.position.copy(position);
      m.userData.velocity=V([(Math.random()-.5)*5,(Math.random()-.5)*5,(Math.random()-.5)*4]);
      m.rotation.set(Math.random()*6,Math.random()*6,0);group.add(m);
    }
    effects.push({kind:'particles',group,material,life:.85,age:0});
  }
  function ripple(position,color) {
    const mesh=new THREE.Mesh(new THREE.RingGeometry(.55,.57,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));
    mesh.position.copy(position);scene.add(mesh);effects.push({kind:'ring',mesh,life:.55,age:0});
  }
  function flyToDock(piece,block) {
    const source=pieceMeshes.get(piece.id);
    if (!source) return;
    const mesh=jewel(piece.color,false,null,piece.drop);mesh.position.copy(source.position);mesh.quaternion.copy(source.quaternion);
    const end=V(block.position).applyQuaternion(root.quaternion);
    scene.add(mesh);effects.push({kind:'flight',mesh,start:source.position.clone(),end,life:.15,age:0});
  }
  function handleEvents() {
    if (!game) return;
    let ended=null;
    const pending=game.drainEvents();if(!pending.length)return;
    for(const event of pending) {
      if (event.type==='snap') {
        flyToDock(event.piece,event.block);
        const pos=V(event.block.position).applyQuaternion(root.quaternion);
        particleBurst(pos,COLORS[event.block.color].hex,reducedMotion?5:18);
        ripple(pos,COLORS[event.block.color].hex);
        floating(`+${event.points}`,pos,COLORS[event.block.color].hex,event.contacts>1?`${event.contacts}-FACE JOIN`:event.multiplier>1?`${event.multiplier}× COMBO`:'SNAP');
        sound('snap',event.block.color);navigator.vibrate?.(12);
        if (game.snaps===1 && game.level===0 && game.mode==='classic') toast('Nice snap. Connect three touching Aqua cubes to clear their group.', 'good');
      } else if(event.type==='clear') {
        settleAnimation={steps:event.steps,duration:event.duration,elapsed:0,completed:0};
        for(const step of event.steps){const mesh=blockMeshes.get(step.id);if(mesh)delete mesh.userData.born;}
        snapAnimation=null;aiming=null;keys.clear();dragging=null;touchPoints.clear();tapGesture=null;
        for(const b of event.removed) particleBurst(V(b.position).applyQuaternion(root.quaternion),COLORS[b.color].hex,reducedMotion?3:10);
        ripple(V(),COLORS[event.color].hex);
        showClearReward(event);
        const gifts=Object.entries(event.rewards).filter(([,n])=>n).map(([kind,n])=>`+${n} ${TOOL_DEFS[kind].name}`).join(' · ');
        toast(`${event.fullClear?`${event.matchCount}-match! All ${event.removed.length} cells cleared`: `${event.removed.length} ${COLORS[event.color].name} cleared`} · +${event.bonus} points${gifts?` · ${gifts}`:''}`, 'good');sound(event.fullClear?'full-clear':'clear',event.color);
        if(event.fullClear){$('flash').classList.add('super-clear');setTimeout(()=>$('flash').classList.remove('super-clear'),650);navigator.vibrate?.([20,40,35]);}
      } else if(event.type==='speed-up') {
        toast(`SPEED UP +${event.percent}% · ${event.multiplier.toFixed(2)}× · next in ${PACE_EVERY} cells`,'good');
        floating(`+${event.percent}%`,V([0,1.6,1]),'#ffe09b','SPEED UP');sound('align');
      } else if(event.type==='shield') {
        toast('Shield ready · protects one miss','good');sound('align');
      } else if(event.type==='shield-block') {
        toast('Shield caught the miss · life and combo kept','good');ripple(V(),'#b8afff');sound('align');
      } else if(event.type==='recolor') {
        const mesh=pieceMeshes.get(event.piece.id);if(mesh){removeGroup(mesh);pieceMeshes.delete(event.piece.id);}
        $('incoming-list').dataset.signature='';toast(`Cell recolored · ${COLORS[event.piece.color].name}`,'good');sound('align');
      } else if(event.type==='life-earned') {
        floating('+1 ♥',V([0,1,1]),'#ff9ebc','SPARE LIFE');toast(`Spare life earned · ${event.pool}/${MAX_LIFE_POOL} in reserve`,'good');
      } else if(event.type==='life-used') {
        toast(`Spare life used · ${event.pool} remaining`,'good');
      } else if(event.type==='slow') {
        toast('Slow time · all incoming pieces at 45% speed for 8 seconds','good');sound('align');
      } else if(event.type==='bomb') {
        const source=pieceMeshes.get(event.piece.id),position=source?.position.clone()||V();
        particleBurst(position,COLORS[event.piece.color].hex,reducedMotion?8:32);ripple(position,COLORS[event.piece.color].hex);floating('+75',position,'#ffc15c','BOMB');toast('Selected incoming piece removed · no life lost','good');sound('bomb',event.piece.color);
      } else if(event.type==='settled') {
        finishSettling();
      } else if(event.type==='miss') {
        shake=reducedMotion?0:.13;$('flash').classList.add('hit');setTimeout(()=>$('flash').classList.remove('hit'),250);
        toast(game.mode==='growth'?`${event.reason} · try another angle`:`${event.reason} · ${game.lives} ${game.lives===1?'life':'lives'} left`, 'bad');sound('miss');
      } else if(event.type==='checkpoint') {paused=true;checkpointModal();}
      else if(event.type==='won'||event.type==='lost'||event.type==='ended') ended=event.type;
    }
    if(game.mode==='classic'){
      if(game.config.clearsPerLife){profile.lifePool=game.lifePool;profile.lifeProgress=game.lifeProgress;}
      const gained=game.coinsEarned-bankedCoins,changed=gained>0||game.config.clearsPerLife||game.config.toolTypes.some(kind=>toolBank[kind]!==game.tools[kind]);
      if(changed){coins+=Math.max(0,gained);bankedCoins=game.coinsEarned;for(const kind of game.config.toolTypes)toolBank[kind]=game.tools[kind];save();}
    }
    syncBlocks();
    if (ended) {
      if (ended==='won' && game.mode==='classic') {
        const old=records[game.level]||{},before=chapterBadges(game.config.chapter,records);newBadge=null;newChapterUnlocked=game.config.stage===3&&game.config.chapter<CHAPTERS.length-1&&!old.stars;
        records[game.level]={score:Math.max(old.score||0,game.score),stars:Math.max(old.stars||0,game.stars())};newBadge=chapterBadges(game.config.chapter,records).find((b,i)=>b.earned&&!before[i].earned)||null;save();
      }
      if(isFlowMode(game.mode)){profile[game.mode][game.shape]=Math.max(profile[game.mode][game.shape],game.score);if(game.mode==='magnet')profile.magnetRun=null;save();}
      const finalGame=game;
      setTimeout(()=>{ if(game===finalGame&&game.status===ended) resultModal(); },ended==='ended'?0:500);
      sound(ended==='won'?'win':'miss');
    }
    if(game.mode==='magnet'&&!ended)saveMagnet();
  }

  function updateWorld(dt,time) {
    animateClearReward(dt);
    animateSettling(dt);
    if (snapAnimation && !paused) {
      snapAnimation.elapsed+=dt;
      const t=Math.min(1,snapAnimation.elapsed/snapAnimation.duration);
      root.quaternion.slerpQuaternions(snapAnimation.from,snapAnimation.to,1-(1-t)**3);
      if(t===1) {
        const completed=snapAnimation,queued=completed.queuedSnap;
        snapAnimation=null;
        if(completed.magnetic)finishMagnetPull(completed);else if(queued)quickSnap();
      }
    }
    const play=game?.status==='playing'&&!paused&&!game.settleRemaining;
    if(play && !snapAnimation && !dragging) {
      let dx=0,dy=0,dz=0;
      if(keys.has('arrowleft')||keys.has('j'))dy-=1;
      if(keys.has('arrowright')||keys.has('l'))dy+=1;
      if(keys.has('arrowup')||keys.has('i'))dx-=1;
      if(keys.has('arrowdown')||keys.has('k'))dx+=1;
      if(keys.has('q'))dz+=1;if(keys.has('e'))dz-=1;
      if(dx||dy||dz) {
        const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(dx*dt*1.6,dy*dt*1.6,dz*dt*1.6));
        root.quaternion.premultiply(q);aiming=null;
      }
    }

    tryMagnetPull(dt);
    if(!game) {
      orbitTime+=dt;
      if(!reducedMotion) root.quaternion.setFromEuler(new THREE.Euler(.3+Math.sin(orbitTime*.3)*.08,-.5+orbitTime*.08,.15));
    }
    let maxRadius=0;
    for(const mesh of blockMeshes.values())maxRadius=Math.max(maxRadius,mesh.position.length());
    const aspect=width/height;
    targetViewHeight=Math.max(8.2,(maxRadius+1.6)*2, (maxRadius+1.55)*2.3/Math.max(aspect,.65));
    viewHeight=THREE.MathUtils.lerp(viewHeight,targetViewHeight,1-Math.exp(-dt*2));
    camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;
    camera.updateProjectionMatrix();
    orbit.scale.setScalar(1+maxRadius*.13);
    orbit.rotation.z=Math.sin(time*.0001)*.05;
    glow.scale.setScalar(5+maxRadius*1.3);
    for(const mesh of blockMeshes.values()) {
      if(mesh.userData.born) {
        const t=Math.min(1,(performance.now()-mesh.userData.born)/230);
        mesh.scale.setScalar(.8+.2*t+.04*Math.sin(t*Math.PI));if(t===1)delete mesh.userData.born;
      }
    }
    if(game) {
      for(const [id,mesh] of pieceMeshes) if(!game.incoming.some(p=>p.id===id)) { removeGroup(mesh);pieceMeshes.delete(id); }
      for(const [id,d] of docks) if(!game.incoming.some(p=>p.id===id)) {disposeDock(d);docks.delete(id);}
      for(const piece of game.incoming) {
        if(!pieceMeshes.has(piece.id)) {const mesh=jewel(piece.color,false,null,piece.drop);incomingRoot.add(mesh);pieceMeshes.set(piece.id,mesh);}
        const mesh=pieceMeshes.get(piece.id);
        if(game.settleRemaining>0){
          const dock=docks.get(piece.id);if(dock)dock.group.visible=false;
          continue;
        }
        const d=getDock(piece); if(!d) continue;
        const selected=piece.id===selectedId;
        const targetRotation=new THREE.Quaternion().setFromUnitVectors(d.normal,d.direction).multiply(root.quaternion.clone());
        mesh.quaternion.copy(targetRotation.multiply(poseQuaternion(d.face.candidate)));
        // Launch points are always on a visible screen edge. The slight positive
        // z offset keeps every incoming shape in front of the sculpture.
        const horizontal=piece.lane===0||piece.lane===2;
        const half=horizontal?camera.right:camera.top;
        const travel=Math.max(1.6,half-Math.abs(horizontal?d.destination.x:d.destination.y)+.6);
        const t=clamp(piece.remaining/piece.duration,0,1);
        mesh.position.copy(d.destination).addScaledVector(d.direction,travel*t);
        if(snapAnimation?.magnetic&&snapAnimation.pieceId===piece.id){const pull=clamp(snapAnimation.elapsed/snapAnimation.duration,0,1);mesh.position.lerpVectors(snapAnimation.pullStart,d.destination,1-(1-pull)**2);}
        mesh.scale.setScalar(selected?1:.88);
        const dockKey=d.face.key||`${d.face.blockId}:${d.face.index}`;
        if(docks.has(piece.id)&&docks.get(piece.id).key!==dockKey){disposeDock(docks.get(piece.id));docks.delete(piece.id);}
        if(!docks.has(piece.id))docks.set(piece.id,makeDock(d.face));
        const dock=docks.get(piece.id);
        dock.group.position.copy(d.center).addScaledVector(d.normal,.02);
        dock.group.quaternion.copy(root.quaternion).multiply(new THREE.Quaternion().setFromUnitVectors(V([0,0,1]),V(d.face.normal)));
        const valid=d.dot>=(game.mode==='magnet'?MAGNET_COS:ALIGNMENT_COS)&&!d.blocked;
        const color=new THREE.Color(valid?COLORS[piece.color].hex:'#ffc15c');
        dock.fill.material.color.copy(color);dock.outline.material.color.copy(color);dock.beam.material.color.copy(color);
        const angle=THREE.MathUtils.radToDeg(Math.acos(clamp(d.dot,-1,1)));
        const proximity=clamp((65-angle)/(65-(game.mode==='magnet'?MAGNET_ANGLE:9)),0,1);
        if(!paused)dock.pulsePhase=(dock.pulsePhase+dt*(.65+2.35*proximity*proximity)*Math.PI*2)%(Math.PI*2);
        const pulse=reducedMotion?.6:.5+.5*Math.sin(dock.pulsePhase);
        dock.fill.material.opacity=selected?(valid?.22:.045+.17*pulse):.035;
        dock.outline.material.opacity=selected?(valid?1:.3+.7*pulse):.35;
        dock.beam.material.opacity=selected?.38:.12;
        const local=mesh.position.clone().sub(dock.group.position).applyQuaternion(dock.group.quaternion.clone().invert());
        const points=dock.beam.geometry.attributes.position;
        points.setXYZ(0,0,0,.04);points.setXYZ(1,local.x,local.y,local.z);points.needsUpdate=true;dock.beam.computeLineDistances();
        dock.group.visible=game.status==='playing';
      }
    }
    for(let i=effects.length-1;i>=0;i--) {
      const effect=effects[i];
      if(!paused)effect.age+=dt;
      const t=clamp(effect.age/effect.life,0,1);
      if(effect.kind==='particles') {
        effect.material.opacity=(1-t)*.9;
        if(!paused) for(const m of effect.group.children) {m.position.addScaledVector(m.userData.velocity,dt);m.userData.velocity.multiplyScalar(Math.exp(-dt*2.5));m.rotation.x+=dt*3;m.scale.setScalar(1-t*.7);}
      } else if(effect.kind==='ring') {effect.mesh.scale.setScalar(1+t*4);effect.mesh.material.opacity=(1-t)*.65;}
      else if(effect.kind==='flight') {effect.mesh.position.lerpVectors(effect.start,effect.end,1-(1-t)**3);effect.mesh.scale.setScalar(1-.18*t);}
      if(t>=1) {
        if(effect.group){scene.remove(effect.group);effect.material.dispose();}
        else {scene.remove(effect.mesh);if(effect.kind==='ring'){effect.mesh.geometry.dispose();effect.mesh.material.dispose();}else effect.mesh.children[1].material.dispose();}
        effects.splice(i,1);
      }
    }
    if(shake>0&&!paused){camera.position.x=(Math.random()-.5)*shake;camera.position.y=(Math.random()-.5)*shake;shake*=Math.exp(-dt*8);}
    else camera.position.x=camera.position.y=0;
    renderer.render(scene,camera);
  }

  function startGame(level=0,mode='classic',shape='cube',equipped=null) {
    unlockAudio();music.unlock();
    if(mode==='classic'&&!levelUnlocked(level,records)){showLevels();return;}
    if(isFlowMode(mode)&&!flowShapeUnlocked(shape,records,mode)){showEndless('cube',mode);return;}
    const cfg=LEVELS[level];
    clearTimeout(toastTimeout);$('toast').textContent='';$('toast').className='toast';
    const available=availableTools(mode,cfg);
    if(mode==='classic'&&grantToolIntroductions(profile,available))save();
    const chosen=normalizeLoadout(equipped||profile.loadout,available);
    if(available.length>1){profile.loadout=chosen;save();}
    const loadout=isFlowMode(mode)?Object.fromEntries(available.map(t=>[t,ECONOMY.startingTools])):toolBank;
    newChapterUnlocked=false;newBadge=null;bankedCoins=0;game=new Game(level,mode,Math.random,loadout,isFlowMode(mode)?{shape,unlockedTools:profile.unlockedTools,equipped:chosen}:{lifePool:profile.lifePool,lifeProgress:profile.lifeProgress,completed:!!records[level]?.stars,unlockedTools:profile.unlockedTools,equipped:chosen});selectedId=null;paused=false;aiming=null;snapAnimation=null;settleAnimation=null;keys.clear();targetFaces.clear();magnetLatch.reset();
    clearCelebration=null;$('clear-reward').hidden=true;
    $('incoming-list').dataset.signature='';
    clearPieces();for(const mesh of blockMeshes.values())removeGroup(mesh);blockMeshes.clear();
    for(const effect of effects){if(effect.group){scene.remove(effect.group);effect.material.dispose();}else{scene.remove(effect.mesh);if(effect.kind==='ring'){effect.mesh.geometry.dispose();effect.mesh.material.dispose();}else effect.mesh.children[1]?.material?.dispose();}}effects.length=0;
    syncBlocks();root.quaternion.copy(mode==='magnet'?magnetInitialRotation:initialRotation);viewHeight=8.6;
    closeModal();game.tick(0);handleEvents();chooseSelected();updateHUD();
    if(mode==='growth')toast('100 cells · random 3–10% speed rises every 25 placements');
    else if(mode==='endless')toast('Endless flow · match to refill your toolbox');
    else if(mode==='magnet')toast('Rotate to aim · the magnet catches within 20°');
    else if(cfg.stage===0)toast('Tap a face → Snap · swipe to inspect');
  }
  function updateHUD() {
    if(!game) return;
    const cfg=game.config,magnet=game.mode==='magnet';
    document.querySelector('.sidebar').dataset.mode=game.mode;
    $('snap').hidden=magnet;$('magnet-status').hidden=!magnet;
    $('arena').setAttribute('aria-label',magnet?'MagnetFlow board. Rotate to aim; compatible faces catch automatically.':'3D game board. Swipe to inspect. Tap an exposed face, then Snap turns and attaches.');
    $('score').textContent=String(game.score).padStart(5,'0');
    $('combo').textContent=game.combo>1?`${1+Math.min(4,Math.floor(game.combo/3))}× combo`:'';
    $('level-name').textContent=cfg.name;
    $('chapter-title').textContent=cfg.name;$('chapter-subtitle').textContent=cfg.subtitle;
    $('chapter-number').textContent=game.mode==='growth'?'LAB':`${String(cfg.stage+1).padStart(2,'0')} / 20`;
    $('level-label').textContent=game.mode==='growth'?'GROWTH LAB':isFlowMode(game.mode)?`${SHAPES[game.shape].name.toUpperCase()} ${magnet?'⊂⊃':'∞'}`:`${SHAPES[game.shape].name.toUpperCase()} ${cfg.stage+1}/20`;
    $('lives').textContent=game.mode==='growth'?'∞':Array.from({length:magnet?1:3},(_,i)=>i<game.lives?'◆':'◇').join(' ')+(cfg.clearsPerLife?` +${game.lifePool}`:'');
    $('lives').setAttribute('aria-label',game.mode==='growth'?'No life limit':`${game.lives} lives, ${cfg.clearsPerLife?game.lifePool:0} spares`);
    $('progress-text').textContent=game.mode==='growth'?`${game.blocks.length-1}/100`:isFlowMode(game.mode)?`${game.snaps} placed · ${PACE_EVERY-game.snaps%PACE_EVERY} to speed up`:`${game.resolved}/${cfg.total}`;
    $('progress-fill').style.width=`${100*(game.mode==='growth'?(game.blocks.length-1)/100:isFlowMode(game.mode)?0:game.resolved/cfg.total)}%`;
    $('best').textContent=game.mode!=='classic'?`${game.pace.multiplier.toFixed(2)}× speed${isFlowMode(game.mode)?` · BEST ${profile[game.mode][game.shape]}`:''}`:`${coins} coins · ${cfg.clearsPerLife?`${game.lifeProgress}/${cfg.clearsPerLife} → ♥`:`★${cfg.gold}`}`;
    $('concurrency').textContent=`${cfg.concurrent} ${cfg.concurrent===1?'LANE':'LANES'}`;
    $('rule-title').textContent=game.mode==='growth'?'Keep every connection.': 'Three touching cells clear.';
    $('rule-detail').textContent=game.mode==='growth'?'No clears or life limit. The camera pulls back as your sculpture grows.':'Three clear their color group. Four or more clear the whole sculpture with a bonus.';
    $('color-counts').innerHTML=COLORS.map((c,i)=>`<span style="--gem:${c.hex}">${c.symbol} ×${game.blocks.filter(b=>b.color===i).length}</span>`).join('');
    const signature=game.incoming.map(p=>`${p.id}:${p.color}:${p.drop}:${p.id===selectedId}`).join(',');
    if($('incoming-list').dataset.signature!==signature) {
      $('incoming-list').dataset.signature=signature;
      $('incoming-list').innerHTML=game.incoming.length?game.incoming.map(p=>`<button class="piece-card ${p.id===selectedId?'selected':''}" data-id="${p.id}" style="--gem:${COLORS[p.color].hex}" aria-pressed="${p.id===selectedId}" aria-label="Select ${COLORS[p.color].name} ${SHAPES[game.shape].name} from ${LANE_NAMES[p.lane]}"><span class="piece-icon">${COLORS[p.color].symbol}</span><span class="piece-info"><strong>${LANE_NAMES[p.lane].toUpperCase()}</strong><small>${COLORS[p.color].name} · ${SHAPES[game.shape].name}${p.drop?` · ${TOOL_DEFS[p.drop].symbol}`:''}</small></span><kbd>${p.lane+1}</kbd>${p.drop?`<span class="drop-tag ${p.drop}" title="Contains ${TOOL_DEFS[p.drop].name}">${TOOL_DEFS[p.drop].symbol}</span>`:''}<span class="piece-time"></span></button>`).join(''):'<div class="empty-incoming">Find your next angle.</div>';
    }
    for(const p of game.incoming) {
      const bar=$('incoming-list').querySelector(`[data-id="${p.id}"] .piece-time`);
      if(bar)bar.style.transform=`scaleX(${clamp(p.remaining/p.duration,0,1)})`;
    }
    document.querySelectorAll('.lane-label').forEach(el=>el.classList.toggle('active',game.incoming.some(p=>p.lane===Number(el.dataset.lane))));
    const selected=game.incoming.find(p=>p.id===selectedId),dock=selected&&getDock(selected);
    const valid=dock?.dot>=(magnet?MAGNET_COS:ALIGNMENT_COS)&&!dock?.blocked;
    if(magnet){
      const angle=dock?THREE.MathUtils.radToDeg(Math.acos(clamp(dock.dot,-1,1))):90;
      $('magnet-state').textContent=paused?'Paused':snapAnimation?.magnetic?'Magnet pulling…':game.settleRemaining?'Clearing…':valid?'Magnet catching…':'Rotate to attract';
      $('magnet-angle').textContent=dock?`${Math.round(angle)}° → 20°`:'';
      $('magnet-fill').style.width=`${100*clamp((65-angle)/(65-MAGNET_ANGLE),0,1)}%`;
      $('magnet-status').classList.toggle('caught',valid||!!snapAnimation?.magnetic);
    }
    $('alignment-card').classList.toggle('valid',valid);
    const targeted=selected&&targetFaces.has(selected.id);
    $('alignment-status').textContent=selected?(targeted?'Face selected. Tap Snap.':'Tap an exposed face, then Snap.'):'Waiting for a cell';
    $('alignment-detail').textContent=selected?(valid?`${COLORS[selected.color].symbol} ${COLORS[selected.color].name} → ${({3:'triangle',4:'square',5:'pentagon',6:'hexagon'}[dock.face.geometry.sides]||'face')}`:'Swipe to inspect every side'):`${SHAPES[game.shape].name} · choose a face`;
    const contacts=dock?contactsForFace(dock.face,game.blocks).length:0;
    if(targeted)$('alignment-detail').textContent='Snap turns and attaches automatically';
    if((valid||targeted)&&contacts>1)$('alignment-detail').textContent=`${contacts}-face join · ${targeted?'Snap auto-turns':'bonus'}`;
    $('alignment-fill').style.width=`${dock?clamp((dock.dot-.4)/(.999-.4)*100,0,100):0}%`;
    if(game.settleRemaining>0){
      $('alignment-status').textContent='Remaining colors sliding inward…';
      $('alignment-detail').textContent='Incoming cells paused';
    }
    $('arena').dataset.settling=String(game.settleRemaining>0);
    $('tools-row').hidden=!game.equipped.length;
    const toolsBlocked=paused||game.status!=='playing'||game.settleRemaining>0||!!snapAnimation;
    for(const [i,id] of ['slow','bomb'].entries()){
      const kind=game.equipped[i],button=$(id);button.hidden=!kind;
      if(!kind)continue;
      const def=TOOL_DEFS[kind],active=kind==='slow'?game.slowRemaining>0:kind==='shield'&&game.shieldActive;
      button.querySelector('span').textContent=def.symbol;
      $(id+'-count').textContent=kind==='slow'&&active?`${Math.ceil(game.slowRemaining)}s`:kind==='shield'&&active?'ON':`×${game.tools[kind]}`;
      button.disabled=toolsBlocked||!game.canUseTool(kind)||active||(['bomb','recolor'].includes(kind)&&!selected);
      button.title=def.description;button.setAttribute('aria-label',`${def.name}: ${active?'active':`${game.tools[kind]} charges`}`);
      button.classList.toggle('tool-active',active);
    }
    $('arena').dataset.slow=String(game.slowRemaining>0);$('arena').dataset.shield=String(game.shieldActive);
    $('snap').disabled=!selected||paused||game.status!=='playing'||game.settleRemaining>0;
    $('pause').textContent=paused?'▶':'Ⅱ';
    $('pause').setAttribute('aria-label',paused?'Resume game':'Pause game');
  }

  function showClearReward(event){
    clearCelebration={elapsed:0,duration:event.fullClear?1.65:1.15};
    const el=$('clear-reward');el.innerHTML=clearRewardMarkup(event);
    el.className=event.fullClear?'full':'group';el.style.setProperty('--reward-color',COLORS[event.color].hex);
    el.style.opacity='0';el.hidden=false;
  }
  function animateClearReward(dt){
    if(!clearCelebration||paused)return;
    const el=$('clear-reward');clearCelebration.elapsed+=dt;
    const t=clearCelebration.elapsed,duration=clearCelebration.duration;
    if(t>=duration){el.hidden=true;clearCelebration=null;return;}
    const entry=Math.min(1,t/.16),exit=Math.min(1,(duration-t)/.28);
    el.style.opacity=String(Math.min(entry,exit));
    el.style.transform=reducedMotion?'translateX(-50%)':`translate(-50%,${(1-entry)*13-(1-exit)*9}px) scale(${.86+.14*(1-(1-entry)**3)})`;
  }
  function floating(text,pos,color,caption='') {
    const p=pos.clone().project(camera);
    const el=document.createElement('div');el.className='float-label';el.style.left=`${(p.x*.5+.5)*width}px`;el.style.top=`${(-p.y*.5+.5)*height}px`;el.style.color=color;
    el.textContent=text;if(caption){const small=document.createElement('small');small.textContent=caption;el.appendChild(small);}
    $('floating-labels').appendChild(el);setTimeout(()=>el.remove(),1250);
  }
  function resize() {
    const rect=$('canvas-host').getBoundingClientRect();width=rect.width;height=rect.height;
    renderer.setSize(width,height);renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  }
  new ResizeObserver(resize).observe($('arena'));resize();syncBlocks();

  renderer.domElement.addEventListener('pointerdown',event=>{
    if(paused||!game||game.status!=='playing'||game.settleRemaining>0||snapAnimation?.magnetic||event.button!==0)return;
    dragging={id:event.pointerId,x:event.clientX,y:event.clientY};snapAnimation=null;aiming=null;
    touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});
    tapGesture=touchPoints.size===1?{id:event.pointerId,x:event.clientX,y:event.clientY,moved:false}:null;
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener('pointermove',event=>{
    if(!touchPoints.has(event.pointerId))return;
    if(tapGesture&&Math.hypot(event.clientX-tapGesture.x,event.clientY-tapGesture.y)>7)tapGesture.moved=true;
    if(touchPoints.size===2) {
      const before=[...touchPoints.values()];
      const oldAngle=Math.atan2(before[1].y-before[0].y,before[1].x-before[0].x);
      touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});
      const after=[...touchPoints.values()];
      const newAngle=Math.atan2(after[1].y-after[0].y,after[1].x-after[0].x);
      let delta=newAngle-oldAngle;delta=Math.atan2(Math.sin(delta),Math.cos(delta));
      root.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(V([0,0,1]),-delta));
      return;
    }
    if(!dragging||dragging.id!==event.pointerId)return;
    const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y;
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(dy*.0075,dx*.0075,0));root.quaternion.premultiply(q);
    dragging.x=event.clientX;dragging.y=event.clientY;
    touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});
  });
  const stopDrag=event=>{
    if(event.type==='pointerup'&&tapGesture?.id===event.pointerId&&!tapGesture.moved)chooseFaceAt(event.clientX,event.clientY);
    tapGesture=null;
    touchPoints.delete(event.pointerId);
    const remaining=[...touchPoints.entries()][0];
    dragging=remaining?{id:remaining[0],x:remaining[1].x,y:remaining[1].y}:null;
  };
  renderer.domElement.addEventListener('pointerup',stopDrag);renderer.domElement.addEventListener('pointercancel',stopDrag);
  function chooseFaceAt(clientX,clientY) {
    if(!game||game.mode==='magnet'||paused||game.settleRemaining>0||!selectedId)return;
    const rect=renderer.domElement.getBoundingClientRect();
    const pointer=new THREE.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    const ray=new THREE.Raycaster();ray.setFromCamera(pointer,camera);
    const hit=ray.intersectObjects([...blockMeshes.values()],true).find(h=>h.object.isMesh);
    if(!hit)return;
    const blockId=hit.object.parent.userData.blockId;
    const block=game.blocks.find(b=>b.id===blockId);if(!block)return;
    const local=root.worldToLocal(hit.point.clone()).sub(V(block.position));
    const components=[Math.abs(local.x),Math.abs(local.y),Math.abs(local.z)];
    const axis=components.indexOf(Math.max(...components));
    const index=axis*2+(local.getComponent(axis)<0?1:0);
    const actualIndex=isPoly(block)?[...facesOf(block)].sort((a,b)=>V(b.normal).dot(hit.face.normal.clone().applyQuaternion(hit.object.parent.quaternion))-V(a.normal).dot(hit.face.normal.clone().applyQuaternion(hit.object.parent.quaternion)))[0].index:index;
    const face=currentFaces().find(f=>f.blockId===blockId&&f.index===actualIndex);
    if(!face){targetFaces.delete(selectedId);toast('That face is occupied · tap an open face');updateHUD();return;}
    targetFaces.set(selectedId,{blockId,index:actualIndex});snapAnimation=null;
    toast('Face selected · tap Snap to turn and attach', 'good');sound('align');updateHUD();
  }
  $('incoming-list').addEventListener('click',event=>{
    const card=event.target.closest('.piece-card');if(!card||paused||game?.settleRemaining>0||snapAnimation?.magnetic)return;
    selectedId=Number(card.dataset.id);snapAnimation=null;aiming=null;updateHUD();
  });
  function useSlot(index){
    if(paused||snapAnimation)return;chooseSelected();
    const kind=game?.equipped[index];
    if(kind==='slow')game.useSlow();
    else if(kind==='bomb')game.bomb(selectedId);
    else if(kind==='shield')game.useShield();
    else if(kind==='recolor'&&game.canUseTool('recolor')){
      const piece=game.incoming.find(p=>p.id===selectedId);if(!piece)return;
      paused=true;showModal('recolor',`<div class="modal-kicker">RECOLOR · 1 CHARGE</div><h2 id="modal-title">Choose a cell color.</h2><p>The selected incoming cell keeps its lane, timer and embedded tool.</p><div class="color-picker">${COLORS.slice(0,game.config.colorCount).map((c,i)=>`<button data-cell-color="${i}" style="--gem:${c.hex}" ${i===piece.color?'disabled':''}><b>${c.symbol}</b>${c.name}</button>`).join('')}</div><div class="modal-buttons"><button class="text-button" data-action="resume">Cancel</button></div>`);return;
    }
    handleEvents();chooseSelected();updateHUD();
  }
  $('slow').onclick=()=>useSlot(0);$('bomb').onclick=()=>useSlot(1);
  $('snap').onclick=quickSnap;$('reset-view').onclick=resetView;
  $('pause').onclick=togglePause;
  function suspendRun(){if(game?.status==='playing'){if(game.mode==='magnet')finishPendingMagnet();paused=true;saveMagnet();}}
  $('help').onclick=()=>{suspendRun();showHelp();};
  $('home').onclick=()=>{suspendRun();showLevels();};
  $('levels').onclick=()=>{suspendRun();showLevels();};
  $('sound').onclick=()=>{soundReturn=modalType?{type:modalType,html:$('modal-content').innerHTML}:null;suspendRun();showSoundOptions();};
  document.addEventListener('keydown',event=>{
    const k=event.key.toLowerCase();
    const modalOpen=!$('modal').classList.contains('hidden');
    if(modalOpen) {
      if(k==='escape' && modalType!=='welcome') {event.preventDefault();resume();}
      if(k==='tab') trapFocus(event);
      return;
    }
    if(event.target.tagName.toLowerCase()==='input'&&k===' ')return;
    if(['arrowup','arrowdown','arrowleft','arrowright',' ','q','e'].includes(k))event.preventDefault();
    keys.add(k);if(event.repeat)return;
    if(k===' ')quickSnap();
    else if(k==='p'||k==='escape')togglePause();else if(k==='r')resetView();else if(k==='m')$('sound').click();
    else if(laneKeys.includes(k)) {
      const p=game?.incoming.find(p=>p.lane===Number(k)-1);if(p&&!snapAnimation?.magnetic){selectedId=p.id;snapAnimation=null;aiming=null;updateHUD();}
    }
  });
  document.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur',()=>{keys.clear();dragging=null;touchPoints.clear();if(game?.status==='playing'&&!paused)togglePause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&game?.status==='playing'&&!paused)togglePause();});
  window.addEventListener('pagehide',()=>suspendRun());

  function togglePause() {
    if(!game||game.status!=='playing')return;
    if(game.awaitingCheckpoint){checkpointModal();return;}
    if(!paused&&game.mode==='magnet')finishPendingMagnet();
    if(game.awaitingCheckpoint){checkpointModal();return;}
    if(paused)resume();else {paused=true;keys.clear();dragging=null;touchPoints.clear();showModal('pause',`<div class="modal-kicker">TAKE YOUR TIME</div><h2 id="modal-title">A moment of stillness.</h2><p>Your sculpture and incoming pieces are waiting exactly where you left them.</p><div class="modal-buttons"><button class="primary" data-action="resume">Resume <span aria-hidden="true">↗</span></button><button class="text-button" data-action="retry">Restart</button><button class="text-button" data-action="levels">Levels</button></div>`);}
    if(paused&&game.mode==='magnet'){
      saveMagnet();
      $('modal-content').querySelector('.modal-buttons').insertAdjacentHTML('beforeend','<button class="text-button" data-action="save-magnet">Save & exit</button><button class="text-button" data-action="end-magnet">End run · bank score</button>');
    }
    updateHUD();
  }
  function finishPendingMagnet(){
    if(!snapAnimation?.magnetic)return;
    const capture=snapAnimation;snapAnimation=null;root.quaternion.copy(capture.to);finishMagnetPull(capture);
  }
  function saveMagnet(){
    if(game?.mode!=='magnet'||game.status!=='playing'||snapAnimation?.magnetic)return false;
    profile.magnetRun=captureMagnet(game,root.quaternion.toArray(),selectedId);
    profile.magnet[game.shape]=Math.max(profile.magnet[game.shape],game.score);
    return save();
  }
  function checkpointModal(){
    paused=true;keys.clear();dragging=null;touchPoints.clear();
    const stored=saveMagnet();
    showModal('checkpoint',`<div class="brief-kicker">MAGNETFLOW · CHECKPOINT ${game.snaps}</div>${hero(game.shape,'magnet','⊂⊃')}<h2 id="modal-title">A well-earned pause.</h2><p class="brief-copy">${game.score.toLocaleString()} points · ${game.pace.multiplier.toFixed(2)}× speed.<br>One life. No new lives. ${stored?'Your run is saved here.':'Save failed. Keep this game open and free browser storage.'}</p><div class="modal-buttons"><button class="primary" data-action="continue-magnet">Keep going ↗</button><button class="text-button" data-action="save-magnet">Save & exit</button><button class="text-button" data-action="end-magnet">End run · bank score</button></div><p class="help-note">Progress stays on this device and browser. Ending a run keeps its best score and removes its resume save.</p>`);
  }
  function resumeMagnet(){
    const restored=restoreMagnet(profile.magnetRun);if(!restored){profile.magnetRun=null;save();showEndless('cube','magnet');return;}
    game=restored.game;selectedId=restored.selectedId;paused=true;snapAnimation=null;settleAnimation=null;aiming=null;targetFaces.clear();magnetLatch.reset();keys.clear();
    clearPieces();for(const mesh of blockMeshes.values())removeGroup(mesh);blockMeshes.clear();
    clearCelebration=null;$('clear-reward').hidden=true;$('incoming-list').dataset.signature='';
    root.quaternion.fromArray(restored.rotation);syncBlocks();viewHeight=8.6;chooseSelected();updateHUD();
    if(game.awaitingCheckpoint)checkpointModal();else showModal('pause',`<div class="modal-kicker">SAVED MAGNETFLOW · ${SHAPES[game.shape].name.toUpperCase()}</div><h2 id="modal-title">Your angle is waiting.</h2><p>${game.score.toLocaleString()} points · ${game.snaps} placed · ${game.pace.multiplier.toFixed(2)}× speed. Same one life and tools.</p><div class="modal-buttons"><button class="primary" data-action="resume">Resume run ↗</button><button class="text-button" data-action="save-magnet">Save & exit</button><button class="text-button" data-action="end-magnet">End run · bank score</button></div>`);
  }
  function saveAndExitMagnet(){
    finishPendingMagnet();paused=true;
    if(!saveMagnet()){toast('Save could not be written. Keep this game open and free some browser storage.','bad');return;}
    game=null;clearPieces();showLevels();
  }
  function resume() {if(modalType==='sound'&&soundReturn){const previous=soundReturn;soundReturn=null;showModal(previous.type,previous.html);return;}if(game?.awaitingCheckpoint){checkpointModal();return;}if(game?.status==='playing'){paused=false;closeModal();keys.clear();updateHUD();}else if(game)resultModal();else welcome();}
  function hero(shape,kind='sides',icon='◇'){
    const symbol=CHAPTERS.find(c=>c.shape===shape)?.symbol||'◇';
    return `<div class="brief-art ${kind}" aria-hidden="true"><div class="brief-orbit"></div><div class="brief-jewel ${shape}"><span>${symbol}</span></div><div class="change-token">${icon}</div><i></i><i></i><i></i></div>`;
  }
  function briefLevel(level=0,mode='classic',shape='cube',selection=null){
    if(mode==='classic'&&!levelUnlocked(level,records)){showLevels();return;}
    if(isFlowMode(mode)&&!flowShapeUnlocked(shape,records,mode)){showEndless('cube',mode);return;}
    paused=true;const available=availableTools(mode,LEVELS[level]);const preferred=normalizeLoadout(selection||profile.loadout,available);pendingRun={level,mode,shape,equipped:selection?preferred:preferred.length?preferred:available.slice(0,2)};
    const cfg=LEVELS[level],growth=mode==='growth',endless=isFlowMode(mode),magnet=mode==='magnet';
    const brief=growth?{change:'speed',icon:'»',title:'Build to 100',description:'Keep 100 cells. Every 25 placed: a random 3–10% speed rise.'}:magnet?{change:'magnet',icon:'⊂⊃',title:'Feel the pull',description:'Rotate to aim. Within 20°, a compatible face pulls the cell in. One life. A saved break every 100 placements.'}:endless?{change:'tool',icon:'∞',title:'Find your endless flow',description:'Infinite cells. Start with 2 of each tool, collect refills and earn spares.'}:cfg.briefing;
    const actualShape=growth?'cube':endless?shape:cfg.shape;
    showModal('briefing',`<div class="brief-kicker">${SHAPES[actualShape].name.toUpperCase()} · ${growth?'GROWTH LAB':endless?(magnet?'MAGNETFLOW':'ENDLESS FLOW'):`LEVEL ${cfg.stage+1} / 20`}</div>${hero(actualShape,brief.change,brief.icon)}<div class="brief-category">${growth?'CONTINUOUS BUILD':endless?(magnet?'AIM · ATTRACT · CLEAR':'SURVIVAL'):brief.change==='speed'||cfg.stage===4?'SPEED UP':`NEW ${brief.change.toUpperCase()}`}</div><h2 id="modal-title">${brief.title}</h2><p class="brief-copy">${brief.description}</p><div class="brief-stats">${growth?'<span><b>100</b> cubes</span><span><b>∞</b> lives</span>':endless?`<span><b>4</b> sides</span><span><b>2</b> tool slots</span><span><b>${magnet?'1':'♥'}</b> ${magnet?'life':'spares'}</span>`:`<span><b>${cfg.total}</b> cells</span><span><b>${cfg.colorCount}</b> colors</span><span><b>${cfg.travel.toFixed(1)}s</b> travel</span>`}</div>${loadoutMarkup(available)}<div class="modal-buttons"><button class="primary" data-action="play" ${available.length&&!pendingRun.equipped.length?'disabled':''}>Play ↗</button><button class="text-button" data-action="levels">Back</button></div>`);
  }
  function resultModal(){
    const won=game.status==='won',growth=game.mode==='growth',classic=game.mode==='classic',cfg=game.config,stars=game.stars();
    const hasNext=classic&&cfg.stage<19;
    showModal('result',`<div class="modal-kicker">${SHAPES[game.shape].name.toUpperCase()} · ${growth?'GROWTH LAB':classic?`LEVEL ${cfg.stage+1}/20`:game.mode==='magnet'?'MAGNETFLOW':'ENDLESS FLOW'}</div><h2 id="modal-title">${won?(growth?'100 connections.':'Level complete.'):(game.status==='ended'?'Run banked.':'Find your next angle.')}</h2>${won&&classic?`<div class="result-stars" aria-label="${stars} of 3 stars">${'★'.repeat(stars)}</div>`:''}${newBadge&&classic?`<div class="badge-award"><span>${newBadge.symbol}</span><strong>${SHAPES[game.shape].name} ${newBadge.name}</strong><small>${newBadge.at} levels completed</small></div>`:''}<p>${newChapterUnlocked?`${CHAPTERS[cfg.chapter+1].name} unlocked. Keep going here, or try the next shape.`:growth?'Every cube stays. Your sculpture is complete.':classic?`${game.resolved}/${cfg.total} cells resolved.`:`Best ${profile[game.mode][game.shape].toLocaleString()} · tools refill through matching.`}</p><div class="result-stats"><div><strong>${game.score.toLocaleString()}</strong><span>SCORE</span></div><div><strong>${game.snaps}</strong><span>SNAPS</span></div><div><strong>${growth?game.blocks.length-1:game.clears}</strong><span>${growth?'CUBES':'CLEARS'}</span></div></div><div class="modal-buttons"><button class="primary" data-action="${won&&hasNext?'next':'retry'}">${won&&hasNext?'Next level ↗':'Play again ↗'}</button>${classic?`<button class="text-button" data-action="shop">Tool shop · ${coins} coins</button>`:''}<button class="text-button" data-action="levels">Choose a shape</button></div>`);
  }
  function welcome(){
    showModal('welcome',`<div class="modal-kicker">TURN · CHOOSE · SNAP</div>${hero('cube','sides','◇')}<h1 id="modal-title">Find your angle.<br>Make it <em>snap.</em></h1><p>Tap a face, then Snap. Match 3 to clear the group; match 4+ to clear the sculpture.</p><div class="modal-buttons"><button class="primary" data-action="start">Play ↗</button><button class="text-button" data-action="levels">Explore levels</button></div><div class="modal-foot">5 SHAPES · 100 LEVELS · 3 CONTINUOUS MODES · v0.5.0</div>`);
  }
  function showLevels(chapter=game?.config.chapter??0,page=null){
    if(chapter!==levelChapter)levelPage=0;levelChapter=chapter;
    if(!chapterUnlocked(chapter,records))levelChapter=0;
    if(page!==null)levelPage=page;levelPage=clamp(levelPage,0,3);
    const current=CHAPTERS[levelChapter],badges=chapterBadges(levelChapter,records);
    showModal('levels',`<div class="modal-kicker">100 LEVELS · FIND YOUR ANGLE</div><h2 id="modal-title">Choose your shape.</h2><div class="chapter-tabs">${CHAPTERS.map((c,i)=>`<button data-chapter="${i}" ${chapterUnlocked(i,records)?'':'disabled'} class="${i===levelChapter?'selected':''}" title="${chapterUnlocked(i,records)?c.name:`Finish ${CHAPTERS[i-1].name} level 4`}"><span>${c.symbol}</span>${c.name}</button>`).join('')}</div><div class="badge-shelf">${badges.map(b=>`<div class="${b.earned?'earned':''}" title="${b.at} completed levels" aria-label="${b.name}: ${b.earned?'earned':`${badges[0].completed}/${b.at} levels`}"><span>${b.symbol}</span><small>${b.name}</small></div>`).join('')}</div><div class="level-pages">${[0,1,2,3].map(i=>`<button data-page="${i}" class="${i===levelPage?'selected':''}">${i*5+1}–${i*5+5}</button>`).join('')}</div><div class="level-grid journey-grid">${LEVELS.map((l,i)=>l.chapter===levelChapter&&Math.floor(l.stage/5)===levelPage?`<button class="level-choice" data-level="${i}" ${levelUnlocked(i,records)?'':'disabled'}><span class="level-num">${String(l.stage+1).padStart(2,'0')}</span><span><strong>${l.name}</strong><small>${l.total} cells · ${l.colorCount} colors</small></span><span class="level-stars">${records[i]?.stars?'★'.repeat(records[i].stars):levelUnlocked(i,records)?'↗':'⌑'}</span></button>`:'').join('')}</div><div class="continuous-row"><button class="text-button" data-action="growth">□ Growth lab <small>100 cells</small></button><button class="text-button" data-action="endless">∞ Endless flow <small>Beginner unlocks shapes</small></button><button class="text-button magnet-mode" data-action="magnet">⊂⊃ MagnetFlow <small>${magnetUnlocked(records)?'Rotate · auto catch':'Earn any Novice badge'}</small></button></div><div class="modal-buttons">${!game||game.status!=='playing'?`<button class="text-button" data-action="shop">Tool shop · ${coins} coins</button>`:''}${game?.status==='playing'?'<button class="text-button" data-action="resume">Resume</button>':''}${profile.magnetRun?'<button class="text-button" data-action="resume-magnet">⊂⊃ Resume saved MagnetFlow</button>':''}</div>`);
  }
  function showEndless(shape=endlessShape,mode=flowMenuMode){
    flowMenuMode=isFlowMode(mode)?mode:'endless';const magnet=flowMenuMode==='magnet';
    if(magnet&&!magnetUnlocked(records)){
      showModal('magnet-locked',`<div class="brief-kicker">NOVICE REWARD</div>${hero('cube','magnet','⊂⊃')}<h2 id="modal-title">Unlock MagnetFlow</h2><p class="brief-copy">Complete 10 levels in any one shape to earn its Novice badge.</p><div class="unlock-progress">${CHAPTERS.map((c,i)=>`<span>${c.symbol} ${c.name}<b>${chapterBadges(i,records)[0].completed}/10</b></span>`).join('')}</div><div class="modal-buttons"><button class="primary" data-action="levels">Play campaign ↗</button></div>`);return;
    }
    if(!flowShapeUnlocked(shape,records,flowMenuMode))shape='cube';endlessShape=shape;
    showModal('endless',`<div class="modal-kicker">CONTINUOUS PLAY · ${magnet?'NOVICE REWARD':'BEGINNER REWARDS'}</div><h2 id="modal-title">${magnet?'MagnetFlow.':'Endless flow.'}</h2><p>${magnet?'Rotate to aim. A forgiving 20° magnetic catch pulls cells into place. No Snap button.':'Cube is ready from the start. Earn each other shape’s Beginner badge to use it here.'}</p><div class="chapter-tabs flow-tabs">${CHAPTERS.map((c,i)=>{const open=flowShapeUnlocked(c.shape,records,flowMenuMode),count=chapterBadges(i,records)[0].completed;return `<button data-endless-shape="${c.shape}" ${open?'':'disabled'} class="${shape===c.shape?'selected':''}" title="${open?`${c.name} available`:`Earn ${c.name} Beginner: 5 completed levels`}"><span>${c.symbol}</span>${c.name}<small>${open?'Ready':`Beginner ${Math.min(count,5)}/5`}</small></button>`;}).join('')}</div>${hero(shape,magnet?'magnet':'tool',magnet?'⊂⊃':'∞')}<div class="modal-foot">BEST ${profile[flowMenuMode][shape].toLocaleString()} · ${magnet?'ONE LIFE · BREAK EVERY 100':'CLEARS, TOOLS & SPARE LIVES'}</div>${magnet&&profile.magnetRun?`<button class="saved-run" data-action="resume-magnet">⊂⊃ Resume saved ${SHAPES[profile.magnetRun.shape].name}<small>${profile.magnetRun.state.score.toLocaleString()} points · ${profile.magnetRun.state.snaps} placed</small></button><p class="help-note">Starting a new MagnetFlow run replaces this save.</p>`:''}<div class="modal-buttons"><button class="primary" data-action="endless-brief">Continue ↗</button><button class="text-button" data-action="levels">Back</button></div>`);
  }
  function availableTools(mode,cfg){
    if(mode==='growth')return [];
    const kinds=isFlowMode(mode)?[...BASE_TOOLS]:[...cfg.toolTypes];
    if(isFlowMode(mode)||cfg.stage>=6)for(const t of TOOL_IDS)if(!BASE_TOOLS.includes(t)&&profile.unlockedTools[t])kinds.push(t);
    return kinds;
  }
  function loadoutMarkup(available){
    if(!available.length)return '';
    return `<section class="loadout-picker"><div class="loadout-heading">EQUIP UP TO TWO <b>${pendingRun.equipped.length}/2</b></div><div class="loadout-grid">${available.map(t=>`<button data-equip="${t}" aria-pressed="${pendingRun.equipped.includes(t)}"><span>${TOOL_DEFS[t].symbol}</span>${TOOL_DEFS[t].name}</button>`).join('')}</div><small id="loadout-note" role="status">Tap a selected tool to free a slot. Extra charges stay in storage.</small></section>`;
  }
  function toolUnlocked(kind){return BASE_TOOLS.includes(kind)?LEVELS.some((l,i)=>l.toolTypes.includes(kind)&&levelUnlocked(i,records)):profile.unlockedTools[kind]===true;}

  function showSoundOptions(){
    showModal('sound',`<div class="modal-kicker">SET YOUR RHYTHM</div><h2 id="modal-title">Sound.</h2><button class="sound-option" data-action="toggle-effects" aria-pressed="${!muted}"><span>Snap & effects</span><strong>${muted?'Muted':'On'}</strong></button><button class="sound-option" data-action="toggle-music" aria-pressed="${!profile.musicMuted}"><span>Background music</span><strong>${profile.musicMuted?'Muted':'On'}</strong></button><label class="volume-label" for="music-volume">Music volume <output id="music-percent">${Math.round(profile.musicVolume*100)}%</output></label><input id="music-volume" type="range" min="0" max="20" value="${Math.round(profile.musicVolume*100)}" step="1"><p class="music-credit" id="track-name">${music.track}</p><div class="modal-foot">MUSIC IS CAPPED AT 20%</div><div class="modal-buttons"><button class="primary" data-action="resume">Done ↗</button></div>`);
  }
  function showShop(){
    if(game?.status==='playing'){showLevels();return;}
    const wins=bestChapterWins(records);
    showModal('shop',`<div class="modal-kicker">COINS · PERMANENT UNLOCKS · REFILLS</div><h2 id="modal-title">Your tool collection.</h2><p class="coin-wallet">${coins} coins</p><p>Unlocks include 2 charges. Refills buy 1 charge. Equip up to two before Play; other stock stays saved. Cleared cells earn 2 coins each.</p><div class="shop-grid">${TOOL_IDS.map(kind=>{
      const def=TOOL_DEFS[kind],owned=toolUnlocked(kind),base=BASE_TOOLS.includes(kind),eligible=wins>=def.researchAt;
      return `<div class="shop-item"><span class="shop-symbol">${def.symbol}</span><h3>${def.name}</h3><p>${def.description}</p><small>${owned?`Owned ${toolBank[kind]} / ${TOOL_CAP}`:base?`Opens at level ${def.level}`:`${def.badge} · ${Math.min(wins,def.researchAt)}/${def.researchAt} completed`}</small>${owned?`<button data-buy="${kind}" ${coins<def.price||toolBank[kind]>=TOOL_CAP?'disabled':''}>${toolBank[kind]>=TOOL_CAP?'Storage full':`Refill · ${def.price} coins`}</button>`:base?`<button disabled>Unlock at level ${def.level}</button>`:`<button data-research="${kind}" ${!eligible||coins<def.unlockCost?'disabled':''}>Unlock · ${def.unlockCost} coins</button>`}</div>`;
    }).join('')}</div><div class="modal-buttons"><button class="primary" data-action="${game&&game.status!=='playing'?'result':'levels'}">${game&&game.status!=='playing'?'Back to results':'Choose a shape'} ↗</button></div><div class="modal-foot">COINS AND TOOLS SAVE HERE · NO REAL-MONEY PURCHASES</div>`);
  }
  function showHelp() {
    showModal('help',`<button class="modal-close" data-action="resume" aria-label="Close instructions">×</button><div class="modal-kicker">CHOOSE THE CONNECTION</div><h2 id="modal-title">Turn. Choose. Snap.</h2><p>Swipe to inspect your sculpture. Tap the exposed face where the next cell should attach, then press Snap.</p><div class="help-table"><strong>Swipe</strong><span>Rotate freely in 3D. Your chosen face stays selected while you look around.</span><strong>Tap a face</strong><span>Choose an exposed face on any piece. Branch outward or fill a corner to touch several cubes for a bonus.</span><strong>Snap</strong><span>Automatically turns the sculpture into alignment and attaches the selected cell to your chosen face. You do not need to line it up manually.</span><strong>Match three</strong><span>Three face-connected pieces of the same color clear only their group. Bent and branching groups count. Four or more of one color clear every attached cell, keeping the central core, with a 1,000-point bonus plus 250 for each match beyond four, before the combo multiplier.</span><strong>Keep the rest</strong><span>After a three-match, all other pieces stay and slide inward, including separate pieces of the same color. A four-plus match clears the entire sculpture; incoming pieces keep approaching after the effect.</span><strong>Incoming card</strong><span>Tap a card to choose which cell to place when several approach. Their timers keep moving.</span><strong>Face outline</strong><span>Amber pulses faster as the face nears alignment, then holds solid in cell color when locked.</span><strong>Slow time</strong><span>All incoming pieces and spawns move at 45% speed for 8 seconds. Clear cells marked ◷ to collect charges, or buy them with earned coins between stages.</span><strong>Bomb</strong><span>Removes only the selected incoming cell, awards 75 points and costs no life. Clear cells marked ✦ to collect Bombs. Bombing a marked cell does not collect its tool.</span><strong>Bonus clears</strong><span>A four-plus match earns the full-clear bonus. Every removed cell earns 2 coins and releases any tool it contains, including other colors swept by a full clear. Full tools convert extra drops to 3 coins. First wins earn 10 coins plus 2 for each level beyond the first; replay wins have no completion bonus.</span><strong>Tool shop</strong><span>Buy Slow for 45 coins or Bomb for 55 between stages. Each holds three. Coins and tools carry over and save here; retries do not refill spent tools. Slow Time unlocks at level 5; Bomb at level 8. Each introduction grants two charges, once per profile. Older one-charge introductions get only the extra charge; retries never refill spent stock. Levels 1–4 use no tools.</span><strong>Tool loadout</strong><span>Equip up to two tools before each run. Other collected tools stay in storage until the next run. Shield research opens with any Novice badge: 140 coins, then 65 per refill. Recolor opens with any Expert badge: 220 coins, then 80 per refill. Each permanent unlock includes two charges. Shield protects one miss without losing a life or combo. Recolor changes the selected incoming cell to a chosen available color. Both appear as marked drops once owned and available in the run.</span><strong>New shapes</strong><span>Each shape has 20 levels. Levels 1–4 teach the four sides; level 4 opens the next shape. Every level has a briefing. Complete 5/10/15/20 distinct levels in a shape for Beginner/Novice/Expert/Master badges. Existing stars are kept.</span><strong>Spare lives</strong><span>From level 10, every 3 match clears earns a spare, up to 5. From level 15, every 2 clears. Spares and partial progress carry between campaign levels and retries. A spare is used automatically at zero active lives. Replaying levels below 10 does not earn or spend spares. Endless has a separate run-only pool. MagnetFlow has one life and never earns spares.</span><strong>Flow unlocks</strong><span>Cube is always available in Endless. Earn a shape’s Beginner badge (5 distinct completed levels) to unlock it in Endless and MagnetFlow. The first Novice badge (10 completed levels in one shape) unlocks MagnetFlow.</span><strong>MagnetFlow</strong><span>No Snap button or tap-to-select face. Rotate the sculpture toward the selected incoming lane. Hold a compatible, clear face within 20° briefly; the magnet finishes the turn and pulls in the cell. Tap incoming cards to choose your target. Matching clears and tools work as in Endless. You have one life, with no earned lives. Every 100 placements pauses for Continue, Save & exit, or End run. Save & exit preserves your sculpture, incoming clocks, speed, tools and score. Resume the saved run from the MagnetFlow menu. End run banks the best score and removes the resume save. Progress is local to this browser or installed app, with no cloud sync.</span><strong>Two fingers</strong><span>Twist to roll the sculpture around the viewing axis.</span><strong>Choose first</strong><span>Snap needs a valid face selection. If a tap hits an occupied face, choose another. An invalid Snap press costs no life; missed incoming deadlines do.</span><strong>Ⅱ · ♪ · ↻</strong><span>Pause · sound · reset orientation and face selection. Switching apps pauses automatically.</span></div><p class="help-note">Edges, corners, other colors and the neutral core cannot connect a match. Slides do not trigger automatic cascades. A run ends when active lives and available spares run out. Level complete means all incoming pieces are resolved; it does not clear the sculpture. Starting another level or retry resets it. Growth lab keeps 100 cells, has no life limit. All continuous modes speed up by a random 3–10% every 25 successfully placed cells, counting cleared placements once. Misses and Bomb removals do not count. Endless flow has infinite incoming, shape choice, two starting charges of each tool and run-only tools/lives. Color clears earn a bright cell chime; four-plus clears earn a larger Full Clear image and fanfare. Effects mute silences both. Music and effects mute separately in Sound.</p><div class="modal-buttons"><button class="primary" data-action="resume">${game?'Back to the game':'Got it ↗'}</button></div>${installInstructions()}`);
  }
  function showModal(type,html) {
    modalType=type;keys.clear();dragging=null;touchPoints.clear();lastFocused=document.activeElement;
    $('modal-content').innerHTML=html;$('modal').classList.remove('hidden');
    $('modal-content').querySelector('.primary,button')?.focus({preventScroll:true});
  }
  function closeModal() {$('modal').classList.add('hidden');modalType=null;lastFocused?.focus?.({preventScroll:true});}
  function trapFocus(event) {
    const list=[...$('modal-content').querySelectorAll('button:not(:disabled),input,a[href]')];
    if(!list.length)return;
    if(event.shiftKey&&document.activeElement===list[0]){event.preventDefault();list.at(-1).focus();}
    else if(!event.shiftKey&&document.activeElement===list.at(-1)){event.preventDefault();list[0].focus();}
  }
  $('modal-content').addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    unlockAudio();
    if(button.dataset.buy){if(!toolUnlocked(button.dataset.buy))return;const purchase=purchaseTool({coins,tools:toolBank,unlockedTools:profile.unlockedTools},button.dataset.buy);if(purchase&&game?.status!=='playing'){coins=purchase.coins;Object.assign(toolBank,purchase.tools);save();sound('snap');showShop();}return;}
    if(button.dataset.research){
      if(game?.status==='playing')return;
      const upgrade=researchTool({...profile,coins,tools:toolBank,records},button.dataset.research);
      if(upgrade){coins=upgrade.coins;Object.assign(toolBank,upgrade.tools);profile.unlockedTools=upgrade.unlockedTools;profile.introduced=upgrade.introduced;profile.toolGrants=upgrade.toolGrants;save();sound('win');showShop();}return;
    }
    if(button.dataset.equip&&pendingRun){
      const kind=button.dataset.equip,selected=[...pendingRun.equipped];
      if(selected.includes(kind))selected.splice(selected.indexOf(kind),1);else if(selected.length<2)selected.push(kind);else {$('loadout-note').textContent='Both slots are full. Tap a selected tool to replace it.';return;}
      briefLevel(pendingRun.level,pendingRun.mode,pendingRun.shape,selected);return;
    }
    if(button.dataset.cellColor!==undefined){if(game?.recolor(selectedId,Number(button.dataset.cellColor))){handleEvents();resume();}return;}
    if(button.dataset.chapter!==undefined){showLevels(Number(button.dataset.chapter));return;}
    if(button.dataset.page!==undefined){showLevels(levelChapter,Number(button.dataset.page));return;}
    if(button.dataset.endlessShape){showEndless(button.dataset.endlessShape);return;}
    if(button.dataset.level!==undefined){briefLevel(Number(button.dataset.level));return;}
    const action=button.dataset.action;
    if(action==='shop')showShop();else if(action==='result')resultModal();else if(action==='start')briefLevel();else if(action==='growth')briefLevel(0,'growth');
    else if(action==='endless')showEndless(endlessShape,'endless');else if(action==='magnet')showEndless(endlessShape,'magnet');else if(action==='endless-brief')briefLevel(0,flowMenuMode,endlessShape);
    else if(action==='play'&&pendingRun){const run=pendingRun;pendingRun=null;startGame(run.level,run.mode,run.shape,run.equipped);}
    else if(action==='resume-magnet')resumeMagnet();
    else if(action==='continue-magnet'){if(game?.continueMagnet()){saveMagnet();resume();}}
    else if(action==='save-magnet')saveAndExitMagnet();
    else if(action==='end-magnet'){finishPendingMagnet();if(game?.endMagnet())handleEvents();}
    else if(action==='toggle-music'){profile.musicMuted=!profile.musicMuted;music.setMuted(profile.musicMuted);save();updateSound();showSoundOptions();}
    else if(action==='toggle-effects'){muted=!muted;save();updateSound();showSoundOptions();}
    else if(action==='levels')showLevels();else if(action==='resume')resume();
    else if(action==='retry')briefLevel(game.level,game.mode,game.shape);else if(action==='next')briefLevel(game.level+1);
  });

  $('modal-content').addEventListener('input',event=>{if(event.target.id==='music-volume'){music.setVolume(Number(event.target.value)/100);profile.musicVolume=music.volume;$('music-percent').textContent=`${Math.round(profile.musicVolume*100)}%`;save();}});

  // Test hooks exist only when explicitly opened with ?test=1. They expose the
  // actual rules and renderer state so integration tests can exercise edge cases.
  if(new URLSearchParams(location.search).get('test')==='1') {
    window.__POLYSNAP__={
      start:startGame, snap:quickSnap, select:id=>{selectedId=id;updateHUD();},
      tick:dt=>{const expired=game.tick(dt)||[];chooseSelected();for(const id of expired){const p=game.incoming.find(p=>p.id===id),d=p&&getDock(p);if(d)game.snap(id,d.face,d.dot);else game.miss(id);}handleEvents();chooseSelected();updateHUD();},
      state:()=>({score:game?.score,lives:game?.lives,status:game?.status,mode:game?.mode,level:game?.level,resolved:game?.resolved,snaps:game?.snaps,clears:game?.clears,settleRemaining:game?.settleRemaining,paused,blocks:game?.blocks,renderedBlocks:[...blockMeshes].map(([id,mesh])=>({id,position:mesh.position.toArray()})),incoming:game?.incoming,selectedId,rotation:root.quaternion.toArray(),viewHeight,drawCalls:renderer.info.render.calls}),
      rotate:angles=>{root.quaternion.setFromEuler(new THREE.Euler(...angles));snapAnimation=null;aiming=null;},
      get game(){return game;},get scene(){return scene;},get renderer(){return renderer;}
    };
  }
  updateSound();welcome();
  renderer.setAnimationLoop(time=>{
    const dt=Math.min(.05,lastTime?(time-lastTime)/1000:0);lastTime=time;
    if(game?.status==='playing'&&!paused) {
      const expired=game.tick(dt)||[];chooseSelected();
      for(const id of expired) {
        // An on-time Snap reserves this piece during its short automatic turn.
        // Other lanes continue moving and can still expire normally.
        if((snapAnimation?.queuedSnap||snapAnimation?.magnetic)&&aiming?.pieceId===id)continue;
        const piece=game.incoming.find(p=>p.id===id),dock=piece&&getDock(piece);
        if(dock&&!dock.blocked)game.snap(id,dock.face,dock.dot);else game.miss(id,'Connection path blocked');
      }
      handleEvents();chooseSelected();
    }
    updateWorld(dt,time);
    saveClock+=dt;if(saveClock>=2){saveClock=0;if(game?.mode==='magnet'&&game.status==='playing'&&!snapAnimation?.magnetic)saveMagnet();}
    uiClock+=dt;if(uiClock>.07){updateHUD();uiClock=0;}
  });
}

function makeFaceTexture(hex,index) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');
  const color=new THREE.Color(hex);
  const base=`#${color.getHexString()}`;
  const grad=ctx.createLinearGradient(0,0,256,256);grad.addColorStop(0,index<0?'#34596b':base);grad.addColorStop(1,index<0?'#102936':`#${color.clone().multiplyScalar(.47).getHexString()}`);
  ctx.fillStyle=grad;ctx.fillRect(0,0,256,256);
  const shine=ctx.createLinearGradient(0,0,0,180);shine.addColorStop(0,'#ffffff30');shine.addColorStop(.5,'#ffffff00');ctx.fillStyle=shine;ctx.fillRect(0,0,256,180);
  ctx.lineWidth=2;ctx.strokeStyle=index<0?'#7fe9ee66':'#ffffff50';ctx.strokeRect(15,15,226,226);
  ctx.lineWidth=4;ctx.strokeStyle=index<0?'#7fe9ee99':'#ffffffb0';ctx.lineJoin='miter';
  ctx.beginPath();
  if(index===0)ctx.arc(128,128,25,0,Math.PI*2);
  else if(index===1){ctx.moveTo(128,96);ctx.lineTo(157,148);ctx.lineTo(99,148);ctx.closePath();}
  else if(index===2){ctx.moveTo(116,103);ctx.lineTo(116,153);ctx.moveTo(140,103);ctx.lineTo(140,153);}
  else if(index===4){ctx.moveTo(98,118);ctx.bezierCurveTo(115,90,140,145,158,118);ctx.moveTo(98,143);ctx.bezierCurveTo(115,115,140,170,158,143);}
  else if(index===5){ctx.moveTo(128,98);ctx.lineTo(128,158);ctx.moveTo(98,128);ctx.lineTo(158,128);}
  else{ctx.moveTo(128,102);ctx.lineTo(154,128);ctx.lineTo(128,154);ctx.lineTo(102,128);ctx.closePath();}
  ctx.stroke();
  if(index<0){ctx.fillStyle='#8affed';for(const x of [25,231])for(const y of[25,231])ctx.fillRect(x-2,y-2,4,4);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function toast(message,type='') {
  clearTimeout(toastTimeout);$('toast').textContent=message;$('toast').className=`toast show ${type}`;
  toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),3700);
}
function unlockAudio() {
  if(!audio){try{audio=new(window.AudioContext||window.webkitAudioContext)();}catch{}}
  if(audio&&audio.state!=='running'&&audio.state!=='closed')audio.resume().catch(()=>{});
}
function updateSound(){$('sound').textContent=muted&&profile.musicMuted?'♪̸':'♪';$('sound').setAttribute('aria-label','Sound options');}
function sound(type,color=0) {
  if(muted||!audio||audio.state!=='running')return;
  if(type==='clear'||type==='full-clear'){playClearReward(audio,type==='full-clear',color);return;}
  const now=audio.currentTime;
  const tone=(freq,delay,duration,gain=.08,wave='sine')=>{
    const osc=audio.createOscillator(),envelope=audio.createGain();osc.type=wave;osc.frequency.setValueAtTime(freq,now+delay);
    if(type==='snap')osc.frequency.exponentialRampToValueAtTime(freq*.55,now+delay+.07);
    envelope.gain.setValueAtTime(0,now+delay);envelope.gain.linearRampToValueAtTime(gain,now+delay+.006);envelope.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);
    osc.connect(envelope);envelope.connect(audio.destination);osc.start(now+delay);osc.stop(now+delay+duration+.01);
  };
  if(type==='snap'){
    tone(870+color*130,0,.09,.1,'triangle');tone(180,0,.07,.12);
    // A tiny procedural noise transient adds a tactile click to the cell tone.
    const buffer=audio.createBuffer(1,Math.floor(audio.sampleRate*.035),audio.sampleRate);const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length)**3;
    const src=audio.createBufferSource();src.buffer=buffer;const gain=audio.createGain();gain.gain.value=.14;src.connect(gain);gain.connect(audio.destination);src.start(now);
  }else if(type==='align'){tone(430,0,.08,.035);tone(650,.045,.12,.04);}
  else if(type==='bomb'){tone(180,0,.16,.08,'triangle');tone(740,.04,.2,.04);}
  else if(type==='win'){[520,655,780,1040,1310].forEach((n,i)=>tone(n,i*.1,.5,.07));}
  else if(type==='miss'){tone(140,0,.23,.1,'triangle');tone(105,.08,.25,.08,'triangle');}
}
