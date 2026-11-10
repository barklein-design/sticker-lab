import {maskBounds} from './core.js';
let kit, detector, sam, processor;
const report = text => self.postMessage({type:'status',text});
async function loadModels() {
  report('טוענים את מנוע החילוץ… בפתיחה הראשונה נדרשת הורדה גדולה.');
  kit ||= await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
  kit.env.allowLocalModels=false;
  kit.env.backends.onnx.wasm.numThreads=1;
  const progress = info => {
    if(info.status==='progress' && info.total) report(`מורידים מודל: ${info.file} · ${Math.round(info.progress)}%`);
  };
  detector ||= await kit.pipeline('object-detection','Xenova/detr-resnet-50',{device:'wasm',dtype:'q8',progress_callback:progress});
  sam ||= await kit.SamModel.from_pretrained('Xenova/slimsam-77-uniform',{device:'wasm',dtype:'q8',progress_callback:progress});
  processor ||= await kit.AutoProcessor.from_pretrained('Xenova/slimsam-77-uniform');
}
function dispose(obj) { for(const item of Object.values(obj||{})) if(item?.dispose)item.dispose(); }
self.onmessage = async ({data}) => {
  let prepared, embeddings;
  try {
    await loadModels();
    const image = new kit.RawImage(new Uint8ClampedArray(data.pixels),data.width,data.height,4);
    report('מזהים אובייקטים בתמונה…');
    const detections=(await detector(image,{threshold:0.55,percentage:false})).sort((a,b)=>b.score-a.score).slice(0,16);
    if(!detections.length){self.postMessage({type:'done',count:0});return;}
    report(`זוהו ${detections.length} אובייקטים. מכינים חיתוך מדויק…`);
    prepared = await processor(image);
    embeddings = await sam.get_image_embeddings(prepared);
    let count=0;
    for(let index=0;index<detections.length;index++) {
      const detection=detections[index], b=detection.box;
      report(`מחלצים מדבקה ${index+1} מתוך ${detections.length}…`);
      // SAM box prompts are represented by the two corner labels, 2 and 3.
      const corners=processor.reshape_input_points([[[b.xmin,b.ymin],[b.xmax,b.ymax]]],prepared.original_sizes,prepared.reshaped_input_sizes);
      const labels=new kit.Tensor('int64',BigInt64Array.from([2n,3n]),[1,1,2]);
      const result=await sam({...embeddings,input_points:corners,input_labels:labels});
      const masks=await processor.post_process_masks(result.pred_masks,prepared.original_sizes,prepared.reshaped_input_sizes);
      const scores=result.iou_scores.data;
      let best=0;for(let i=1;i<scores.length;i++)if(scores[i]>scores[best])best=i;
      const area=data.width*data.height;
      const mask=new Uint8Array(masks[0].data.slice(best*area,(best+1)*area));
      const bounds=maskBounds(mask,data.width,data.height);
      if(bounds && bounds.count>80 && bounds.count<area*0.95){
        const cut=new OffscreenCanvas(bounds.width,bounds.height), context=cut.getContext('2d');
        const pixels=context.createImageData(bounds.width,bounds.height);
        for(let y=0;y<bounds.height;y++)for(let x=0;x<bounds.width;x++){
          const original=(y+bounds.top)*data.width+x+bounds.left, target=(y*bounds.width+x)*4;
          pixels.data.set(image.data.subarray(original*4,original*4+3),target);
          pixels.data[target+3]=mask[original]?image.data[original*4+3]:0;
        }
        context.putImageData(pixels,0,0);
        const blob=await cut.convertToBlob({type:'image/png'});
        self.postMessage({type:'sticker',blob,label:detection.label,score:detection.score});count++;
      }
      dispose(result);dispose({corners,labels});masks.forEach(m=>m.dispose?.());
    }
    self.postMessage({type:'done',count});
  } catch(error){self.postMessage({type:'error',text:error?.message||String(error)});}
  finally{dispose(prepared);dispose(embeddings);}
};
