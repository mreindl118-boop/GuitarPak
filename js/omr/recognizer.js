/* Private browser OMR entry point. Loading this file opens no worker, device or
 * network connection. Explicit recognize() copies pixels into one bounded job. */
(function(root){'use strict';
  var script=typeof document!=='undefined'&&document.currentScript,base=script&&script.src?new URL('.',script.src):new URL('js/omr/',document.baseURI),active=null;
  function fail(message,code){var e=new Error(message);e.code=code;return e;}
  function abort(){var e=new Error('Recognition canceled.');e.name='AbortError';return e;}
  function recognize(options){options=options||{};return new Promise(function(resolve,reject){
    if(active)return reject(fail('A recognition job is already running. Cancel it or wait.','BUSY'));
    if(options.signal&&options.signal.aborted)return reject(abort());
    if(typeof Worker==='undefined'||typeof WebAssembly==='undefined')return reject(fail('This browser does not support local recognition workers.','UNAVAILABLE'));
    var image=options.imageData||{},data=image.data||image,w=options.width||image.width,h=options.height||image.height;
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<80||h<40||w>8192||h>8192||w*h>16000000||!ArrayBuffer.isView(data)||!(data instanceof Uint8Array||data instanceof Uint8ClampedArray)||data.length!==w*h&&data.length!==w*h*4)return reject(fail('Use bounded grayscale/RGBA pixels (80×40 minimum, 16 million pixels maximum).','INVALID_PIXELS'));
    var channels=data.length===w*h?1:4,x=0,y=0,cw=w,ch=h,b=options.region&&(options.region.bbox||options.region);
    if(b){x=b.x;y=b.y;cw=b.width==null?b.w:b.width;ch=b.height==null?b.h:b.height;if(![x,y,cw,ch].every(Number.isInteger)||x<0||y<0||cw<80||ch<40||x+cw>w||y+ch>h)return reject(fail('Staff region must be an integer rectangle inside the rendered page.','INVALID_REGION'));}
    if(options.region&&options.region.usable===false)return reject(fail('This staff geometry needs correction before recognition.','UNUSABLE_REGION'));
    var transform=options.region&&options.region.transform,pixels;
    if(transform){
      if(transform.type!=='vertical-shear'||!Number.isFinite(transform.slope)||Math.abs(transform.slope)>Math.tan(Math.PI/180)||!Number.isFinite(transform.centerX)||transform.centerX<0||transform.centerX>w||!root.SLStaffDetection||typeof root.SLStaffDetection.cropStaff!=='function'||!options.region.workingBox)return reject(fail('This transformed staff needs the supported local deskew/crop helper.','UNSUPPORTED_TRANSFORM'));
      var cropped;try{cropped=root.SLStaffDetection.cropStaff({data:data,width:w,height:h,channels:channels},options.region);}catch(e){return reject(fail('Staff rectification failed: '+e.message,'INVALID_REGION'));}
      pixels=new Uint8Array(cropped.data);cw=cropped.width;ch=cropped.height;channels=1;x=options.region.workingBox.x;y=options.region.workingBox.y;
      if(cw<80||ch<40||cw*ch>16000000)return reject(fail('Rectified staff exceeds recognition bounds.','INVALID_REGION'));
    }else{pixels=new Uint8Array(cw*ch*channels);for(var row=0;row<ch;row++)pixels.set(data.subarray(((y+row)*w+x)*channels,((y+row)*w+x+cw)*channels),row*cw*channels);}
    var worker,timer,done=false;
    function finish(error,result){if(done)return;done=true;if(timer)clearTimeout(timer);if(worker)worker.terminate();if(options.signal)options.signal.removeEventListener('abort',cancel);active=null;error?reject(error):resolve(result);}
    function cancel(){finish(abort());}
    active={cancel:cancel};if(options.signal)options.signal.addEventListener('abort',cancel,{once:true});
    var page=options.page==null?options.region&&options.region.page||1:options.page;
    if(!Number.isInteger(page)||page<1||page>500)return finish(fail('Source page must be between one and 500.','INVALID_PAGE'));
    try{worker=new Worker(new URL('recognizer.worker.js',base),{type:'module'});timer=setTimeout(function(){finish(fail('Recognition exceeded its time limit. No targets were saved.','TIMEOUT'));},120000);worker.onerror=function(e){finish(fail('Local recognition worker failed: '+e.message,'WORKER_ERROR'));};worker.onmessage=function(e){var m=e.data||{};if(m.type==='progress'){if(typeof options.onProgress==='function')try{options.onProgress(m.progress);}catch(ignore){};}else if(m.type==='result')finish(null,m.result);else if(m.type==='error')finish(fail(m.message,m.code||'MODEL_ERROR'));};worker.postMessage({pixels:pixels,width:cw,height:ch,channels:channels,offset:{x:x,y:y},sourceTransform:transform||null,page:page},[pixels.buffer]);}catch(e){finish(e);}
  });}
  root.SLRecognition={recognize:recognize,cancel:function(){if(active)active.cancel();},get busy(){return !!active;},get supported(){return typeof Worker!=='undefined'&&typeof WebAssembly!=='undefined';}};
})(window);
