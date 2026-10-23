// Pure bounded score format: original authored fixtures, no audio or device API.
const { chromium } = require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
const env=require('./env');let checks=0;
function ok(v,m){assert.ok(v,m);checks++;console.log('  PASS '+m);}
function midiRead(input){const b=Buffer.from(input);let p=0,tick=0,last=0;const notes=[],tempos=[],active=new Map();assert.equal(b.toString('ascii',0,4),'MThd');assert.equal(b.readUInt16BE(12),960);p=22;const vlq=()=>{let n=0,x;do{x=b[p++];n=n*128+(x&127);}while(x&128);return n;};let end=0;while(p<b.length){tick+=vlq();let s=b[p++];if(s<128){p--;s=last;}else last=s;if(s===255){const kind=b[p++],len=vlq();if(kind===81)tempos.push({tick,us:b.readUIntBE(p,3)});if(kind===47)end=tick;p+=len;}else{const n=b[p++],v=b[p++];if((s&240)===144&&v)active.set(n,tick);else{assert.ok(active.has(n));notes.push({m:n,t:active.get(n),d:tick-active.get(n)});active.delete(n);}}}assert.equal(active.size,0);return {notes,tempos,end};}
(async()=>{const browser=await chromium.launch({executablePath:env.CHROMIUM});try{
 const page=await browser.newPage();await page.route('**/score-format-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Score format test</title>'}));await page.goto(new URL('score-format-test',env.URL).href);
 await page.addScriptTag({url:new URL('js/score.js',env.URL).href});
 const xml=fs.readFileSync(path.join(__dirname,'fixtures/score/tempo-tie-chord.musicxml'),'utf8');
 const data=await page.evaluate(xml=>{const m=SLScore.parseMusicXML(xml),round=SLScore.parseMusicXML(SLScore.scoreXML(m));return {m,round,midi:Array.from(SLScore.midiBytes(m)),timeline:SLScore.timeline(m),audio:['play','stop','toggle','module'].some(x=>x in SLScore)};},xml);
 ok(data.m.notes.length===4&&data.m.totalBeats===8,'tie/chord fixture retains four sounding notes and trailing rest length');
 ok(data.m.notes[0].duration===3&&data.m.measures[0].events[0].pitches[0].tieStart&&data.m.measures[0].events[1].pitches[0].tieStop,'written ties remain in notation while sounding duration is merged');
 ok(data.m.tempos.length===2&&data.m.tempos[0].bpm===120&&data.m.tempos[1].beat===2&&data.m.tempos[1].bpm===60,'full tempo map remains explicit');
 ok(data.m.sourcePart.name==='Test'&&data.m.measures[0].key.fifths===1,'source part and key signature metadata retained');
 ok(JSON.stringify(data.round.notes)===JSON.stringify(data.m.notes)&&JSON.stringify(data.round.tempos)===JSON.stringify(data.m.tempos),'XML roundtrip preserves pitches, spelling, merged durations and tempos');
 ok(data.round.totalBeats===8&&data.round.measures[0].key.fifths===1,'XML roundtrip preserves key and complete measure/rest length');
 ok(data.timeline[0].at===0&&data.timeline[0].duration===2,'pure timing conversion integrates original tempo changes');
 ok(!data.audio,'recovered format contains no playback, oscillator or page module');
 const decoded=midiRead(data.midi);
 ok(decoded.notes.length===4&&decoded.notes.find(n=>n.m===60).d===2880,'independent SMF decoder verifies merged note pair duration');
 ok(decoded.end===7680&&decoded.tempos.length===2&&decoded.tempos[1].tick===1920,'SMF end marker retains trailing rests and tempo positions');
 const created=await page.evaluate(()=>{const m=SLScore.createScore('Bb3:q [C4,E4,G4]:h R:q',{title:'Original review study',bpm:96,meter:'4/4',clef:'bass'});return {m,round:SLScore.parseMusicXML(SLScore.scoreXML(m))};});
 ok(created.m.notes[0].pitch.step==='B'&&created.m.notes[0].pitch.alter===-1&&created.m.notes[0].midi===58,'manual spelled accidental is not silently respelled');
 ok(created.m.notes.length===4&&created.m.totalBeats===4&&created.m.measures[0].events[1].pitches.length===3,'original manual chord and rest have exact structure');
 ok(created.round.measures[0].clef==='bass'&&created.round.tempos[0].bpm===96,'manual bass clef and tempo roundtrip');
 const rejects=[
  ['multiple-voices.musicxml','Multiple voices'],['repeat.musicxml','repeat']
 ];
 for(const [file,label] of rejects){const text=fs.readFileSync(path.join(__dirname,'fixtures/score',file),'utf8');ok(await page.evaluate(t=>{try{SLScore.parseMusicXML(t);return false;}catch(e){return !!e.message;}},text),'unsupported '+label+' rejects without partial score');}
 const invalid=[['entity',xml.replace('<score-partwise','<!ENTITY injected "x"><score-partwise')],['internal DTD',xml.replace(/<!DOCTYPE[^>]*>/,'<!DOCTYPE score-partwise [<!ENTITY x "bad">]>')],['UTF-16 declaration',xml.replace('UTF-8','UTF-16')],['multiple parts',xml.replace('</score-partwise>','<part id="P2"/></score-partwise>')],['tuplets',xml.replace('<voice>1</voice>','<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><voice>1</voice>')],['transposition',xml.replace('<divisions>8</divisions>','<divisions>8</divisions><transpose><chromatic>-2</chromatic></transpose>')],['unmatched tie',xml.replace(/<tie type="stop"\/>/,'').replace(/<tied type="stop"\/>/,'')],['malformed XML','<score-partwise>']];
 for(const [label,text] of invalid)ok(await page.evaluate(t=>{try{SLScore.parseMusicXML(t);return false;}catch(e){return true;}},text),'rejects '+label+' explicitly');
 const bytes=await page.evaluate(()=>{try{SLScore.parseMusicXML('漢'.repeat(750000));return false;}catch(e){return /MiB/.test(e.message);}});
 ok(bytes,'UTF-8 byte bound handles multibyte text, not only JS character count');
 const badTokens=['C4:q. R:w','[C4,C4]:q','C9:q','C4:x','C4:q | D4:q'];
 for(const s of badTokens)ok(await page.evaluate(t=>{try{SLScore.createScore(t);return false;}catch(e){return true;}},s),'invalid token/measure rejected: '+s);
 console.log('ALL PASS ('+checks+' pure score format checks)');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
