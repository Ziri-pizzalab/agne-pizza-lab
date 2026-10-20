'use strict';
const $=id=>document.getElementById(id),clone=o=>JSON.parse(JSON.stringify(o));
const round=(x,places=1)=>Math.round((x+Number.EPSILON)*Math.pow(10,places))/Math.pow(10,places);
const fmt=x=>Number.isFinite(x)?round(x).toLocaleString('ja-JP',{maximumFractionDigits:1}):'—';
const presets={
 napoli:{name:'ナポリ風',hydration:60,salt:2.5,oil:0,extras:[],bake:'430〜485℃・60〜90秒',source:'AVPN公式規定の範囲内の参考配合',url:'https://www.pizzanapoletana.org/it/ricetta_pizza_napoletana'},
 milano:{name:'ミラノ風・薄焼き（暫定）',hydration:58,salt:2.5,oil:2,extras:[],bake:'280〜330℃・3〜5分（暫定）',source:'仮の参考配合。公開レシピの照合待ち',url:''},
 roma:{name:'ローマ風トンダ（暫定）',hydration:58,salt:2.4,oil:4,extras:[],bake:'300〜350℃・3〜5分（暫定）',source:'仮の参考配合。公開レシピの照合待ち',url:''},
 ny:{name:'ニューヨーク風',hydration:63,salt:2,oil:2,extras:[{name:'砂糖',pct:1.6}],bake:'280〜330℃・4〜7分',source:'The Pizza Craftの公開配合を参考',url:''},
 mine:{name:'マイレシピ',hydration:65,salt:2.5,oil:0,extras:[],bake:'生地の厚みや窯に合わせて調整',source:'普段の配合を初期値に設定',url:''}
};
const defaultFlours=()=>[{id:1,name:'カプート',pct:100,seed:300}];
const defaults={style:'mine',process:'biga',mode:'flour',totalFlour:660,bigaFlour:300,bigaHyd:50,extraFlour:360,hydration:65,salt:2.5,oil:0,ball:180,quantity:6,yeastType:'dry',yeast:1,prefermentYeast:1,extras:[{name:'',pct:0},{name:'',pct:0}],flours:defaultFlours(),stage:'biga',fermentMethod:'room',room:25,fridge:4,beforeCold:3};
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
let state=clone(defaults),adopted=read('ange-v3-adopted',{});
const old=null,savedV2=read('ange-v3-current',null);
if(savedV2&&typeof savedV2==='object'){state={...state,...savedV2};state.totalFlour=Number(savedV2.totalFlour??(Number(savedV2.bigaFlour??300)+Number(savedV2.extraFlour??360)));}
else if(old&&typeof old==='object'){
 for(const k of ['mode','bigaFlour','bigaHyd','extraFlour','hydration','salt','oil','ball','quantity'])if(old[k]!==undefined)state[k]=old[k];
 state.totalFlour=Number(state.bigaFlour)+Number(state.extraFlour);state.yeastType=old.yeastType==='fresh'?'fresh':'dry';state.yeast=round((Number(old.bigaFlour??300)+Number(old.extraFlour??360))*Number(old.yeast??.15)/100);state.prefermentYeast=state.yeast;
}
function normalise(){
 state.extras=Array.from({length:2},(_,i)=>({name:String(state.extras?.[i]?.name||''),pct:Math.max(0,Math.min(50,Number(state.extras?.[i]?.pct)||0))}));
 const arr=Array.isArray(state.flours)&&state.flours.length?state.flours.slice(0,4):[{id:1,name:state.flourName||'カプート',pct:100,seed:Number(state.bigaFlour)||0}];
 state.flours=arr.map((f,i)=>({id:Number(f.id)||i+1,name:String(f.name||''),pct:Math.max(0,Number(f.pct)||0),seed:Math.max(0,Number(f.seed)||0)}));
 // Preserve existing proportions, but always make the last flour the 100% remainder.
 if(state.flours.length===1)state.flours[0].pct=100;
 else{let used=0;for(let i=0;i<state.flours.length-1;i++){state.flours[i].pct=round(Math.min(state.flours[i].pct,100-used),8);used+=state.flours[i].pct}state.flours.at(-1).pct=round(100-used,8)}
 state.stage=state.process==='straight'?'final':state.stage==='final'?'final':'biga';
 state.fermentMethod=['room','cold','mixed'].includes(state.fermentMethod)?state.fermentMethod:'room';
}
normalise();
function persist(){try{localStorage.setItem('ange-v3-current',JSON.stringify(state))}catch(e){console.warn('Storage unavailable',e)}}
function flourTotal(){
 const extraPct=state.extras.filter(x=>x.name.trim()).reduce((s,x)=>s+Number(x.pct),0);
 const factor=1+(Number(state.hydration)+Number(state.salt)+Number(state.oil)+extraPct)/100;
 return state.mode==='target'?(Number(state.ball)*Number(state.quantity)-Number(state.yeast))/factor:Number(state.totalFlour);
}
function prepareSeeds(){
 const total=flourTotal();if(!Number.isFinite(total))return;
 for(const f of state.flours){f.seed=Math.max(0,Math.min(Number(f.seed)||0,Math.max(0,total*f.pct/100)))}
 state.bigaFlour=state.process==='straight'?0:round(state.flours.reduce((s,f)=>s+f.seed,0),5);
}
function calc(){
 const totalFlour=flourTotal();const flours=state.flours.map(f=>({...f,grams:totalFlour*f.pct/100}));
 const seedFlour=state.process==='straight'?0:flours.reduce((s,f)=>s+f.seed,0);
 const seedWater=seedFlour*Number(state.bigaHyd)/100;
 const water=totalFlour*Number(state.hydration)/100;
 const extras=state.extras.filter(f=>f.name.trim()&&Number(f.pct)>0).map(x=>({...x,grams:totalFlour*x.pct/100}));
 const dough=totalFlour+water+totalFlour*(Number(state.salt)+Number(state.oil))/100+extras.reduce((s,x)=>s+x.grams,0)+Number(state.yeast);
 const seedYeast=state.process==='straight'?0:Number(state.prefermentYeast);
 const valid=totalFlour>0&&Number.isFinite(dough)&&water+1e-8>=seedWater&&seedYeast>=0&&seedYeast<=Number(state.yeast)&&flours.every(f=>f.seed>=0&&f.seed<=f.grams+1e-7)&&seedFlour<=totalFlour+1e-7;
 return {totalFlour,flours,seedFlour,seedWater,water,extras,dough,seedYeast,valid,balls:Math.floor((dough+1e-7)/Number(state.ball)),leftover:Math.max(0,dough%Number(state.ball))};
}
function slider(host,label,key,min,max,step,unit){
 const wrap=document.createElement('div');wrap.className='control';const top=document.createElement('div');top.className='top';const text=document.createElement('span');text.textContent=label;const out=document.createElement('output');const input=document.createElement('input');input.type='range';Object.assign(input,{min,max,step,value:state[key]});const refresh=()=>out.textContent=fmt(Number(state[key]))+unit;
 input.oninput=()=>{state[key]=Number(input.value);if(key==='totalFlour'||key==='ball'||key==='quantity'||key==='hydration'||key==='salt'||key==='oil')prepareSeeds();refresh();persist();results();if(['ball','quantity','totalFlour','hydration','salt','oil'].includes(key))flourRows()};
 top.append(text,out);wrap.append(top,input);$(host).append(wrap);refresh();
}
function redraw(){
 $('style').replaceChildren();for(const [k,p] of Object.entries(presets)){const o=document.createElement('option');o.value=k;o.textContent=p.name;$('style').append(o)}
 $('style').value=state.style;$('process').value=state.process;document.querySelectorAll('[data-process]').forEach(b=>{const active=b.dataset.process===state.process;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});$('yeastType').value=state.yeastType;
 $('styleSource').replaceChildren(document.createTextNode(presets[state.style].source+' '));if(presets[state.style].url){const a=document.createElement('a');a.textContent='参考元';a.href=presets[state.style].url;a.target='_blank';a.rel='noopener';$('styleSource').append(a)}
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
 $('baseControls').replaceChildren();$('ratioControls').replaceChildren();$('prefermentControls').replaceChildren();
 if(state.mode==='flour'){slider('baseControls','総粉量','totalFlour',100,1800,10,'g')}
 slider('baseControls','ピザ玉の重さ','ball',80,400,5,'g');if(state.mode==='target')slider('baseControls','作りたい個数','quantity',1,24,1,'個');
 $('prefermentBox').hidden=state.process==='straight';$('prefermentTitle').textContent=state.process==='poolish'?'ポーリッシュ':'ビガ';
 if(state.process!=='straight')slider('prefermentControls','種の加水率','bigaHyd',state.process==='poolish'?80:40,state.process==='poolish'?120:80,1,'%');
 slider('ratioControls','最終加水率','hydration',45,90,.5,'%');slider('ratioControls','塩分率','salt',0,5,.1,'%');slider('ratioControls','オイル率','oil',0,10,.5,'%');
 $('yeast').max=Math.max(10,Math.ceil(state.yeast));$('yeast').value=state.yeast;$('prefermentYeast').value=state.prefermentYeast;$('yeastSplitField').hidden=state.process==='straight';
 for(let i=0;i<2;i++){$('extraName'+i).value=state.extras[i].name;$('extraPct'+i).value=state.extras[i].pct||''}
 flourRows();results();
}
function flourRows(){
 const c=calc();const host=$('flourRows');host.replaceChildren();
 const showSeed=state.process!=='straight';
 for(let i=0;i<state.flours.length;i++){
  const f=state.flours[i];const row=document.createElement('div');row.className='flour-row';
  const name=document.createElement('div');name.className='flour-name';const label=document.createElement('label');label.textContent='粉 '+(i+1);const input=document.createElement('input');input.placeholder='粉の名前';input.value=f.name;input.oninput=()=>{f.name=input.value;persist();results()};name.append(label,input);
  const pct=document.createElement('div');pct.className='flour-pct';const lp=document.createElement('label');lp.textContent=i===state.flours.length-1?'自動 %':'配合 %';pct.append(lp);
  const gr=document.createElement('div');gr.className='flour-grams';const lg=document.createElement('label');lg.textContent=i===state.flours.length-1?'自動 g':'粉量 g';gr.append(lg);
  const total=c.totalFlour;
  const change=(raw,unit)=>{if(raw.trim()==='')return;const v=Number(raw);if(!Number.isFinite(v))return;const earlier=state.flours.slice(0,-1).filter(x=>x!==f).reduce((s,x)=>s+x.pct,0);const value=unit==='g'?(total>0?v/total*100:0):v;f.pct=Math.max(0,Math.min(100-earlier,value));state.flours.at(-1).pct=Math.max(0,100-state.flours.slice(0,-1).reduce((s,x)=>s+x.pct,0));prepareSeeds();persist();flourRows();results()};
  if(i===state.flours.length-1){const fixed=document.createElement('div');fixed.className='auto-pct';fixed.textContent=fmt(f.pct)+'%';pct.append(fixed);const gfixed=document.createElement('div');gfixed.className='auto-pct';gfixed.textContent=fmt(c.flours[i].grams)+'g';gr.append(gfixed)}
  else{const p=document.createElement('input');p.type='number';p.min='0';p.max='100';p.step='.1';p.value=String(round(f.pct,3));p.onchange=()=>change(p.value,'%');pct.append(p);const g=document.createElement('input');g.type='number';g.min='0';g.step='.1';g.value=String(round(c.flours[i].grams,3));g.onchange=()=>change(g.value,'g');gr.append(g)}
  row.append(pct,name);
  if(state.flours.length>1){const del=document.createElement('button');del.className='quiet delete-flour';del.textContent='×';del.setAttribute('aria-label','この粉を削除');del.onclick=()=>{state.flours.splice(i,1);if(state.flours.length===1)state.flours[0].pct=100;else state.flours.at(-1).pct=round(100-state.flours.slice(0,-1).reduce((s,x)=>s+x.pct,0));prepareSeeds();persist();flourRows();results()};row.append(del)}
  const foot=document.createElement('div');foot.className='flour-foot';const gm=document.createElement('span');gm.textContent='粉量 '+fmt(c.flours[i].grams)+'g';foot.append(gm);
  if(showSeed){const seedL=document.createElement('label');seedL.textContent='種用';const seedInput=document.createElement('input');seedInput.type='number';seedInput.min='0';seedInput.step='.1';seedInput.max=String(Math.max(0,c.flours[i].grams));seedInput.value=String(round(f.seed));seedInput.setAttribute('aria-label',`粉${i+1}の種用グラム数`);seedInput.onchange=()=>{f.seed=Math.max(0,Math.min(c.flours[i].grams,Number(seedInput.value)||0));state.bigaFlour=state.flours.reduce((s,x)=>s+x.seed,0);persist();queueMicrotask(()=>{flourRows();results()})};const g=document.createElement('span');g.textContent='g';foot.append(seedL,seedInput,g)}
  if(i<state.flours.length-1){gr.classList.add('flour-grams-compact');foot.insertBefore(gr,foot.firstChild)}row.append(foot);host.append(row);
 }
 $('addFlour').hidden=state.flours.length>=4;
}
function group(id,title,theme,items){const wrap=document.createElement('section');wrap.className='ingredient-group '+theme;const heading=document.createElement('h3');heading.textContent=title;wrap.append(heading);const grid=document.createElement('div');grid.className='ingredient-grid';for(const item of items){const card=document.createElement('div');card.className='ingredient';const name=document.createElement('small');name.textContent=item[0];const value=document.createElement('b');value.textContent=Number.isFinite(item[1])?fmt(item[1])+'g':'—';card.append(name,value);if(item[2]?.length){const lines=document.createElement('div');lines.className='ingredient-breakdown';for(const t of item[2]){const d=document.createElement('div');d.textContent=t;lines.append(d)}card.append(lines)}grid.append(card)}wrap.append(grid);$(id).append(wrap)}
function results(){
 const c=calc();updateStickySummary(c);updateSectionMetrics(c);if(!c.valid){$('summaryIngredients').textContent='配合を確認してください';}
 if(!c.valid)return;
 const blended=state.flours.length>1;
 const preFlours=c.flours.filter(f=>f.seed>1e-7).map(f=>(f.name||'名称未設定')+' '+fmt(f.seed)+'g');
 const mainFlours=c.flours.filter(f=>f.grams-(state.process==='straight'?0:f.seed)>1e-7).map(f=>(f.name||'名称未設定')+' '+fmt(f.grams-(state.process==='straight'?0:f.seed))+'g');
 const allFlours=c.flours.map(f=>(f.name||'名称未設定')+' '+fmt(f.pct)+'%（'+fmt(f.grams)+'g）');
 
 $('yeastOut').textContent=fmt(Number(state.yeast))+'g';$('yeastPercent').textContent='総粉量に対して '+(Number(state.yeast)/c.totalFlour*100).toFixed(3)+'%';
}

