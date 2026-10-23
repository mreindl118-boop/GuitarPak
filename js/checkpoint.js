/* Explicit update/import boundary. Only a deliberate user action stops and
 * checkpoints practice; a worker taking control never reloads over edits. */
(function () {
  'use strict';
  var checkpointing=null,updating=false,barriers=0,boundary=null;
  Object.defineProperty(App,'interactionBlocked',{get:function(){return barriers>0;}});
  App.blockInteraction=function(reason){
    if(boundary){barriers++;var nestedReleased=false;return function(){if(!nestedReleased){nestedReleased=true;finishBoundary();}};}
    var previous=document.activeElement,states=[],oldBusy=document.body.getAttribute('aria-busy'),released=false;
    var overlay=document.createElement('div');overlay.className='sl-operation';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');overlay.tabIndex=-1;
    var card=document.createElement('p');card.textContent=reason||'Saving changes. Please wait before editing or starting practice.';overlay.appendChild(card);document.body.appendChild(overlay);
    function block(node){if(node===overlay||node.nodeType!==1||states.some(function(p){return p[0]===node;}))return;states.push([node,node.inert]);node.inert=true;}
    Array.from(document.body.children).forEach(block);var observer=new MutationObserver(function(changes){changes.forEach(function(c){c.addedNodes.forEach(block);});});observer.observe(document.body,{childList:true});
    boundary={finish:function(){observer.disconnect();states.forEach(function(p){p[0].inert=p[1];});overlay.remove();if(oldBusy===null)document.body.removeAttribute('aria-busy');else document.body.setAttribute('aria-busy',oldBusy);if(previous&&previous.isConnected&&!previous.closest('[inert]'))previous.focus();}};
    barriers++;document.body.setAttribute('aria-busy','true');overlay.focus();
    return function(){if(released)return;released=true;finishBoundary();};
  };
  function finishBoundary(){barriers--;if(!barriers&&boundary){var previous=boundary;boundary=null;previous.finish();}}
  App.injectCSS('checkpoint-boundary','.sl-operation{position:fixed;inset:0;z-index:30000;display:grid;place-items:center;background:var(--bg,#131114);padding:24px}.sl-operation p{max-width:36rem;padding:24px;border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--text);font-size:1.1rem}');
  function errors(result,fallback){return result&&result.errors&&result.errors.length?result.errors:[fallback];}
  App.checkpoint=function(options){
    if(checkpointing)return checkpointing;
    checkpointing=(async function(){
      var failed=[];
      // Commit focused edit controls before asking their owners to save.
      if(document.activeElement&&document.activeElement.blur&&!document.activeElement.closest('.sl-operation'))document.activeElement.blur();
      App.emit('transport:claim',{owner:'checkpoint',reason:options&&options.reason||'save'});
      if(App.tuner)App.tuner.stop();
      if(App.keysLessons)App.keysLessons.stop();
      if(window.Woodshed&&Woodshed.checkpoint)Woodshed.checkpoint();
      if(window.PerformancePlayer){var p=PerformancePlayer.checkpoint();if(!p.ok)failed=failed.concat(errors(p,'Practice has unsaved results.'));}
      if(window.SLXP){SLXP.retryPending();if(SLXP.pending().length)failed.push('Lesson observations still need saving or export.');}
      if(App.practicePlan&&App.practicePlan.checkpoint){var plan=await App.practicePlan.checkpoint();if(!plan.ok)failed=failed.concat(errors(plan,'Teacher notes or draft changes have not saved.'));}
      if(window.SLScoreReview&&SLScoreReview.checkpoint){var score=await SLScoreReview.checkpoint();if(!score.ok)failed=failed.concat(errors(score,'Score edits have not saved.'));}
      if(window.SLMusicLibrary&&SLMusicLibrary.checkpoint){var library=await SLMusicLibrary.checkpoint();if(!library.ok)failed=failed.concat(errors(library,'The song library is still saving.'));}
      if(window.PracticeMaterial){var material=PracticeMaterial.checkpoint();if(!material.ok)failed=failed.concat(errors(material,'Material history has not saved.'));}
      var persistence=App.persistence&&await App.persistence.checkpoint();
      if(persistence&&!persistence.ok)failed=failed.concat(errors(persistence,'Settings or samples still need saving.'));
      return {ok:!failed.length,errors:Array.from(new Set(failed)),status:App.persistence&&App.persistence.status()};
    })().catch(function(e){return {ok:false,errors:[e.message]};}).finally(function(){checkpointing=null;});
    return checkpointing;
  };
  function ready(){
    if(document.getElementById('app-update'))return;
    var bar=document.createElement('aside');bar.id='app-update';bar.setAttribute('role','status');
    var text=document.createElement('span');text.textContent='An app update is ready. Save practice and score edits before reloading.';bar.appendChild(text);
    var go=document.createElement('button');go.type='button';go.className='btn sm primary';go.textContent='Save & update';go.onclick=request;bar.appendChild(go);
    var later=document.createElement('button');later.type='button';later.className='btn sm';later.textContent='Later';later.onclick=function(){bar.remove();};bar.appendChild(later);document.body.appendChild(bar);
  }
  async function request(){
    if(updating)return {ok:false,errors:['An update is already being checked.']};updating=true;ready();
    var bar=document.getElementById('app-update'),text=bar&&bar.querySelector('span'),go=bar&&bar.querySelector('button');if(go)go.disabled=true;
    var release=App.blockInteraction('Saving practice and edits, then installing the app update. Please wait.');
    try{
      var result=await App.checkpoint({reason:'web-update'});if(!result.ok)throw Error(result.errors.join(' '));
      if('serviceWorker' in navigator){
        var registration=await navigator.serviceWorker.getRegistration();
        if(registration){await registration.update();var worker=registration.installing||registration.waiting;
          if(worker&&worker.state!=='activated')await new Promise(function(resolve,reject){var timer=setTimeout(function(){done(Error('The update is still installing. Retry when ready.'));},15000);function done(error){clearTimeout(timer);worker.removeEventListener('statechange',change);error?reject(error):resolve();}function change(){if(worker.state==='activated')done();else if(worker.state==='redundant')done(Error('The update could not install. Your saved data remains available.'));}worker.addEventListener('statechange',change);change();});
        }
      }
      // Recheck after every asynchronous worker wait. Late physical input or
      // background saves must not create uncheckpointed data before reload.
      var finalCheck=await App.checkpoint({reason:'web-update-final'});if(!finalCheck.ok)throw Error(finalCheck.errors.join(' '));
      location.reload();return {ok:true};
    }catch(error){if(text)text.textContent='Update deferred: '+error.message;return {ok:false,errors:[error.message]};}
    finally{release();updating=false;if(go)go.disabled=false;}
  }
  App.updates={ready:ready,request:request,get busy(){return updating;}};
})();
