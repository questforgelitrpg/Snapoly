// Convex geometry shared by the renderer and the rules. Poses use world-space
// vertices; face reflection gives an exact compatible attachment, not a cube
// collision proxy. Mirroring the vertex labels keeps every pose a rigid rotation.
export const add=(a,b)=>a.map((n,i)=>n+b[i]);
export const sub=(a,b)=>a.map((n,i)=>n-b[i]);
export const scale=(a,s)=>a.map(n=>n*s);
export const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const length=a=>Math.hypot(...a);
export const normalize=a=>scale(a,1/(length(a)||1));
export const average=points=>scale(points.reduce((a,b)=>add(a,b),[0,0,0]),1/points.length);
const h=Math.SQRT1_2;
// Find the large coplanar polygon faces of a small convex vertex set. The
// resulting flat faces are kept intact for picking, docking and matching.
function convexFaces(vertices){
  const found=new Map();
  for(let a=0;a<vertices.length;a++)for(let b=a+1;b<vertices.length;b++)for(let c=b+1;c<vertices.length;c++){
    let normal=cross(sub(vertices[b],vertices[a]),sub(vertices[c],vertices[a]));
    if(length(normal)<1e-7)continue;normal=normalize(normal);
    const offsets=vertices.map(v=>dot(normal,sub(v,vertices[a])));
    if(offsets.some(v=>v>1e-6)&&offsets.some(v=>v< -1e-6))continue;
    const ids=offsets.flatMap((v,i)=>Math.abs(v)<1e-6?[i]:[]),key=ids.join(',');
    if(found.has(key))continue;
    const center=average(ids.map(i=>vertices[i]));if(dot(normal,center)<0)normal=scale(normal,-1);
    const u=normalize(sub(vertices[ids[0]],center)),v=cross(normal,u);
    ids.sort((a,b)=>Math.atan2(dot(sub(vertices[a],center),v),dot(sub(vertices[a],center),u))-Math.atan2(dot(sub(vertices[b],center),v),dot(sub(vertices[b],center),u)));
    found.set(key,ids);
  }
  return [...found.values()];
}
function shapeFromVertices(id,name,symbol,vertices){
  const mirror=vertices.map(p=>vertices.findIndex(q=>length(sub(q,[-p[0],p[1],p[2]]))<1e-6));
  if(mirror.includes(-1))throw Error('Shape must have a mirror symmetry.');
  return {id,name,symbol,vertices,faces:convexFaces(vertices),mirror};
}
const hexVertices=Array.from({length:12},(_,i)=>[Math.cos((i%6)*Math.PI/3),Math.sin((i%6)*Math.PI/3),i<6?-.5:.5]);
const phi=(1+Math.sqrt(5))/2,dodecaVertices=[];
for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])dodecaVertices.push([x,y,z]);
for(const a of [-1,1])for(const b of [-1,1])dodecaVertices.push([0,a/phi,b*phi],[a/phi,b*phi,0],[a*phi,0,b/phi]);
export const SHAPES={
  cube:{id:'cube',name:'Cube',symbol:'□',vertices:[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],faces:[[1,5,6,2],[0,3,7,4],[3,2,6,7],[0,4,5,1],[4,7,6,5],[0,1,2,3]],mirror:[1,0,3,2,5,4,7,6]},
  pyramid:{id:'pyramid',name:'Pyramid',symbol:'△',vertices:[[-.5,-h/5,-.5],[.5,-h/5,-.5],[.5,-h/5,.5],[-.5,-h/5,.5],[0,h*4/5,0]],faces:[[0,1,2,3],[0,4,1],[1,4,2],[2,4,3],[3,4,0]],mirror:[1,0,3,2,4]},
  diamond:{id:'diamond',name:'Diamond',symbol:'◇',vertices:[[h,0,0],[-h,0,0],[0,h,0],[0,-h,0],[0,0,h],[0,0,-h]],faces:[[0,2,4],[2,1,4],[1,3,4],[3,0,4],[2,0,5],[1,2,5],[3,1,5],[0,3,5]],mirror:[1,0,2,3,4,5]},
  hexprism:shapeFromVertices('hexprism','Hexagonal Prism','⬡',hexVertices),
  dodecahedron:shapeFromVertices('dodecahedron','Dodecahedron','⬟',dodecaVertices.map(p=>scale(p,phi/2*.85)))
};
export const isPoly=block=>block.shape&&block.shape!=='cube';
export const vertexKey=p=>p.map(n=>Math.round(n*1e5)).join(',');
export const polygonKey=vertices=>vertices.map(vertexKey).sort().join('|');
// Domain poses replace coordinate arrays when moving. Cache their immutable
// surfaces so polygon collision checks do not rebuild every neighboring face.
const surfaces=new WeakMap(),edgeCache=new WeakMap();
export function verticesOf(block){return block.vertices||SHAPES[block.shape||'cube'].vertices.map(v=>add(v,block.position));}
export function polyBlock(shape,id,color,position=[0,0,0]){
  return {id,color,shape,position:[...position],vertices:SHAPES[shape].vertices.map(v=>add(v,position))};
}
export function facesOf(block){
  const cached=surfaces.get(block);
  if(cached&&cached.vertices===block.vertices&&cached.position===block.position&&cached.shape===block.shape&&cached.id===block.id)return cached.faces;
  const definition=SHAPES[block.shape||'cube'],vertices=verticesOf(block);
  const faces=definition.faces.map((indices,index)=>{
    let points=indices.map(i=>vertices[i]);const center=average(points);
    let normal=normalize(cross(sub(points[1],points[0]),sub(points[2],points[0])));
    if(dot(normal,sub(center,block.position))<0){normal=scale(normal,-1);points=[...points].reverse();}
    return {blockId:block.id,index,normal,center,position:block.position,vertices:points,key:polygonKey(points),geometry:{kind:'regular',sides:points.length,size:length(sub(points[1],points[0]))}};
  });
  surfaces.set(block,{vertices:block.vertices,position:block.position,shape:block.shape,id:block.id,faces});return faces;
}
export function reflectedCandidate(block,face){
  const reflect=p=>sub(p,scale(face.normal,2*dot(sub(p,face.center),face.normal)));
  const reflected=verticesOf(block).map(reflect),definition=SHAPES[block.shape||'cube'];
  const vertices=definition.mirror.map(i=>reflected[i]);
  return {shape:block.shape||'cube',position:average(vertices),vertices};
}
export function shareFace(a,b){
  const keys=new Set(facesOf(a).map(f=>f.key));
  return facesOf(b).some(f=>keys.has(f.key));
}
export function neighborsOf(block,blocks){
  if(!isPoly(block))return blocks.filter(b=>b.id!==block.id&&length(sub(b.position,block.position))<1.00001&&Math.abs(length(sub(b.position,block.position))-1)<1e-5);
  return blocks.filter(b=>b.id!==block.id&&length(sub(b.position,block.position))<2.1&&shareFace(block,b));
}
function edgesOf(block){
  const cached=edgeCache.get(block);if(cached&&cached.vertices===block.vertices&&cached.position===block.position)return cached.edges;
  const seen=new Set(),edges=[];
  for(const face of facesOf(block))for(let i=0;i<face.vertices.length;i++){
    const a=face.vertices[i],b=face.vertices[(i+1)%face.vertices.length],key=[vertexKey(a),vertexKey(b)].sort().join('|');
    if(!seen.has(key)){seen.add(key);const edge=normalize(sub(b,a));if(!edges.some(v=>Math.abs(dot(v,edge))>.99999))edges.push(edge);}
  }
  edgeCache.set(block,{vertices:block.vertices,position:block.position,edges});return edges;
}
// Separating-axis theorem. Merely sharing a face/edge is permitted; positive
// volume intersection is not. Broad-phase bounds discard distant blocks first.
export function overlaps(a,b){
  const av=verticesOf(a),bv=verticesOf(b),epsilon=1e-5;
  for(let axis=0;axis<3;axis++)if(Math.min(...av.map(v=>v[axis]))>=Math.max(...bv.map(v=>v[axis]))-epsilon||Math.min(...bv.map(v=>v[axis]))>=Math.max(...av.map(v=>v[axis]))-epsilon)return false;
  const axes=[...facesOf(a),...facesOf(b)].map(f=>f.normal);
  for(const ea of edgesOf(a))for(const eb of edgesOf(b)){const axis=cross(ea,eb);if(length(axis)>epsilon)axes.push(normalize(axis));}
  for(const axis of axes){const ap=av.map(v=>dot(v,axis)),bp=bv.map(v=>dot(v,axis));if(Math.min(Math.max(...ap),Math.max(...bp))-Math.max(Math.min(...ap),Math.min(...bp))<=epsilon)return false;}
  return true;
}
export function polyExposedFaces(blocks){
  const all=blocks.flatMap(facesOf),counts=new Map();
  for(const f of all)counts.set(f.key,(counts.get(f.key)||0)+1);
  return all.filter(f=>counts.get(f.key)===1).map(face=>{
    const owner=blocks.find(b=>b.id===face.blockId),candidate=reflectedCandidate(owner,face);
    return {...face,candidate,destination:candidate.position,blocked:blocks.some(b=>b.id!==owner.id&&overlaps(candidate,b))};
  });
}
// Reconnect detached survivors to vacant, compatible faces without discarding
// identities or colors. Already connected survivors keep their original poses.
// A step carries both poses so the renderer can turn and tuck the survivor in.
export function settlePolyBlocks(blocks){
  const settled=blocks.map(b=>({...b,position:[...b.position],vertices:b.vertices.map(v=>[...v])})),steps=[];
  const core=settled.find(b=>b.id===0);if(!core)throw Error('Settling requires a core.');
  const anchored=new Set([0]);
  function expand(){let changed;do{changed=false;for(const b of settled)if(!anchored.has(b.id)&&neighborsOf(b,settled).some(n=>anchored.has(n.id))){anchored.add(b.id);changed=true;}}while(changed);}
  expand();
  while(anchored.size<settled.length){
    const supports=settled.filter(b=>anchored.has(b.id));
    const faces=polyExposedFaces(supports).filter(f=>!f.blocked);
    let best=null;
    for(const block of settled.filter(b=>!anchored.has(b.id)))for(const face of faces){
      const candidate={...block,...face.candidate};
      if(settled.some(other=>other.id!==block.id&&overlaps(candidate,other)))continue;
      const cost=length(sub(candidate.position,core.position))*.15+length(sub(candidate.position,block.position));
      if(!best||cost<best.cost)best={block,candidate,cost};
    }
    if(!best)break; // Preserve a survivor if a crowded shape has no valid tuck.
    const {block,candidate}=best;
    steps.push({id:block.id,from:[...block.position],to:[...candidate.position],fromVertices:block.vertices.map(v=>[...v]),toVertices:candidate.vertices.map(v=>[...v]),shape:block.shape});
    block.position=candidate.position;block.vertices=candidate.vertices;anchored.add(block.id);expand();
  }
  return {blocks:settled,steps};
}
