// Context surfaces are useful objects only when they are themselves the subject.
const surfaces = new Set(['couch','bed','dining table','bench']);
const boxArea = b => Math.max(0,b.xmax-b.xmin)*Math.max(0,b.ymax-b.ymin);
const intersection = (a,b) => Math.max(0,Math.min(a.xmax,b.xmax)-Math.max(a.xmin,b.xmin))*Math.max(0,Math.min(a.ymax,b.ymax)-Math.max(a.ymin,b.ymin));
export function foregroundDetections(detections,width,height,pixels) {
  const contextFiltered=detections.filter(item=>{
    if(!surfaces.has(item.label))return true;
    const area=boxArea(item.box);
    const supportsSubject=detections.some(other=>other!==item && !surfaces.has(other.label) &&
      boxArea(other.box)<area*.7 && intersection(item.box,other.box)/Math.max(1,boxArea(other.box))>.7);
    return !supportsSubject && area/(width*height)<.65;
  });
  const subjects=new Set(['person','cat','dog','bird','horse','cow','sheep','elephant','bear','zebra','giraffe']);
  const ranked=contextFiltered.filter(d=>subjects.has(d.label)).sort((a,b)=>boxArea(b.box)-boxArea(a.box));
  const dominant=ranked[0];
  if(!dominant || boxArea(dominant.box)/(width*height)<.06)return contextFiltered;
  const anchors=ranked.filter(d=>boxArea(d.box)>=boxArea(dominant.box)*.3 &&
    d.box.ymax-d.box.ymin>=(dominant.box.ymax-dominant.box.ymin)*.55);
  const detail=pixels?Math.max(...anchors.map(d=>objectDetail(pixels,width,height,d.box))):0;
  const accessories=new Set(['sports ball','remote','cell phone','bottle','cup','handbag','backpack','tie','skateboard','tennis racket','baseball bat','baseball glove','frisbee','umbrella','skis','snowboard','surfboard']);
  return contextFiltered.filter(item=>{
    if(subjects.has(item.label))return anchors.includes(item);
    const area=boxArea(item.box),relative=area/boxArea(dominant.box);
    // Small interactive objects remain eligible, including the ball at a player's feet.
    const near=anchors.some(a=>{
      const pad=Math.max(a.box.xmax-a.box.xmin,a.box.ymax-a.box.ymin)*.22;
      return intersection(item.box,{xmin:a.box.xmin-pad,ymin:a.box.ymin-pad,xmax:a.box.xmax+pad,ymax:a.box.ymax+pad})/Math.max(1,area)>.5;
    });
    if(accessories.has(item.label))return relative>=.3 || (near && (item.score??1)>=.6);
    if(relative<.12)return false;
    if(relative<.45 && !near)return false;
    if(pixels && detail>0 && relative<.6 && objectDetail(pixels,width,height,item.box)<detail*.35)return false;
    return true;
  });
}
// Local second differences measure fine detail without resizing a blurry crop.
export function objectDetail(pixels,width,height,box){
  const gray=(x,y)=>{const i=(y*width+x)*4;return pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114;};
  const left=Math.max(1,Math.ceil(box.xmin)),right=Math.min(width-2,Math.floor(box.xmax));
  const top=Math.max(1,Math.ceil(box.ymin)),bottom=Math.min(height-2,Math.floor(box.ymax));
  let sum=0,count=0;
  for(let y=top;y<=bottom;y+=2)for(let x=left;x<=right;x+=2){sum+=Math.abs(4*gray(x,y)-gray(x-1,y)-gray(x+1,y)-gray(x,y-1)-gray(x,y+1));count++;}
  return count?sum/count:0;
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
