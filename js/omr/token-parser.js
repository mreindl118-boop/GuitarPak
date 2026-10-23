/* Strict, bounded interpretation of satb-line-omr subtokens. The model predicts
 * absolute kern pitches (accidentals explicit), not staff-relative MIDI. No
 * musical truth is inferred from filenames, expected lessons or source text. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SLRecognitionTokens=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var NAT={C:0,D:2,E:4,F:5,G:7,A:9,B:11}, ACC={'#':1,'##':2,'-':-1,'--':-2,n:0};
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function duration(s){var m=/^(0|1|2|3|4|6|8|12|16|24|32)(\.{0,2})$/.exec(s);if(!m)return null;var n=+m[1],d=n===0?8:4/n;return d*(2-Math.pow(.5,m[2].length));}
  function pitch(s){if(!/^(?:([a-g])\1*|([A-G])\2*)$/.test(s))return null;var lower=s[0]===s[0].toLowerCase(),octave=lower?3+s.length:4-s.length;return {step:s[0].toUpperCase(),octave:octave};}
  function anchor(record,staff){var a=record[0].f0,b=record[record.length-1].f1,scale=staff.lineSpacingPx/staff.normSpacing,box=staff.bbox;return {page:staff.page||1,system:staff.system||0,staff:staff.staffIndex||0,bbox:[box[0]+4*a*scale,box[1],4*(b-a+1)*scale,box[3]]};}
  function parseLines(lines){
    if(!Array.isArray(lines)||lines.length>64)throw Error('Recognition supports at most 64 staff lines per request.');
    var events=[],rawTokens=[],warnings=[],unsupported=[],state={},rhythmKnown=true,total=0;
    function issue(code,message,src){unsupported.push({code:code,message:message,sourceAnchor:src||null});rhythmKnown=false;}
    lines.forEach(function(line){
      var staff=line.staff,partId='part-'+((staff.staffIndex||0)+1),st=state[partId]||(state[partId]={beat:0,clef:null,keyFifths:0,time:null,tie:null,broken:false,measureStart:0}),records=[],current=[];
      if(!staff||!Array.isArray(staff.bbox)||staff.bbox.length!==4||!(staff.lineSpacingPx>0)||!(staff.normSpacing>0))throw Error('Recognition line needs valid source geometry.');
      var input=line.events||line.tokens;if(!Array.isArray(input))throw Error('Recognition line needs raw token events.');
      input.forEach(function(t){if(++total>32768)throw Error('Recognition token limit exceeded.');if(!t||typeof t.token!=='string'||t.token.length>80||!Number.isFinite(t.f0)||!Number.isFinite(t.f1)||t.f0<0||t.f1<t.f0)throw Error('Invalid recognition token event.');var src=anchor([t],staff);rawTokens.push({token:t.token,rawConfidence:Number.isFinite(t.confidence)?t.confidence:null,frameStart:t.f0,frameEnd:t.f1,staff:staff.staffIndex||0,page:staff.page||1,bbox:src.bbox});if(t.token==='<b>'){if(current.length)records.push(current);current=[];}else current.push(t);});if(current.length)records.push(current);
      if(staff.truncated)issue('line-truncated','The staff line exceeds the model width. Missing notation must be reviewed; no continuation is invented.',{page:staff.page,bbox:staff.bbox});
      records.forEach(function(record){
        var tokens=record.map(function(x){return x.token;}),src=anchor(record,staff),first=tokens[0];
        if(first[0]==='*'){
          if(tokens.length!==1){issue('mixed-attribute','A musical attribute was mixed with note tokens.',src);st.broken=true;return;}
          if(/^\*clef(?:G2|F4)$/.test(first))st.clef={sign:first[5],line:+first[6],octaveChange:0};
          else if(first==='*clefGv2'){st.clef={sign:'G',line:2,octaveChange:-1};warnings.push({code:'octaved-clef',message:'Tenor octave-down clef recognized. Kern pitch already carries sounding octave; no additional octave shift is applied.',sourceAnchor:src});}
          else if(/^\*M\d+\/(?:1|2|4|8|16|32)$/.test(first)){var sig=first.slice(2).split('/').map(Number);if(sig[0]<1||sig[0]>128){issue('unsupported-meter','Meter is outside the supported range.',src);return;}st.time={beats:sig[0],beatType:sig[1]};}
          else if(/^\*k\[(?:[a-g](?:#|-))*\]$/.test(first)){var key=first.slice(3,-1),sharp=(key.match(/#/g)||[]).length,flat=(key.match(/-/g)||[]).length;var expected=sharp?'f#c#g#d#a#e#b#'.slice(0,sharp*2):'b-e-a-d-g-c-f-'.slice(0,flat*2);if(sharp&&flat||sharp+flat>7||key!==expected)issue('unsupported-key','The predicted key signature is not a standard fifths sequence.',src);else st.keyFifths=sharp-flat;}
          else issue('unknown-attribute','Unsupported musical attribute: '+first,src);
          return;
        }
        if(first[0]==='='){
          if(tokens.length!==1||['=','==','=||'].indexOf(first)<0){issue('repeat-or-navigation','Repeats, endings and unknown barline navigation are not expanded.',src);st.broken=true;return;}
          if(st.time&&!st.broken){var used=st.beat-st.measureStart,expected=st.time.beats*4/st.time.beatType;if(used>0&&Math.abs(used-expected)>.000001)warnings.push({code:'measure-duration-mismatch',message:'Recognized measure durations differ from the recognized meter. Verify rhythm and pickup measures.',sourceAnchor:src,recognizedBeats:used,meterBeats:expected});}
          st.measureStart=st.beat;return;
        }
        var ds=tokens.filter(function(t){return duration(t)!==null;}),ps=tokens.filter(function(t){return pitch(t)!==null;}),rests=tokens.filter(function(t){return t==='r';}),acc=tokens.filter(function(t){return t in ACC;}),ties=tokens.filter(function(t){return ['[',']','_'].indexOf(t)>=0;}),mods=tokens.filter(function(t){return duration(t)===null&&pitch(t)===null&&t!=='r'&&!(t in ACC)&&['L','J','[',']','_'].indexOf(t)<0;});
        if(ds.length!==1||ps.length+rests.length!==1||acc.length>1||ties.length>1||mods.length||rests.length&&acc.length){issue('unparseable-tokens','A token record is ambiguous or unsupported: '+tokens.join(' '),src);st.broken=true;return;}
        if(!st.clef)warnings.push({code:'missing-clef',message:'No clef was recognized before these absolute pitches. Confirm the intended clef.',sourceAnchor:src});
        var p=ps.length?pitch(ps[0]):null,alter=acc.length?ACC[acc[0]]:0,midi=p?(p.octave+1)*12+NAT[p.step]+alter:null,d=duration(ds[0]);
        if(p&&(!Number.isInteger(midi)||midi<0||midi>127)){issue('pitch-out-of-range','The predicted pitch is outside MIDI range.',src);st.broken=true;return;}
        var tie=ties[0]==='['?'start':ties[0]===']'?'stop':ties[0]==='_'?'continue':null,e={midi:midi,rest:!!rests.length,beat:st.broken?null:st.beat,duration:d,pitch:p?{step:p.step,alter:alter,octave:p.octave}:null,clef:copy(st.clef),keyFifths:st.keyFifths,meter:copy(st.time),tie:tie,partId:partId,confidence:null,verified:false,tokens:tokens,sourceAnchor:src};
        if(e.rest&&tie){issue('rest-tie','A rest cannot be tied.',src);st.broken=true;}
        if(st.tie){
          if(!e.rest&&e.midi===st.tie.midi&&(tie==='stop'||tie==='continue')&&e.beat!==null&&Math.abs(st.tie.beat+st.tie.duration-e.beat)<.000001){st.tie.duration+=d;st.tie.sourceAnchors=(st.tie.sourceAnchors||[st.tie.sourceAnchor]).concat([src]);st.tie.tokens=st.tie.tokens.concat(tokens);st.tie.tie=tie==='stop'?'merged':'start';if(tie==='stop')st.tie=null;}
          else{issue('broken-tie','A tie does not continue with the same adjacent pitch.',src);st.tie=null;events.push(e);}
        }else{events.push(e);if(tie==='stop'||tie==='continue')issue('orphan-tie','A tie continuation has no recognized start.',src);}
        if(tie==='start')st.tie=e;
        st.beat+=d;
      });
    });
    Object.keys(state).forEach(function(k){if(state[k].tie)issue('unclosed-tie','A tied pitch has no recognized ending.',state[k].tie.sourceAnchor);});
    if(!events.some(function(e){return !e.rest;}))issue('no-pitched-targets','No pitched targets were recognized. Empty, chord-only or unsupported input cannot be treated as a successful musical transcription.');
    if(unsupported.length)warnings.push({code:'review-required',message:'Unsupported or ambiguous notation was retained in raw tokens. Do not infer missing targets or timing.'});
    return {events:events,rawTokens:rawTokens,warnings:warnings,unsupported:unsupported,rhythmKnown:rhythmKnown,calibratedConfidence:null};
  }
  return {parseLines:parseLines,duration:duration};
});
