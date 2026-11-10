export function createRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value,1664525)+1013904223)>>>0; return value/4294967296; };
}
export function stampSettings(settings, random = Math.random) {
  const signed = () => random()*2-1;
  const angle = random()*Math.PI*2, distance = Math.sqrt(random())*settings.scatter;
  return {
    size:Math.max(8,settings.size*(1+signed()*settings.sizeJitter/100)),
    rotation:settings.rotation+signed()*settings.rotationJitter,
    hue:settings.hue+signed()*settings.hueJitter,
    opacity:settings.opacity/100,
    dx:Math.cos(angle)*distance,dy:Math.sin(angle)*distance
  };
}
export function interpolateStroke(from,to,spacing,remainder=0) {
  const dx=to.x-from.x,dy=to.y-from.y,distance=Math.hypot(dx,dy),points=[];
  if(!distance)return {points,remainder};
  let step=spacing-remainder;
  for(;step<=distance;step+=spacing)points.push({x:from.x+dx*step/distance,y:from.y+dy*step/distance});
  return {points,remainder:(remainder+distance)%spacing};
}
export function maskBounds(mask,width,height) {
  let left=width,top=height,right=-1,bottom=-1,count=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x]){
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);count++;
  }
  return count?{left,top,width:right-left+1,height:bottom-top+1,count}:null;
}
