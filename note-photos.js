'use strict';

function createNotePhotoEditor(prefix, agenda) {
 const slots = [['before','焼成前'],['after','焼成後'],['section','断面']];
 const folderTag = 'ange-pizza-lab-note-photo-folder';
 const fileTag = 'ange-pizza-lab-note-photo-v1';
 const root = document.getElementById(prefix + 'PhotoSlots');
 const heading = document.getElementById(prefix + 'Photos');
 const help = document.getElementById(prefix + 'PhotosHelp');
 const status = document.getElementById(prefix + 'PhotoStatus');
 const connection = window.angeDriveConnection;
 const displays = new Map();
 const historyDisposers = new Set();
 let selections = new Map();
 let enabled = false;
 let saving = false;
 let processing = 0;
 let formVersion = 0;
 let sessionVersion = 0;
 let destination = {};
 let agendaDraft = null;
 const draftKey = 'ange-agenda-photo-cache';
 let changed = () => {};

 function element(tag, label) {
  const output = document.createElement(tag);
  if (label) output.textContent = label;
  return output;
 }

 function button(label, action) {
  const control = element('button',label);
  control.type = 'button';
  control.className = 'quiet';
  control.onclick = action;
  return control;
 }

 function reference(value) {
  return value && typeof value.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value.id) &&
   /^[a-f0-9]{64}$/.test(value.sha256);
 }

 function readRefs(value) {
  return Object.fromEntries(slots.filter(([key])=>reference(value?.[key])).map(([key])=>[key,value[key]]));
 }

 function clearDisplays() {
  for (const url of displays.values()) URL.revokeObjectURL(url);
  displays.clear();
 }

 function clearHistory() {
  for (const dispose of historyDisposers) dispose();
  historyDisposers.clear();
 }

 function setEnabled(value) {
  if (enabled === value) return;
  enabled = value;
  render();
 }

 function reset(refs) {
  formVersion++;
  processing = 0;
  clearDisplays();
  selections = new Map(Object.entries(readRefs(refs)).map(([key,ref])=>[key,{ref}]));
  status.textContent = '';
  render();
 }

 function render() {
  heading.hidden = !enabled && !agenda;
  if (!enabled && !agenda) return;
  const connected = connection.connected();
  help.textContent = !enabled ? 'Driveのレシピ帳を有効にすると写真を追加できます。'
   : !connected ? '写真の追加・差し替えにはGoogle Driveへの接続が必要です。'
   : agenda ? '撮った写真はDriveに保存し、Diarioの仕込み記録へ引き継ぎます。'
   : '写真の差し替えや取り外しは、仕込み記録を保存すると反映されます。';
  root.replaceChildren();
  for (const [key,label] of slots) {
   const selection = selections.get(key);
   const card = element('div');
   card.className = 'note-photo-slot';
   card.append(element('strong',label));
   const url = displays.get(key);
   if (url) {
    const image = element('img');
    image.src = url;
    image.alt = label;
    card.append(image);
   } else {
    card.append(element('small',selection?.ref ? '保存済み' : '未登録'));
   }
   const controls = element('div');
   controls.className = 'actions';
   if (enabled && connected) {
    const sources = agenda ? [['撮影',true],['写真を選ぶ',false]] : [['写真を選ぶ',false]];
    for (const [action,capture] of sources) {
     const input = element('input');
     input.type = 'file';
     input.accept = 'image/*';
     input.hidden = true;
     if (capture) input.setAttribute('capture','environment');
     input.onchange = () => {
      const [file] = input.files;
      if (file) select(key, file);
     };
     const pick = button(action,()=>input.click());
     pick.setAttribute('aria-label', label + 'の' + action);
     pick.disabled = saving || !!processing;
     controls.append(pick,input);
    }
    if (selection) {
     const remove = button('削除',()=>{
      if (url) URL.revokeObjectURL(url);
      displays.delete(key);
      selections.delete(key);
      if (agenda) cacheAgenda();
      changed();
      render();
     });
     remove.setAttribute('aria-label', label + 'の写真を削除');
     remove.disabled = saving || !!processing;
     controls.append(remove);
    }
   }
   card.append(controls);
   root.append(card);
  }
  if (agenda && enabled && connected && !saving && !processing &&
      [...selections.values()].some(entry=>entry.blob)) root.append(button('写真の保存を再試行',saveAgendaPhotos));
 }

 async function compress(file) {
  const url = URL.createObjectURL(file);
  try {
   const image = element('img');
   await new Promise((resolve,reject)=>{
    image.onload = resolve;
    image.onerror = () => reject(new Error('この画像は開けませんでした。JPEGなどの画像を選んでください。'));
    image.src = url;
   });
   const scale = Math.min(1,1440 / Math.max(image.naturalWidth,image.naturalHeight));
   const canvas = element('canvas');
   canvas.width = Math.max(1,Math.round(image.naturalWidth * scale));
   canvas.height = Math.max(1,Math.round(image.naturalHeight * scale));
   const ctx = canvas.getContext('2d');
   if (!ctx) throw new Error('写真を変換できませんでした。');
   ctx.fillStyle = '#ffffff';
   ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(image,0,0,canvas.width,canvas.height);
   for (const quality of [.84,.68,.50]) {
    const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if (blob?.type === 'image/jpeg' && blob.size && blob.size <= 1000000) return blob;
   }
   throw new Error('写真の容量を小さくできませんでした。');
  } finally {
   URL.revokeObjectURL(url);
  }
 }

 async function digest(blob) {
  const bytes = await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 }

 async function select(key,file) {
  const version = formVersion;
  processing++;
  let selected = false;
  status.textContent = '写真を準備しています…';
  render();
  try {
   const blob = await compress(file);
   const sha256 = await digest(blob);
   if (version !== formVersion) return;
   if (displays.has(key)) URL.revokeObjectURL(displays.get(key));
   displays.set(key,URL.createObjectURL(blob));
   selections.set(key,{blob,sha256,uploads:new Map()});
   selected = true;
   status.textContent = '';
  } catch (error) {
   if (version === formVersion) status.textContent = error.message;
  } finally {
   if (version === formVersion) {
    processing--;
    changed();
    render();
   }
  }
  if (selected && agenda && version === formVersion) await saveAgendaPhotos();
 }

 function checkSession(session,form) {
  if (session !== sessionVersion || form !== formVersion) throw new Error('接続または編集中の記録が変わりました。もう一度保存してください。');
 }

 async function save(expectedOwner) {
  if (processing) throw new Error('写真の準備が完了してから保存してください。');
  const form = formVersion;
  const pending = [...selections.entries()].filter(([,entry])=>entry.blob);
  const refs = readRefs(Object.fromEntries([...selections].map(([key,entry])=>[key,entry.ref])));
  if (!pending.length) return {refs,owner:expectedOwner};
  const session = sessionVersion;
  const api = connection.api();
  saving = true;
  changed();
  status.textContent = '写真をDriveに保存しています…';
  render();
  try {
   const owner = await api.userId();
   checkSession(session,form);
   if (expectedOwner && owner !== expectedOwner) throw new Error('仕込み記録を編集したGoogleアカウントで接続してください。');
   if (destination.owner !== owner) destination = {owner};
   destination.id ??= await api.findOrCreateFolder(destination,folderTag,'Ange Pizza Lab - 写真');
   const folder = destination.id;
   checkSession(session,form);
   for (const [key,entry] of pending) {
    let id = entry.uploads.get(owner);
    if (!id) {
     id = await api.newFileId();
     checkSession(session,form);
     entry.uploads.set(owner,id);
    }
    await api.uploadPhoto({
     id,name:'Diario-' + key + '-' + id + '.jpg', mimeType:'image/jpeg',parents:[folder],
     appProperties:{angeType:fileTag},
    },entry.blob);
    const verified = await api.readPhoto(id);
    if (verified.type !== 'image/jpeg' || await digest(verified) !== entry.sha256) {
     throw new Error('写真をDriveから読み戻せませんでした。もう一度保存してください。');
    }
    checkSession(session,form);
    refs[key] = {id,sha256:entry.sha256};
   }
   status.textContent = '';
   return {refs,owner};
  } finally {
   saving = false;
   changed();
   if (form === formVersion) {
    if (status.textContent === '写真をDriveに保存しています…') status.textContent = '';
    render();
   }
  }
 }


 function loadAgenda(key, onChange) {
  changed = onChange;
  if (agendaDraft?.key === key) return;
  let cached;
  try { cached = JSON.parse(localStorage.getItem(draftKey)); } catch {}
  agendaDraft = {key,owner:cached?.key === key ? cached.owner : undefined};
  reset(cached?.key === key ? cached.refs : undefined);
 }

 function cacheAgenda() {
  if (!agendaDraft) return;
  const refs = readRefs(Object.fromEntries([...selections].map(([key,entry])=>[key,entry.ref])));
  try {
   if (Object.keys(refs).length) localStorage.setItem(draftKey,JSON.stringify({...agendaDraft,refs}));
   else localStorage.removeItem(draftKey);
  } catch {}
 }

 async function saveAgendaPhotos() {
  const form = formVersion;
  try {
   const {refs,owner} = await save(agendaDraft.owner);
   for (const [key,ref] of Object.entries(refs)) selections.set(key,{ref});
   agendaDraft.owner = owner;
   cacheAgenda();
   status.textContent = '写真をDriveに保存しました。';
  } catch (error) {
   if (form !== formVersion) return;
   connection.expireIfUnauthorized(error);
   status.textContent = error.message + ' 写真はこの画面に残っています。';
  }
  changed();
  render();
 }

 function readyForHandoff() { return !saving && !processing; }
 function hasPhotos() { return selections.size > 0; }
 function snapshot() {
  return {key:agendaDraft?.key, owner:agendaDraft?.owner, photos:new Map(selections)};
 }
 function accept(snapshot) {
  reset();
  selections = new Map(snapshot.photos);
  render();
 }
 function matches(snapshot) {
  return agendaDraft?.key === snapshot.key && selections.size === snapshot.photos.size &&
   [...selections].every(([key,entry])=>entry === snapshot.photos.get(key));
 }
 function finishAgenda(snapshot) {
  if (!matches(snapshot)) return;
  reset();
  agendaDraft.owner = undefined;
  cacheAgenda();
  changed();
 }

 function history(photos) {
  const refs = readRefs(photos);
  if (!Object.keys(refs).length) return null;
  const group = element('details');
  group.append(element('summary','仕込み写真'));
  const list = element('div');
  list.className = 'note-photo-grid';
  group.append(list);
  const urls = [];
  const dispose = () => {
   for (const url of urls.splice(0)) URL.revokeObjectURL(url);
   list.replaceChildren();
  };
  historyDisposers.add(dispose);
  let requestVersion = 0;
  group.addEventListener('toggle',async ()=>{
   const current = ++requestVersion;
   dispose();
   if (!group.open || !group.isConnected) return;
   const session = sessionVersion;
   const available = connection.connected();
   await Promise.all(slots.filter(([key])=>refs[key]).map(async ([key,label])=>{
    const figure = element('figure');
    figure.className = 'note-photo-slot';
    const feedback = element('small',available ? '読み込み中…' : 'Driveに接続すると表示できます');
    figure.append(element('figcaption',label),feedback);
    list.append(figure);
    if (!available) return;
    try {
     const blob = await connection.api().readPhoto(refs[key].id);
     if (blob.type !== 'image/jpeg' || await digest(blob) !== refs[key].sha256) throw new Error('写真が一致しません。');
     if (!group.isConnected || current !== requestVersion || session !== sessionVersion) return;
     const url = URL.createObjectURL(blob);
     urls.push(url);
     const image = element('img');
     image.src = url;
     image.alt = label;
     feedback.replaceWith(image);
    } catch (error) {
     if (session !== sessionVersion || current !== requestVersion) return;
     connection.expireIfUnauthorized(error);
     feedback.textContent = '写真を表示できませんでした。';
    }
   }));
  });
  return group;
 }

 document.addEventListener('ange-drive-session',()=>{
  sessionVersion++;
  clearHistory();
  render();
 });
 return {setEnabled,reset,save,history,clearHistory,loadAgenda,snapshot,accept,
  readyForHandoff,hasPhotos,finishAgenda};
}

window.angeNotePhotos = createNotePhotoEditor('note',false);
window.angeAgendaPhotos = createNotePhotoEditor('agenda',true);
