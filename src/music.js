export const MAX_MUSIC_VOLUME=.2;
export const musicVolume=value=>Number.isFinite(value)?Math.max(0,Math.min(MAX_MUSIC_VOLUME,value)):MAX_MUSIC_VOLUME;
// One player prevents overlapping tracks. A user gesture unlocks browser audio.
export function createMusicPlayer(tracks,{element,muted=false,volume=.2,getContext}={}){
  const media=element||new Audio();let index=0,unlocked=false,suspended=false,source=null,gain=null,level=musicVolume(volume);
  media.volume=level;media.muted=muted;media.preload='none';
  if(tracks.length)media.src=tracks[0].url;
  const play=()=>{if(unlocked&&!suspended&&!media.muted&&tracks.length){try{Promise.resolve(media.play()).catch(()=>{});}catch{}}};
  media.addEventListener('ended',()=>{if(!tracks.length)return;index=(index+1)%tracks.length;media.src=tracks[index].url;play();});
  return {media,unlock(){
      const context=getContext?.();
      if(context&&!source){try{source=context.createMediaElementSource(media);gain=context.createGain();gain.gain.value=level;source.connect(gain);gain.connect(context.destination);media.volume=1;}catch{media.volume=level;}}
      // Web Audio gain enforces the cap on iPhone, where the media-volume
      // property can be controlled by the device. Connect gain before playing.
      unlocked=true;suspended=false;play();
    },
    setMuted(value){media.muted=!!value;if(media.muted)media.pause();else play();},
    setVolume(value){level=musicVolume(value);if(gain)gain.gain.value=level;else media.volume=level;},get volume(){return level;},pause(){suspended=true;media.pause();},
    resume(){suspended=false;play();},get track(){return tracks[index]?.title||'No track';}};
}
