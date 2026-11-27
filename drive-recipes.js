'use strict';

function createDriveCollection({kind, folderTag, folderName, label, prefix, validRecord, modeKey}) {
 const tombstone = 'deleted';
 const pending = new Map();
 let events = new Map();
 let owner = '';
 let folder = {};
 let enabled = false;
 let ready = false;
 let session = 0;
 if (modeKey) {
  try { enabled = localStorage.getItem(modeKey) === 'drive'; } catch {}
 }

 function reset() {
  session++;
  events = new Map();
  ready = false;
 }
 document.addEventListener('ange-drive-session', reset);

 function requireSession(expected) {
  if (expected !== session) throw new Error('Google Driveに再接続し、もう一度お試しください。');
 }

 function asEvent(file) {
  const props = file.appProperties;
  if (props?.angeType !== kind || !props.recipe || !file.id || !Number.isFinite(Date.parse(file.createdTime))) {
   throw new Error('Driveの' + label + 'を読み取れませんでした。');
  }
  return {id:file.id, key:props.recipe, revision:props.revision || file.id,
   parent:props.parent, removed:props.status === tombstone, updated:file.createdTime};
 }

 function heads(key, source = events) {
  const matching = [...source.values()].filter(event => event.key === key);
  const parents = new Set(matching.map(event => event.parent));
  const unique = new Map(matching.map(event => [event.revision, event]));
  return [...unique.values()].filter(event => !parents.has(event.revision));
 }

 async function apiForUser() {
  const client = window.angeDriveConnection.api();
  const expected = session;
  const id = await client.userId();
  requireSession(expected);
  if (owner !== id) {
   owner = id;
   events = new Map();
   pending.clear();
   folder = {};
  }
  return {client, expected};
 }

 async function refresh({client, expected}) {
  const next = new Map(events);
  let token;
  do {
   const page = await client.fileList(kind, token);
   if (page.incompleteSearch) throw new Error('Driveの' + label + 'をすべて検索できませんでした。再試行してください。');
   for (const file of page.files ?? []) {
    const event = asEvent(file);
    if (!next.get(event.id)?.record) next.set(event.id, event);
   }
   token = page.nextPageToken;
  } while (token);

  const keys = new Set([...next.values()].map(event => event.key));
  const unread = [...keys].flatMap(key => heads(key, next)).filter(event => !event.removed && !event.record);
  for (let i = 0; i < unread.length; i += 6) {
   await Promise.all(unread.slice(i, i + 6).map(async event => {
    const data = await client.readJson(event.id);
    if (data?.format !== kind || data.key !== event.key || !validRecord(data.record)) {
     throw new Error('保存された' + label + 'の形式を確認できませんでした。');
    }
    event.record = data.record;
   }));
  }
  requireSession(expected);
  events = next;
  ready = true;
 }

 function list() {
  if (!ready || !window.angeDriveConnection.connected()) return [];
  const keys = new Set([...events.values()].map(event => event.key));
  return [...keys].flatMap(key => {
   const versions = heads(key);
   return versions.filter(event => event.record && !event.removed).map(event => ({
    ...event.record, id:key, _driveRevision:event.revision, _driveUpdated:event.updated,
    _driveOwner:owner, _driveConflict:versions.filter(version => !version.removed).length > 1,
   }));
  }).sort((a,b) => b._driveUpdated.localeCompare(a._driveUpdated));
 }

 async function append(context, payload, revision, saveKey) {
  const {client, expected} = context;
  let upload = pending.get(saveKey);
  if (!upload) {
   const id = await client.newFileId();
   requireSession(expected);
   upload = {id, key:payload.key || prefix + '-' + id, createdAt:new Date().toISOString()};
   pending.set(saveKey, upload);
  }
  if (!folder.id) folder.id = await client.findOrCreateFolder(folder, folderTag, folderName);
  requireSession(expected);
  const data = {...payload, key:upload.key};
  const appProperties = {angeType:kind, recipe:upload.key};
  if (revision) appProperties.revision = revision;
  if (payload.parent) appProperties.parent = payload.parent;
  if (payload.removed) appProperties.status = tombstone;
  await client.uploadJson({
   id:upload.id, name:prefix + '-' + upload.id + '.json', mimeType:'application/json',
   parents:[folder.id], appProperties,
  }, data);
  const stored = await client.readJson(upload.id);
  if (canonical(stored) !== canonical(data)) throw new Error('Driveに保存した内容を確認できませんでした。再試行してください。');
  requireSession(expected);
  events.set(upload.id, {id:upload.id, key:upload.key, revision:revision || upload.id, parent:payload.parent,
   removed:payload.removed, record:payload.record, updated:upload.createdAt});
  pending.delete(saveKey);
 }

 function canonical(value) {
  return JSON.stringify(value, (key, item) => {
   if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
   return Object.fromEntries(Object.keys(item).sort().map(name => [name,item[name]]));
  });
 }

 function publicRecord(source) {
  const {_key,_i,_driveRevision,_driveUpdated,_driveOwner,_driveConflict,id,...record} = source;
  return id || prefix !== 'recipe' ? record : {...record, legacyRecipeKey:_key + '::' + _i};
 }

 async function save(record, source, removed = false) {
  const context = await apiForUser();
  if (source && source._driveOwner !== owner) throw new Error('編集元のGoogleアカウントで接続し直してください。');
  const payload = {format:kind, key:source?.id ?? null, parent:source?._driveRevision ?? null,
   removed, record:removed ? null : record};
  const saveKey = canonical(payload);
  await refresh(context);
  if (source && !heads(source.id).some(event => event.revision === source._driveRevision) && !pending.has(saveKey)) {
   throw new Error('この' + label + 'は別の端末で更新されました。最新の一覧から開き直してください。');
  }
  await append(context, payload, null, saveKey);
 }

 async function hashRecord(record) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(record)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2,'0')).join('');
 }

 async function migrate(records) {
  const prepared = records.map(source => ({id:source.id, record:publicRecord(source)}));
  if (prepared.some(({record}) => !validRecord(record))) {
   throw new Error('取り込み元に読み取れない' + label + 'があります。元のデータをご確認ください。');
  }
  const context = await apiForUser();
  await refresh(context);
  let count = 0;
  for (const {id,record} of prepared) {
   const fingerprint = await hashRecord(record);
   const key = typeof id === 'string' && /^[a-z0-9_-]{1,90}$/i.test(id) ? id : 'legacy-' + fingerprint;
   const revision = 'import-' + fingerprint;
   if ([...events.values()].some(event => event.key === key && event.revision === revision)) continue;
   const payload = {format:kind,key,parent:null,removed:false,record};
   await append(context,payload,revision,canonical(payload));
   count++;
  }
  return count;
 }

 return {
  get enabled() { return enabled; },
  get ready() { return ready && window.angeDriveConnection.connected(); },
  activate() {
   if (modeKey) localStorage.setItem(modeKey,'drive');
   enabled = true;
  },
  list, save, migrate,
  contains(id) { return !!id && [...events.values()].some(event => event.key === id); },
  async load() { await refresh(await apiForUser()); },
 };
}

const isDriveRecord = value => value && typeof value === 'object' && !Array.isArray(value);

window.angeDriveRecipes = createDriveCollection({
 kind:'ange-pizza-lab-recipe-v1', folderTag:'ange-pizza-lab-recipe-folder',
 folderName:'Ange Pizza Lab - レシピ帳', label:'レシピ', prefix:'recipe', modeKey:'ange-drive-recipe-book',
 validRecord:record => typeof record?.name === 'string' && record.name.trim() && isDriveRecord(record.state),
});
window.angeDriveNotes = createDriveCollection({
 kind:'ange-pizza-lab-note-v1', folderTag:'ange-pizza-lab-note-folder',
 folderName:'Ange Pizza Lab - 仕込み記録', label:'仕込み記録', prefix:'note',
 validRecord:record => typeof record?.recipeName === 'string' && isDriveRecord(record.inputs) &&
  (record.stages === undefined || Array.isArray(record.stages)),
});