function applyPreset(k){const p=adopted[k]||presets[k];state.style=k;for(const key of ['hydration','salt','oil'])state[key]=p[key];state.extras=clone([p.extras?.[0]||{name:'',pct:0},p.extras?.[1]||{name:'',pct:0}]);if(p.flours)state.flours=clone(p.flours);if(p.process)state.process=p.process;if(p.bigaHyd!==undefined)state.bigaHyd=p.bigaHyd;normalise();prepareSeeds();persist();redraw()}
function savedRecipes(){const curr=read('ange-v3-recipes',[]),prev=[];return [...(Array.isArray(curr)?curr.map((r,i)=>({...r,_key:'ange-v3-recipes',_i:i})):[]),...(Array.isArray(prev)?prev.map((r,i)=>({...r,_key:'ange-recipes',_i:i,legacy:true})):[])]}
let recipeVisible=5;let editingRecipe=null;
function currentRecipeData(){const {stage,fermentMethod,room,fridge,beforeCold,...recipe}=state;return clone(recipe)}
function loadRecipeState(r){const s=r.state||{};if(r.legacy){state={...clone(defaults),...Object.fromEntries(['mode','bigaFlour','bigaHyd','extraFlour','hydration','salt','oil','ball','quantity'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]]))};state.totalFlour=Number(state.bigaFlour)+Number(state.extraFlour);state.yeast=round(state.totalFlour*Number(s.yeast??.15)/100);state.prefermentYeast=state.yeast}else{state={...clone(defaults),...clone(s)};state.totalFlour=Number(s.totalFlour??(Number(s.bigaFlour??300)+Number(s.extraFlour??360)))}normalise();prepareSeeds();persist();redraw();selectTab('recipe')}
function recipeKey(r){return r.id||r._key+'::'+r._i}
function showRecipes(){const root=$('recipeList');root.replaceChildren();const q=($('recipeSearch')?.value||'').trim().toLocaleLowerCase();let matches=savedRecipes().filter(r=>{const s=r.state||{};const fl=(s.flours||[]).map(f=>f.name).join(' ');const process={biga:'ビガ',straight:'ストレート',poolish:'ポーリッシュ'}[s.process]||'';return [r.name,fl,process,String(s.hydration??''),r.savedAt].join(' ').toLocaleLowerCase().includes(q)});if($('recipeSort')?.value==='name')matches.sort((a,b)=>a.name.localeCompare(b.name,'ja'));const limit=matches.slice(0,recipeVisible);for(const r of limit){const div=document.createElement('div');div.className='saved-item';if(editingRecipe&&editingRecipe.id===r.id&&editingRecipe.key===r._key)div.classList.add('edit-active');const info=document.createElement('div');const b=document.createElement('strong');b.textContent=r.name+(r.legacy?'（旧版）':'');const small=document.createElement('small');small.textContent=(r.savedAt||'')+(r.state?.hydration!==undefined?' ／ 加水率'+r.state.hydration+'%':'');info.append(b,small);const actions=document.createElement('div');actions.className='actions';const load=document.createElement('button');load.className='quiet small-action';load.textContent='読込';load.onclick=()=>{loadRecipeState(r);editingRecipe=null;$('recipeEditStatus').textContent='レシピを配合画面に読み込みました';showRecipes()};const edit=document.createElement('button');edit.className='quiet small-action';edit.textContent='編集';edit.onclick=()=>{loadRecipeState(r);editingRecipe={id:r.id,key:r._key,index:r._i,name:r.name};$('recipeName').value=r.name;$('recipeEditStatus').textContent='編集中：'+r.name+'。配合を変更後、レシピ帳で保存方法を選択してください。';selectTab('recipe');showRecipes()};const del=document.createElement('button');del.className='quiet small-action';del.textContent='削除';del.onclick=()=>{if(!confirm('このレシピを削除しますか？（過去のピザノートには影響しません）'))return;const list=read(r._key,[]);let idx=r.id?list.findIndex(x=>x.id===r.id):r._i;if(idx<0)return;list.splice(idx,1);localStorage.setItem(r._key,JSON.stringify(list));if(editingRecipe?.id===r.id&&editingRecipe?.key===r._key)stopRecipeEditing();showRecipes();refreshNoteRecipes()};actions.append(load,edit,del);div.append(info,actions);root.append(div)}if(!matches.length){const empty=document.createElement('p');empty.className='note';empty.textContent=q?'一致するレシピはありません。':'まだ保存されたレシピはありません。';root.append(empty)}$('moreRecipes').hidden=matches.length<=recipeVisible;$('moreRecipes').textContent='さらに'+Math.min(5,matches.length-recipeVisible)+'件表示（残り'+(matches.length-recipeVisible)+'件）';}
function stopRecipeEditing(){editingRecipe=null;$('saveRecipe').textContent='この配合をレシピ帳に保存';$('recipeEditStatus').textContent='';$('recipeName').value='';const actions=$('recipeEditActions');if(actions)actions.hidden=true;$('recipeEditor').hidden=true}
function beginRecipeEditing(){ $('saveRecipe').textContent='別名で保存';const actions=$('recipeEditActions');if(actions)actions.hidden=false;$('recipeEditor').hidden=false }
// Pizza notebook: saved separately from recipes; no forecasting or photos.
const NOTES_KEY='ange-v3-notes';
const dateTimeLocal=d=>{const pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())};
function durationText(a,b){if(!a||!b)return '日時を入力すると経過時間を表示します';const st=new Date(a),en=new Date(b);if(!Number.isFinite(+st)||!Number.isFinite(+en))return '日時を確認してください';const minutes=Math.round((en-st)/60000);if(minutes<0)return '終了日時が開始日時より前です';const hours=Math.floor(minutes/60),mins=minutes%60,days=Math.floor(hours/24);return '経過：'+(days?days+'日 ':'')+(hours%24||!days?(days?hours%24:hours)+'時間':'')+(mins?' '+mins+'分':'')};
function refreshNoteRecipes(){const select=$('noteRecipe');if(!select)return;const prev=select.value;select.replaceChildren(new Option('現在の配合（保存済みでなくても可）','current'));for(const [i,r] of savedRecipes().entries()){const key=r._key+'::'+r._i;select.append(new Option(r.name+(r.legacy?'（旧版）':''),key))}if([...select.options].some(o=>o.value===prev))select.value=prev;else select.value='current';noteSeedVisibility()}
function pickedRecipe(){const key=$('noteRecipe').value;if(key==='current')return {name:state.flours.map(f=>f.name).filter(Boolean).join('＋')+'・'+fmt(state.hydration)+'%・'+{biga:'ビガ法',straight:'ストレート法',poolish:'ポーリッシュ法'}[state.process],snapshot:clone(state)};const r=savedRecipes().find(r=>r._key+'::'+r._i===key);return r?{name:r.name,snapshot:clone(r.state||{})}: {name:'現在の配合',snapshot:clone(state)}}
function noteSeedVisibility(){const selected=pickedRecipe();const process=selected.snapshot.process||'biga';$('noteSeedBlock').hidden=process==='straight'}
function updateDurations(){for(const [id,out] of [['noteSeedHours','noteSeedDuration'],['noteMatureHours','noteMatureDuration']]){const v=$(id).value;$(out).textContent=v!==''?('設定：'+Number(v)+'時間'):'未設定'}}
function noteInputs(){const ids=['noteStarted','noteTemp','noteHumidity','noteMethod','noteSeedHours','noteMatureHours','noteRating','noteMemo'];return Object.fromEntries(ids.map(k=>[k,$(k).value]))}
let noteVisible=5;
function showNotes(){const root=$('noteList');root.replaceChildren();const query=($('noteSearch')?.value||'').trim().toLocaleLowerCase();const ratingFilter=$('noteRatingFilter')?.value||'';const all=read(NOTES_KEY,[]);const notes=all.filter(n=>{const x=n.inputs||{};const hay=[n.recipeName,x.noteStarted,x.noteMemo,x.noteMethod,x.noteTemp,x.noteHumidity].join(' ').toLocaleLowerCase();if(!hay.includes(query))return false;const rating=Number(x.noteRating)||0;return !ratingFilter||(ratingFilter==='unrated'?rating===0:rating>=Number(ratingFilter))});if(!notes.length){const p=document.createElement('p');p.className='note';p.textContent=all.length?'該当する仕込み記録がありません。':'まだ仕込み記録がありません。';root.append(p)}for(const note of notes.slice(0,noteVisible)){const div=document.createElement('div');div.className='note-entry';const head=document.createElement('strong');head.textContent=note.recipeName;const meta=document.createElement('small');meta.textContent=(note.inputs.noteStarted||'日時未記入').replace('T',' ')+' ／ '+(note.inputs.noteRating?'★'.repeat(Number(note.inputs.noteRating)):'未評価');const detail=document.createElement('p');const segments=[];if(note.inputs.noteTemp!=='')segments.push('室温 '+note.inputs.noteTemp+'℃');if(note.inputs.noteHumidity!=='')segments.push('湿度 '+note.inputs.noteHumidity+'%');if(note.inputs.noteMatureHours!=='')segments.push('本練り後 '+note.inputs.noteMatureHours+'時間');if(note.inputs.noteSeedHours!=='')segments.push('種 '+note.inputs.noteSeedHours+'時間');if(note.inputs.noteMethod)segments.push({room:'常温',cold:'冷蔵',mixed:'常温＋冷蔵'}[note.inputs.noteMethod]||'');detail.textContent=segments.join(' ／ ')+(note.inputs.noteMemo?'\n'+note.inputs.noteMemo:'');const actions=document.createElement('div');actions.className='actions';const load=document.createElement('button');load.className='quiet small-action';load.textContent='詳細・編集';load.onclick=()=>{for(const [k,v] of Object.entries(note.inputs))if($(k))$(k).value=v;$('noteRecipe').value='current';editingNoteId=note.id;noteSeedVisibility();$('noteSeedBlock').hidden=note.recipeSnapshot?.process==='straight';updateDurations();syncDurationPicks();$('saveNote').textContent='この記録を更新';$('noteStatus').textContent='編集中：'+note.recipeName;window.scrollTo(0,0)};const del=document.createElement('button');del.className='quiet small-action';del.textContent='削除';del.onclick=()=>{if(!confirm('この仕込み記録を削除しますか？'))return;saveNotes(read(NOTES_KEY,[]).filter(n=>n.id!==note.id));showNotes()};actions.append(load,del);div.append(head,meta,detail,actions);root.append(div)}$('moreNotes').hidden=notes.length<=noteVisible;$('moreNotes').textContent='さらに'+Math.min(5,notes.length-noteVisible)+'件表示（残り'+(notes.length-noteVisible)+'件）'}
function resetNoteForm(){editingNoteId=null;$('saveNote').textContent='仕込み記録を保存';for(const k of ['noteSeedHours','noteMatureHours','noteMemo','noteRating'])$(k).value='';updateDurations()}
function initNotes(){if(!$('noteStarted').value)$('noteStarted').value=dateTimeLocal(new Date());refreshNoteRecipes();$('noteRecipe').onchange=noteSeedVisibility;for(const id of ['noteSeedHours','noteMatureHours'])$(id).oninput=updateDurations;$('saveNote').onclick=()=>{const inp=noteInputs();if(inp.noteHumidity!==''&&(+inp.noteHumidity<0||+inp.noteHumidity>100)){$('noteStatus').textContent='湿度は0〜100%で入力してください';return}for(const id of ['noteSeedHours','noteMatureHours'])if(inp[id]!==''&&(!Number.isFinite(Number(inp[id]))||Number(inp[id])<0||Number(inp[id])>1000)){$('noteStatus').textContent='発酵時間を確認してください';return}const chosen=pickedRecipe();const notes=read(NOTES_KEY,[]);const existing=editingNoteId?notes.find(n=>n.id===editingNoteId):null;const item={id:existing?.id||'note-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),recipeName:existing?.recipeName||chosen.name,recipeSnapshot:existing?.recipeSnapshot||chosen.snapshot,inputs:inp,savedAt:new Date().toISOString()};if(existing)notes.splice(notes.findIndex(n=>n.id===existing.id),1,item);else notes.unshift(item);try{saveNotes(notes);$('noteStatus').textContent='✓ 記録を保存しました';resetNoteForm();showNotes()}catch(e){$('noteStatus').textContent='保存できませんでした。端末の空き容量とブラウザ設定を確認してください'}};showNotes();updateDurations()}
const BACKUP_KEYS=['ange-v3-current','ange-v3-adopted','ange-v3-recipes',NOTES_KEY];
function initBackups(){$('exportBackup').onclick=()=>{const items={};for(const k of BACKUP_KEYS){const s=localStorage.getItem(k);if(s!==null)items[k]=JSON.parse(s)}const json=JSON.stringify({app:'Ange Pizza Lab',formatVersion:1,exportedAt:new Date().toISOString(),items},null,2);const a=document.createElement('a');const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.href=url;a.download='Ange_Pizza_Lab_backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('backupStatus').textContent='バックアップを作成しました。iCloud Driveなどに保存してください'};$('importBackup').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(parsed.app!=='Ange Pizza Lab'||parsed.formatVersion!==1||!parsed.items||typeof parsed.items!=='object'||Object.keys(parsed.items).some(k=>!BACKUP_KEYS.includes(k)))throw Error('形式が異なります');if(!confirm('現在の保存レシピ・仕込み履歴をバックアップ内容で置き換えます。続けますか？'))return;for(const [key,value] of Object.entries(parsed.items))localStorage.setItem(key,JSON.stringify(value));location.reload()}catch(err){$('backupStatus').textContent='復元できません。Ange Pizza Labのバックアップファイルを選んでください'}finally{e.target.value=''}}}
function selectTab(tab){document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===tab));document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab))}
$('quickSaveRecipe').onclick=()=>openRecipeModal();
$('style').onchange=e=>applyPreset(e.target.value);
$('process').onchange=e=>{state.process=e.target.value;if(state.process==='poolish'&&state.bigaHyd<80)state.bigaHyd=100;if(state.process==='biga'&&state.bigaHyd>80)state.bigaHyd=50;if(state.process!=='straight'&&state.flours.every(f=>f.seed===0))state.flours[0].seed=Math.min(300,flourTotal());normalise();persist();redraw()};
$('addFlour').onclick=()=>{if(state.flours.length>=4)return;const last=state.flours.at(-1);const newcomer=round(last.pct/2);last.pct=round(last.pct-newcomer);state.flours.push({id:Math.max(...state.flours.map(x=>x.id))+1,name:'',pct:newcomer,seed:0});prepareSeeds();persist();flourRows();results()};
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{if(state.mode==='target'&&button.dataset.mode==='flour'){const c=calc();state.totalFlour=Math.max(0,round(c.totalFlour))}state.mode=button.dataset.mode;prepareSeeds();persist();redraw()};
$('yeastType').onchange=e=>{const next=e.target.value;if(next!==state.yeastType){const factor=next==='fresh'?3:1/3;state.yeast=round(state.yeast*factor);state.prefermentYeast=round(state.prefermentYeast*factor);state.yeastType=next;persist();redraw()}};
function syncYeast(){state.prefermentYeast=Math.min(state.prefermentYeast,state.yeast);$('yeast').value=state.yeast;$('prefermentYeast').value=state.prefermentYeast;persist();results()}
$('yeast').oninput=e=>{state.yeast=Number(e.target.value);syncYeast()};$('yeastMinus').onclick=()=>{state.yeast=Math.max(0,round(state.yeast-.1));syncYeast()};$('yeastPlus').onclick=()=>{state.yeast=Math.min(10,round(state.yeast+.1));syncYeast()};$('prefermentYeast').onchange=e=>{state.prefermentYeast=Math.max(0,Math.min(state.yeast,Number(e.target.value)||0));syncYeast()};
for(let i=0;i<2;i++)for(const [type,k] of [['extraName','name'],['extraPct','pct']])$(type+i).oninput=e=>{state.extras[i][k]=k==='pct'?Math.max(0,Math.min(50,Number(e.target.value)||0)):e.target.value;prepareSeeds();persist();flourRows();results()};
$('adopt').onclick=()=>{adopted[state.style]={hydration:state.hydration,salt:state.salt,oil:state.oil,extras:clone(state.extras),flours:clone(state.flours),process:state.process,bigaHyd:state.bigaHyd};localStorage.setItem('ange-v3-adopted',JSON.stringify(adopted));$('adoptStatus').textContent='✓ '+presets[state.style].name+'の配合を保存しました'};
$('restorePreset').onclick=()=>{if(!confirm('このスタイルで採用した配合を初期値に戻しますか？'))return;delete adopted[state.style];localStorage.setItem('ange-v3-adopted',JSON.stringify(adopted));applyPreset(state.style);$('adoptStatus').textContent='初期配合に戻しました'};
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>selectTab(button.dataset.tab);
const recipeEditActions=document.createElement('div');recipeEditActions.id='recipeEditActions';recipeEditActions.className='actions';recipeEditActions.hidden=true;recipeEditActions.innerHTML='<button id="overwriteRecipe" class="primary" type="button">上書き保存</button><button id="cancelRecipeEdit" class="quiet" type="button">編集をやめる</button>';$('saveRecipe').insertAdjacentElement('afterend',recipeEditActions);
$('saveRecipe').onclick=()=>{const flourLabel=state.flours.map(f=>f.name.trim()).filter(Boolean).join('＋');const label=$('recipeName').value.trim()||`${flourLabel||presets[state.style].name}・${fmt(state.hydration)}%・${{biga:'ビガ法',straight:'ストレート法',poolish:'ポーリッシュ法'}[state.process]}`;if(editingRecipe&&label===editingRecipe.name){$('recipeEditStatus').textContent='別名で保存するには、元と異なるレシピ名を入力してください';selectTab('saved');$('recipeName').focus();return}const recipes=read('ange-v3-recipes',[]);recipes.unshift({id:'recipe-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),name:label,state:currentRecipeData(),savedAt:new Date().toLocaleDateString('ja-JP')});try{localStorage.setItem('ange-v3-recipes',JSON.stringify(recipes));stopRecipeEditing();$('recipeEditStatus').textContent='✓ 新しいレシピを保存しました';showRecipes();refreshNoteRecipes()}catch(e){$('recipeEditStatus').textContent='保存に失敗しました。空き容量を確認してください'}};
$('overwriteRecipe').onclick=()=>{if(!editingRecipe)return;const label=$('recipeName').value.trim();if(!label){$('recipeEditStatus').textContent='レシピ名を入力してください';return}const source=editingRecipe;const old=read(source.key,[]);const index=source.id?old.findIndex(x=>x.id===source.id):source.index;if(index<0){$('recipeEditStatus').textContent='元のレシピが見つかりません';return}const savedAt=new Date().toLocaleDateString('ja-JP');const updated={...old[index],name:label,state:currentRecipeData(),savedAt};if(source.key==='ange-v3-recipes'){old[index]=updated;localStorage.setItem(source.key,JSON.stringify(old))}else{const curr=read('ange-v3-recipes',[]);curr.unshift({...updated,id:'recipe-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),legacy:undefined});localStorage.setItem('ange-v3-recipes',JSON.stringify(curr));old.splice(index,1);localStorage.setItem(source.key,JSON.stringify(old))}stopRecipeEditing();$('recipeEditStatus').textContent='✓ レシピを更新しました（過去の仕込み記録は変更しません）';showRecipes();refreshNoteRecipes()};
$('cancelRecipeEdit').onclick=()=>{stopRecipeEditing();showRecipes()};
$('recipeSearch').oninput=()=>{recipeVisible=5;showRecipes()};$('recipeSort').onchange=()=>{recipeVisible=5;showRecipes()};$('moreRecipes').onclick=()=>{recipeVisible+=5;showRecipes()};
$('noteSearch').oninput=()=>{noteVisible=5;showNotes()};$('noteRatingFilter').onchange=()=>{noteVisible=5;showNotes()};$('moreNotes').onclick=()=>{noteVisible+=5;showNotes()};
const baseShowRecipes=showRecipes;showRecipes=function(){baseShowRecipes();if(editingRecipe)beginRecipeEditing()};
$('reset').onclick=()=>{if(confirm('現在の配合だけ初期化しますか？（保存レシピと採用済みプリセットは残ります）')){state=clone(defaults);normalise();persist();redraw()}};
// Collapsible sections retain their controls and state; first section opens by default.
document.querySelectorAll('#recipe > .card').forEach((card,index)=>{
 const heading=card.querySelector(':scope > h2');if(!heading)return;
 const btn=document.createElement('button');btn.type='button';btn.className='section-fold';btn.textContent=heading.textContent;btn.setAttribute('aria-expanded',String(index===0));
 heading.replaceWith(btn);
 const content=document.createElement('div');content.className='section-fold-body';
 while(btn.nextSibling)content.appendChild(btn.nextSibling);
 card.appendChild(content);content.hidden=index!==0;
 btn.onclick=()=>{content.hidden=!content.hidden;btn.setAttribute('aria-expanded',String(!content.hidden))};
});
normalise();prepareSeeds();redraw();showRecipes();initNotes();initBackups();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});


// Ver.2.5: viewport-safe page-top navigation; does not change saved data.
(()=>{const topButton=document.getElementById('backToTop');if(!topButton)return;
const updateTopButton=()=>{topButton.hidden=window.scrollY<260;};
topButton.addEventListener('click',()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
window.addEventListener('scroll',updateTopButton,{passive:true});
window.addEventListener('pageshow',updateTopButton);
updateTopButton();})();

// Ver.3.0: bottom sheet and horizontal method selector.
function escapeText(s){return String(s||'名称未設定').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function updateStickySummary(c){
 const weight=$('summaryWeight');if(!weight)return;
 weight.textContent=c.valid?fmt(c.dough)+'g':'—';
 $('summaryIngredients').textContent=c.valid?'粉 '+fmt(c.totalFlour)+'g · 水 '+fmt(c.water)+'g · 塩 '+fmt(c.totalFlour*Number(state.salt)/100)+'g · 酵母 '+fmt(Number(state.yeast))+'g':'配合を確認してください';
 const line=(label,value)=>'<div class="summary-line"><span>'+label+'</span><b>'+fmt(value)+'g</b></div>';
 $('summarySeed').innerHTML=state.process==='straight'?'<p class="note">ストレート法では発酵種は使いません</p>':line('粉',c.seedFlour)+c.flours.filter(f=>f.seed>0).map(f=>'<div class="summary-flour">'+escapeText(f.name)+' '+fmt(f.seed)+'g</div>').join('')+line('水',c.seedWater)+line('イースト',c.seedYeast);
 $('summaryMain').innerHTML=line('粉',c.totalFlour-c.seedFlour)+c.flours.filter(f=>f.grams-(state.process==='straight'?0:f.seed)>0).map(f=>'<div class="summary-flour">'+escapeText(f.name)+' '+fmt(f.grams-(state.process==='straight'?0:f.seed))+'g</div>').join('')+line('水',c.water-c.seedWater)+line('塩',c.totalFlour*Number(state.salt)/100)+line('イースト',Number(state.yeast)-c.seedYeast);
}
document.querySelectorAll('[data-process]').forEach(button=>button.addEventListener('click',()=>{const select=$('process');select.value=button.dataset.process;select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelectorAll('[data-process]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button))})}));
$('summaryToggle').addEventListener('click',()=>{const details=$('summaryDetails');details.hidden=!details.hidden;const expanded=!details.hidden;$('summaryToggle').setAttribute('aria-expanded',String(expanded));$('summaryLabel').textContent=expanded?'材料内訳を閉じる ▼':'材料内訳を見る ▲';});
updateStickySummary(calc());

// Ver.3.2: optional recipe conditions, saved temperature defaults, evidence-limited fermentation guidance.
const TEMP_KEY='ange-v3-temp-defaults';
function temperatureDefaults(){const v=read(TEMP_KEY,{room:24,fridge:4});return {room:Number.isFinite(Number(v.room))?Number(v.room):24,fridge:Number.isFinite(Number(v.fridge))?Number(v.fridge):4}}
function openRecipeModal(){const d=temperatureDefaults();$('modalRecipeName').value='';$('modalRoom').value=d.room;$('modalFridge').value=d.fridge;$('modalFermentMethod').value='';$('modalRoomHours').value='';$('modalColdHours').value='';$('modalMemo').value='';$('modalError').hidden=true;$('recipeModal').showModal();$('modalRecipeName').focus()}
function modalNumber(id,min,max){const s=$(id).value.trim();if(!s)return null;const n=Number(s);if(!Number.isFinite(n)||n<min||n>max)throw new Error('入力した温度・時間の範囲を確認してください');return n}
function saveModalRecipe(skip){try{const name=$('modalRecipeName').value.trim();if(!name)throw new Error('レシピ名を入力してください');const conditions=skip?null:{room:modalNumber('modalRoom',-10,50),fridge:modalNumber('modalFridge',-5,20),method:$('modalFermentMethod').value||null,roomHours:modalNumber('modalRoomHours',0,500),coldHours:modalNumber('modalColdHours',0,500),memo:$('modalMemo').value.trim()};const recipes=read('ange-v3-recipes',[]);recipes.unshift({id:'recipe-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),name,state:currentRecipeData(),conditions,savedAt:new Date().toLocaleDateString('ja-JP')});localStorage.setItem('ange-v3-recipes',JSON.stringify(recipes));$('recipeModal').close();stopRecipeEditing();showRecipes();refreshNoteRecipes();selectTab('saved');$('recipeEditStatus').textContent='✓ レシピを追加しました'}catch(e){$('modalError').hidden=false;$('modalError').textContent=e.message||'保存できませんでした'}}
$('modalCancel').onclick=()=>$('recipeModal').close();$('modalSave').onclick=()=>saveModalRecipe(false);$('modalSkip').onclick=()=>saveModalRecipe(true);
$('openTempSettings').onclick=()=>{const d=temperatureDefaults();$('defaultRoom').value=d.room;$('defaultFridge').value=d.fridge;$('tempError').hidden=true;$('tempSettingsModal').showModal()};
$('tempCancel').onclick=()=>$('tempSettingsModal').close();$('tempSave').onclick=()=>{const r=Number($('defaultRoom').value),f=Number($('defaultFridge').value);if(!$('defaultRoom').value||!$('defaultFridge').value||!Number.isFinite(r)||!Number.isFinite(f)||r< -10||r>50||f< -5||f>20){$('tempError').hidden=false;$('tempError').textContent='室温は-10〜50℃、冷蔵庫は-5〜20℃で設定してください';return}localStorage.setItem(TEMP_KEY,JSON.stringify({room:r,fridge:f}));$('tempSettingsModal').close();renderFermentReference()};
let referenceMethod='room';
function renderFermentReference(){const d=temperatureDefaults();document.querySelectorAll('[data-ferment]').forEach(b=>{b.classList.toggle('active',b.dataset.ferment===referenceMethod);b.setAttribute('aria-pressed',String(b.dataset.ferment===referenceMethod))});const temp='設定室温 '+d.room+'℃'+(referenceMethod==='mixed'?' ／ 冷蔵庫 '+d.fridge+'℃':'');let msg='';if(state.process==='poolish'){const pct=Number(state.bigaFlour)>0?Number(state.prefermentYeast)/Number(state.bigaFlour)*100:0;msg='ポーリッシュ：18〜20℃では、インスタントドライイーストを種の粉に対し約0.08%使用する場合12〜16時間、0.28%なら約8時間、0.5%なら約4時間という専門書の目安があります。現在の種用酵母比率は約'+pct.toFixed(2)+'%。条件が一致しない場合は時間を換算できません。'}else if(state.process==='biga'){msg='ビガ種：種の加水率、温度、酵母量で熟成が変化します。現在の配合に対する検証済みの所要時間は未設定です。香り・膨らみ・生地の状態を確認してください。'}else{msg='ストレート法：こね上げ時の生地温度と酵母量によって発酵時間が変わります。現在の配合に対する検証済みの所要時間は未設定です。'}if(referenceMethod==='mixed')msg+=' 冷蔵中も生地はすぐに設定温度まで下がらず、発酵は直ちに止まりません。冷蔵時間を常温時間へ単純換算しないでください。';$('fermentReference').textContent=temp+'。'+msg+'（参考情報であり発酵完了予測ではありません）'}
document.querySelectorAll('[data-ferment]').forEach(b=>b.onclick=()=>{referenceMethod=b.dataset.ferment;renderFermentReference()});
const _originalSticky=updateStickySummary;updateStickySummary=function(c){_originalSticky(c);renderFermentReference()};renderFermentReference();

// RC1: duration choice controls; editable hours and visual selection.
function syncDurationPicks(){document.querySelectorAll('.duration-picks').forEach(group=>{const id=group.dataset.target,input=$(id),v=input.value;const values=[...group.querySelectorAll('button[data-hours]')].map(b=>b.dataset.hours).filter(x=>x!=='custom');const isCustom=v!==''&&!values.includes(v);group.querySelectorAll('button').forEach(b=>b.classList.toggle('active',v!==''&&(isCustom?b.dataset.hours==='custom':b.dataset.hours===v)));$(id==='noteSeedHours'?'noteSeedCustom':'noteMatureCustom').hidden=!isCustom});updateDurations()}
document.querySelectorAll('.duration-picks').forEach(group=>{const id=group.dataset.target;group.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.hours==='custom'){$(id==='noteSeedHours'?'noteSeedCustom':'noteMatureCustom').hidden=false;group.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));$(id).focus();return}$(id).value=b.dataset.hours;syncDurationPicks()}));$(id).addEventListener('input',()=>{const custom=$(id==='noteSeedHours'?'noteSeedCustom':'noteMatureCustom');custom.hidden=false;group.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.hours==='custom'));updateDurations()})});
const _showNotes=showNotes;showNotes=function(){_showNotes();syncDurationPicks()};
const _resetNoteForm=resetNoteForm;resetNoteForm=function(){_resetNoteForm();syncDurationPicks()};
// Collapsible headers show the live flour total and hydration.
function updateSectionMetrics(c){const buttons=document.querySelectorAll('#recipe>.card>.section-fold');if(buttons[1]){buttons[1].innerHTML='<span>② 粉の配合</span><span class="fold-metric">'+fmt(c.totalFlour)+'g</span>'}if(buttons[2]){buttons[2].innerHTML='<span>③ 配合を調整</span><span class="fold-metric">'+fmt(Number(state.hydration))+'%</span>'}}
updateSectionMetrics(calc());syncDurationPicks();
