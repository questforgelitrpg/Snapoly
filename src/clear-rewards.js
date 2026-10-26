import {COLORS} from './rules.js';

// Original vector reward art stays sharp on phone screens and loads offline.
export function clearRewardMarkup(event){
  const full=event.fullClear===true,color=COLORS[event.color]||COLORS[0];
  const palette=full?['#ffc15c','#b58aff','#37e7d0','#f25a99']:[color.hex,color.hex,color.hex];
  const gems=palette.map((c,i)=>{
    const x=160+(i-(palette.length-1)/2)*48,y=full?(i===1||i===2?52:65):63;
    return `<g transform="translate(${x} ${y})"><path d="M0 -30 23 -13 20 15 0 32 -20 15 -23 -13Z" fill="${c}" stroke="#f5ffff" stroke-opacity=".65"/><path d="M0 -30 8 -9 0 32 -8 -9Z" fill="#fff" opacity=".3"/><path d="M-23 -13 8 -9 20 15 0 32 -8 -9Z" fill="#052532" opacity=".22"/><path d="M-23 -13 0 -30 23 -13 8 -9 -8 -9Z" fill="#fff" opacity=".4"/></g>`;
  }).join('');
  const rays=Array.from({length:full?16:10},(_,i)=>{
    const a=i*Math.PI*2/(full?16:10),r=full?87:73;
    return `<path d="M${160+Math.cos(a)*r} ${65+Math.sin(a)*r*.56}l${Math.cos(a)*13} ${Math.sin(a)*10}"/>`;
  }).join('');
  return `<svg class="reward-art" viewBox="0 0 320 130" aria-hidden="true"><defs><radialGradient id="reward-glow"><stop stop-color="${full?'#ffc15c':color.hex}" stop-opacity=".4"/><stop offset="1" stop-color="${color.hex}" stop-opacity="0"/></radialGradient></defs><ellipse cx="160" cy="65" rx="155" ry="64" fill="url(#reward-glow)"/><g class="reward-rays" fill="none" stroke="${full?'#ffe6a1':color.hex}" stroke-width="2" stroke-linecap="round">${rays}</g><path d="M46 82 93 107 160 117 227 107 274 82" fill="none" stroke="${full?'#ffdc88':color.hex}" stroke-opacity=".5"/>${gems}<path d="m160 9 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#fff9dc"/></svg><strong class="reward-title">${full?'FULL CLEAR':'COLOR CLEAR'}</strong><span class="reward-detail">${full?`${event.matchCount} MATCH · ALL CELLS`:'3 CONNECTED · ONE COLOR'}</span><b class="reward-points">+${Math.max(0,Math.floor(event.bonus)).toLocaleString()}</b>`;
}

// Bright glass partials, ascending notes and a soft shimmer. Full clears have
// their own longer fanfare and low accent; every node disconnects when done.
export function playClearReward(context,full=false,color=0){
  const now=context.currentTime,master=context.createGain();
  master.gain.value=full?.24:.22;master.connect(context.destination);
  let active=0;
  function voice(frequency,delay,duration,level,wave='sine'){
    const osc=context.createOscillator(),gain=context.createGain();
    osc.type=wave;osc.frequency.setValueAtTime(frequency,now+delay);
    gain.gain.setValueAtTime(0,now+delay);
    gain.gain.linearRampToValueAtTime(level,now+delay+.005);
    gain.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);
    osc.connect(gain);gain.connect(master);active++;
    osc.onended=()=>{osc.disconnect();gain.disconnect();if(--active===0)master.disconnect();};
    osc.start(now+delay);osc.stop(now+delay+duration+.015);
  }
  const root=523.25*2**((color%3)*2/12);
  const notes=full?[1,1.25,1.5,2,2.5,3,4]:[1,1.25,1.5,2];
  notes.forEach((ratio,i)=>{
    voice(root*ratio,i*(full?.045:.055),full?.47:.36,.28);
    voice(root*ratio*2.76,i*(full?.045:.055),.18,.045);
  });
  if(full){
    voice(130.81,0,.35,.5,'triangle');
    [1,1.25,1.5,2].forEach(r=>voice(root*r,.27,.86,.15));
    voice(root*4,.39,.65,.09);
  }else voice(root*3,.23,.38,.1);
  const length=Math.floor(context.sampleRate*(full?.65:.25));
  const buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length)**2;
  const noise=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
  noise.buffer=buffer;filter.type='highpass';filter.frequency.value=full?3200:5200;
  const delay=full?.22:.12;gain.gain.setValueAtTime(full?.1:.06,now+delay);
  gain.gain.exponentialRampToValueAtTime(.0001,now+delay+length/context.sampleRate);
  noise.connect(filter);filter.connect(gain);gain.connect(master);active++;
  noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();if(--active===0)master.disconnect();};
  noise.start(now+delay);noise.stop(now+delay+length/context.sampleRate+.015);
}
