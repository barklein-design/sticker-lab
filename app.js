import {stampSettings,interpolateStroke} from './core.js';
const $=id=>document.getElementById(id);
const defaults={size:130,sizeJitter:25,rotation:0,rotationJitter:20,hue:0,hueJitter:0,scatter:12,spacing:65,opacity:100};
const settings={...defaults};
const specs=[['size','גודל',20,350,'px'],['sizeJitter','שונות בגודל',0,90,'%'],['rotation','סיבוב',-180,180,'°'],['rotationJitter','שונות בסיבוב',0,180,'°'],['hue','שינוי גוון',-180,180,'°'],['hueJitter','שונות בגוון',0,180,'°'],['scatter','פיזור',0,180,'px'],['spacing','ריווח',10,220,'px'],['opacity','שקיפות / אטימות',10,100,'%']];
let sourceCanvas,worker,busy=false,timeout,run=0,stickers=[],history=[],redo=[],activeStroke=null,painter,background='#f7f5ee',lastPoint,remainder=0;
let idCounter=0, sourceVersion=0;
const labels={person:'דמות',cat:'חתול',dog:'כלב','sports ball':'כדור',bird:'ציפור',car:'מכונית',bottle:'בקבוק',chair:'כיסא',cup:'כוס',bicycle:'אופניים',remote:'שלט',couch:'ספה',book:'ספר',backpack:'תיק',banana:'בננה',apple:'תפוח',vase:'אגרטל'};
for(const [key,name,min,max,unit] of specs){
  const row=document.createElement('div');row.className='control'+(key.includes('Jitter')?' random':'');
  const label=document.createElement('label');label.htmlFor=key;label.textContent=name;
  const output=document.createElement('output');output.id=key+'-value';output.textContent=settings[key]+unit;label.append(output);
  const input=document.createElement('input');Object.assign(input,{type:'range',id:key,min,max,value:settings[key]});
  input.addEventListener('input',()=>{settings[key]=Number(input.value);output.textContent=input.value+unit;previewBrush();});
  row.append(label,input);$('controls').append(row);
}
function status(text,error=false){$('status').textContent=text;$('status').className='status'+(error?' error':busy?' busy':'');}
function setBusy(value){busy=value;$('extract').disabled=value||!sourceCanvas;$('file').disabled=value;$('example').disabled=value;$('cancel').hidden=!value;}
async function loadImage(file,name){
  if(busy)return;
  if(file.size>20*1024*1024){status('בחרו תמונה עד 20MB.',true);return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){status('בחרו קובץ JPG, PNG או WebP.',true);return;}
  try{
    const image=await createImageBitmap(file);
    const scale=Math.min(1,1024/Math.max(image.width,image.height));
    sourceCanvas=document.createElement('canvas');sourceCanvas.width=Math.max(1,Math.round(image.width*scale));sourceCanvas.height=Math.max(1,Math.round(image.height*scale));
    sourceCanvas.getContext('2d').drawImage(image,0,0,sourceCanvas.width,sourceCanvas.height);image.close();sourceVersion++;
    $('source').src=sourceCanvas.toDataURL('image/jpeg',0.85);$('source-name').textContent=name;$('source-wrap').hidden=false;
    $('extract').disabled=false;status('התמונה מוכנה. לחצו על חילוץ מדבקות אוטומטי.');
  }catch{status('לא הצלחנו לפתוח את התמונה. נסו קובץ אחר.',true);}
}
$('file').addEventListener('change',event=>{if(event.target.files[0])loadImage(event.target.files[0],event.target.files[0].name);event.target.value='';});
for(const type of ['dragover','dragleave','drop'])$('dropzone').addEventListener(type,event=>{
  event.preventDefault();$('dropzone').classList.toggle('dragover',type==='dragover');
  if(type==='drop'&&event.dataTransfer.files[0])loadImage(event.dataTransfer.files[0],event.dataTransfer.files[0].name);
});
$('example').onclick=async()=>{
  if(busy)return;
  $('example').disabled=true;status('טוענים תמונת דוגמה…');
  try{const response=await fetch('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/cats.jpg');if(!response.ok)throw Error();await loadImage(await response.blob(),'תמונת הדגמה · Transformers.js');}
  catch{status('תמונת הדוגמה לא נטענה. אפשר לבחור תמונה מהמחשב.',true);}
  finally{$('example').disabled=false;}
};
function endRun(){clearTimeout(timeout);setBusy(false);}
$('extract').onclick=()=>{
  if(!sourceCanvas||busy)return;
  setBusy(true);const generation=++run, sourceId=sourceVersion;
  stickers=stickers.filter(s=>s.sourceId!==sourceId);renderTray();status('מתחילים חילוץ אוטומטי…');
  worker ||= new Worker(new URL('./segment-worker.js?v=6',import.meta.url),{type:'module'});
  worker.onmessage=async({data})=>{
    if(generation!==run)return;
    if(data.type==='status')status(data.text);
    if(data.type==='sticker')await addSticker(data.blob,labels[data.label]||data.label,sourceId,generation);
    if(data.type==='done'){endRun();status(data.count?`חולצו ${data.count} מדבקות. בחרו אותן במגירה וציירו על הקנבס.`:'לא נמצאו אובייקטים מתאימים. נסו תמונה עם חפצים או דמויות ברורים.');}
    if(data.type==='error'){endRun();worker.terminate();worker=null;status('החילוץ נכשל. בדקו חיבור לאינטרנט ונסו שוב. '+data.text,true);}
  };
  worker.onerror=event=>{endRun();worker?.terminate();worker=null;status('מנוע החילוץ לא נטען. נסו Chrome או Edge מעודכנים. '+event.message,true);};
  timeout=setTimeout(()=>{run++;worker?.terminate();worker=null;endRun();status('החילוץ התארך ונעצר אחרי 8 דקות. נסו שוב או תמונה פשוטה יותר.',true);},480000);
  const pixels=sourceCanvas.getContext('2d').getImageData(0,0,sourceCanvas.width,sourceCanvas.height).data;
  worker.postMessage({pixels:pixels.buffer,width:sourceCanvas.width,height:sourceCanvas.height},[pixels.buffer]);
};
$('cancel').onclick=()=>{run++;worker?.terminate();worker=null;endRun();status('החילוץ בוטל. מדבקות שכבר חולצו נשארו במגירה.');};
async function addSticker(blob,label,sourceId,generation){
  const url=URL.createObjectURL(blob),image=new Image();image.src=url;await image.decode();
  if(generation!==run){URL.revokeObjectURL(url);return;}
  stickers.push({id:++idCounter,url,image,label,sourceId,selected:true});renderTray();
}
function renderTray(){
  $('stickers').replaceChildren();
  for(const sticker of stickers){
    const card=document.createElement('div');card.className='sticker';
    const pick=document.createElement('button');pick.className='pick';pick.setAttribute('aria-pressed',String(sticker.selected));pick.setAttribute('aria-label','בחירת '+sticker.label);
    const image=new Image();image.src=sticker.url;image.alt='';const caption=document.createElement('span');caption.textContent=sticker.label;
    pick.append(image,caption);pick.onclick=()=>{sticker.selected=!sticker.selected;renderTray();};
    const remove=document.createElement('button');remove.className='remove';remove.textContent='×';remove.setAttribute('aria-label','הסרת '+sticker.label+' מהמגירה');
    remove.onclick=()=>{stickers=stickers.filter(item=>item!==sticker);renderTray();};
    card.append(pick,remove);$('stickers').append(card);
  }
  if(!stickers.length){const empty=document.createElement('div');empty.className='tray-empty';empty.textContent='המדבקות שיחולצו יופיעו כאן';$('stickers').append(empty);}
  $('sticker-count').textContent=stickers.length;$('select-all').disabled=!stickers.length;
  previewBrush();updateUI();
}
function previewBrush(){
  const selected=stickers.filter(s=>s.selected);$('brush-preview').replaceChildren();
  if(!selected.length){const text=document.createElement('span');text.textContent='בחרו מדבקה';$('brush-preview').append(text);return;}
  const image=new Image();image.src=selected[0].url;image.alt='תצוגה מקדימה של המברשת';image.style.transform=`rotate(${settings.rotation}deg)`;image.style.filter=`hue-rotate(${settings.hue}deg)`;image.style.opacity=settings.opacity/100;$('brush-preview').append(image);
}
$('select-all').onclick=()=>{const all=stickers.every(s=>s.selected);stickers.forEach(s=>s.selected=!all);renderTray();};
$('reset').onclick=()=>{Object.assign(settings,defaults);for(const[key,,min,max,unit]of specs){$(key).value=settings[key];$(key+'-value').textContent=settings[key]+unit;}previewBrush();};
function updateUI(){
  $('canvas-empty').hidden=history.length>0||!!activeStroke?.length;
  $('undo').disabled=!history.length;$('redo').disabled=!redo.length;$('clear').disabled=!history.length;$('save').disabled=!history.length;
  const selected=stickers.filter(s=>s.selected).length;
  $('canvas-info').textContent=selected?`${selected} מדבקות במברשת · ${history.reduce((n,s)=>n+s.length,0)} הטבעות`:'בחרו מדבקות מהמגירה כדי לצייר';
}
function drawStamp(ctx,stamp){
  const ratio=stamp.sticker.image.width/stamp.sticker.image.height;
  const w=ratio>=1?stamp.size:stamp.size*ratio,h=ratio>=1?stamp.size/ratio:stamp.size;
  ctx.save();ctx.translate(stamp.x,stamp.y);ctx.rotate(stamp.rotation*Math.PI/180);ctx.globalAlpha=stamp.opacity;ctx.filter=`hue-rotate(${stamp.hue}deg)`;
  ctx.drawImage(stamp.sticker.image,-w/2,-h/2,w,h);ctx.restore();
}
function render(){if(!painter)return;const ctx=painter.drawingContext;ctx.save();ctx.fillStyle=background;ctx.fillRect(0,0,1200,800);ctx.restore();for(const stroke of history)for(const stamp of stroke)drawStamp(ctx,stamp);if(activeStroke)for(const stamp of activeStroke)drawStamp(ctx,stamp);updateUI();}
function stamp(point){
  const selected=stickers.filter(s=>s.selected);if(!selected.length)return;
  if(history.reduce((n,s)=>n+s.length,0)+(activeStroke?.length||0)>=6000){$('canvas-info').textContent='הגעתם ל־6,000 הטבעות. שמרו את היצירה או בטלו משיכות.';return;}
  const sampled=stampSettings(settings);const item={...sampled,x:point.x+sampled.dx,y:point.y+sampled.dy,sticker:selected[Math.floor(Math.random()*selected.length)]};
  activeStroke.push(item);drawStamp(painter.drawingContext,item);$('canvas-empty').hidden=true;
}
function position(event){const bounds=event.currentTarget.getBoundingClientRect();return{x:(event.clientX-bounds.left)*1200/bounds.width,y:(event.clientY-bounds.top)*800/bounds.height};}
function finish(){if(activeStroke?.length){history.push(activeStroke);redo=[];}activeStroke=null;updateUI();}
function setupCanvas(){
  painter=new p5(p=>{
    p.setup=()=>{const canvas=p.createCanvas(1200,800);p.pixelDensity(1);p.noLoop();canvas.parent('canvas-host');canvas.elt.setAttribute('aria-label','קנבס ציור עם מדבקות');
      canvas.elt.addEventListener('pointerdown',event=>{if(event.button!==0||!stickers.some(s=>s.selected))return;event.preventDefault();canvas.elt.setPointerCapture(event.pointerId);activeStroke=[];lastPoint=position(event);remainder=0;stamp(lastPoint);});
      canvas.elt.addEventListener('pointermove',event=>{if(!activeStroke)return;const point=position(event);const path=interpolateStroke(lastPoint,point,settings.spacing,remainder);path.points.forEach(stamp);remainder=path.remainder;lastPoint=point;});
      canvas.elt.addEventListener('pointerup',finish);canvas.elt.addEventListener('pointercancel',finish);canvas.elt.addEventListener('lostpointercapture',finish);
      // Instance assignment completes after synchronous setup; defer initial paint.
      queueMicrotask(render);
    };
  });
}
$('undo').onclick=()=>{if(history.length){redo.push(history.pop());render();}};
$('redo').onclick=()=>{if(redo.length){history.push(redo.pop());render();}};
$('clear').onclick=()=>{if(history.length){redo=[];history=[history.flat()];redo.push(history.pop());render();}};
$('save').onclick=()=>{const link=document.createElement('a');link.download='cut-and-play.png';link.href=painter.canvas.toDataURL('image/png');link.click();};
document.querySelectorAll('[data-bg]').forEach(button=>button.onclick=()=>{background=button.dataset.bg;document.querySelectorAll('[data-bg]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});render();});
if(document.readyState==='complete')setupCanvas();else window.addEventListener('load',()=>{if(window.p5)setupCanvas();else status('ספריית הציור לא נטענה. בדקו את החיבור ורעננו את העמוד.',true);},{once:true});
