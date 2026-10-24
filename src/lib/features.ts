export type Telemetry = { spend: number[]; damage: number[]; kills: {x: number|null;y:number|null;seconds:number;weapon:string}[]; agents:string[] };
const bucket = (s:string) => [...s.toLowerCase()].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0)%16;
/** vtac-v1: 8 aggregates, 8 damage bins, 64 spatial bins, 16 timing bins,
 * 16 weapon hash bins, 16 agent hash bins. Unit normalized, zero vectors rejected. */
export function embed(t:Telemetry): number[] {
  const v=Array<number>(128).fill(0);
  v[0]=1; v[1]=t.spend.reduce((a,b)=>a+b,0)/90000;
  v[2]=t.spend.length?Math.min(...t.spend)/9000:0; v[3]=Math.max(...t.spend,0)/9000;
  v[4]=t.damage.reduce((a,b)=>a+b,0)/10000; v[5]=t.kills.length/10;
  v[6]=t.kills.filter(k=>k.x!==null).length/10; v[7]=t.agents.length/10;
  for(const d of t.damage) v[8+Math.min(7,Math.floor(d/100))]+=0.1;
  for(const k of t.kills){
    if(k.x!==null&&k.y!==null) v[16+Math.min(7,Math.floor(k.y*8))*8+Math.min(7,Math.floor(k.x*8))]+=0.1;
    v[80+Math.min(15,Math.floor(k.seconds/10))]+=0.1;
    v[96+bucket(k.weapon)]+=0.1;
  }
  for(const a of t.agents) v[112+bucket(a)]+=0.1;
  const norm=Math.hypot(...v); return v.map(x=>x/norm);
}
export function cosine(a:number[],b:number[]) {
  if(a.length!==b.length||!a.length||a.some(x=>!Number.isFinite(x))||b.some(x=>!Number.isFinite(x))) throw new Error('Invalid vectors');
  const denominator=Math.hypot(...a)*Math.hypot(...b);
  if(!denominator) throw new Error('Zero vector');
  return a.reduce((n,x,i)=>n+x*b[i],0)/denominator;
}
