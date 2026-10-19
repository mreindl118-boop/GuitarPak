/* Public release history. No device commands, account state, or update-channel changes. */
(function () {
  'use strict';
  var releases = [
    {version:'0.78.0', date:'2026-10-19', notes:[
      'MIDI Hub: play, inspect and reshape MIDI, with named Yamaha controls and explicit SysEx tools.',
      'MIDI output selection, Thru and held-note cleanup have additional safeguards.',
      'LUMI Practice separates a MODX answer input from the experimental LUMI display output. Try the clearly labeled simulation before connecting hardware.',
      'Score Preview reads a documented single-part MusicXML subset, plays it locally, preserves the original and exports MIDI. Unsupported notation is refused rather than simplified silently.',
      'Music Library keeps immutable originals and explicit metadata in this browser, with versioned MIDI from supported XML and integrity-checked backup packages. PDF/image previews are not recognition; back up local files yourself.',
      'Helix Stadium XL provides explicit, armed preset/snapshot controls for documented firmware 1.4. Hardware behavior still needs validation.'
    ]},
    {version:'0.77.2',date:'2026-10-14',notes:[
      'Keyboard lights restore after reconnecting, and Re-send restores every intended key.',
      'Missing selected outputs remain disconnected instead of switching to a synth. The corrected grand-piano level is preserved.'
    ]}
  ];
  var dialog, lastFocus;
  function open() {
    if (!dialog) {
      dialog=document.createElement('dialog');dialog.id='sl-release-history';dialog.setAttribute('aria-labelledby','sl-release-title');
      var title=document.createElement('h2');title.id='sl-release-title';title.textContent="What's New";dialog.appendChild(title);
      releases.forEach(function (r) {
        var h=document.createElement('h3');h.textContent='soundLAB '+r.version+' · '+r.date;dialog.appendChild(h);
        var list=document.createElement('ul');r.notes.forEach(function (n) {var li=document.createElement('li');li.textContent=n;list.appendChild(li);});dialog.appendChild(list);
      });
      var close=document.createElement('button');close.type='button';close.className='btn sm primary';close.id='sl-release-close';close.textContent='Close';
      function closed(){App.emit('modal',{name:'release-notes',open:false});if(lastFocus&&lastFocus.focus)lastFocus.focus();}
      close.onclick=function () {if(dialog.close)dialog.close();else{dialog.removeAttribute('open');closed();}};dialog.appendChild(close);
      dialog.addEventListener('close',closed);
      dialog.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Escape'&&!dialog.close){dialog.removeAttribute('open');closed();}});
      document.body.appendChild(dialog);
    }
    lastFocus=document.activeElement;App.emit('transport:claim',{owner:'release-notes'});
    if(dialog.showModal){if(!dialog.open)dialog.showModal();}else dialog.setAttribute('open','');
    App.emit('modal',{name:'release-notes',open:true});dialog.querySelector('button').focus();
  }
  function init() {
    App.injectCSS('release-notes','#sl-release-notice{margin:8px 16px;padding:10px 14px;border:1px solid var(--border,#555);border-radius:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px}#sl-release-history{max-width:620px;width:calc(100% - 40px);max-height:80vh;overflow:auto;background:var(--card,#222);color:var(--text,#eee);border:1px solid var(--border,#555);border-radius:16px;padding:22px}#sl-release-history::backdrop{background:#0009}#sl-release-history li{margin:8px 0;line-height:1.5}');
    var update=document.getElementById('set-update');
    if(update&&!document.getElementById('sl-release-open')){var button=document.createElement('button');button.type='button';button.id='sl-release-open';button.className='btn sm';button.textContent="What's New / history";button.onclick=open;update.parentNode.appendChild(button);}
    var minor=String(App.version).split('.').slice(0,2).join('.');
    if(App.store.get('app.whatsNewMinor','')===minor||document.getElementById('sl-release-notice'))return;
    var notice=document.createElement('aside');notice.id='sl-release-notice';notice.setAttribute('role','status');
    var text=document.createElement('span');text.textContent='New in soundLAB '+App.version+': MIDI Hub and new practice tools.';notice.appendChild(text);
    var read=document.createElement('button');read.className='btn sm';read.type='button';read.textContent="What's New";read.onclick=function(){dismiss();open();};notice.appendChild(read);
    var done=document.createElement('button');done.className='btn sm';done.type='button';done.textContent='Dismiss';done.onclick=dismiss;notice.appendChild(done);
    function dismiss(){App.store.set('app.whatsNewMinor',minor);notice.remove();}
    var main=document.querySelector('main');if(main&&main.parentNode)main.parentNode.insertBefore(notice,main);else document.body.appendChild(notice);
  }
  window.SLReleaseNotes={init:init,open:open,history:releases};
})();
