/* Five-line staff GEOMETRY only. No note/clef/rhythm recognition or metadata input.
 * Independent bounded horizontal-run/projection implementation, informed by
 * satb-line-omr c60823117a5c92b0c29f921dbca023e94026d279 omr-preprocess.js
 * (MIT, Alexander Alber; reference license accompanies this experiment).
 * UMD: worker/browser global SLStaffDetection or CommonJS require(). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SLStaffDetection = api;
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var MAX_PIXELS = 12000000, MAX_DIMENSION = 8192, MAX_LINE_RUNS = 1024, MAX_REGIONS = 128, remainingWork=0;
  function fault(message, code) { var e = new Error(message); e.code = code || 'INVALID_IMAGE'; return e; }
  function imageInfo(image) {
    if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 16 || image.height < 16) throw fault('Use an image with integer dimensions of at least 16×16.');
    if (image.width > MAX_DIMENSION || image.height > MAX_DIMENSION || image.width * image.height > MAX_PIXELS) throw fault('Staff detection supports at most 12 million pixels and 8192 pixels per dimension. Downscale a copy while retaining the original.', 'IMAGE_LIMIT');
    var data = image.data, n = image.width * image.height, channels = image.channels || (data && data.length === n * 4 ? 4 : 1);
    if (!data || !ArrayBuffer.isView(data) || ![1,4].includes(channels) || data.length !== n * channels || ![Uint8Array, Uint8ClampedArray, Float32Array, Float64Array].some(function (C) { return data instanceof C; })) throw fault('Expected exact-length grayscale or RGBA typed pixels.');
    var floats = data instanceof Float32Array || data instanceof Float64Array;
    return {width:image.width,height:image.height,data:data,channels:channels,floatRange:floats};
  }
  function grayFromImage(image) {
    var info = imageInfo(image), out = new Uint8Array(info.width * info.height), data = info.data;
    for (var p = 0; p < out.length; p++) {
      var value;
      if (info.channels === 1) value = data[p] * (info.floatRange ? 255 : 1);
      else {
        var at = p * 4, scale = info.floatRange ? 255 : 1;
        var r = data[at] * scale, g = data[at + 1] * scale, b = data[at + 2] * scale, a = data[at + 3] * (info.floatRange ? 1 : 1 / 255);
        if (![r,g,b,a].every(Number.isFinite) || a < 0 || a > 1 || Math.min(r,g,b) < 0 || Math.max(r,g,b) > 255) throw fault('Pixel values must be finite and inside their declared range.');
        value = (0.2126 * r + 0.7152 * g + 0.0722 * b) * a + 255 * (1 - a);
      }
      if (!Number.isFinite(value) || value < 0 || value > 255) throw fault('Grayscale must be 0…255 bytes or 0…1 floats.');
      out[p] = Math.round(value);
    }
    return {data:out,width:info.width,height:info.height,channels:1};
  }
  function median(values) { var a = values.slice().sort(function(a,b){return a-b;}); return a.length % 2 ? a[a.length>>1] : (a[(a.length>>1)-1]+a[a.length>>1])/2; }
  function clamp(v, lo, hi) { return Math.max(lo,Math.min(hi,v)); }
  function runRows(gray, width, height, threshold) {
    var sums = new Uint32Array(height), best = new Uint32Array(height), left = new Int32Array(height), right = new Int32Array(height), total = 0;
    var minimum = Math.max(24, Math.round(width * .075));
    for (var y = 0; y < height; y++) {
      var count = 0, run = 0, longest = 0, start = 0, x0 = 0, x1 = 0;
      for (var x = 0; x < width; x++) {
        if (gray[y * width + x] < threshold) { count++; if (!run) start = x; run++; if (run > longest) { longest=run;x0=start;x1=x+1; } }
        else run=0;
      }
      sums[y]=count;best[y]=longest;left[y]=x0;right[y]=x1;total+=count;
    }
    var lines=[], current=null;
    for (var row=0;row<height;row++) {
      var qualified=best[row]>=minimum;
      if(qualified){if(!current)current={top:row,bottom:row,weight:0,centerSum:0,left:width,right:0,peak:0};current.bottom=row;current.weight+=best[row];current.centerSum+=row*best[row];current.left=Math.min(current.left,left[row]);current.right=Math.max(current.right,right[row]);current.peak=Math.max(current.peak,best[row]);}
      if(current&&(!qualified||row===height-1)){var cutoff=Math.max(minimum,current.peak*.45),weight=0,center=0,first=-1,last=-1;for(var cy=current.top;cy<=current.bottom;cy++){if(best[cy]>=cutoff){if(first<0)first=cy;last=cy;weight+=best[cy];center+=cy*best[cy];}}current.top=first;current.bottom=last;current.y=center/weight;lines.push(current);current=null;}
    }
    return {lines:lines,rowSums:sums,totalInk:total,minimumRun:minimum};
  }
  function nearest(lines, y, tolerance, after) {
    var best=null, delta=tolerance+.00001;
    for(var j=after;j<lines.length;j++){if(lines[j].y>y+tolerance)break;var d=Math.abs(lines[j].y-y);if(d<delta){best=j;delta=d;}}
    return best;
  }
  function inkAt(gray,width,height,x,y,radius,threshold) {
    var top=Math.max(0,Math.floor(y-radius)),bot=Math.min(height-1,Math.ceil(y+radius));
    for(var row=top;row<=bot;row++){if(--remainingWork<0)throw fault('Staff geometry work budget exceeded. Crop a smaller page region.', 'IMAGE_COMPLEXITY');if(gray[row*width+x]<threshold)return true;}
    return false;
  }
  function supportedColumns(gray,width,height,ys,radii,threshold,spacing) {
    var support=new Uint8Array(width);
    for(var x=0;x<width;x++){var matches=0;for(var k=0;k<5;k++)if(inkAt(gray,width,height,x,ys[k],radii[k],threshold))matches++;support[x]=matches>=3?1:0;}
    var parts=[], start=-1,last=-1, gap=0, bridge=Math.max(3,Math.round(spacing*1.5));
    for(var col=0;col<width;col++){if(support[col]){if(start<0)start=col;last=col;gap=0;}else if(start>=0&&++gap>bridge){parts.push([start,last+1]);start=-1;gap=0;}}
    if(start>=0)parts.push([start,last+1]);
    return parts.filter(function(r){return r[1]-r[0]>=Math.max(40,spacing*7);});
  }
  function coverage(gray,width,height,y,radius,x0,x1,threshold){var n=0;for(var x=x0;x<x1;x++)if(inkAt(gray,width,height,x,y,radius,threshold))n++;return n/Math.max(1,x1-x0);}
  function scoreCandidate(gray,width,height,lines,indices,threshold) {
    var ys=indices.map(function(i){return lines[i].y;}), gaps=ys.slice(1).map(function(y,i){return y-ys[i];}), spacing=median(gaps);
    if(spacing<4||spacing>128)return [];
    var spread=Math.max.apply(null,gaps)-Math.min.apply(null,gaps);
    if(spread>spacing*.22)return [];
    var radii=indices.map(function(i){return Math.min(spacing*.16,Math.max(.75,(lines[i].bottom-lines[i].top)/2+.4));});
    if(indices.some(function(i){return lines[i].bottom-lines[i].top+1>spacing*.44;}))return [];
    var parts=supportedColumns(gray,width,height,ys,radii,threshold,spacing), out=[];
    parts.forEach(function(part){
      var covers=ys.map(function(y,k){return coverage(gray,width,height,y,radii[k],part[0],part[1],threshold);});
      var weakest=Math.min.apply(null,covers),mean=covers.reduce(function(s,n){return s+n;},0)/5;
      if(weakest<.54||mean<.71)return;
      var extra=lines.filter(function(line,j){return indices.indexOf(j)<0&&line.y>ys[0]+spacing*.25&&line.y<ys[4]-spacing*.25&&coverage(gray,width,height,line.y,1,part[0],part[1],threshold)>.65;}).length;
      var continuation=lines.some(function(line,j){return indices.indexOf(j)<0&&(Math.abs(line.y-(ys[0]-spacing))<spacing*.18||Math.abs(line.y-(ys[4]+spacing))<spacing*.18)&&coverage(gray,width,height,line.y,1,part[0],part[1],threshold)>.65;});
      var warnings=[];
      if(extra>=2)warnings.push('AMBIGUOUS_EXTRA_LINES');
      if(continuation)warnings.push('AMBIGUOUS_STAFF_BOUNDARY');
      var edgeThickness=Math.max.apply(null,indices.map(function(i){return lines[i].bottom-lines[i].top+1;}));
      var confidence=clamp(.55*mean+.25*weakest+.20*(1-spread/Math.max(1,spacing)),0,1);
      if(extra>=2||continuation)confidence=Math.min(confidence,.35);
      out.push({lineYs:ys,spacing:spacing,lineThickness:edgeThickness,lineCoverage:covers,confidence:confidence,warnings:warnings,staffSpan:{x:part[0],y:ys[0],width:part[1]-part[0],height:ys[4]-ys[0]},clef:null,system:null,usable:confidence>=.72&&!warnings.length});
    });
    return out;
  }
  function overlap(a,b){var l=Math.max(a.staffSpan.x,b.staffSpan.x),r=Math.min(a.staffSpan.x+a.staffSpan.width,b.staffSpan.x+b.staffSpan.width);var t=Math.max(a.lineYs[0],b.lineYs[0]),z=Math.min(a.lineYs[4],b.lineYs[4]);if(r<=l||z<=t)return 0;return (r-l)*(z-t)/Math.min(a.staffSpan.width*(a.lineYs[4]-a.lineYs[0]),b.staffSpan.width*(b.lineYs[4]-b.lineYs[0]));}
  function cropBounds(staff,all,width,height){
    var span=staff.staffSpan,spacing=staff.spacing;
    var left=Math.max(0,Math.floor(span.x-spacing)),right=Math.min(width,Math.ceil(span.x+span.width+spacing*.6));
    var top=Math.max(0,Math.floor(staff.lineYs[0]-spacing*3.5)),bottom=Math.min(height,Math.ceil(staff.lineYs[4]+spacing*3.5));
    var upper=null,lower=null;
    all.forEach(function(other){if(other===staff)return;var shared=Math.min(span.x+span.width,other.staffSpan.x+other.staffSpan.width)-Math.max(span.x,other.staffSpan.x);if(shared<Math.min(span.width,other.staffSpan.width)*.45)return;if(other.lineYs[4]<staff.lineYs[0]&&(!upper||other.lineYs[4]>upper.lineYs[4]))upper=other;if(other.lineYs[0]>staff.lineYs[4]&&(!lower||other.lineYs[0]<lower.lineYs[0]))lower=other;});
    if(upper)top=Math.max(top,Math.ceil((upper.lineYs[4]+staff.lineYs[0])/2));
    if(lower)bottom=Math.min(bottom,Math.floor((staff.lineYs[4]+lower.lineYs[0])/2));
    var padUp=staff.lineYs[0]-top,padDown=bottom-staff.lineYs[4];
    if((upper&&padUp<spacing*1.5)||(lower&&padDown<spacing*1.5)){staff.warnings.push('DENSE_STAVES_INSUFFICIENT_MARGIN');staff.usable=false;staff.confidence=Math.min(staff.confidence,.45);}
    if(padUp<spacing*1.5||padDown<spacing*1.5){staff.warnings.push('SOURCE_CROP_CLIPS_CONTEXT');staff.usable=false;staff.confidence=Math.min(staff.confidence,.5);}
    staff.bbox={x:left,y:top,width:right-left,height:bottom-top};
    staff.box={x:left,y:top,w:right-left,h:bottom-top,lineSpacing:spacing,padUp:padUp,padDown:padDown};
  }
  function skewDiagnostic(gray,width,height,threshold){
    var stride=Math.max(1,Math.ceil(Math.max(width,height)/900)),w=Math.ceil(width/stride),h=Math.ceil(height/stride),points=[];
    for(var y=0;y<h;y++)for(var x=0;x<w;x++)if(gray[Math.min(height-1,y*stride)*width+Math.min(width-1,x*stride)]<threshold)points.push([x,y]);
    if(points.length<100||points.length>w*h*.45)return null;
    function score(angle){var slope=Math.tan(angle*Math.PI/180),hist=new Uint32Array(h+Math.ceil(w*.23)+4),off=Math.ceil(w*.115)+2;for(var i=0;i<points.length;i++){var yy=Math.round(points[i][1]-slope*(points[i][0]-w/2))+off;if(yy>=0&&yy<hist.length)hist[yy]++;}var n=0;for(var j=0;j<hist.length;j++)n+=hist[j]*hist[j];return n;}
    var zero=score(0),best={angle:0,score:zero};[-6,-4,-2,-1,-.5,.5,1,2,4,6].forEach(function(a){var n=score(a);if(n>best.score)best={angle:a,score:n};});
    var center=best.angle;for(var a=center-.5;a<=center+.5;a+=.125){var n=score(a);if(n>best.score)best={angle:a,score:n};}
    return best.angle&&best.score>zero*1.25?{estimatedDegrees:best.angle,projectionGain:best.score/zero}:null;
  }
  function shear(gray,width,height,slope){var out=new Uint8Array(gray.length);out.fill(255);for(var y=0;y<height;y++)for(var x=0;x<width;x++){var old=y+slope*(x-width/2),top=Math.floor(old),part=old-top;if(top>=0&&top+1<height)out[y*width+x]=Math.round(gray[top*width+x]*(1-part)+gray[(top+1)*width+x]*part);}return out;}
  function detectStaffRegions(input){
    var start=typeof performance!=='undefined'&&performance.now?performance.now():Date.now(),image=grayFromImage(input),gray=image.data,width=image.width,height=image.height;
    var threshold=153,skew=skewDiagnostic(gray,width,height,threshold),transform=null;remainingWork=120000000;
    if(skew&&Math.abs(skew.estimatedDegrees)<=1&&Math.abs(skew.estimatedDegrees)>=.25&&skew.projectionGain>=1.35){transform={type:'vertical-shear',slope:Math.tan(skew.estimatedDegrees*Math.PI/180),centerX:width/2,estimatedDegrees:skew.estimatedDegrees};gray=shear(gray,width,height,transform.slope);}
    var rows=runRows(gray,width,height,threshold),lines=rows.lines,warnings=transform?['MILD_SKEW_RECTIFIED']:[],candidates=[];
    if(rows.totalInk<30)return {regions:[],rejectedRegions:[],warnings:['NO_INK'],stats:{pixels:gray.length,lineRuns:lines.length,regions:0}};
    if(rows.totalInk>gray.length*.55)return {regions:[],rejectedRegions:[],warnings:['DARK_OR_INVERTED_IMAGE'],stats:{pixels:gray.length,lineRuns:lines.length,regions:0}};
    if(lines.length>MAX_LINE_RUNS)throw fault('Too many horizontal line candidates; simplify or crop the page.', 'IMAGE_COMPLEXITY');
    for(var i=0;i+4<lines.length;i++){
      for(var j=i+1;j<Math.min(lines.length,i+10);j++){
        var spacing=lines[j].y-lines[i].y;if(spacing<4)continue;if(spacing>128)break;
        var indices=[i,j],valid=true;
        for(var k=2;k<5;k++){var picked=nearest(lines,lines[i].y+spacing*k,Math.max(1,spacing*.14),indices[indices.length-1]+1);if(picked===null){valid=false;break;}indices.push(picked);}
        if(valid)candidates=candidates.concat(scoreCandidate(gray,width,height,lines,indices,threshold));
        if(candidates.length>MAX_REGIONS*32)throw fault('Page has too many ambiguous staff candidates. Crop a smaller region.', 'IMAGE_COMPLEXITY');
      }
    }
    candidates.sort(function(a,b){return b.confidence-a.confidence||a.lineYs[0]-b.lineYs[0]||a.staffSpan.x-b.staffSpan.x;});
    var chosen=[];
    candidates.forEach(function(c){if(!chosen.some(function(p){return overlap(p,c)>.62;}))chosen.push(c);});
    if(chosen.length>MAX_REGIONS)throw fault('At most 128 staff regions per page are supported.', 'IMAGE_COMPLEXITY');
    chosen.forEach(function(staff){cropBounds(staff,chosen.filter(function(r){return r.usable;}),width,height);});
    if(skew&&!transform&&Math.abs(skew.estimatedDegrees)>=1){warnings.push('ROTATED_OR_SKEWED_PAGE');chosen.forEach(function(r){r.warnings.push('ROTATION_REQUIRES_DESKEW');r.usable=false;r.confidence=Math.min(r.confidence,.4);});}
    if(!chosen.length)warnings.push('NO_RELIABLE_FIVE_LINE_STAFF');
    if(lines.length&&lines.length<5)warnings.push('INSUFFICIENT_HORIZONTAL_LINES');
    chosen.sort(function(a,b){return a.lineYs[0]-b.lineYs[0]||a.staffSpan.x-b.staffSpan.x;});
    chosen.forEach(function(r,index){if(transform){r.transform=Object.assign({},transform);r.workingBox=Object.assign({},r.box);var leftShift=transform.slope*(r.bbox.x-width/2),rightShift=transform.slope*(r.bbox.x+r.bbox.width-width/2),oldTop=Math.max(0,Math.floor(r.bbox.y+Math.min(leftShift,rightShift))),oldEnd=Math.min(height,Math.ceil(r.bbox.y+r.bbox.height+Math.max(leftShift,rightShift)));r.bbox={x:r.bbox.x,y:oldTop,width:r.bbox.width,height:oldEnd-oldTop};r.lineSegments=r.lineYs.map(function(y){return {x1:r.bbox.x,y1:y+leftShift,x2:r.bbox.x+r.bbox.width,y2:y+rightShift};});r.warnings.push('MILD_SKEW_RECTIFIED');r.confidence=Math.min(r.confidence,.95);}r.sourceSize={width:width,height:height};r.id='staff-'+(index+1);r.readingOrder=index;r.geometryOnly=true;r.confidence=Math.round(r.confidence*1000)/1000;});
    var accepted=chosen.filter(function(r){return r.usable;}),rejected=chosen.filter(function(r){return !r.usable;});
    if(rejected.length)warnings.push('SOME_REGIONS_REQUIRE_MANUAL_CROP_REVIEW');
    var end=typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
    return {regions:accepted,rejectedRegions:rejected,warnings:warnings,skew:skew,stats:{pixels:gray.length,lineRuns:lines.length,candidates:candidates.length,regions:accepted.length,rejected:rejected.length,inkFraction:rows.totalInk/gray.length,elapsedMs:end-start}};
  }
  function cropStaff(input,region){
    var image=grayFromImage(input),b=region&&(region.workingBox?{x:region.workingBox.x,y:region.workingBox.y,width:region.workingBox.w,height:region.workingBox.h}:region.bbox);if(region&&region.sourceSize&&(region.sourceSize.width!==image.width||region.sourceSize.height!==image.height))throw fault('This region belongs to a different raster size.', 'INVALID_CROP');if(region&&region.transform){var t=region.transform;if(t.type!=='vertical-shear'||!Number.isFinite(t.slope)||Math.abs(t.slope)>Math.tan(Math.PI/180)+.000001||t.centerX!==image.width/2)throw fault('Invalid staff rectification transform.', 'INVALID_CROP');image.data=shear(image.data,image.width,image.height,t.slope);}
    if(!region||!Array.isArray(region.lineYs)||region.lineYs.length!==5||!region.lineYs.every(Number.isFinite)||!Number.isFinite(region.spacing)||region.spacing<4||region.spacing>128)throw fault('A validated five-line staff geometry is required.', 'INVALID_CROP');
    if(!b||!['x','y','width','height'].every(function(k){return Number.isInteger(b[k]);})||b.x<0||b.y<0||b.width<1||b.height<1||b.x+b.width>image.width||b.y+b.height>image.height||!region.usable)throw fault('Select a usable staff crop inside this image.', 'INVALID_CROP');
    var out=new Uint8Array(b.width*b.height);
    for(var y=0;y<b.height;y++)out.set(image.data.subarray((b.y+y)*image.width+b.x,(b.y+y)*image.width+b.x+b.width),y*b.width);
    return {data:out,width:b.width,height:b.height,channels:1,sourceBox:Object.assign({},region.bbox),sourceTransform:region.transform?Object.assign({},region.transform):null,staffOffset:region.lineYs[0]-b.y,lineSpacing:region.spacing};
  }
  return {version:1,detectStaffRegions:detectStaffRegions,detect:detectStaffRegions,cropStaff:cropStaff,grayFromImage:grayFromImage,limits:{maxPixels:MAX_PIXELS,maxDimension:MAX_DIMENSION,maxRegions:MAX_REGIONS,maxLineRuns:MAX_LINE_RUNS}};
});
