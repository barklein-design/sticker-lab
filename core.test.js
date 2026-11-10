import test from 'node:test';import assert from 'node:assert/strict';
import {createRandom,stampSettings,interpolateStroke,maskBounds} from './core.js';
import {foregroundDetections,separateMasks} from './foreground.js';
test('a couch behind cats is excluded while isolated furniture remains usable',()=>{
 const couch={label:'couch',box:{xmin:0,ymin:0,xmax:95,ymax:95}},cat={label:'cat',box:{xmin:20,ymin:20,xmax:40,ymax:80}};
 assert.deepEqual(foregroundDetections([couch,cat],100,100),[cat]);
 const isolated={label:'couch',box:{xmin:20,ymin:30,xmax:70,ymax:70}};
 assert.deepEqual(foregroundDetections([isolated],100,100),[isolated]);
 assert.deepEqual(foregroundDetections([cat],100,100),[cat]);
});
test('nested foreground pixels are removed from larger masks without changing input',()=>{
 const small={label:'cat',score:.9,mask:Uint8Array.from([0,1,1,0,0,0])},large={label:'object',score:.8,mask:Uint8Array.from([1,1,1,1,1,1])};
 const result=separateMasks([large,small]);assert.deepEqual([...result[1].mask],[1,0,0,1,1,1]);assert.equal(large.mask[1],1);
 assert.equal(separateMasks([small,{...small,mask:small.mask.slice()}]).length,1);
 const touching={label:'other',score:.8,mask:Uint8Array.from([0,0,1,1,0,0])};
 assert.deepEqual([...separateMasks([small,touching])[1].mask],[0,0,1,1,0,0]);
});
test('brush randomness respects ranges and does not mutate controls',()=>{const s={size:100,sizeJitter:30,rotation:0,rotationJitter:20,hue:40,hueJitter:5,scatter:25,opacity:60};const original={...s},rng=createRandom(17);for(let i=0;i<1000;i++){const v=stampSettings(s,rng);assert(v.size>=70&&v.size<=130);assert(Math.abs(v.rotation)<=20);assert(v.hue>=35&&v.hue<=45);assert(Math.hypot(v.dx,v.dy)<=25.000001);assert.equal(v.opacity,.6);}assert.deepEqual(s,original);});
test('stroke spacing is independent of pointer event frequency',()=>{const one=interpolateStroke({x:0,y:0},{x:100,y:0},20);let remainder=0,all=[];for(let x=0;x<100;x+=5){const result=interpolateStroke({x,y:0},{x:x+5,y:0},20,remainder);all.push(...result.points);remainder=result.remainder;}assert.deepEqual(all,one.points);});
test('mask crop preserves all visible pixels and handles empty masks',()=>{assert.equal(maskBounds(new Uint8Array(9),3,3),null);assert.deepEqual(maskBounds(Uint8Array.from([0,0,0,0,1,1,0,0,1]),3,3),{left:1,top:1,width:2,height:2,count:3});});
