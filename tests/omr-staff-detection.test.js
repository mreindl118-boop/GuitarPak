const assert=require('assert'), detector=require('../js/omr/staff-detection.js');
let count=0;const ok=(v,m)=>{assert(v,m);count++;console.log('PASS',m);};
function page(w=900,h=500){return {data:new Uint8Array(w*h).fill(255),width:w,height:h,channels:1};}
function line(p,x0,x1,y,thick=1){for(let dy=0;dy<thick;dy++)for(let x=x0;x<x1;x++)if(y+dy>=0&&y+dy<p.height&&x>=0&&x<p.width)p.data[(y+dy)*p.width+x]=0;}
function staff(p,x0=40,x1=860,y=100,s=12,lines=5){for(let i=0;i<lines;i++)line(p,x0,x1,y+i*s);return p;}
function result(p){return detector.detect(p);}
function rotate(p,angle){const q=page(p.width,p.height),t=angle*Math.PI/180,c=Math.cos(t),s=Math.sin(t),cx=p.width/2,cy=p.height/2;for(let y=0;y<q.height;y++)for(let x=0;x<q.width;x++){const a=Math.round(c*(x-cx)+s*(y-cy)+cx),b=Math.round(-s*(x-cx)+c*(y-cy)+cy);if(a>=0&&a<p.width&&b>=0&&b<p.height)q.data[y*q.width+x]=p.data[b*p.width+a];}return q;}
function rejects(fn,code,m){let e;try{fn();}catch(err){e=err;}ok(e&&e.code===code,m);}
const clean=staff(page());let r=result(clean);
ok(r.regions.length===1&&r.regions[0].lineYs.every((y,i)=>Math.abs(y-100-12*i)<.01),'clean five-line geometry detected at actual pixel coordinates');
ok(r.regions[0].spacing===12&&r.regions[0].confidence>=.95&&r.regions[0].geometryOnly,'geometry score and exact spacing are explicit, not note certainty');
ok(r.regions[0].clef===null&&r.regions[0].system===null,'clef/system/rhythm are not fabricated from geometry');
ok(r.regions[0].bbox.y<=100-24&&r.regions[0].bbox.y+r.regions[0].bbox.height>=148+24,'crop preserves at least ledger/clef context on unclipped source');
let crop=detector.cropStaff(clean,r.regions[0]);
ok(crop.width*crop.height===crop.data.length&&crop.staffOffset>=24&&crop.lineSpacing===12,'model crop exposes real pixels and normalization anchors');
let two=staff(staff(page(),40,860,80),40,860,310);r=result(two);
ok(r.regions.length===2&&r.regions[0].readingOrder===0&&r.regions[1].readingOrder===1,'separate systems remain independently ordered staff regions');
let columns=staff(staff(page(),30,350,100),550,870,100);r=result(columns);
ok(r.regions.length===2&&r.regions[0].bbox.x<r.regions[1].bbox.x,'same-height separate columns are not joined into an invented single staff');
let stagger=staff(staff(page(),30,350,100),550,870,106);r=result(stagger);
ok(r.regions.length===2,'staggered column staves survive interleaved projection rows');
let beam=staff(page());for(let y=110;y<120;y++)line(beam,400,500,y);r=result(beam);
ok(r.regions.length===1&&Math.abs(r.regions[0].spacing-12)<.1,'local beams cannot replace or merge the full-width staff-line anchors');
let six=staff(page(),40,860,100,12,6);r=result(six);
ok(!r.regions.length&&r.rejectedRegions.some(a=>a.warnings.includes('AMBIGUOUS_STAFF_BOUNDARY')),'six long equally spaced lines require review instead of inventing a five-line staff');
let ten=staff(page(),40,860,100,12,10);r=result(ten);
ok(!r.regions.length,'ten contiguous lines cannot be arbitrarily split into two invented staves');
let dense=staff(staff(page(),40,860,100,12),40,860,160,12);r=result(dense);
ok(!r.regions.length&&r.rejectedRegions.length,'dense grand-staff geometry with insufficient margins fails closed');
let broken=staff(page());for(let k=0;k<5;k++)for(let x=40;x<860;x++)if(x%15<9)broken.data[(100+k*12)*900+x]=255;r=result(broken);
ok(!r.regions.length,'severely broken/low-quality lines are not assigned high confidence');
let low=staff(page(),40,860,100,3);r=result(low);
ok(!r.regions.length,'sub-four-pixel staff spacing is unsupported rather than guessed');
ok(!result(page()).regions.length&&result(page()).warnings.includes('NO_INK'),'blank page produces no staff claim');
let dark=page();dark.data.fill(0);ok(result(dark).warnings.includes('DARK_OR_INVERTED_IMAGE'),'inverted/dark page is rejected explicitly');
let random=page();let seed=17;for(let i=0;i<random.data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;if(seed/4294967296<.06)random.data[i]=0;}ok(!result(random).regions.length,'salt-noise field does not invent staff regions');
const rgba={data:new Uint8ClampedArray(clean.width*clean.height*4),width:clean.width,height:clean.height,channels:4};for(let i=0;i<clean.data.length;i++){rgba.data.set([clean.data[i],clean.data[i],clean.data[i],255],i*4);}r=result(rgba);
ok(r.regions.length===1&&r.regions[0].lineYs.join()===result(clean).regions[0].lineYs.join(),'RGBA and grayscale have the same geometric detection');
const transparent={data:new Uint8Array(100*100*4),width:100,height:100,channels:4};ok(!result(transparent).regions.length,'transparent black is composited on white, not mistaken for black page ink');
const floats={data:Float32Array.from(clean.data,b=>b/255),width:clean.width,height:clean.height};ok(result(floats).regions.length===1,'normalized float grayscale input works without range ambiguity');
const before=Buffer.from(clean.data);result(clean);ok(Buffer.compare(before,Buffer.from(clean.data))===0,'detection never mutates source pixels');
let mild=rotate(clean,.65);r=result(mild);ok(r.regions.length===1&&r.warnings.includes('MILD_SKEW_RECTIFIED'),'mild rotation is explicitly rectified rather than silently changing anchors');
crop=detector.cropStaff(mild,r.regions[0]);ok(crop.sourceTransform&&crop.sourceBox&&crop.staffOffset>=20,'rectified crop retains its source-box and inverse shear transform');
let severe=rotate(clean,4);r=result(severe);ok(!r.regions.length&&r.warnings.includes('ROTATED_OR_SKEWED_PAGE'),'larger rotation is declined with an honest rotation warning');
rejects(()=>result({width:9000,height:20,data:new Uint8Array(1)}),'IMAGE_LIMIT','oversized dimensions fail before pixel access');
rejects(()=>result({width:4000,height:4000,data:new Uint8Array(1)}),'IMAGE_LIMIT','pixel budget is enforced before allocation');
rejects(()=>result({width:20,height:20,data:new Uint8Array(399)}),'INVALID_IMAGE','truncated pixel plane is rejected');
rejects(()=>result({width:20,height:20,data:new Float32Array(400).fill(NaN)}),'INVALID_IMAGE','NaN pixel input is rejected');
rejects(()=>result({width:20,height:20,data:new Float32Array(400).fill(255)}),'INVALID_IMAGE','float grayscale range must be explicitly normalized');
rejects(()=>detector.cropStaff(clean,{usable:true,bbox:{x:-1,y:0,width:50,height:50}}),'INVALID_CROP','invalid source crop cannot escape image bounds');

