// Context surfaces are useful objects only when they are themselves the subject.
const surfaces = new Set(['couch','bed','dining table','bench']);
const boxArea = b => Math.max(0,b.xmax-b.xmin)*Math.max(0,b.ymax-b.ymin);
const intersection = (a,b) => Math.max(0,Math.min(a.xmax,b.xmax)-Math.max(a.xmin,b.xmin))*Math.max(0,Math.min(a.ymax,b.ymax)-Math.max(a.ymin,b.ymin));
export function foregroundDetections(detections,width,height) {
  return detections.filter(item=>{
    if(!surfaces.has(item.label))return true;
    const area=boxArea(item.box);
    const supportsSubject=detections.some(other=>other!==item && !surfaces.has(other.label) &&
      boxArea(other.box)<area*.7 && intersection(item.box,other.box)/Math.max(1,boxArea(other.box))>.7);
    return !supportsSubject && area/(width*height)<.65;
  });
}
// Small, distinct subjects own their pixels. Do not cut merely touching masks.
export function separateMasks(items) {
  const sorted=items.map(item=>({...item,mask:item.mask.slice(),area:item.mask.reduce((n,v)=>n+(v?1:0),0)}))
    .sort((a,b)=>a.area-b.area || b.score-a.score);
  const accepted=[];
  for(const item of sorted){
    if(!item.area)continue;
    let duplicate=false;
    for(const other of accepted){
      let overlap=0;
      for(let i=0;i<item.mask.length;i++)if(item.mask[i]&&other.mask[i])overlap++;
      const union=item.area+other.area-overlap;
      if(overlap/Math.max(1,union)>.85){duplicate=true;break;}
      if(item.area>other.area*1.8 && overlap/other.area>.7){
        for(let i=0;i<item.mask.length;i++)if(other.mask[i])item.mask[i]=0;
      }
    }
    if(!duplicate){item.area=item.mask.reduce((n,v)=>n+(v?1:0),0);if(item.area)accepted.push(item);}
  }
  return accepted.sort((a,b)=>b.score-a.score);
}
