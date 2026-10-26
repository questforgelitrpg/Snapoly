export const TOOL_DEFS={
  slow:{name:'Slow Time',symbol:'◷',price:45,unlockCost:0,level:5,description:'All incoming cells at 45% speed for 8 seconds.'},
  bomb:{name:'Bomb',symbol:'✦',price:55,unlockCost:0,level:8,description:'Remove the selected incoming cell. Earn 75 points.'},
  shield:{name:'Shield',symbol:'⬡',price:65,unlockCost:140,researchAt:10,badge:'Novice',description:'Protect one missed cell. Keep your life and combo.'},
  recolor:{name:'Recolor',symbol:'◈',price:80,unlockCost:220,researchAt:15,badge:'Expert',description:'Choose a new color for the selected incoming cell.'}
};
export const TOOL_IDS=Object.keys(TOOL_DEFS),BASE_TOOLS=['slow','bomb'];
export const bestChapterWins=(records=[])=>{
  let best=0;
  for(let i=0;i<records.length;i+=20)best=Math.max(best,records.slice(i,i+20).filter(r=>r?.stars>0).length);
  return best;
};
export function normalizeLoadout(selected,available=TOOL_IDS){
  return [...new Set((Array.isArray(selected)?selected:BASE_TOOLS).filter(t=>available.includes(t)&&TOOL_IDS.includes(t)))].slice(0,2);
}
export function researchTool(profile,kind){
  const def=TOOL_DEFS[kind];
  if(!def?.unlockCost||profile.unlockedTools?.[kind]||bestChapterWins(profile.records)<def.researchAt||!Number.isSafeInteger(profile.coins)||profile.coins<def.unlockCost)return null;
  return {...profile,coins:profile.coins-def.unlockCost,
    unlockedTools:{...profile.unlockedTools,[kind]:true},tools:{...profile.tools,[kind]:Math.min(3,(profile.tools?.[kind]||0)+2)},
    introduced:{...profile.introduced,[kind]:true},toolGrants:{...profile.toolGrants,[kind]:2}};
}
