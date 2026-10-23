// Real application and decoded piano bank, silent OfflineAudioContext only.
// Observe production source creation/cancellation rather than mocking the gate.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(value, text) { console.log(value ? '  PASS' : '  FAIL', text); if (!value) fails++; }
(async () => {
 const browser = await chromium.launch({executablePath:env.CHROMIUM});
 const context = await browser.newContext({serviceWorkers:'block'});
 try {
  await context.addInitScript(() => {
   window.SL_ARTIFACT=true;
   for(const k of ['help.seen','help.done','qz.landed'])localStorage.setItem('guitarlab.'+k,'true');
   window.__pitchNodes=[];
   function SilentContext(){
    const c=new OfflineAudioContext(2,44100*4,44100);
    c.resume=()=>Promise.resolve();
    for(const name of ['createBufferSource','createOscillator']){
     const original=c[name].bind(c);
     c[name]=function(){
      const node=original(), record={node,type:name,starts:[],stops:[]};__pitchNodes.push(record);
      const start=node.start.bind(node), stop=node.stop.bind(node);
      node.start=(...args)=>{record.starts.push(args);return start(...args);};
      node.stop=(...args)=>{record.stops.push(args);try{return stop(...args);}catch(e){}};
      return node;
     };
    }
    return c;
   }
   window.AudioContext=window.webkitAudioContext=SilentContext;
   navigator.requestMIDIAccess=()=>Promise.reject(new Error('No MIDI hardware in audio test'));
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(()=>window.App&&App.keys&&App.active==='quiz');
  await page.evaluate(()=>{App.switchTo('piano');App.keys.warm();});
  await page.waitForFunction(()=>App.keys.ready());
  const result=await page.evaluate(()=>{
   const result={}, count=()=>__pitchNodes.filter(x=>x.starts.length).length;
   App.emit('fb:set',{root:0,scale:'major',source:'test'});App.scaleLock.set(true);
   let before=count();
   App.pluck(61,0,1);App.pluckSynth(61,0,1);App.keys.play(61,0,1);
   App.emit('midi:note',{on:true,midi:61,chan:5,vel:90});
   result.blocked=count()===before;
   App.keys.play(60,0,1);result.sampled=count()===before+1&&__pitchNodes.at(-1).type==='createBufferSource';
   App.pluckSynth(62,0,1);result.synth=count()===before+2;
   App.emit('midi:note',{on:true,midi:64,chan:7,vel:90});
   const live=__pitchNodes.at(-1);
   App.emit('midi:note',{on:false,midi:64,chan:7,vel:0,mute:true});
   result.mutedRelease=live.stops.length>0;
   App.keys.play(60,2,1);App.pluckSynth(62,2,1);
   const scheduled=__pitchNodes.filter(x=>x.starts.some(a=>a[0]>=2));
   App.emit('fb:set',{root:2,scale:'major',source:'test'});
   result.futureCancelled=scheduled.length>=2&&scheduled.every(x=>x.stops.some(a=>a[0]===0));
   before=count();App.keys.play(60,0,1);App.pluckSynth(60,0,1);
   result.newRootBlocks=count()===before;
   App.keys.play(61,0,1);result.newRootAllows=count()===before+1;
   App.switchTo('quiz');result.quiz=App.scaleLock.active&&!App.scaleLock.allows(60);
   App.switchTo('songs');result.songs=App.scaleLock.active&&!App.scaleLock.allows(60);
   App.switchTo('shed');result.shed=App.scaleLock.active&&!App.scaleLock.allows(60);
   App.emit('fb:set',{root:9,scale:'minor',source:'test'});
   result.calibration=App.scaleLock.contains(69+12*Math.log2(442/440))&&!App.scaleLock.contains(70+12*Math.log2(442/440));
   App.scaleLock.set(false);before=count();App.keys.play(70,0,1);App.pluckSynth(70,0,1);
   result.unlocked=count()===before+2;
   result.silentContext=App.getAudio() instanceof OfflineAudioContext;
   return result;
  });
  for(const [name,value]of Object.entries(result))ok(value,name);
  ok(errors.length===0,'no browser errors: '+errors.join('; '));
 }finally{await context.close();await browser.close();}
 console.log(fails?'FAILED '+fails:'ALL PASS');process.exitCode=fails?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
