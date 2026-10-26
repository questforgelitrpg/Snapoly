export const PACE_EVERY=25,PACE_MIN=3,PACE_MAX=10;
export class ContinuousPace{
  constructor(random=Math.random){this.random=random;this.multiplier=1;this.steps=0;}
  advance(placed){
    const changes=[];
    while(Math.floor(placed/PACE_EVERY)>this.steps){
      const value=this.random(),roll=Number.isFinite(value)?Math.max(0,Math.min(.999999999,value)):0;
      const percent=PACE_MIN+Math.floor(roll*(PACE_MAX-PACE_MIN+1));
      this.multiplier*=1+percent/100;this.steps++;
      changes.push({percent,multiplier:this.multiplier,at:this.steps*PACE_EVERY});
    }
    return changes;
  }
}
