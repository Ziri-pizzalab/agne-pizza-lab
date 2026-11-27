'use strict';

(() => {
 const scope = 'https://www.googleapis.com/auth/drive.file';
 const api = 'https://www.googleapis.com/drive/v3';
 const upload = 'https://www.googleapis.com/upload/drive/v3';
 const folderTag = 'ange-pizza-lab-drive-check-folder';
 const sampleTag = 'ange-pizza-lab-drive-check-sample';
 const sampleType = 'ange-pizza-lab-drive-check';
 const folderMime = 'application/vnd.google-apps.folder';
 const field = id => document.getElementById(id);

 function createApi(accessToken, fetcher = fetch) {
  async function request(url, options = {}, parse = response => response.json()) {
   let response;
   try {
    response = await fetcher(url, {
     ...options,
     headers:{...options.headers, Authorization:'Bearer ' + accessToken},
     signal:AbortSignal.timeout(15000),
    });
   } catch {
    throw new Error('通信結果を確認できませんでした。接続を確認して再試行してください。');
   }
   if (response.ok) return parse(response);
   const messages = {
    401:'Googleの接続期限が切れました。再接続してから再試行してください。',
    403:'Google Driveへのアクセスが許可されていません。権限や利用アカウントを確認してください。',
    404:'対象のファイルが見つかりません。同じGoogleアカウントで接続しているか確認してください。',
    429:'Google Driveが混み合っています。少し時間をおいて再試行してください。',
   };
   const error = new Error(messages[response.status] ?? 'Google Driveから処理結果を確認できませんでした。再試行してください。');
   error.status = response.status;
   throw error;
  }

  function fileList(tag, pageToken = '') {
   const params = new URLSearchParams({
    q:"trashed = false and appProperties has { key='angeType' and value='" + tag + "' }",
    orderBy:'createdTime desc',
    fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,createdTime,appProperties)',
    pageSize:'100',
   });
   if (pageToken) params.set('pageToken', pageToken);
   return request(api + '/files?' + params);
  }

  async function newFileId() {
   const {ids} = await request(api + '/files/generateIds?count=1&space=drive');
   if (!ids?.[0]) throw new Error('Google DriveでファイルIDを取得できませんでした。');
   return ids[0];
  }

  async function findOrCreateFolder(sample, tag = folderTag, name = 'Ange Pizza Lab - 接続テスト') {
   const {files} = await fileList(tag);
   const folder = files.find(file => file.mimeType === folderMime);
   if (folder) return folder.id;
   sample.newFolderId ??= await newFileId();
   const id = sample.newFolderId;
   try {
    await request(api + '/files?fields=id', {
     method:'POST',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({id,name,mimeType:folderMime,appProperties:{angeType:tag}}),
    });
   } catch (error) {
    if (error.status !== 409) throw error;
    const existing = await request(api + '/files/' + encodeURIComponent(id) + '?fields=mimeType,appProperties,trashed');
    if (existing.trashed || existing.mimeType !== folderMime || existing.appProperties?.angeType !== tag) throw error;
   }
   return id;
  }

  async function createSample() {
   return {id:await newFileId(),data:{type:sampleType,version:1,createdAt:new Date().toISOString(),message:'接続確認用サンプル'}};
  }

  async function readSample(id) {
   const data = await request(api + '/files/' + encodeURIComponent(id) + '?alt=media');
   if (data.type !== sampleType || data.version !== 1 || !Number.isFinite(Date.parse(data.createdAt))) {
    throw new Error('接続テスト用のデータ形式を確認できませんでした。');
   }
   return {id,data};
  }

  function readJson(id) {
   return request(api + '/files/' + encodeURIComponent(id) + '?alt=media');
  }

  async function uploadJson(metadata, data) {
   const boundary = 'ange-' + crypto.randomUUID();
   const body = [
    '--' + boundary, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(metadata),
    '--' + boundary, 'Content-Type: application/json', '', JSON.stringify(data),
    '--' + boundary + '--','',
   ].join('\r\n');
   try {
    await request(upload + '/files?uploadType=multipart&fields=id', {
     method:'POST',
     headers:{'Content-Type':'multipart/related; boundary=' + boundary},
     body,
    });
   } catch (error) {
    // Retrying the same generated ID can return 409 after a successful first upload.
    if (error.status !== 409) throw error;
   }
  }

  function readPhoto(id) {
   return request(api + '/files/' + encodeURIComponent(id) + '?alt=media', {}, response => response.blob());
  }

  async function uploadPhoto(metadata, photo) {
   const boundary = 'ange-' + crypto.randomUUID();
   const headers = ['--' + boundary, 'Content-Type: application/json; charset=UTF-8', '',
    JSON.stringify(metadata), '--' + boundary, 'Content-Type: image/jpeg', '', ''].join('\r\n');
   const body = new Blob([headers, photo, '\r\n--' + boundary + '--\r\n']);
   try {
    await request(upload + '/files?uploadType=multipart&fields=id', {
     method:'POST', headers:{'Content-Type':'multipart/related; boundary=' + boundary}, body,
    });
   } catch (error) {
    if (error.status !== 409) throw error;
   }
  }

  async function writeSample(sample, folderId) {
   await uploadJson({
    id:sample.id,
    name:'Driveテスト-' + sample.data.createdAt.replaceAll(':','-') + '.json',
    mimeType:'application/json',
    parents:[folderId],
    appProperties:{angeType:sampleTag},
   },sample.data);
   const result = await readSample(sample.id);
   if (result.data.createdAt !== sample.data.createdAt || result.data.message !== sample.data.message) {
    throw new Error('読み戻したテストデータが送信内容と一致しません。');
   }
   return result;
  }

  async function readLatestSample() {
   const {files} = await fileList(sampleTag);
   return files.length ? readSample(files[0].id) : null;
  }
  async function userId() {
   const {user} = await request(api + '/about?fields=user(permissionId)');
   if (!user?.permissionId) throw new Error('接続先のGoogleアカウントを確認できませんでした。');
   return user.permissionId;
  }
  return {userId,findOrCreateFolder,createSample,writeSample,readLatestSample,fileList,newFileId,readJson,uploadJson,readPhoto,uploadPhoto};
 }

 const dialog = field('driveCheckDialog');
 let accessToken = '';
 let expiresAt = 0;
 let busy = false;
 let connectionAttempt = 0;
 let sdk;
 let pending;
 const input = field('driveClientId');
 const status = field('driveCheckStatus');
 try { input.value = localStorage.getItem('ange-drive-client-id') ?? ''; } catch {}
 const output = field('driveCheckResult');

 function updateButtons() {
  const connected = !!accessToken && Date.now() < expiresAt;
  field('driveConnect').disabled = busy;
  field('driveWriteSample').disabled = busy || !connected;
  field('driveReadSample').disabled = busy || !connected;
  field('driveDisconnect').hidden = !accessToken;
  field('driveDisconnect').disabled = busy;
  input.disabled = busy || !!accessToken;
  field('closeDriveCheck').disabled = busy;
 }

 function loadGoogleSdk() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  sdk ??= new Promise((resolve,reject) => {
   const script = document.createElement('script');
   script.src = 'https://accounts.google.com/gsi/client';
   script.async = true;
   script.onload = resolve;
   script.onerror = () => {
    script.remove();
    sdk = undefined;
    reject(new Error('Googleの接続画面を読み込めませんでした。再試行してください。'));
   };
   document.head.append(script);
  });
  return sdk;
 }

 function disconnect() {
  accessToken = '';
  expiresAt = 0;
  pending = undefined;
  busy = false;
  connectionAttempt++;
  output.textContent = '';
  status.textContent = 'Google Driveに接続していません。';
  document.dispatchEvent(new Event('ange-drive-session'));
  updateButtons();
 }

 async function connect() {
  const client_id = input.value.trim();
  if (!/^[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(client_id)) {
   status.textContent = 'Google OAuthのウェブ用クライアントIDを入力してください。';
   input.focus();
   return;
  }
  if (!window.google?.accounts?.oauth2) {
   status.textContent = 'Googleの接続画面を読み込み中です。読み込み後にもう一度押してください。';
   try {
    await loadGoogleSdk();
    if (dialog.open) status.textContent = '「Google Driveに接続」を押してください。';
   } catch (error) {
    if (dialog.open) status.textContent = error.message;
   }
   return;
  }
  const attempt = ++connectionAttempt;
  const reconnecting = !!accessToken;
  busy = true;
  updateButtons();
  status.textContent = 'Googleでアカウントと権限を確認してください。';
  const finish = (message, response) => {
   if (attempt !== connectionAttempt || !dialog.open) return;
   if (response) {
    accessToken = response.access_token;
    expiresAt = Date.now() + Math.max(0,Number(response.expires_in) - 15) * 1000;
    if (!reconnecting) pending = undefined;
    try { localStorage.setItem('ange-drive-client-id', client_id); } catch {}
    document.dispatchEvent(new Event('ange-drive-session'));
   }
   busy = false;
   status.textContent = message;
   updateButtons();
  };
  try {
   const oauth = window.google.accounts.oauth2;
   const client = oauth.initTokenClient({
    client_id,scope,include_granted_scopes:false,
    callback(response) {
     if (response.error || !response.access_token || !oauth.hasGrantedAllScopes(response,scope)) {
      finish('Google Driveへの接続を完了できませんでした。');
      return;
     }
     finish('Google Driveに接続しました。',response);
    },
    error_callback() { finish('Googleの接続画面を開けなかったか、途中で閉じられました。'); },
   });
   client.requestAccessToken({prompt:reconnecting ? '' : 'select_account'});
  } catch {
   finish('Googleの接続画面を開けませんでした。クライアントIDとサイトの設定を確認してください。');
  }
 }

 function showSample(sample) {
  const date = new Intl.DateTimeFormat('ja-JP',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Tokyo'}).format(new Date(sample.data.createdAt));
  output.textContent = '記録日時 ' + date + '\nテストID ' + sample.id;
 }

 async function checkDrive(write) {
  if (busy) return;
  if (!accessToken || Date.now() >= expiresAt) {
   status.textContent = 'Google Driveへ再接続してください。';
   updateButtons();
   return;
  }
  const attempt = connectionAttempt;
  busy = true;
  updateButtons();
  status.textContent = write ? 'Driveに保存して読み戻しています。' : 'Driveから読み込んでいます。';
  output.textContent = '';
  try {
   const client = createApi(accessToken);
   let sample;
   if (write) {
    pending ??= await client.createSample();
    pending.folderId ??= await client.findOrCreateFolder(pending);
    sample = await client.writeSample(pending,pending.folderId);
    pending = undefined;
   } else {
    sample = await client.readLatestSample();
   }
   if (attempt !== connectionAttempt) return;
   if (sample) showSample(sample);
   status.textContent = !sample ? 'この接続ではテストデータが見つかりません。' :
    write ? 'テストデータをDriveに保存し、同じ内容を読み戻せました。' : 'Driveからテストデータを読み込みました。';
  } catch (error) {
   if (attempt !== connectionAttempt) return;
   expireIfUnauthorized(error);
   status.textContent = error.message;
  } finally {
   if (attempt === connectionAttempt) {
    busy = false;
    updateButtons();
   }
  }
 }

 function openConnection() {
  field('settingsMenu').open = false;
  dialog.showModal();
  updateButtons();
  loadGoogleSdk().catch(error => { if (dialog.open && !accessToken) status.textContent = error.message; });
 }
 function expireIfUnauthorized(error) {
  if (error.status !== 401) return;
  expiresAt = 0;
  status.textContent = error.message;
  updateButtons();
  document.dispatchEvent(new Event('ange-drive-session'));
 }
 window.angeDriveConnection = {
  open:openConnection,
  expireIfUnauthorized,
  connected:() => !!accessToken && Date.now() < expiresAt,
  api() {
   if (!this.connected()) throw new Error('Google Driveに接続してから再試行してください。');
   return createApi(accessToken);
  },
 };
 field('openDriveCheck').onclick = openConnection;
 field('driveConnectionShortcut').onclick = openConnection;
 field('modalDriveConnect').onclick = openConnection;
 field('editDriveConnect').onclick = openConnection;
 field('openNoteDrive').onclick = openConnection;
 field('editNoteDrive').onclick = openConnection;
 field('driveDiagnosticToggle').onclick = () => {
  const diagnostic = field('driveDiagnostic');
  diagnostic.hidden = !diagnostic.hidden;
  field('driveDiagnosticToggle').setAttribute('aria-expanded', String(!diagnostic.hidden));
 };
 field('driveConnect').onclick = connect;
 field('driveDisconnect').onclick = disconnect;
 field('driveWriteSample').onclick = () => checkDrive(true);
 field('driveReadSample').onclick = () => checkDrive(false);
 dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
 field('closeDriveCheck').onclick = () => { if (!busy) dialog.close(); };
})();