const baseline=result(clean), hostile=result({...clean,truth:{staffCount:99,clef:'bass',notes:[1,2,3]},filename:'fake-answer-Cmajor.png'});
ok(JSON.stringify(baseline.regions)===JSON.stringify(hostile.regions),'metadata/filenames/ground-truth-like extra fields cannot affect geometry inference');
rejects(()=>detector.cropStaff({...clean,width:450,height:1000},baseline.regions[0]),'INVALID_CROP','staff crop cannot be applied to a different raster size');
let tampered=JSON.parse(JSON.stringify(baseline.regions[0]));tampered.transform={type:'vertical-shear',slope:Infinity,centerX:450};
rejects(()=>detector.cropStaff(clean,tampered),'INVALID_CROP','nonfinite/unsupported source transform is rejected');
const vm=require('vm'),fs=require('fs'),path=require('path');const realm={self:{},ArrayBuffer,Uint8Array,Uint8ClampedArray,Float32Array,Float64Array,Uint32Array,Int32Array,Date,performance};vm.createContext(realm);vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/omr/staff-detection.js'),'utf8'),realm);
ok(realm.self.SLStaffDetection&&realm.self.SLStaffDetection.detect(clean).regions.length===1,'UMD browser/worker global exports without DOM or CommonJS');
const clipped=staff(page(),40,860,5,12);ok(!result(clipped).regions.length&&result(clipped).rejectedRegions.some(r=>r.warnings.includes('SOURCE_CROP_CLIPS_CONTEXT')),'source-clipped ledger/clef margins are declined explicitly');
console.log('ALL PASS — '+count+' staff detection checks');
