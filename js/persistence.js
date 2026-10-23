/* Versioned settings recovery. Existing guitarlab.* names are preserved.
 * localStorage writes are verified, not called atomic. Imports use a durable
 * before-snapshot + phase journal and compensating rollback across stores. */
(function(root,factory){var api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SLPersistence=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  var PREFIX='guitarlab.', JOURNAL='__persistence.journal.v1', LAST='__persistence.last.v1';
  var FORMAT='soundlab-settings', MAX=128*1024*1024;
  // Browsers coordinate asynchronous restore/sampler transactions across tabs.
  // Injected non-browser storage uses one in-process queue for deterministic tests.
  var queues=new WeakMap();
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function errorText(e){return e&&e.message||String(e);}
  function id(){return root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():'storage-'+Date.now()+'-'+Math.random().toString(36).slice(2);}
  function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function encode(bytes){var u=new Uint8Array(bytes),s='';for(var i=0;i<u.length;i+=16384)s+=String.fromCharCode.apply(null,u.subarray(i,i+16384));return root.btoa?root.btoa(s):Buffer.from(u).toString('base64');}
  function decode(s){if(typeof s!=='string'||s.length>MAX*1.4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw new Error('Invalid or oversized sample encoding.');var text=root.atob?root.atob(s):Buffer.from(s,'base64').toString('binary'),u=new Uint8Array(text.length);for(var i=0;i<text.length;i++)u[i]=text.charCodeAt(i);return u.buffer;}
  async function digest(bytes){if(!root.crypto||!root.crypto.subtle)throw new Error('Archive integrity requires a secure browser context.');var d=await root.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(d),function(n){return n.toString(16).padStart(2,'0');}).join('');}
  function immutable(existing,next){
    if(!existing)return null;
    if(!Array.isArray(existing.sessions)||!next||!Array.isArray(next.sessions))return 'Existing practice history cannot be replaced by an invalid record.';
    var candidate=new Map(next.sessions.map(function(s){return [s.id,s];}));
    if(existing.sessions.some(function(s){return !candidate.has(s.id)||!equal(s,candidate.get(s.id));}))return 'This write would remove or rewrite an existing immutable practice session. Reload and retry the original observation.';
    return null;
  }
  function Store(options){
    options=options||{};this.prefix=options.prefix||PREFIX;this.manifest=options.manifest||root.SLStorageManifest||{validate:function(){return {ok:true,errors:[]};},strictReadback:function(){return false;},failClosed:function(){return false;}};
    this.storage=null;this.unavailable='';this._storageReadable=false;try{this.storage=options.storage||root.localStorage;if(!this.storage)throw new Error('Local storage is unavailable.');}catch(e){this.unavailable=errorText(e);}
    this._overlay=new Map();this._failed=new Map();this._issues=new Map();this._known=new Map();this._listeners=[];this._adapters=new Map();this._plans=new Map();this._busy=false;this._needsReload=false;this._external=false;this._journal=null;this._lastError='';this._backupMemory=new Map();this._journalStore=options.journalStore||null;this._acceptedJournal=null;this._ownedJournal=null;this._sawActiveJournal=false;this._transactionDepth=0;
    this.store=this;this._readJournal();if(this._journal&&this._journal.state==='committed')this._acceptedJournal=this._journal.id;
    Object.getOwnPropertyNames(Store.prototype).forEach(function(name){if(name!=='constructor'&&typeof this[name]==='function')this[name]=this[name].bind(this);},this);
    var self=this;if(root.addEventListener)root.addEventListener('storage',function(e){if(!e.key||e.key.indexOf(self.prefix)===0){self._external=true;self._readJournal();self._notify();}});
  }
  Store.prototype._exclusive=async function(work){
    var self=this,run=async function(){self._transactionDepth++;try{return await work();}finally{self._transactionDepth--;}};
    if(root.navigator&&root.navigator.locks&&typeof root.navigator.locks.request==='function')return root.navigator.locks.request('soundlab-storage:'+this.prefix,{mode:'exclusive'},run);
    if(root.document)throw new Error('Safe storage transactions require browser Web Locks. Export your data and use a supported browser; nothing was changed.');
    if(!this.storage)throw new Error(this.unavailable||'Storage is unavailable.');
    var previous=queues.get(this.storage)||Promise.resolve(),next=previous.catch(function(){}).then(run);queues.set(this.storage,next.catch(function(){}));return next;
  };
  Store.prototype._liveFence=function(){
    this._readJournal();var j=this._journal;if(!j)return null;
    if(j.state==='committed'&&j.id===this._acceptedJournal)return null;
    if(j.state==='committed')this._needsReload=true;
    return j.state==='committed'?'Another tab imported settings. Reload before saving.':'Storage recovery or import must finish before settings can be saved.';
  };
  Store.prototype._assertOwner=function(key){this._readJournal();if(!this._journal||this._journal.id!==key||this._ownedJournal!==key)throw new Error('Recovery transaction ownership changed. No further data was written.');};
  Store.prototype.withMutation=async function(work){var self=this;return this._exclusive(async function(){var blocked=self._liveFence();if(blocked||self._busy||self._needsReload)throw new Error(blocked||'Finish storage recovery/reload before saving sampler data.');return work();});};
  Store.prototype._raw=function(key){if(!this.storage)throw new Error(this.unavailable||'Storage is unavailable.');try{var value=this.storage.getItem(this.prefix+key);this._storageReadable=true;return value;}catch(e){this._storageReadable=false;this.unavailable=errorText(e);throw e;}};
  Store.prototype._put=function(key,raw){if(!this.storage)throw new Error(this.unavailable||'Storage is unavailable.');this.storage.setItem(this.prefix+key,raw);if(this._raw(key)!==raw)throw new Error('Storage did not retain '+key+'.');};
  Store.prototype._remove=function(key){if(!this.storage)throw new Error('Storage is unavailable.');this.storage.removeItem(this.prefix+key);if(this._raw(key)!==null)throw new Error('Storage did not remove '+key+'.');};
  Store.prototype._reserved=function(key){return key.indexOf('__persistence.')===0;};
  Store.prototype._validate=function(key,value){return this.manifest.validate?this.manifest.validate(key,value):{ok:true,errors:[]};};
  Store.prototype.read=function(key){
    var raw;try{raw=this._raw(key);}catch(e){var bad={status:'unavailable',key:key,raw:null,errors:[errorText(e)]};this._issues.set(key,bad);return bad;}
    if(raw===null){this._issues.delete(key);return {status:'missing',key:key,raw:null,value:undefined,revision:null};}
    var value;try{value=JSON.parse(raw);}catch(e){var corrupt={status:'corrupt',key:key,raw:raw,revision:raw,errors:['Stored JSON could not be read; original bytes were retained.']};this._issues.set(key,corrupt);return corrupt;}
    var check=this._validate(key,value);if(!check.ok){var unsupported={status:'unsupported',key:key,raw:raw,value:value,revision:raw,errors:check.errors};this._issues.set(key,unsupported);return unsupported;}
    this._issues.delete(key);return {status:'ok',key:key,raw:raw,value:value,revision:raw};
  };
  Store.prototype.get=function(key,fallback){
    if(this._overlay.has(key)&&!this.manifest.strictReadback(key))return clone(this._overlay.get(key).value);
    var r=this.read(key);this._known.set(key,r.raw);
    if(r.status==='ok')return r.value;
    if(r.status!=='missing'&&this.manifest.failClosed(key))throw new Error((r.errors||['Stored data is unavailable.']).join(' '));
    return fallback;
  };
  Store.prototype.revision=function(key){var r=this.read(key);if(r.status==='unavailable')throw new Error(r.errors.join(' '));return r.raw;};
  Store.prototype.write=function(key,value,options){
    options=options||{};var self=this,current,raw;
    function refused(message,conflict){self._lastError=message;if(self.manifest.strictReadback(key))try{self._failed.set(key,{value:clone(value),error:message});}catch(e){}if(!self.manifest.strictReadback(key))try{self._overlay.set(key,{value:clone(value),error:message});}catch(e){self._issues.set(key,{key:key,status:'invalid-write',raw:null,errors:[message]});}self._notify();return {ok:false,persisted:false,pending:!self.manifest.strictReadback(key),conflict:!!conflict,errors:[message]};}
    if(typeof key!=='string'||!key||key.length>256||this._reserved(key))return {ok:false,persisted:false,errors:['Invalid or reserved setting key.']};
    var blocked=this._liveFence();if(blocked||this._busy||this._needsReload)return refused(blocked||'Storage recovery or import must finish before settings can be saved.');
    try{raw=JSON.stringify(value);if(raw===undefined)throw new Error('A setting must be JSON serializable.');current=this.read(key);
      if(current.status==='unavailable')throw new Error(current.errors.join(' '));
      if((current.status==='corrupt'||current.status==='unsupported')&&!options.replaceCorrupt)throw new Error('Original '+key+' data is '+current.status+' and was retained. Review recovery before replacing it.');
      var check=this._validate(key,value);if(!check.ok)throw new Error(check.errors.join(' '));
      var expected=Object.prototype.hasOwnProperty.call(options,'expectedRevision')?options.expectedRevision:this.manifest.strictReadback(key)&&this._known.has(key)?this._known.get(key):current.raw;
      if(expected!==current.raw)return refused('Another session changed '+key+'. Reload or retry against the latest saved data.',true);
      if(key==='practice.progress.v1'&&current.status==='ok'){var violation=immutable(current.value,value);if(violation)return refused(violation,true);}
      this._put(key,raw);this._known.set(key,raw);this._overlay.delete(key);this._failed.delete(key);this._issues.delete(key);this._lastError='';this._notify();return {ok:true,persisted:true,pending:false,revision:raw};
    }catch(e){return refused(errorText(e));}
  };
  Store.prototype.set=function(key,value){return this.write(key,value);};
  Store.prototype.status=function(){this._readJournal();if(this._journal&&this._journal.state==='committed'&&this._journal.id!==this._acceptedJournal&&this._journal.id!==this._ownedJournal)this._needsReload=true;var pendingBlobs=0;this._adapters.forEach(function(a){try{pendingBlobs+=a.pending?a.pending():0;}catch(e){}});return {pendingBlobs:pendingBlobs,available:!!this.storage&&this._storageReadable,pendingKeys:Array.from(this._overlay.keys()),pendingStrictKeys:Array.from(this._failed.keys()),issues:Array.from(this._issues.values()).map(function(r){return {key:r.key,status:r.status,errors:r.errors};}),localBusy:this._busy,busy:this._busy||!!(this._journal&&this._journal.state!=='committed'),recoveryRequired:!!(this._journal&&this._journal.state!=='committed'),needsReload:this._needsReload,externalChanged:this._external,lastError:this._lastError,blockReload:pendingBlobs>0||this._busy||this._needsReload||this._overlay.size>0||this._failed.size>0||!!(this._journal&&this._journal.state!=='committed')};};
  Store.prototype.refresh=function(){this._notify();return this.status();};
  Store.prototype.subscribe=function(fn){if(typeof fn!=='function')return function(){};this._listeners.push(fn);fn(this.status());var self=this;return function(){self._listeners=self._listeners.filter(function(f){return f!==fn;});};};
  Store.prototype._notify=function(){var s=this.status();this._listeners.slice().forEach(function(fn){try{fn(s);}catch(e){}});if(root.dispatchEvent&&root.CustomEvent)root.dispatchEvent(new root.CustomEvent('soundlab:storage',{detail:s}));};
  Store.prototype.retry=function(){var self=this,results=[];Array.from(this._overlay.entries()).forEach(function(pair){var r=self.write(pair[0],pair[1].value);results.push(Object.assign({key:pair[0]},r));});return {ok:!this._overlay.size,results:results};};
  Store.prototype.exportPending=function(){return {format:'soundlab-unsaved-settings',version:1,createdAt:new Date().toISOString(),strictCandidates:Array.from(this._failed.entries()).map(function(p){return {key:p[0],value:clone(p[1].value),error:p[1].error};}),settings:Array.from(this._overlay.entries()).map(function(p){return {key:p[0],value:clone(p[1].value),error:p[1].error};}),issues:Array.from(this._issues.values()).map(function(r){return {key:r.key,raw:r.raw,status:r.status,errors:r.errors};})};};
  Store.prototype.rawSnapshot=function(){
    if(!this.storage)throw new Error(this.unavailable||'Storage is unavailable.');var records=[];
    for(var i=0;i<this.storage.length;i++){var name=this.storage.key(i);if(name&&name.indexOf(this.prefix)===0&&!this._reserved(name.slice(this.prefix.length)))records.push({key:name,raw:this.storage.getItem(name)});}
    records.sort(function(a,b){return a.key.localeCompare(b.key);});return records;
  };
  Store.prototype.registerBlobAdapter=function(adapter){if(!adapter||!adapter.id||typeof adapter.export!=='function'||typeof adapter.apply!=='function'||typeof adapter.restore!=='function')throw new Error('A blob adapter needs id, export, apply and restore.');this._adapters.set(adapter.id,adapter);return this;};
  Store.prototype._snapshotBlobs=async function(options){var blobs=[];for(var pair of this._adapters){var list=await pair[1].export(options||{});for(var entry of list){var bytes=entry.bytes;blobs.push({adapter:pair[0],key:String(entry.key),encoding:'base64',data:encode(bytes),sha256:await digest(bytes)});}}return blobs;};
  Store.prototype._exportArchive=async function(options){options=options||{};var records=this.rawSnapshot();if(options.includePending){var mapped=new Map(records.map(function(r){return [r.key,r];})),self=this;this._overlay.forEach(function(p,key){mapped.set(self.prefix+key,{key:self.prefix+key,raw:JSON.stringify(p.value)});});records=Array.from(mapped.values()).sort(function(a,b){return a.key.localeCompare(b.key);});}return {format:FORMAT,version:1,createdAt:new Date().toISOString(),scope:{settings:'All persisted guitarlab.* records, including unknown/legacy values',sampler:this._adapters.has('sampler')?'Original sampler bytes included':'Sampler adapter unavailable',musicLibrary:'Separate Music Library archive',native:'Native preferences and browser permissions excluded',unsaved:'Use Export unsaved settings separately'},records:records,blobs:await this._snapshotBlobs(options)};};
  Store.prototype.exportArchive=async function(options){var self=this;return this._exclusive(async function(){self._readJournal();if(self._journal&&self._journal.state!=='committed')throw new Error('Finish import/recovery before exporting a complete settings/sampler archive. Raw recovery export remains available.');var before=JSON.stringify(self.rawSnapshot()),archive=await self._exportArchive(options);if(JSON.stringify(self.rawSnapshot())!==before)throw new Error('Settings changed during export. Retry to capture a consistent archive.');return archive;});};
  Store.prototype._archive=async function(input){
    var a=clone(input),warnings=[];if(a&&a.app==='soundLAB'&&a.keys&&!a.format){a={format:FORMAT,version:1,records:Object.keys(a.keys).map(function(k){return {key:k,raw:a.keys[k]};}),blobs:[]};warnings.push('Legacy settings-only backup: sampler bytes and native preferences were not included.');}
    if(!a||a.format!==FORMAT||a.version!==1||!Array.isArray(a.records)||!Array.isArray(a.blobs))throw new Error('Unsupported settings archive format/version. Original data was left unchanged.');
    if(a.records.length>20000||a.blobs.length>10000||JSON.stringify(a).length>MAX)throw new Error('Archive exceeds the 128 MB safety limit.');
    var seen=new Set(),size=0;
    for(var r of a.records){if(!r||typeof r.key!=='string'||r.key.indexOf(this.prefix)!==0||this._reserved(r.key.slice(this.prefix.length))||typeof r.raw!=='string'||seen.has(r.key))throw new Error('Archive has an invalid, duplicate or reserved setting record.');seen.add(r.key);size+=r.raw.length;
      var key=r.key.slice(this.prefix.length),value;try{value=JSON.parse(r.raw);}catch(e){throw new Error('Archive setting '+key+' contains invalid JSON. Raw recovery export remains available; it was not activated.');}
      var valid=this._validate(key,value);if(!valid.ok)throw new Error(key+': '+valid.errors.join(' '));
      var current=this.read(key);if(key==='practice.progress.v1'&&current.status==='ok'){var bad=immutable(current.value,value);if(bad)throw new Error(bad);}
      if(key==='plugins.list'&&value&&value.length)warnings.push('This archive contains plugin source. Restored enabled plugins run after the next app launch.');
    }
    var blobKeys=new Set();for(var b of a.blobs){if(!b||typeof b.key!=='string'||!b.key||b.encoding!=='base64'||!this._adapters.has(b.adapter))throw new Error('Archive sample adapter/key is unsupported.');var bk=b.adapter+'/'+b.key;if(blobKeys.has(bk))throw new Error('Archive contains duplicate sample keys.');blobKeys.add(bk);var bytes=decode(b.data);size+=bytes.byteLength;if(size>MAX)throw new Error('Decoded archive exceeds 128 MB.');if(typeof b.sha256!=='string'||await digest(bytes)!==b.sha256)throw new Error('Sample integrity check failed for '+b.key+'.');}
    return {archive:a,warnings:warnings};
  };
  Store.prototype.prepareImport=async function(input){
    try{if(this.status().recoveryRequired||this._busy||this._needsReload)throw new Error('Finish recovery/reload before preparing another import.');var v=await this._archive(input),before=this.rawSnapshot(),existing=new Map(before.map(function(r){return [r.key,r.raw];})),planId=id(),changed=v.archive.records.filter(function(r){return existing.get(r.key)!==r.raw;});
      this._plans.set(planId,{archive:v.archive,revision:JSON.stringify(before)});return {ok:true,id:planId,records:v.archive.records.length,changed:changed.length,added:changed.filter(function(r){return !existing.has(r.key);}).length,replaced:changed.filter(function(r){return existing.has(r.key);}).length,samples:v.archive.blobs.length,warnings:v.warnings,policy:'Merge imported records; unrelated and unknown existing settings/samples are retained. A verified before-snapshot is kept. No changes made yet.'};
    }catch(e){return {ok:false,errors:[errorText(e)]};}
  };
  Store.prototype.rebaseImport=async function(plan){var key=typeof plan==='string'?plan:plan&&plan.id,p=this._plans.get(key);if(!p)return {ok:false,errors:['Import preview expired.']};try{var previous=new Map(JSON.parse(p.revision).map(function(r){return [r.key,r.raw];})),current=this.rawSnapshot(),now=new Map(current.map(function(r){return [r.key,r.raw];}));if(p.archive.records.some(function(r){return previous.get(r.key)!==now.get(r.key);}))throw new Error('An imported setting changed after preview. Review the archive again.');await this._archive(p.archive);p.revision=JSON.stringify(current);return {ok:true,id:key};}catch(e){return {ok:false,errors:[errorText(e)]};}};
  Store.prototype._backupDB=function(){return new Promise(function(resolve,reject){if(!root.indexedDB)return reject(new Error('IndexedDB is required for a durable before-import backup.'));var request=root.indexedDB.open('soundlab-persistence',1);request.onupgradeneeded=function(){if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots');};request.onblocked=function(){reject(new Error('Recovery database upgrade is blocked by another app tab.'));};request.onerror=function(){reject(request.error);};request.onsuccess=function(){var db=request.result;db.onversionchange=function(){db.close();};resolve(db);};});};
  Store.prototype._saveBackup=async function(key,value){if(this._journalStore){await this._journalStore.put(key,clone(value));var got=await this._journalStore.get(key);if(!equal(got,value))throw new Error('Before-import backup readback failed.');return;}
    var db=await this._backupDB();await new Promise(function(resolve,reject){var tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(value,key);tx.oncomplete=resolve;tx.onerror=tx.onabort=function(){reject(tx.error||new Error('Backup transaction failed.'));};});db.close();if(!equal(await this._loadBackup(key),value))throw new Error('Before-import backup readback failed.');};
  Store.prototype._loadBackup=async function(key){if(this._journalStore)return this._journalStore.get(key);var db=await this._backupDB();var value=await new Promise(function(resolve,reject){var q=db.transaction('snapshots').objectStore('snapshots').get(key);q.onsuccess=function(){resolve(q.result);};q.onerror=function(){reject(q.error);};});db.close();return value;};
  Store.prototype._writeJournal=function(j){if(this._ownedJournal&&j.state!=='prepared')this._assertOwner(j.id);this._put(JOURNAL,JSON.stringify(j));this._journal=clone(j);};
  Store.prototype._readJournal=function(){var raw;try{raw=this._raw(JOURNAL);}catch(e){this._lastError='Storage is unavailable: '+errorText(e);return;}try{this._journal=null;if(raw){var j=JSON.parse(raw);if(j.version!==1||!Array.isArray(j.beforeRecords)||typeof j.id!=='string'||!j.id||['prepared','applying','rollback-blobs','committed'].indexOf(j.state)<0)throw new Error('Unsupported recovery journal.');var keys=new Set(),prefix=this.prefix,self=this;if(j.beforeRecords.length>20000||j.beforeRecords.some(function(r){if(!r||typeof r.key!=='string'||r.key.indexOf(prefix)!==0||self._reserved(r.key.slice(prefix.length))||typeof r.raw!=='string'||keys.has(r.key))return true;keys.add(r.key);return false;}))throw new Error('Invalid before-import records; no data was changed.');this._journal=j;if(j.state!=='committed')this._sawActiveJournal=true;}else if(this._sawActiveJournal)this._needsReload=true;}catch(e){this._journal={state:'invalid',id:'unknown',version:1};this._lastError='Recovery journal could not be read: '+errorText(e);}};
  Store.prototype._restoreRecords=function(records,owner){var desired=new Map(records.map(function(r){return [r.key,r.raw];})),current=this.rawSnapshot();for(var r of records){if(owner)this._assertOwner(owner);this._put(r.key.slice(this.prefix.length),r.raw);}for(var old of current)if(!desired.has(old.key)){if(owner)this._assertOwner(owner);this._remove(old.key.slice(this.prefix.length));}if(!equal(this.rawSnapshot(),records))throw new Error('Settings rollback readback failed.');};
  Store.prototype._applyBlobs=async function(blobs,restoring,owner){for(var pair of this._adapters){if(owner)this._assertOwner(owner);var entries=blobs.filter(function(b){return b.adapter===pair[0];}).map(function(b){return {key:b.key,bytes:decode(b.data)};});if(restoring)await pair[1].restore(entries);else if(entries.length)await pair[1].apply(entries);}};
  Store.prototype._recover=async function(){
    this._readJournal();var j=this._journal;if(!j){if(this._sawActiveJournal)this._needsReload=true;return {ok:true,recovered:false,requiresReload:this._needsReload};}if(j.state==='invalid')return {ok:false,errors:[this._lastError||'Invalid recovery journal. Export original data before repair.']};if(j.state==='committed'){if(this._sawActiveJournal||j.id!==this._acceptedJournal)this._needsReload=true;return {ok:true,recovered:false,requiresReload:this._needsReload};}this._ownedJournal=j.id;this._busy=true;this._notify();
    try{var before=await this._loadBackup(j.id);if(!before)throw new Error('The durable before-import snapshot is unavailable. Original raw records are still in the journal.');if(before.format!==FORMAT||before.version!==1||!equal(before.records,j.beforeRecords)||!Array.isArray(before.blobs))throw new Error('Before-import snapshot does not match its journal. Original data was retained.');var seenBlobs=new Set();for(var b of before.blobs){if(!b||!this._adapters.has(b.adapter)||typeof b.key!=='string'||!b.key||b.encoding!=='base64'||seenBlobs.has(b.adapter+'/'+b.key))throw new Error('Recovery sample adapter/record is not ready.');seenBlobs.add(b.adapter+'/'+b.key);if(await digest(decode(b.data))!==b.sha256)throw new Error('Recovery sample integrity failed. Original data was retained.');}this._assertOwner(j.id);this._restoreRecords(j.beforeRecords,j.id);await this._applyBlobs(before.blobs,true,j.id);this._assertOwner(j.id);this._remove(JOURNAL);this._journal=null;this._needsReload=true;this._lastError='';return {ok:true,recovered:true,requiresReload:true};}
    catch(e){this._lastError='Recovery remains pending: '+errorText(e);return {ok:false,errors:[this._lastError]};}finally{this._busy=false;this._notify();}
  };
  Store.prototype.recover=async function(){var self=this;try{return await this._exclusive(function(){return self._recover();});}catch(e){this._lastError=errorText(e);this._notify();return {ok:false,errors:[this._lastError]};}};
  Store.prototype.commitImport=async function(plan){var self=this;try{return await this._exclusive(function(){return self._commitImport(plan);});}catch(e){this._lastError=errorText(e);this._notify();return {ok:false,errors:[this._lastError]};}};
  Store.prototype._commitImport=async function(plan){
    var planId=typeof plan==='string'?plan:plan&&plan.id,p=this._plans.get(planId);if(!p)return {ok:false,errors:['Import preview is missing or expired. Review the archive again.']};
    if(this._liveFence()||this.status().recoveryRequired||this._busy||this._needsReload||this._overlay.size||this.status().pendingBlobs)return {ok:false,errors:['Save/export pending changes and finish recovery before import.']};
    this._busy=true;this._notify();var journal=null;
    try{if(JSON.stringify(this.rawSnapshot())!==p.revision)throw new Error('Saved settings changed after preview. Review the archive again.');await this._archive(p.archive);
      var before=await this._exportArchive(),backupId=id();await this._saveBackup(backupId,before);
      // All asynchronous validation/backup work is complete. A tab may have made
      // an ordinary synchronous preference/session save while backup was pending.
      if(this._liveFence()||JSON.stringify(this.rawSnapshot())!==p.revision)throw new Error('Saved settings changed while preparing the backup. Review the archive again.');
      await this._archive(p.archive);
      if(this._liveFence()||JSON.stringify(this.rawSnapshot())!==p.revision)throw new Error('Saved settings changed before activation. Review the archive again.');
      this._ownedJournal=backupId;journal={version:1,id:backupId,state:'prepared',beforeRecords:before.records,startedAt:new Date().toISOString()};this._writeJournal(journal);journal.state='applying';this._writeJournal(journal);
      await this._applyBlobs(p.archive.blobs,false,backupId);
      for(var r of p.archive.records){this._assertOwner(backupId);this._put(r.key.slice(this.prefix.length),r.raw);}
      for(var r of p.archive.records)if(this._raw(r.key.slice(this.prefix.length))!==r.raw)throw new Error('Imported setting readback failed.');
      this._assertOwner(backupId);this._put(LAST,JSON.stringify({id:backupId,createdAt:new Date().toISOString()}));journal.state='committed';this._writeJournal(journal);this._plans.delete(planId);this._needsReload=true;this._lastError='';return {ok:true,requiresReload:true,beforeSnapshotId:backupId,records:p.archive.records.length,samples:p.archive.blobs.length};
    }catch(e){var message=errorText(e),rollback=null;if(journal){this._readJournal();if(this._journal&&this._journal.id===journal.id&&this._ownedJournal===journal.id)rollback=await this._recover();else rollback={ok:false,errors:['Transaction ownership changed; automatic rollback was refused to preserve newer data.']};}this._lastError=message+(rollback&&!rollback.ok?' Recovery is pending; original records remain journalled.':'');return {ok:false,rolledBack:!!(rollback&&rollback.ok),requiresReload:!!(rollback&&rollback.ok),recoveryRequired:!!(rollback&&!rollback.ok),errors:[this._lastError]};}
    finally{this._busy=false;this._notify();}
  };
  Store.prototype.checkpoint=async function(){this.retry();var errors=[];for(var pair of this._adapters)if(pair[1].flush)try{await pair[1].flush();}catch(e){errors.push(errorText(e));}var status=this.status();if(!status.available||status.pendingKeys.length||status.pendingStrictKeys.length||status.pendingBlobs||status.busy||status.recoveryRequired||status.issues.length)errors.push('Unsaved changes or recovery still require attention.');return {ok:!errors.length,errors:errors,status:status};};
  Store.prototype.migrate=async function(spec){
    try{if(!spec||typeof spec.id!=='string'||typeof spec.transform!=='function'||!Number.isInteger(spec.from)||!Number.isInteger(spec.to)||spec.to<=spec.from)throw new Error('Migration needs id, ordered versions and a pure transform.');var key='storage.schema.v1',raw=this.read(key),state=raw.status==='missing'?{version:1,schemaVersion:0,applied:[]}:raw.value;if(raw.status!=='ok'&&raw.status!=='missing')throw new Error('Schema state is unreadable; original bytes were retained.');if(!state||state.version!==1||!Array.isArray(state.applied))throw new Error('Unsupported schema state.');if(state.applied.indexOf(spec.id)>=0)return {ok:true,skipped:true};if(state.schemaVersion!==spec.from)throw new Error('Migration source version does not match.');var archive=await this.exportArchive(),changed=await spec.transform(clone(archive));if(!changed)throw new Error('Migration returned no archive.');changed.records=changed.records.filter(function(r){return r.key!==PREFIX+key;});changed.records.push({key:this.prefix+key,raw:JSON.stringify({version:1,schemaVersion:spec.to,applied:state.applied.concat([spec.id])})});var plan=await this.prepareImport(changed);if(!plan.ok)return plan;return this.commitImport(plan);}catch(e){return {ok:false,errors:[errorText(e)]};}
  };
  Store.prototype.exportPendingArchive=async function(){var blobs=[];for(var pair of this._adapters){var list=pair[1].pendingEntries?pair[1].pendingEntries():[];for(var e of list)blobs.push({adapter:pair[0],key:e.key,encoding:'base64',data:encode(e.bytes),sha256:await digest(e.bytes)});}var records=Array.from(this._overlay.entries()).map(function(p){return {key:this.prefix+p[0],raw:JSON.stringify(p[1].value)};},this);this._failed.forEach(function(p,key){if(/pending/.test(key))records.push({key:this.prefix+key,raw:JSON.stringify(p.value)});},this);return {format:FORMAT,version:1,createdAt:new Date().toISOString(),scope:{partial:'Only unsaved settings/sampler bytes; unrelated durable data is not included',strict:'Unconfirmed canonical whole-record candidates are diagnostic only, not activated'},records:records,blobs:blobs,recovery:this.exportPending()};};
  Store.prototype.beforeSnapshot=async function(){var raw=this._raw(LAST);if(!raw)throw new Error('No verified before-import snapshot is available.');var value=await this._loadBackup(JSON.parse(raw).id);if(!value)throw new Error('Before-import snapshot is unavailable.');return value;};
  Store.prototype.repair=function(key,raw){
    var blocked=this._liveFence();if(blocked||this._busy||this._needsReload)return {ok:false,errors:[blocked||'Finish storage recovery/reload before repair.']};
    var current=this.read(key);if(current.status!=='corrupt'&&current.status!=='unsupported')return {ok:false,errors:['Choose a corrupt/unsupported record to repair.']};
    if(key==='practice.progress.v1'&&current.value&&current.value.version!==1)return {ok:false,errors:['A different practice-history schema must be opened by a compatible version; it cannot be downgraded here.']};
    try{var value=JSON.parse(raw),valid=this._validate(key,value);if(!valid.ok)throw new Error(valid.errors.join(' '));var saved=this._raw('__persistence.quarantine.v1'),items=saved?JSON.parse(saved):[];if(!Array.isArray(items))throw new Error('Existing raw-recovery archive is unsupported and was retained.');items.push({key:key,raw:current.raw,reason:current.status,at:new Date().toISOString()});this._put('__persistence.quarantine.v1',JSON.stringify(items));var result=this.write(key,value,{replaceCorrupt:true,expectedRevision:current.raw});if(result.ok){this._needsReload=true;this._notify();}return result;}catch(e){return {ok:false,errors:[errorText(e)]};}
  };
  Store.prototype.exportRecovery=function(){var raw=null,quarantine=null,records=[],errors=[];try{raw=this._raw(JOURNAL);quarantine=this._raw('__persistence.quarantine.v1');records=this.rawSnapshot();}catch(e){errors.push(errorText(e));}return {errors:errors,journalRaw:raw,format:'soundlab-storage-recovery',version:1,journal:this._journal?clone(this._journal):null,quarantineRaw:quarantine,pending:this.exportPending(),records:records};};
  return {create:function(options){return new Store(options);},Store:Store,format:FORMAT,version:1,encode:encode,decode:decode};
});
