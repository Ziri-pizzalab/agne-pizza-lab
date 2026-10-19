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
let state=clone(defaults),adopted=read('ange-v2-adopted',{});
const old=read('ange-current',null),savedV2=read('ange-v2-current',null);
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
 else{let used=0;for(let i=0;i<state.flours.length-1;i++){state.flours[i].pct=round(Math.min(state.flours[i].pct,100-used));used+=state.flours[i].pct}state.flours.at(-1).pct=round(100-used)}
 state.stage=state.process==='straight'?'final':state.stage==='final'?'final':'biga';
 state.fermentMethod=['room','cold','mixed'].includes(state.fermentMethod)?state.fermentMethod:'room';
}
normalise();
function persist(){try{localStorage.setItem('ange-v2-current',JSON.stringify(state))}catch(e){console.warn('Storage unavailable',e)}}
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
 $('style').value=state.style;$('process').value=state.process;$('yeastType').value=state.yeastType;
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
 flourRows();results();fermentUI();bakeGuide();
}
function flourRows(){
 const c=calc();const host=$('flourRows');host.replaceChildren();
 const showSeed=state.process!=='straight';
 for(let i=0;i<state.flours.length;i++){
  const f=state.flours[i];const row=document.createElement('div');row.className='flour-row';
  const name=document.createElement('div');name.className='flour-name';const label=document.createElement('label');label.textContent='粉 '+(i+1);const input=document.createElement('input');input.placeholder='粉の名前';input.value=f.name;input.oninput=()=>{f.name=input.value;persist();results()};name.append(label,input);
  const pct=document.createElement('div');pct.className='flour-pct';const lp=document.createElement('label');lp.textContent=i===state.flours.length-1?'自動 %':'配合 %';pct.append(lp);
  if(i===state.flours.length-1){const fixed=document.createElement('div');fixed.className='auto-pct';fixed.textContent=fmt(f.pct)+'%';pct.append(fixed)}
  else{const p=document.createElement('input');p.type='number';p.min='0';p.max='100';p.step='.1';p.value=String(f.pct);p.onchange=()=>{const earlier=state.flours.slice(0,-1).filter(x=>x!==f).reduce((s,x)=>s+x.pct,0);f.pct=round(Math.max(0,Math.min(100-earlier,Number(p.value)||0)));state.flours.at(-1).pct=round(100-state.flours.slice(0,-1).reduce((s,x)=>s+x.pct,0));prepareSeeds();persist();queueMicrotask(()=>{flourRows();results()})};pct.append(p)}
  row.append(name,pct);
  if(state.flours.length>1){const del=document.createElement('button');del.className='quiet delete-flour';del.textContent='×';del.setAttribute('aria-label','この粉を削除');del.onclick=()=>{state.flours.splice(i,1);if(state.flours.length===1)state.flours[0].pct=100;else state.flours.at(-1).pct=round(100-state.flours.slice(0,-1).reduce((s,x)=>s+x.pct,0));prepareSeeds();persist();flourRows();results()};row.append(del)}
  const foot=document.createElement('div');foot.className='flour-foot';const gm=document.createElement('span');gm.textContent='全体 '+fmt(c.flours[i].grams)+'g';foot.append(gm);
  if(showSeed){const seedL=document.createElement('label');seedL.textContent='種用';const seedInput=document.createElement('input');seedInput.type='number';seedInput.min='0';seedInput.step='.1';seedInput.max=String(Math.max(0,c.flours[i].grams));seedInput.value=String(round(f.seed));seedInput.setAttribute('aria-label',`粉${i+1}の種用グラム数`);seedInput.onchange=()=>{f.seed=Math.max(0,Math.min(c.flours[i].grams,Number(seedInput.value)||0));state.bigaFlour=state.flours.reduce((s,x)=>s+x.seed,0);persist();queueMicrotask(()=>{flourRows();results()})};const g=document.createElement('span');g.textContent='g';foot.append(seedL,seedInput,g)}
  row.append(foot);host.append(row);
 }
 $('addFlour').hidden=state.flours.length>=4;
}
function group(id,title,theme,items){const wrap=document.createElement('section');wrap.className='ingredient-group '+theme;const heading=document.createElement('h3');heading.textContent=title;wrap.append(heading);const grid=document.createElement('div');grid.className='ingredient-grid';for(const item of items){const card=document.createElement('div');card.className='ingredient';const name=document.createElement('small');name.textContent=item[0];const value=document.createElement('b');value.textContent=Number.isFinite(item[1])?fmt(item[1])+'g':'—';card.append(name,value);if(item[2]?.length){const lines=document.createElement('div');lines.className='ingredient-breakdown';for(const t of item[2]){const d=document.createElement('div');d.textContent=t;lines.append(d)}card.append(lines)}grid.append(card)}wrap.append(grid);$(id).append(wrap)}
function results(){
 const c=calc();$('warning').hidden=c.valid;if(!c.valid)$('warning').textContent='種用の水または粉が総量を超えています。粉の配分や加水率を確認してください。';
 $('ingredientGroups').replaceChildren();if(!c.valid){$('doughTotal').textContent='—';$('ballsResult').textContent='—';return}
 const blended=state.flours.length>1;
 const preFlours=c.flours.filter(f=>f.seed>1e-7).map(f=>(f.name||'名称未設定')+' '+fmt(f.seed)+'g');
 const mainFlours=c.flours.filter(f=>f.grams-(state.process==='straight'?0:f.seed)>1e-7).map(f=>(f.name||'名称未設定')+' '+fmt(f.grams-(state.process==='straight'?0:f.seed))+'g');
 const allFlours=c.flours.map(f=>(f.name||'名称未設定')+' '+fmt(f.pct)+'%（'+fmt(f.grams)+'g）');
 if(state.process!=='straight')group('ingredientGroups','① 発酵種（'+(state.process==='biga'?'ビガ':'ポーリッシュ')+'）','seed',[['種用の粉',c.seedFlour,blended?preFlours:[]],['種用の水',c.seedWater],['種用イースト',c.seedYeast]]);
 group('ingredientGroups',state.process==='straight'?'① 本練り':'② 本練り','main',[['本練り用の粉',c.totalFlour-c.seedFlour,blended?mainFlours:[]],['本練り用の水',c.water-c.seedWater],['本練り用イースト',Number(state.yeast)-c.seedYeast]]);
 group('ingredientGroups',state.process==='straight'?'② 全体・仕上がり':'③ 全体・仕上がり','overall',[['総粉量',c.totalFlour,blended?allFlours:[]],['塩',c.totalFlour*Number(state.salt)/100],['オイル',c.totalFlour*Number(state.oil)/100],...c.extras.map(x=>[x.name,x.grams])]);
 $('doughTotal').textContent=fmt(c.dough)+'g';$('ballsResult').textContent=c.balls+'個 / '+fmt(c.leftover)+'g';
 $('yeastOut').textContent=fmt(Number(state.yeast))+'g';$('yeastPercent').textContent='総粉量に対して '+(Number(state.yeast)/c.totalFlour*100).toFixed(3)+'%';
}
function fermentUI(){
 $('stage').replaceChildren();if(state.process!=='straight'){const o=document.createElement('option');o.value='biga';o.textContent=state.process==='biga'?'ビガ（種）':'ポーリッシュ（種）';$('stage').append(o)}const f=document.createElement('option');f.value='final';f.textContent='本練り後';$('stage').append(f);if(state.process==='straight')state.stage='final';$('stage').value=state.stage;
 $('fermentMethod').value=state.fermentMethod;$('room').value=state.room;$('fridge').value=state.fridge;$('beforeCold').value=state.beforeCold;
 $('roomOut').textContent=state.room+'℃';$('fridgeOut').textContent=state.fridge+'℃';$('beforeColdBox').hidden=state.fermentMethod!=='mixed';fermentResult();
}
function fermentResult(){
 const c=calc(),seed=state.stage==='biga'&&state.process!=='straight';const yeast=seed?c.seedYeast:Number(state.yeast)-c.seedYeast;const flour=seed?c.seedFlour:c.totalFlour-c.seedFlour;const ratio=flour>0?yeast/flour:0;
 if(!c.valid||ratio<=0){$('fermentEstimate').textContent='算出できません';$('fermentDetail').textContent='該当工程の粉とイースト量を確認してください';return}
 // Experimental only: no stage-specific validated prediction. Rough equivalent of 25C 0.333% dry yeast at 20 hours.
 const dryRatio=ratio/(state.yeastType==='fresh'?3:1);
 const base=20*(.0033333333333/dryRatio);
 const q=t=>Math.pow(2,(t-25)/10);
 const atRoom=base/q(Number(state.room));const atCold=base/q(Number(state.fridge));
 let estimate=atRoom,explain='常温での概算';
 if(state.fermentMethod==='cold'){estimate=atCold;explain='冷蔵の概算（冷却にかかる時間は未計算）'}
 if(state.fermentMethod==='mixed'){estimate=Number(state.beforeCold)+Math.max(0,(base-Number(state.beforeCold)*q(Number(state.room)))/q(Number(state.fridge)));explain='常温'+fmt(Number(state.beforeCold))+'時間後に冷蔵した場合の概算（冷却・復温時間は未計算）'}
 const clamped=estimate>240;
 $('fermentEstimate').textContent=clamped?'長時間（240時間超）':Math.max(.5,round(estimate*.6))+'〜'+round(estimate*1.5)+'時間';
 $('fermentDetail').textContent=explain+'。実測ではなく単純な温度・イースト量モデルによる試算です。'+(seed?'種の成熟状態を確認してください。':'本練り後の熟成・発酵条件は生地により大きく異なります。');
}
function bakeGuide(){const el=$('bakeGuide');el.replaceChildren();const s=document.createElement('strong');s.textContent=presets[state.style].name;const p=document.createElement('div');p.textContent=presets[state.style].bake;el.append(s,p)}
function applyPreset(k){const p=adopted[k]||presets[k];state.style=k;for(const key of ['hydration','salt','oil'])state[key]=p[key];state.extras=clone([p.extras?.[0]||{name:'',pct:0},p.extras?.[1]||{name:'',pct:0}]);if(p.flours)state.flours=clone(p.flours);if(p.process)state.process=p.process;if(p.bigaHyd!==undefined)state.bigaHyd=p.bigaHyd;normalise();prepareSeeds();persist();redraw()}
function savedRecipes(){const curr=read('ange-v2-recipes',[]),prev=read('ange-recipes',[]);return [...(Array.isArray(curr)?curr.map((r,i)=>({...r,_key:'ange-v2-recipes',_i:i})):[]),...(Array.isArray(prev)?prev.map((r,i)=>({...r,_key:'ange-recipes',_i:i,legacy:true})):[])]}
function showRecipes(){const root=$('recipeList');root.replaceChildren();for(const r of savedRecipes()){const div=document.createElement('div');div.className='saved-item';const info=document.createElement('div');const b=document.createElement('strong');b.textContent=r.name+(r.legacy?'（旧版）':'');const small=document.createElement('small');small.textContent=r.savedAt||'';info.append(b,small);const actions=document.createElement('div');actions.className='actions';const load=document.createElement('button');load.className='quiet small-action';load.textContent='読込';load.onclick=()=>{const s=r.state||{};if(r.legacy){state={...clone(defaults),...Object.fromEntries(['mode','bigaFlour','bigaHyd','extraFlour','hydration','salt','oil','ball','quantity'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]]))};state.totalFlour=Number(state.bigaFlour)+Number(state.extraFlour);state.yeast=round(state.totalFlour*Number(s.yeast??.15)/100);state.prefermentYeast=state.yeast}else {state={...clone(defaults),...clone(s)};state.totalFlour=Number(s.totalFlour??(Number(s.bigaFlour??300)+Number(s.extraFlour??360)))};normalise();prepareSeeds();persist();redraw();selectTab('recipe')};const del=document.createElement('button');del.className='quiet small-action';del.textContent='削除';del.onclick=()=>{if(!confirm('このレシピを削除しますか？'))return;const list=read(r._key,[]);list.splice(r._i,1);localStorage.setItem(r._key,JSON.stringify(list));showRecipes()};actions.append(load,del);div.append(info,actions);root.append(div)}}
function selectTab(tab){document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===tab));document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab))}
$('style').onchange=e=>applyPreset(e.target.value);
$('process').onchange=e=>{state.process=e.target.value;if(state.process==='poolish'&&state.bigaHyd<80)state.bigaHyd=100;if(state.process==='biga'&&state.bigaHyd>80)state.bigaHyd=50;if(state.process!=='straight'&&state.flours.every(f=>f.seed===0))state.flours[0].seed=Math.min(300,flourTotal());normalise();persist();redraw()};
$('addFlour').onclick=()=>{if(state.flours.length>=4)return;const last=state.flours.at(-1);const newcomer=round(last.pct/2);last.pct=round(last.pct-newcomer);state.flours.push({id:Math.max(...state.flours.map(x=>x.id))+1,name:'',pct:newcomer,seed:0});prepareSeeds();persist();flourRows();results()};
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{if(state.mode==='target'&&button.dataset.mode==='flour'){const c=calc();state.totalFlour=Math.max(0,round(c.totalFlour))}state.mode=button.dataset.mode;prepareSeeds();persist();redraw()};
$('yeastType').onchange=e=>{const next=e.target.value;if(next!==state.yeastType){const factor=next==='fresh'?3:1/3;state.yeast=round(state.yeast*factor);state.prefermentYeast=round(state.prefermentYeast*factor);state.yeastType=next;persist();redraw()}};
function syncYeast(){state.prefermentYeast=Math.min(state.prefermentYeast,state.yeast);$('yeast').value=state.yeast;$('prefermentYeast').value=state.prefermentYeast;persist();results();fermentResult()}
$('yeast').oninput=e=>{state.yeast=Number(e.target.value);syncYeast()};$('yeastMinus').onclick=()=>{state.yeast=Math.max(0,round(state.yeast-.1));syncYeast()};$('yeastPlus').onclick=()=>{state.yeast=Math.min(10,round(state.yeast+.1));syncYeast()};$('prefermentYeast').onchange=e=>{state.prefermentYeast=Math.max(0,Math.min(state.yeast,Number(e.target.value)||0));syncYeast()};
for(let i=0;i<2;i++)for(const [type,k] of [['extraName','name'],['extraPct','pct']])$(type+i).oninput=e=>{state.extras[i][k]=k==='pct'?Math.max(0,Math.min(50,Number(e.target.value)||0)):e.target.value;prepareSeeds();persist();flourRows();results()};
$('adopt').onclick=()=>{adopted[state.style]={hydration:state.hydration,salt:state.salt,oil:state.oil,extras:clone(state.extras),flours:clone(state.flours),process:state.process,bigaHyd:state.bigaHyd};localStorage.setItem('ange-v2-adopted',JSON.stringify(adopted));$('adoptStatus').textContent='✓ '+presets[state.style].name+'の配合を保存しました'};
$('restorePreset').onclick=()=>{if(!confirm('このスタイルで採用した配合を初期値に戻しますか？'))return;delete adopted[state.style];localStorage.setItem('ange-v2-adopted',JSON.stringify(adopted));applyPreset(state.style);$('adoptStatus').textContent='初期配合に戻しました'};
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>selectTab(button.dataset.tab);
$('stage').onchange=e=>{state.stage=e.target.value;persist();fermentResult()};$('fermentMethod').onchange=e=>{state.fermentMethod=e.target.value;persist();fermentUI()};
for(const k of ['room','fridge'])$(k).oninput=e=>{state[k]=Number(e.target.value);$(k+'Out').textContent=state[k]+'℃';persist();fermentResult()};$('beforeCold').oninput=e=>{state.beforeCold=Math.max(0,Number(e.target.value)||0);persist();fermentResult()};
$('saveRecipe').onclick=()=>{const flourLabel=state.flours.map(f=>f.name.trim()).filter(Boolean).join('＋');const label=$('recipeName').value.trim()||`${flourLabel||presets[state.style].name}・${fmt(state.hydration)}%・${{biga:'ビガ法',straight:'ストレート法',poolish:'ポーリッシュ法'}[state.process]}`;const recipes=read('ange-v2-recipes',[]);const {stage,fermentMethod,room,fridge,beforeCold,...recipe}=state;recipes.unshift({name:label,state:clone(recipe),savedAt:new Date().toLocaleDateString('ja-JP')});localStorage.setItem('ange-v2-recipes',JSON.stringify(recipes));$('recipeName').value='';showRecipes()};
$('reset').onclick=()=>{if(confirm('現在の配合だけ初期化しますか？（保存レシピと採用済みプリセットは残ります）')){state=clone(defaults);normalise();persist();redraw()}};
normalise();prepareSeeds();redraw();showRecipes();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
