'use strict';

(() => {
 const width = 595, height = 842, margin = 39, bodyWidth = width - margin * 2;
 const colors = {ink:'#30252b', rose:'#893d53', pink:'#f3e6e9', line:'#d8bec6', gray:'#6c5760'};
 const photos = [['before','焼成前'],['after','焼成後'],['section','断面']];
 const encode = new TextEncoder();
 const field = id => document.getElementById(id);
 const dialog = field('recipePdfDialog');
 const status = field('recipePdfStatus');
 const download = field('downloadRecipePdf');
 let buildPayload, generated, url, upload, busy = false;

 function page(title, data, number, count, content) {
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('このブラウザではPDFを作れません。');
  ctx.scale(2,2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,width,height);
  ctx.textBaseline = 'top';
  const font = (size,weight) => { ctx.font = weight + ' ' + size + 'px "Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", sans-serif'; };
  function text(value,x,y,size = 10,color = colors.ink,weight = 400) {
   font(size,weight);
   ctx.fillStyle = color;
   ctx.fillText(String(value ?? ''),x,y);
  }
  function lines(value,max,size = 10,weight = 400) {
   font(size,weight);
   const result = [];
   for (const paragraph of String(value ?? '').split(/\r?\n/)) {
    let line = '';
    for (const character of paragraph) {
     if (line && ctx.measureText(line + character).width > max) {
      result.push(line);
      line = '';
     }
     line += character;
    }
    result.push(line);
   }
   return result;
  }
  function block(value,x,y,max,size,weight = 400) {
   const rows = lines(value,max,size,weight);
   if (rows.length > 55) throw new Error('記載内容がA4の固定枠に収まりません。長いメモや工程を短くしてください。');
   rows.forEach((row,i)=>text(row,x,y+i*(size+4),size,colors.ink,weight));
   return rows.length*(size+4);
  }
  function line(x,y,end) {
   ctx.strokeStyle = colors.line;
   ctx.lineWidth = .65;
   ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(end,y); ctx.stroke();
  }
  function table(headers,rows,widths,y) {
   for (const [index,row] of [headers,...rows].entries()) {
    const rowHeight = Math.max(21,...row.map((value,i)=>lines(value,widths[i]-12,9.5).length*13.5+8));
    if (index === 0) { ctx.fillStyle = colors.pink; ctx.fillRect(margin,y,bodyWidth,rowHeight); }
    let x = margin;
    row.forEach((value,i)=>{
     block(value,x+6,y+5,widths[i]-12,9.5,index ? 400 : 700);
     x += widths[i];
    });
    y += rowHeight;
    line(margin,y,margin+bodyWidth);
   }
   return y;
  }
  function section(label,y) {
   text(label,margin,y,12,colors.rose,700);
   return y+20;
  }
  function boxed(value,y,minHeight = 38) {
   const distance = Math.max(minHeight,lines(value,bodyWidth-18,10).length*14+14);
   ctx.strokeStyle = colors.line;
   ctx.strokeRect(margin,y,bodyWidth,distance);
   block(value,margin+8,y+7,bodyWidth-18,10);
   return y+distance;
  }
  function photoRow(images,y) {
   const gap = 8, w = (bodyWidth-gap*2)/3, h = 104;
   photos.forEach(([key,label],i)=>{
    const x = margin+i*(w+gap);
    ctx.fillStyle = colors.pink;
    ctx.fillRect(x,y,w,18);
    text(label,x+7,y+3,10,colors.rose,700);
    ctx.strokeStyle = colors.line;
    ctx.strokeRect(x,y+18,w,h);
    const image = images[key];
    if (image) {
     const scale = Math.min((w-6)/image.naturalWidth,(h-6)/image.naturalHeight);
     const iw = image.naturalWidth*scale, ih = image.naturalHeight*scale;
     ctx.drawImage(image,x+(w-iw)/2,y+18+(h-ih)/2,iw,ih);
    }
   });
   return y+18+h;
  }
  text('Ange Pizza Lab',margin,39,25,colors.rose,700);
  text(title,margin,72,15);
  const nameEnd = 98+block(data.name,margin,98,bodyWidth,15,700);
  const idEnd = nameEnd + (data.id ? block('記録ID ' + data.id,margin,nameEnd,bodyWidth,8) : 0);
  const start = idEnd+12;
  const limit = 782;
  // Measure and draw with the same layout. Compact long records without cutting text.
  ctx.save();
  let end = content({text,table,section,boxed,photoRow,block},start);
  ctx.restore();
  if (end > limit) {
   const factor = (limit-start)/(end-start);
   if (factor < .76) throw new Error('記載内容がA4の固定枠に収まりません。長いメモや工程を短くしてください。');
   ctx.fillStyle = '#fff';
   ctx.fillRect(0,start,width,height-start);
   ctx.save();
   ctx.translate(0,start);
   ctx.scale(1,factor);
   ctx.translate(0,-start);
   content({text,table,section,boxed,photoRow,block},start);
   ctx.restore();
  }
  line(margin,799,width-margin);
  text('Ange Pizza Lab',margin,807,8,colors.rose);
  text(number + ' / ' + count,width-margin-24,807,8,colors.rose);
  return canvas;
 }

 function ricetta(draw,data,y) {
  const {table,section,boxed,block} = draw;
  y = table(data.stats.map(([label])=>label),[data.stats.map(([,value])=>value)],[87,90,100,240],y)+16;
  y = section('材料配合',y);
  const widths = data.headings.length === 4 ? [217,100,100,100] : [277,120,120];
  y = table(data.headings,data.materials,widths,y)+8;
  y += block(data.formula,margin,y,bodyWidth,10)+13;
  y = section('発酵条件・工程',y);
  y = boxed(data.temperatures || '発酵条件の記録なし',y,26)+7;
  y = table(['工程','予定日時'],data.planned.length ? data.planned : [['—','予定の記録なし']],[227,290],y)+16;
  return boxed(data.memo,section('レシピメモ',y),54);
 }

 function diario(draw,data,diary,images,y) {
  const {table,section,boxed,photoRow,block} = draw;
  y = section('工程実績',y);
  const emptyStages = (data.process === 'ストレート' ? ['捏ね始め','捏ね上げ'] : ['発酵種の仕込み','本捏ね開始','捏ね上げ'])
   .concat(['冷蔵庫に入れる','分割・丸め','焼き始め']).map(label=>[label,'','','','']);
  if (diary) {
   const context = [diary.started ? '仕込み ' + diary.started : '',diary.room ? '室温 ' + diary.room + '℃' : '',
    diary.humidity ? '湿度 ' + diary.humidity + '%' : '',diary.method].filter(Boolean).join('  ／  ');
   if (context) y += block(context,margin,y,bodyWidth,10)+7;
  }
  y = table(['工程','実施日時','生地温','室温・庫内','状態・メモ'],
   diary ? (diary.stages.length ? diary.stages : [['—','','','','工程の記録なし']]) : emptyStages,[105,112,52,63,185],y)+15;
  y = photoRow(images,section('仕込み写真',y))+15;
  y = section('焼成・評価',y);
  const rating = diary ? (diary.rating ? diary.rating + ' / 5' : '未評価') : '　　　 / 5';
  y = boxed('評価 ' + rating + '　　焼成条件 ' + (diary?.baking ?? ''),y,26)+13;
  y = boxed(diary?.memo,section('感想・メモ',y),42)+12;
  return boxed(diary?.improvement,section('次回の改善点',y),42);
 }

 function jpeg(canvas) {
  return new Promise((resolve,reject)=>{
   canvas.toBlob(blob=>blob ? resolve(blob) : reject(new Error('PDFのページを変換できませんでした。')),'image/jpeg',.9);
  });
 }

 async function pdfFile(images) {
  const parts = [];
  const offsets = [0];
  let size = 0;
  const add = content => {
   const bytes = typeof content === 'string' ? encode.encode(content) : content;
   parts.push(bytes);
   size += bytes.byteLength;
  };
  const object = (id,body) => {
   offsets[id] = size;
   add(id + ' 0 obj\n');
   for (const part of body) add(part);
   add('\nendobj\n');
  };
  add('%PDF-1.4\n');
  object(1,['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2,['<< /Type /Pages /Count ' + images.length + ' /Kids [' + images.map((_,i)=>(3+i*3)+' 0 R').join(' ') + '] >>']);
  for (let i=0;i<images.length;i++) {
   const id = 3+i*3;
   const image = new Uint8Array(await images[i].arrayBuffer());
   const commands = 'q\n595.276 0 0 841.89 0 0 cm\n/Sheet Do\nQ\n';
   object(id,['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << /XObject << /Sheet ' +
    (id+1) + ' 0 R >> >> /Contents ' + (id+2) + ' 0 R >>']);
   object(id+1,['<< /Type /XObject /Subtype /Image /Width 1190 /Height 1684 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
    image.length + ' >>\nstream\n',image,'\nendstream']);
   object(id+2,['<< /Length ' + commands.length + ' >>\nstream\n' + commands + 'endstream']);
  }
  const xref = size;
  add('xref\n0 ' + offsets.length + '\n0000000000 65535 f \n');
  for (const offset of offsets.slice(1)) add(String(offset).padStart(10,'0') + ' 00000 n \n');
  add('trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts,{type:'application/pdf'});
 }

 async function imageFromBlob(blob) {
  const localUrl = URL.createObjectURL(blob);
  const image = new Image();
  try {
   image.src = localUrl;
   await image.decode();
   return image;
  } finally { URL.revokeObjectURL(localUrl); }
 }

 function clearOutput() {
  if (url) URL.revokeObjectURL(url);
  url = undefined;
  generated = undefined;
  upload = undefined;
  download.hidden = true;
  field('shareRecipePdf').hidden = true;
  field('storeRecipePdf').hidden = true;
 }

 function setBusy(value) {
  busy = value;
  dialog.setAttribute('aria-busy',String(value));
  for (const button of dialog.querySelectorAll('button')) button.disabled = value;
 }

 async function produce(mode) {
  if (busy) return;
  setBusy(true);
  clearOutput();
  status.textContent = 'PDFを作成しています…';
  try {
   const data = buildPayload();
   const diary = mode === 'history' ? data.diary : null;
   const files = diary ? await window.angeNotePhotos.pdfPhotos(diary.photos,diary.owner) : {};
   const images = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key,blob])=>[key,await imageFromBlob(blob)])));
   const count = mode === 'front' ? 1 : 2;
   const pages = [await jpeg(page('RICETTA / レシピ',data,1,count,(draw,y)=>ricetta(draw,data,y)))];
   if (count === 2) pages.push(await jpeg(page('DIARIO / 仕込み・研究記録',data,2,count,(draw,y)=>diario(draw,data,diary,images,y))));
   const fileName = String(data.name || 'Ange Pizza Lab').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').trim().slice(0,80);
   const blob = await pdfFile(pages);
   generated = new File([blob],(fileName || 'Ange Pizza Lab') + (mode === 'front' ? ' - RICETTA.pdf' : ' - RICETTA DIARIO.pdf'),{type:blob.type});
   url = URL.createObjectURL(generated);
   download.href = url;
   download.download = generated.name;
   download.hidden = false;
   field('shareRecipePdf').hidden = !navigator.canShare?.({files:[generated]});
   field('storeRecipePdf').hidden = !window.angeDriveConnection.connected();
   status.textContent = 'A4縦 ' + count + 'ページのPDFを作成しました。';
  } catch (error) {
   window.angeDriveConnection.expireIfUnauthorized(error);
   status.textContent = error.message;
  } finally { setBusy(false); }
 }

 async function saveToDrive() {
  if (!generated || busy) return;
  setBusy(true);
  status.textContent = 'PDFをGoogle Driveに保存しています…';
  try {
   const api = window.angeDriveConnection.api();
   const owner = await api.userId();
   if (upload?.owner !== owner) upload = {owner,folder:{}};
   upload.folder.id ??= await api.findOrCreateFolder(upload.folder,'ange-pizza-lab-pdf-folder','Ange Pizza Lab - PDF');
   upload.id ??= await api.newFileId();
   await api.uploadMedia({id:upload.id,name:generated.name,mimeType:generated.type,parents:[upload.folder.id],
    appProperties:{angeType:'ange-pizza-lab-pdf-v1'}},generated);
   const stored = await api.readMedia(upload.id);
   const checksum = async blob => new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())).join(',');
   if (await checksum(stored) !== await checksum(generated)) throw new Error('Driveに保存したPDFを確認できませんでした。再試行してください。');
   status.textContent = 'Google Driveの「Ange Pizza Lab - PDF」に保存しました。';
  } catch(error) {
   window.angeDriveConnection.expireIfUnauthorized(error);
   status.textContent = error.message;
  } finally { setBusy(false); }
 }

 field('pdfFront').onclick = () => produce('front');
 field('pdfBlank').onclick = () => produce('blank');
 field('pdfHistory').onclick = () => produce('history');
 field('storeRecipePdf').onclick = saveToDrive;
 field('shareRecipePdf').onclick = async () => {
  try { await navigator.share({files:[generated]}); }
  catch(error) { if (error.name !== 'AbortError') status.textContent = '共有できませんでした。「PDFを開く・保存」をお試しください。'; }
 };
 field('closeRecipePdf').onclick = () => { if (!busy) dialog.close(); };
 dialog.addEventListener('cancel',event=>{ if (busy) event.preventDefault(); });
 dialog.addEventListener('close',clearOutput);
 window.angePdf = {open(payload,history = false) {
  buildPayload = payload;
  clearOutput();
  status.textContent = '';
  field('pdfFront').hidden = field('pdfBlank').hidden = history;
  field('pdfHistory').hidden = !history;
  dialog.showModal();
 }};
})();
