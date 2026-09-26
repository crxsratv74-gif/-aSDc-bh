
(function(){
  'use strict';
  let APP = { version: '20.16.0', initialUrls: [], settings: {}, schedule: {}, qualityPresets: {}, sitePresets: {} };
  const el = id => document.getElementById(id);
  const state = { busy:false, refreshTimer:null, fileTimer:null, previewInteractive:true, scheduleDirty:false };

  function message(text, type){
    const box = el('message');
    box.textContent = text || 'Ready.';
    box.className = 'notice ' + (type === 'err' ? 'err' : type === 'ok' ? 'ok' : '');
  }
  function esc(v){return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fmtBytes(n){if(!n)return '0 B';const u=['B','KB','MB','GB'];const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),u.length-1);return (n/Math.pow(1024,i)).toFixed(i?1:0)+' '+u[i];}
  async function api(url,opt){
    const init = Object.assign({headers:{'Accept':'application/json'}}, opt || {});
    if(init.body && typeof init.body === 'object' && !(init.body instanceof FormData)){
      init.headers = Object.assign({'Content-Type':'application/json'},init.headers || {});
      init.body = JSON.stringify(init.body);
    }
    const controller = new AbortController();
    const timer = setTimeout(function(){controller.abort();},30000);
    init.signal = controller.signal;
    try{
      const sep = url.indexOf('?') >= 0 ? '&' : '?';
      const r = await fetch(url + sep + '_=' + Date.now(),init);
      const text = await r.text();
      let d = {};
      try{ d = text ? JSON.parse(text) : {}; }catch(_){ d = {error:text || ('HTTP '+r.status)}; }
      if(!r.ok) throw new Error(d.error || ('HTTP '+r.status));
      return d;
    }catch(e){
      if(e.name === 'AbortError') throw new Error('Request timed out.');
      throw e;
    }finally{ clearTimeout(timer); }
  }
  function getUrls(){
    return el('urls').value.split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);
  }
  function setUrls(urls){
    el('urls').value = (urls || []).join('\n');
    updateUrlCount();
  }
  function updateUrlCount(){ el('urlCount').textContent = getUrls().length + ' URL(s) in panel'; }
  function validateUrls(urls){
    const clean=[]; const seen=new Set();
    for(const raw of urls){
      const value=String(raw || '').trim();
      if(!value) continue;
      let u;
      try{u=new URL(value);}catch(e){throw new Error('Invalid URL: '+value);}
      if(u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http:// and https:// URLs are allowed: '+value);
      const n=u.toString();
      if(!seen.has(n)){seen.add(n);clean.push(n);}
    }
    return clean;
  }
  function updateQualityUI(){
    const q=APP.qualityPresets[el('quality').value];
    if(!q)return;
    el('selectedQuality').textContent='Selected: '+el('quality').value+' · '+q.width+'×'+q.height;
    el('selectedQualityHelp').textContent='Selected: '+el('quality').value+' — '+q.width+'×'+q.height+'. Applies to the next recording.';
    if(el('heroQuality')) el('heroQuality').textContent=el('quality').value+' · '+q.width+'×'+q.height;
    if(el('heroSeconds')) el('heroSeconds').textContent=el('recordSeconds').value;
  }
  function saveLocalSettings(){
    localStorage.setItem('pella.quality',el('quality').value);
    localStorage.setItem('pella.recordSeconds',el('recordSeconds').value);
    localStorage.setItem('pella.warmupSeconds',el('warmupSeconds').value);
    updateQualityUI();
  }
  function setBusy(b, mode){
    state.busy=b;
    const btn=el('startBtn');
    if(!btn) return;
    if(b){
      btn.disabled=true;
      btn.textContent=mode==='stopping'?'Stopping…':'Starting…';
      btn.classList.toggle('recording-stop', mode==='stopping');
    }else{
      btn.disabled=false;
      applyActionButton(false);
    }
  }
  function setRecordingVisual(running){
    document.body.classList.toggle('recording', !!running);
  }
  function applyActionButton(running){
    const btn=el('startBtn');
    if(!btn) return;
    const isStopping=btn.dataset.stopping==='1';
    if(state.busy && !isStopping) return;
    btn.classList.toggle('recording-stop', !!running);
    btn.classList.toggle('primary', !running);
    btn.classList.toggle('danger', !!running);
    btn.setAttribute('aria-label', running ? 'Stop Recording' : 'Start Recording');
    btn.title = running ? 'Stop the current recording' : 'Start a new recording';
    btn.textContent = running ? '■ Stop Recording' : '▶ Start Recording';
  }
  function renderFiles(files){
    if(!files.length){el('files').innerHTML='<div class="empty" style="color:#66717c">No WebM recordings found.</div>';return;}
    el('files').innerHTML=files.map(function(f){
      return '<div class="file"><div class="filehead"><label><input class="filecheck" type="checkbox" value="'+esc(f.key)+'"> Select</label><div class="name" title="'+esc(f.filename)+'">'+esc(f.filename)+'</div><div class="meta">'+fmtBytes(f.size)+' · '+(f.lastModified?new Date(f.lastModified).toLocaleString():'')+'</div></div><video controls preload="metadata" src="'+esc(f.previewUrl)+'"></video><div class="row" style="margin-top:10px"><a class="btn" href="'+esc(f.downloadUrl)+'">Download</a><button type="button" class="danger deleteOne" data-key="'+esc(f.key)+'">Delete</button></div></div>';
    }).join('');
  }
  async function refreshFiles(){
    el('filesNotice').className='notice';
    el('filesNotice').textContent='Loading recordings…';
    try{
      const d=await api('/api/files');
      renderFiles(d.files || []);
      el('filesNotice').className='notice ok';
      el('filesNotice').textContent='B2 recordings loaded: '+(d.files || []).length;
    }catch(e){
      el('files').innerHTML='';
      el('filesNotice').className='notice err';
      el('filesNotice').textContent='B2 recordings unavailable: '+e.message;
    }
  }
  function setPreviewInteractionEnabled(enabled, announce){
    state.previewInteractive = !!enabled;
    const img = el('livePreview');
    const toggle = el('previewInteractionToggle');
    const label = el('previewInteractionLabel');
    if (toggle) toggle.checked = state.previewInteractive;
    if (img) {
      img.style.cursor = state.previewInteractive ? 'crosshair' : 'default';
      img.style.touchAction = state.previewInteractive ? 'none' : 'auto';
      img.setAttribute('aria-disabled', state.previewInteractive ? 'false' : 'true');
      img.title = state.previewInteractive ? 'Click / touch is ON' : 'Click / touch is OFF';
    }
    if (label) label.textContent = state.previewInteractive ? 'ON' : 'OFF';
    if (announce) message(state.previewInteractive ? 'Live Screen Preview touch/click control: ON' : 'Live Screen Preview touch/click control: OFF', 'ok');
  }

  function applyStatus(s){
    const progress=s.totalUrls ? ((s.currentIndex || 0)+1)+'/'+s.totalUrls : '—';
    const current=s.currentUrl ? ' · Current: '+s.currentUrl : '';
    el('status').textContent='Running: '+(s.running?'YES':'NO')+current+' · Progress: '+progress+' · B2: '+(s.b2Configured?'configured':'not configured')+' · Version: '+APP.version;
    el('status').className='status'+(s.lastError?' err':'');
    setRecordingVisual(!!s.running);
    applyActionButton(!!s.running);
    applyScheduleUI(s.schedule, false);
    if(s.lastError) message(s.lastError,'err');
    const active=s.activeRunSettings;
    if(s.running && active){
      el('activeQuality').textContent='Active: '+active.quality+' · '+active.width+'×'+active.height+' · warmup '+Math.round((active.warmupMs||0)/1000)+'s';
      el('liveText').textContent='Recording: '+(s.currentUrl || 'starting')+' · '+active.quality+' · '+active.width+'×'+active.height+' · warmup '+Math.round((active.warmupMs||0)/1000)+'s · '+progress;
      el('livePreview').style.display='block';
      el('liveEmpty').style.display='none';
      el('livePreview').src='/api/live-preview?_='+Date.now();
      bindInteractivePreview();
    }else{
      el('activeQuality').textContent='Active: none';
      el('liveText').textContent='No active recording.';
      el('livePreview').style.display='none';
      el('liveEmpty').style.display='block';
    }
  }
  function mapPreviewPoint(clientX, clientY){
    const img=el('livePreview');
    if(!img || img.style.display==='none') return null;
    const rect=img.getBoundingClientRect();
    if(!rect.width || !rect.height) return null;
    const activeMatch=el('activeQuality').textContent.match(/· (\d+)×(\d+)/);
    const sourceW=img.naturalWidth || Number(activeMatch?.[1]) || rect.width;
    const sourceH=img.naturalHeight || Number(activeMatch?.[2]) || rect.height;
    const rx=(clientX-rect.left)/rect.width;
    const ry=(clientY-rect.top)/rect.height;
    if(rx<0 || ry<0 || rx>1 || ry>1) return null;
    return {x:Math.max(0,Math.min(sourceW-1,rx*sourceW)), y:Math.max(0,Math.min(sourceH-1,ry*sourceH))};
  }

  async function sendPreviewInput(body){
    try{ await api('/api/input',{method:'POST',body:body}); }
    catch(e){ message('Preview input: '+e.message,'err'); }
  }

  function bindInteractivePreview(){
    const img=el('livePreview');
    if(!img || img.dataset.interactive==='1') return;
    img.dataset.interactive='1';
    img.style.cursor='crosshair';
    img.addEventListener('click',function(ev){
      if(!state.previewInteractive) return;
      if(img.dataset.lastTouch && Date.now()-Number(img.dataset.lastTouch)<500) return;
      const p=mapPreviewPoint(ev.clientX,ev.clientY);
      if(!p) return;
      sendPreviewInput({type:'click',x:p.x,y:p.y,button:'left',clickCount:ev.detail>=2?2:1});
    });
    img.addEventListener('contextmenu',function(ev){
      if(!state.previewInteractive) return;
      ev.preventDefault();
      const p=mapPreviewPoint(ev.clientX,ev.clientY);
      if(!p) return;
      sendPreviewInput({type:'click',x:p.x,y:p.y,button:'right',clickCount:1});
    });
    img.addEventListener('pointerup',function(ev){
      if(!state.previewInteractive) return;
      if(ev.pointerType!=='touch') return;
      ev.preventDefault();
      img.dataset.lastTouch=String(Date.now());
      const p=mapPreviewPoint(ev.clientX,ev.clientY);
      if(!p) return;
      sendPreviewInput({type:'tap',x:p.x,y:p.y});
    });
    img.addEventListener('wheel',function(ev){
      if(!state.previewInteractive) return;
      ev.preventDefault();
      const p=mapPreviewPoint(ev.clientX,ev.clientY) || {x:0,y:0};
      sendPreviewInput({type:'wheel',x:p.x,y:p.y,deltaX:ev.deltaX,deltaY:ev.deltaY});
    },{passive:false});
  }

  function bindPreviewInteractionToggle(){
    const toggle = el('previewInteractionToggle');
    if(!toggle || toggle.dataset.bound==='1') return;
    toggle.dataset.bound='1';
    setPreviewInteractionEnabled(toggle.checked, false);
    toggle.addEventListener('change', function(){ setPreviewInteractionEnabled(toggle.checked, true); });
  }

  function detectTimeZone(){
    try{ return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }catch(_){ return 'UTC'; }
  }
  function updateScheduleLabel(){
    const on=!!el('scheduleEnabled')?.checked;
    if(el('scheduleEnabledLabel')) el('scheduleEnabledLabel').textContent=on?'ON':'OFF';
    if(el('scheduleStatus')) el('scheduleStatus').textContent=on ? ((el('scheduleStart').value||'--:--')+' → '+(el('scheduleEnd').value||'--:--')) : 'OFF';
  }
  function applyScheduleUI(s, force){
    if(!s) return;
    if(!force && state.scheduleDirty) return;
    if(el('scheduleEnabled')) el('scheduleEnabled').checked=!!s.enabled;
    if(el('scheduleStart')) el('scheduleStart').value=s.startTime||'05:30';
    if(el('scheduleEnd')) el('scheduleEnd').value=s.endTime||'06:00';
    if(el('scheduleTimeZone')) el('scheduleTimeZone').value=s.timeZone||detectTimeZone();
    state.scheduleDirty=false;
    updateScheduleLabel();
    if(el('scheduleHelp')){
      const extra=s.inWindow ? ' · ACTIVE NOW' : '';
      el('scheduleHelp').textContent=(s.enabled?'Daily schedule is ON':'Daily schedule is OFF')+' · '+(s.startTime||'05:30')+' → '+(s.endTime||'06:00')+' · '+(s.timeZone||detectTimeZone())+extra+'. Scheduled recording uses saved urls.txt.';
    }
  }
  function markScheduleDirty(){ state.scheduleDirty=true; updateScheduleLabel(); }
  async function saveSchedule(){
    const enabled=!!el('scheduleEnabled').checked;
    const startTime=el('scheduleStart').value;
    const endTime=el('scheduleEnd').value;
    const timeZone=(el('scheduleTimeZone').value||detectTimeZone()).trim();
    if(!startTime || !endTime){message('Choose a start and end time.','err');return;}
    if(startTime===endTime){message('Start time and end time must be different.','err');return;}
    try{
      const d=await api('/api/schedule',{method:'POST',body:{enabled,startTime,endTime,timeZone}});
      state.scheduleDirty=false;
      applyScheduleUI(d.schedule,true);
      message('Schedule saved: '+(enabled?'ON':'OFF')+' · '+startTime+' → '+endTime+' · '+timeZone+'.','ok');
    }catch(e){message('Save schedule failed: '+e.message,'err');}
  }

  async function refreshStatus(){
    try{ applyStatus(await api('/api/status')); }
    catch(e){ el('status').textContent='Status error: '+e.message; el('status').className='status err'; message('Status error: '+e.message,'err'); }
  }
  async function refreshAll(){
    await refreshStatus();
    await refreshFiles();
    message('Panel refreshed.','ok');
  }
  async function saveSettings(){
    const quality=el('quality').value;
    const recordSeconds=Number(el('recordSeconds').value);
    const warmupSeconds=Number(el('warmupSeconds').value);
    if(!APP.qualityPresets[quality]){message('Choose a valid quality.','err');return;}
    if(!Number.isFinite(recordSeconds) || recordSeconds < 1 || recordSeconds > 3600){message('Seconds must be between 1 and 3600.','err');return;}
    if(!Number.isFinite(warmupSeconds) || warmupSeconds < 0 || warmupSeconds > 30){message('Warmup must be between 0 and 30 seconds.','err');return;}
    saveLocalSettings();
    try{
      const d=await api('/api/settings',{method:'POST',body:{quality:quality,recordSeconds:recordSeconds,warmupMs:Math.round(warmupSeconds*1000)}});
      message('Settings saved: '+d.settings.quality+' · '+d.settings.width+'×'+d.settings.height+' · '+d.settings.recordSeconds+'s · warmup '+Math.round(d.settings.warmupMs/1000)+'s.','ok');
    }catch(e){message('Save settings failed: '+e.message,'err');}
  }
  async function start(){
    if(state.busy) return;
    const urls=validateUrls(getUrls());
    if(!urls.length){message('Paste at least one URL into the panel first.','err');return;}
    const quality=el('quality').value;
    const recordSeconds=Number(el('recordSeconds').value);
    const warmupSeconds=Number(el('warmupSeconds').value);
    if(!APP.qualityPresets[quality]){message('Choose a valid quality.','err');return;}
    if(!Number.isFinite(recordSeconds) || recordSeconds < 1 || recordSeconds > 3600){message('Seconds must be between 1 and 3600.','err');return;}
    if(!Number.isFinite(warmupSeconds) || warmupSeconds < 0 || warmupSeconds > 30){message('Warmup must be between 0 and 30 seconds.','err');return;}
    setBusy(true,'starting');
    message('Starting '+urls.length+' URL(s) at '+quality+'…');
    try{
      const d=await api('/api/start',{method:'POST',body:{urls:urls,quality:quality,recordSeconds:recordSeconds,warmupMs:Math.round(warmupSeconds*1000)}});
      message('Recording started with exactly '+d.urls.length+' panel URL(s) at '+d.settings.quality+' · '+d.settings.width+'×'+d.settings.height+' · warmup '+Math.round(d.settings.warmupMs/1000)+'s.','ok');
      saveLocalSettings();
      await refreshStatus();
    }catch(e){message('Start failed: '+e.message,'err');}
    finally{
      state.busy=false;
      el('startBtn').disabled=false;
      await refreshStatus();
    }
  }
  function applyWispbytePreset(){
    const p=APP.sitePresets.wispbyte;
    setUrls([p.url]);
    el('quality').value=p.quality;
    el('recordSeconds').value=String(p.recordSeconds);
    el('warmupSeconds').value=String(Math.round(p.warmupMs/1000));
    saveLocalSettings();
    message('Wispbyte preset applied: '+p.url+' · '+p.quality+' · '+p.recordSeconds+'s · '+Math.round(p.warmupMs/1000)+'s warmup. Click Start Recording when ready.','ok');
  }
  async function stop(){
    if(state.busy) return;
    const btn=el('startBtn');
    state.busy=true;
    if(btn){
      btn.dataset.stopping='1';
      btn.disabled=true;
      btn.textContent='Stopping…';
      btn.classList.add('recording-stop');
    }
    try{
      message('Stopping recording…');
      const d=await api('/api/stop',{method:'POST'});
      message(d.message || (d.stopped?'Stop requested.':'Recorder is not running.'),d.stopped?'ok':'');
      await refreshStatus();
    }catch(e){
      message('Stop failed: '+e.message,'err');
    }finally{
      state.busy=false;
      if(btn){btn.dataset.stopping='0';btn.disabled=false;}
      await refreshStatus();
    }
  }
  async function saveUrls(){
    try{
      const d=await api('/api/urls',{method:'POST',body:{text:el('urls').value}});
      setUrls(d.urls || []);
      message('Saved '+(d.urls || []).length+' URL(s) to urls.txt.','ok');
    }catch(e){message('Save URL list failed: '+e.message,'err');}
  }
  async function loadUrls(){
    try{
      const d=await api('/api/urls');
      setUrls(d.urls || []);
      message('Loaded '+(d.urls || []).length+' URL(s) from urls.txt.','ok');
    }catch(e){message('Load urls.txt failed: '+e.message,'err');}
  }
  async function addUrl(){
    const value=el('newUrl').value.trim();
    if(!value){message('Enter a URL first.','err');return;}
    try{
      const one=validateUrls([value])[0];
      const urls=getUrls();
      if(!urls.includes(one)) urls.push(one);
      const checked=validateUrls(urls);
      setUrls(checked);
      el('newUrl').value='';
      await saveUrls();
      message('URL added and saved. Total: '+checked.length+'.','ok');
    }catch(e){message('Add URL failed: '+e.message,'err');}
  }
  function clearPanel(){
    setUrls([]);
    el('newUrl').value='';
    message('Panel URL box cleared. Saved urls.txt was not changed.','ok');
  }
  async function clearSaved(){
    try{
      const d=await api('/api/urls',{method:'DELETE'});
      setUrls([]);
      el('newUrl').value='';
      message('Saved urls.txt cleared.','ok');
    }catch(e){message('Clear saved list failed: '+e.message,'err');}
  }
  function selectAll(){document.querySelectorAll('.filecheck').forEach(function(x){x.checked=true;});message('Selected '+document.querySelectorAll('.filecheck').length+' recording(s).','ok');}
  async function deleteOne(key){
    if(!key)return;
    if(!window.confirm('Delete this recording from Backblaze B2?\\n\\n'+key))return;
    try{await api('/api/delete',{method:'POST',body:{key:key}});message('Deleted recording.','ok');await refreshFiles();}
    catch(e){message('Delete failed: '+e.message,'err');}
  }
  async function deleteSelected(){
    const keys=[].slice.call(document.querySelectorAll('.filecheck:checked')).map(function(x){return x.value;});
    if(!keys.length){message('Select at least one recording.','err');return;}
    if(!window.confirm('Delete '+keys.length+' selected recording(s)?'))return;
    try{const d=await api('/api/delete-many',{method:'POST',body:{keys:keys}});message('Deleted '+(d.deleted || keys).length+' recording(s).','ok');await refreshFiles();}
    catch(e){message('Bulk delete failed: '+e.message,'err');}
  }
  function clearMessage(){message('Ready.','ok');}
  function wire(){
    el('startBtn').addEventListener('click',function(){
      if(state.busy) return;
      const running = el('startBtn').classList.contains('recording-stop');
      if(running) stop(); else start();
    });
    el('stopBtn').addEventListener('click',stop);
    el('refreshBtn').addEventListener('click',refreshAll);
    el('saveSettingsBtn').addEventListener('click',saveSettings);
    el('saveScheduleBtn').addEventListener('click',saveSchedule);
    el('scheduleEnabled').addEventListener('change',markScheduleDirty);
    el('scheduleStart').addEventListener('input',markScheduleDirty);
    el('scheduleEnd').addEventListener('input',markScheduleDirty);
    el('scheduleTimeZone').addEventListener('input',markScheduleDirty);
    el('wispbytePresetBtn').addEventListener('click',applyWispbytePreset);
    el('addUrlBtn').addEventListener('click',addUrl);
    el('saveUrlsBtn').addEventListener('click',saveUrls);
    el('loadUrlsBtn').addEventListener('click',loadUrls);
    el('clearPanelBtn').addEventListener('click',clearPanel);
    el('clearSavedBtn').addEventListener('click',clearSaved);
    el('selectAllBtn').addEventListener('click',selectAll);
    el('deleteSelectedBtn').addEventListener('click',deleteSelected);
    el('clearMessageBtn').addEventListener('click',clearMessage);
    bindPreviewInteractionToggle();
    el('files').addEventListener('click',function(e){const b=e.target.closest('.deleteOne');if(b)deleteOne(b.dataset.key);});
    el('urls').addEventListener('input',updateUrlCount);
    el('quality').addEventListener('change',saveLocalSettings);
    el('recordSeconds').addEventListener('input',saveLocalSettings);
    el('newUrl').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();addUrl();}});
  }
  async function init(){
    try{
      wire();
      message('Connecting…');
      const boot = await api('/api/bootstrap');
      APP = boot;
      // Populate the controls from server state first.
      const serverSettings = APP.settings || {};
      if(serverSettings.quality && APP.qualityPresets[serverSettings.quality]) el('quality').value=serverSettings.quality;
      if(serverSettings.recordSeconds != null) el('recordSeconds').value=String(serverSettings.recordSeconds);
      if(serverSettings.warmupMs != null) el('warmupSeconds').value=String(Math.round(serverSettings.warmupMs/1000));
      applyScheduleUI(APP.schedule || serverSettings.schedule || {}, true);
      if(!el('scheduleTimeZone').value) el('scheduleTimeZone').value=detectTimeZone();
      setUrls(APP.initialUrls || []);
      // Then apply browser-local choices when present.
      const q=localStorage.getItem('pella.quality');
      if(q && APP.qualityPresets[q]) el('quality').value=q;
      const secs=localStorage.getItem('pella.recordSeconds');
      if(secs) el('recordSeconds').value=secs;
      const warm=localStorage.getItem('pella.warmupSeconds');
      if(warm) el('warmupSeconds').value=warm;
      updateQualityUI();
      updateUrlCount();
      await refreshStatus();
      await refreshFiles();
      state.refreshTimer=setInterval(refreshStatus,1500);
      state.fileTimer=setInterval(refreshFiles,30000);
      message('Ready.','ok');
    }catch(e){
      console.error(e);
      el('status').textContent='Panel error: '+e.message;
      el('status').className='status err';
      message('Panel initialization failed: '+e.message,'err');
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
