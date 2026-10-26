import {Quaternion,Vector3} from 'three';
export const MAGNET_START_EULER=[.88,.24,.55];
export const MAGNET_ANGLE=20,MAGNET_COS=Math.cos(MAGNET_ANGLE*Math.PI/180),MAGNET_HOLD=.09,MAGNET_PULL=.32;
export const withinMagnetCatch=(dot,blocked=false)=>Number.isFinite(dot)&&dot<=1+1e-6&&dot+1e-12>=MAGNET_COS&&!blocked;
export function magnetRotation(rotation,worldNormal,laneDirection){
  return new Quaternion().setFromUnitVectors(new Vector3(...worldNormal).normalize(),new Vector3(...laneDirection).normalize()).multiply(rotation.clone());
}
// A short stable aim avoids accidental catches while sweeping past a face.
// Each piece/face starts a fresh latch. Pausing or losing a valid aim resets it.
export class MagnetLatch{
  constructor(){this.reset();}
  reset(){this.key=null;this.elapsed=0;this.fired=false;}
  update(candidate,dt){
    if(!candidate||candidate.remaining<=0||!candidate.enabled||!withinMagnetCatch(candidate.dot,candidate.blocked)){this.reset();return false;}
    const key=`${candidate.id}:${candidate.face}`;
    if(this.key!==key){this.reset();this.key=key;}
    this.elapsed+=Math.max(0,Math.min(.1,dt));
    if(!this.fired&&this.elapsed+1e-9>=MAGNET_HOLD){this.fired=true;return true;}
    return false;
  }
}
