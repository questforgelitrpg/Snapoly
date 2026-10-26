import {LEVELS,TOOL_CAP,MAX_LIFE_POOL,ECONOMY,CHAPTERS} from './rules.js';
import {TOOL_IDS,BASE_TOOLS,normalizeLoadout} from './tool-catalog.js';
import {validMagnetSave} from './magnet-save.js';
export const nonnegative=(value,max=Number.MAX_SAFE_INTEGER)=>Number.isFinite(value)?Math.max(0,Math.min(max,Math.floor(value))):0;
export function loadProfile(saved={}){
  const records=[];
  if(Array.isArray(saved.records))saved.records.forEach((r,i)=>{
    const index=saved.schema===2?i:Math.floor(i/4)*20+i%4;
    if(index<LEVELS.length&&r&&typeof r==='object')records[index]={score:nonnegative(r.score),stars:nonnegative(r.stars,3)};
  });
  return {schema:2,records,muted:saved.muted===true,musicMuted:saved.musicMuted===true,
    musicVolume:Number.isFinite(saved.musicVolume)?Math.max(0,Math.min(.2,saved.musicVolume)):.2,
    coins:nonnegative(saved.coins),tools:Object.fromEntries(TOOL_IDS.map(k=>[k,nonnegative(saved.tools?.[k],TOOL_CAP)])),
    introduced:Object.fromEntries(TOOL_IDS.map(k=>[k,saved.introduced?.[k]===true])),
    toolGrants:Object.fromEntries(TOOL_IDS.map(k=>[k,Number.isFinite(saved.toolGrants?.[k])?nonnegative(saved.toolGrants[k],ECONOMY.startingTools):saved.introduced?.[k]===true?1:0])),
    unlockedTools:Object.fromEntries(TOOL_IDS.map(k=>[k,BASE_TOOLS.includes(k)||saved.unlockedTools?.[k]===true])),
    loadout:normalizeLoadout(saved.loadout),
    lifePool:nonnegative(saved.lifePool,MAX_LIFE_POOL),lifeProgress:nonnegative(saved.lifeProgress,2),
    endless:Object.fromEntries(CHAPTERS.map(c=>[c.shape,nonnegative(saved.endless?.[c.shape])])),
    magnet:Object.fromEntries(CHAPTERS.map(c=>[c.shape,nonnegative(saved.magnet?.[c.shape])])),magnetRun:validMagnetSave(saved.magnetRun)};
}

// Deliver the free introduction charges once per profile. Older saves received
// one charge: they get only the extra charge, without restoring spent stock.
export function grantToolIntroductions(profile,kinds){
  let changed=false;
  for(const kind of kinds){
    if(!TOOL_IDS.includes(kind)||!profile.unlockedTools[kind])continue;
    const owed=ECONOMY.startingTools-profile.toolGrants[kind];
    if(owed<=0)continue;
    profile.tools[kind]=Math.min(TOOL_CAP,profile.tools[kind]+owed);
    profile.toolGrants[kind]=ECONOMY.startingTools;profile.introduced[kind]=true;changed=true;
  }
  return changed;
}
