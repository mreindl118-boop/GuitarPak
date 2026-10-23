// Strict grammar + actual Chromium/WASM inference on original generated pixels.
// Model errors are measured honestly: no assertion that every duration is correct.
const assert=require('assert'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require('playwright'),env=require('./env'),parser=require('../js/omr/token-parser');let checks=0;
function ok(v,m){assert(v,m);checks++;console.log('  PASS '+m);}
function line(tokens,extra={}){return{staff:Object.assign({page:3,system:0,staffIndex:0,bbox:[10,20,800,150],lineSpacingPx:20,normSpacing:10},extra),events:tokens.map((token,i)=>({token,f0:i*2,f1:i*2+1,confidence:.999}))};}
function parse(tokens){return parser.parseLines([line(tokens)]);}
(async()=>{
 let p=parse(['*clefG2','<b>','*M4/4','<b>','4','c','<b>','8','d','#','L','<b>','8','r','<b>','2','e','<b>','=']);
 ok(p.events.length===4&&p.events[0].midi===60&&p.events[1].midi===63&&p.events[2].rest,'strict parser reads exact absolute pitches accidental and rest');
 ok(p.events.map(e=>e.duration).join(',')==='1,0.5,0.5,2'&&p.events[3].beat===2,'durations and rests determine musical positions');
 ok(p.events.every(e=>e.confidence===null&&e.verified===false)&&p.rawTokens.every(t=>t.rawConfidence===.999),'uncalibrated token scores never become musical certainty');
 ok(p.events[0].sourceAnchor.page===3&&p.events[0].sourceAnchor.bbox[0]>=10,'source anchors retain actual page and pixel offsets');
 p=parse(['*clefF4','<b>','*k[f#]','<b>','4','F','<b>','4','F','#']);
 ok(p.events[0].midi===53&&p.events[1].midi===54&&p.events[0].keyFifths===1,'kern accidentals are explicit absolute pitch; key signature is not applied twice');
 p=parse(['*clefGv2','<b>','4','C']);ok(p.events[0].midi===48&&p.events[0].clef.octaveChange===-1,'tenor kern pitch keeps its sounding octave without an extra transpose');
 p=parse(['*clefG2','<b>','2','c','[','<b>','=','<b>','4','c',']']);ok(p.events.length===1&&p.events[0].duration===3&&p.events[0].sourceAnchors.length===2,'adjacent same-pitch tie merges with both source anchors');
 p=parse(['*clefG2','<b>','4','c',']']);ok(p.unsupported.some(w=>w.code==='orphan-tie')&&!p.rhythmKnown,'orphan tie fails known-rhythm status');
 p=parse(['*clefG2','<b>','4','c','e','<b>','4','g']);ok(p.unsupported.length&&p.events[0].beat===null,'ambiguous chord tokens do not invent notes or later timing');
 p=parse(['*clefG2','<b>','4','c','<b>','=:|','<b>','4','d']);ok(p.unsupported.some(w=>w.code==='repeat-or-navigation')&&p.events[1].beat===null,'repeat navigation is not expanded or silently assumed');
 p=parse(['*clefG2','<b>','4','c','mystery']);ok(!p.events.length&&p.unsupported.some(w=>w.code==='unparseable-tokens'),'unknown modifier cannot become an accepted note');
 p=parse(['*clefG2']);ok(!p.events.length&&p.unsupported.some(w=>w.code==='no-pitched-targets'),'empty/chord-only outputs cannot claim a successful musical transcription');
 ok(parser.duration('4..')===1.75&&Math.abs(parser.duration('12')-1/3)<1e-12&&parser.duration('xyz')===null,'duration grammar handles dotted and explicit triplet tokens only');
 let rejected=false;try{parser.parseLines([line(new Array(32769).fill('c'))]);}catch(e){rejected=/limit/.test(e.message);}ok(rejected,'raw token count is bounded');
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../vendor/omr/manifest.json')));for(const f of manifest.files){const b=fs.readFileSync(path.join(__dirname,'..',f.path));assert.equal(b.length,f.bytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),f.sha256);}ok(true,'every eligible model/runtime/code asset matches pinned manifest size and SHA256');
 ok(manifest.model.license==='MIT'&&manifest.runtime.license==='MIT'&&!manifest.files.some(f=>f.path.includes('cc-by-nc-sa')),'only the eligible MIT model and runtime are shipped');
 const browser=await chromium.launch({executablePath:env.CHROMIUM});try{
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 const origin=new URL(env.URL).origin;await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());await page.goto(new URL('tests/fixtures/omr/01-treble-quarters-clean.png',env.URL).href);await page.addScriptTag({url:new URL('js/omr/recognizer.js',env.URL).href});
 const passive=await page.evaluate(()=>({loaded:!!SLRecognition,supported:SLRecognition.supported,busy:SLRecognition.busy}));ok(passive.loaded&&passive.supported&&!passive.busy&&!requests.some(u=>/\.onnx|\.wasm/.test(u)),'loading the API alone loads no model or worker');
 const results=[];
 for(const file of ['01-treble-quarters-clean.png','02-treble-rhythm-clean.png','03-bass-quarters-clean.png','04-bass-rhythm-clean.png']){const url=new URL('tests/fixtures/omr/'+file,env.URL).href;const out=await page.evaluate(async url=>{const b=await createImageBitmap(await(await fetch(url)).blob()),c=new OffscreenCanvas(b.width,b.height),x=c.getContext('2d');x.drawImage(b,0,0);b.close();const image=x.getImageData(0,0,c.width,c.height),stages=[];const result=await SLRecognition.recognize({imageData:image,page:4,onProgress:p=>stages.push(p.stage)});return{result,stages};},url);results.push({file,...out});}
 ok(results.every(r=>r.result.events.length>0&&r.result.rawTokens.length>0&&r.stages.includes('recognizing')),'actual local WASM model recognizes original treble and bass pixels');
 const notes=r=>r.result.events.filter(e=>!e.rest).map(e=>e.midi).join(',');ok(notes(results[0])==='60,62,64,65'&&notes(results[2])==='48,50,52,53','actual clean treble and bass pitches match their generated original notes');
 ok(results.every(r=>r.result.events.every(e=>e.confidence===null&&!e.verified&&e.sourceAnchor.page===4)),'actual model outputs remain unverified with null musical confidence and actual page anchors');
 ok(results.every(r=>r.result.rhythmParsed===true&&r.result.rhythmKnown===false&&r.result.rhythmVerified===false),'valid predicted rhythm remains parsed separately from musical verification');
 ok(results.every(r=>r.result.engine.modelSha256===manifest.model.sha256&&r.result.diagnostics.threads===1&&r.result.diagnostics.graphOptimizationLevel==='disabled'&&r.result.diagnostics.pixelSha256.length===64),'actual inference records pinned model and pixel hashes with safe static-host configuration');
 await page.addScriptTag({url:new URL('js/omr/staff-detection.js',env.URL).href});
 const skew=await page.evaluate(async url=>{const b=await createImageBitmap(await(await fetch(url)).blob()),c=new OffscreenCanvas(b.width,b.height),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(b,0,0);b.close();const image=ctx.getImageData(0,0,c.width,c.height),regions=SLStaffDetection.detectStaffRegions({data:image.data,width:c.width,height:c.height,channels:4}).regions,region=regions.find(r=>r.transform);if(!region)return{transformed:false};const result=await SLRecognition.recognize({imageData:image,region,page:7});return{transformed:true,result};},new URL('tests/fixtures/omr/17-page-treble-quarters-scan.png',env.URL).href);
 ok(skew.transformed&&skew.result.events.length>0&&skew.result.diagnostics.sourceTransform.type==='vertical-shear','actual selected staff is rectified before local-model recognition');
 ok(skew.result.events.every(e=>e.sourceAnchor.page===7&&e.sourceAnchor.bbox.every(Number.isFinite)&&e.sourceAnchor.rectifiedBbox&&e.sourceAnchor.sourceTransform),'deskewed recognition source boxes map back to the original page without NaN');
 const unsupportedResults=[];
 for(const file of ['12-treble-chords-clean.png','14-repeat-bars-clean.png']){const result=await page.evaluate(async url=>{const bitmap=await createImageBitmap(await(await fetch(url)).blob()),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0);bitmap.close();return SLRecognition.recognize({imageData:ctx.getImageData(0,0,canvas.width,canvas.height),page:2});},new URL('tests/fixtures/omr/'+file,env.URL).href);unsupportedResults.push({file,result});}
 ok(unsupportedResults.every(r=>r.result.calibratedConfidence===null&&r.result.rhythmKnown===false&&r.result.rhythmVerified===false&&r.result.events.every(e=>e.confidence===null&&!e.verified)),'actual chord/repeat inputs never become verified notes or known musical timing');
 ok(unsupportedResults.every(r=>r.result.warnings.some(w=>w.code==='monophonic-scope'&&/chords/i.test(w.message)&&/repeats/i.test(w.message))),'actual unsupported inputs retain the scope warning for the review UI');
 const chord=unsupportedResults[0].result;ok(!chord.events.length&&chord.unsupported.some(w=>w.code==='no-pitched-targets')&&chord.unsupported.some(w=>w.code==='unparseable-tokens'),'this actual chord fixture emits ambiguous tokens and no fabricated chord targets');
 const repeat=unsupportedResults[1].result,repeatOmitted=!repeat.rawTokens.some(t=>/[:|!]/.test(t.token)&&t.token.startsWith('='));
 ok(repeat.events.length>0&&repeat.rhythmKnown===false&&repeat.warnings.some(w=>w.code==='uncalibrated-model'),'plausible repeated-score output still requires review and makes no full-score claim');
 console.log('  OBSERVATION current model omitted repeat navigation token: '+repeatOmitted+'; notes='+repeat.events.length+'; detected unsupported codes='+repeat.unsupported.map(w=>w.code).join(',')+'; scope warning remains mandatory.');
 const safety=await page.evaluate(async()=>{const small=new ImageData(100,60);small.data.fill(255);let aborted=false,busy=false,invalid=false;const ctrl=new AbortController(),pending=SLRecognition.recognize({imageData:small,signal:ctrl.signal});try{await SLRecognition.recognize({imageData:small});}catch(e){busy=e.code==='BUSY';}ctrl.abort();try{await pending;}catch(e){aborted=e.name==='AbortError';}try{await SLRecognition.recognize({imageData:small,region:{bbox:{x:-1,y:0,width:90,height:60}}});}catch(e){invalid=e.code==='INVALID_REGION';}const blank=await SLRecognition.recognize({imageData:small});return{aborted,busy,invalid,blank,active:SLRecognition.busy};});
 ok(safety.aborted&&safety.busy&&!safety.active,'abort terminates the worker and concurrent jobs cannot multiply memory');ok(safety.invalid,'out-of-page staff regions fail before model loading');ok(!safety.blank.events.length&&safety.blank.unsupported.some(x=>x.code==='no-staves-found'),'blank pixels return an explicit unsupported result, never fabricated notes');
 ok(safety.blank.rhythmParsed===false&&safety.blank.rhythmVerified===false,'unsupported output does not claim parsed or verified rhythm');
 const staffLimit=await page.evaluate(async()=>{const width=600,height=8000,data=new Uint8Array(width*height).fill(255);for(let g=0;g<100;g++)for(let line=0;line<5;line++){const y=30+g*80+line*8;for(let x=20;x<580;x++)data[y*width+x]=0;}try{await SLRecognition.recognize({imageData:{data,width,height}});return null;}catch(e){return e.code;}});
 ok(staffLimit==='STAFF_LIMIT','too many staves are rejected before normalized tensors and model loading');
 ok(requests.every(u=>u.startsWith(origin))&&!errors.length,'actual worker uses same-origin assets only and has no browser errors');
 if(process.env.EVIDENCE_DIR){fs.mkdirSync(process.env.EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.EVIDENCE_DIR,'omr-engine.json'),JSON.stringify({results,skew,unsupportedResults,repeatOmitted,requests,errors,checks},null,2));}
 await context.close();
 }finally{await browser.close();}
 console.log('ALL PASS ('+checks+' strict parser, pinned assets and actual local-model browser checks)');
})().catch(e=>{console.error(e);process.exitCode=1;});
