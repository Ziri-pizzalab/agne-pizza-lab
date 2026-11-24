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
 state.flours=arr.map((f,i)=>({id:Number(f.id)||i+1,name:String(f.name||''),seedName:String(f.seedName??''),pct:Math.max(0,Number(f.pct)||0),seed:Math.max(0,Number(f.seed)||0)}));
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
// Allocate integer grams: the final flour always absorbs rounding differences.
function allocateFlourGrams(total,flours){
 const grams=Math.max(0,Math.round(total));
 if(!flours.length)return [];
 const result=[];let remaining=grams;
 for(let i=0;i<flours.length-1;i++){
  const desired=Math.round(grams*Math.max(0,Number(flours[i].pct)||0)/100);
  const value=Math.max(0,Math.min(remaining,desired));
  result.push(value);remaining-=value;
 }
 result.push(remaining);
 return result;
}
function prepareSeeds(){
 const total=flourTotal();if(!Number.isFinite(total))return;
 const weights=allocateFlourGrams(total,state.flours);
 state.flours.forEach((f,i)=>{f.seed=Math.max(0,Math.min(Number(f.seed)||0,weights[i]))})
 state.bigaFlour=state.process==='straight'?0:round(state.flours.reduce((s,f)=>s+f.seed,0),5);
}
function calc(){
 const totalFlour=Math.round(flourTotal());const weights=allocateFlourGrams(totalFlour,state.flours);const flours=state.flours.map((f,i)=>({...f,grams:weights[i],pct:totalFlour?weights[i]/totalFlour*100:0}));
 const seedFlour=state.process==='straight'?0:flours.reduce((s,f)=>s+f.seed,0);
 const seedWater=seedFlour*Number(state.bigaHyd)/100;
 const water=totalFlour*Number(state.hydration)/100;
 const extras=state.extras.filter(f=>f.name.trim()&&Number(f.pct)>0).map(x=>({...x,grams:totalFlour*x.pct/100}));
 const dough=totalFlour+water+totalFlour*(Number(state.salt)+Number(state.oil))/100+extras.reduce((s,x)=>s+x.grams,0)+Number(state.yeast);
 const seedYeast=state.process==='straight'?0:Number(state.prefermentYeast);
 const valid=totalFlour>0&&Number.isFinite(dough)&&water+1e-8>=seedWater&&seedYeast>=0&&seedYeast<=Number(state.yeast)&&flours.every(f=>f.seed>=0&&f.seed<=f.grams+1e-7)&&seedFlour<=totalFlour+1e-7;
 return {totalFlour,flours,seedFlour,seedWater,water,extras,dough,seedYeast,valid,balls:Math.floor((dough+1e-7)/Number(state.ball)),leftover:Math.max(0,dough%Number(state.ball))};
}
function numberStepper({label, unit, readValue, writeValue, min = 0, max, step, integer = false}) {
 const control = document.createElement('div');
 control.className = 'number-stepper';
 const field = document.createElement('label');
 field.className = 'number-stepper-value';
 const input = document.createElement('input');
 input.type = 'number';
 input.inputMode = integer ? 'numeric' : 'decimal';
 input.step = integer ? '1' : 'any';
 input.setAttribute('aria-label', label + '（' + unit + '）');
 const unitLabel = document.createElement('span');
 unitLabel.textContent = unit;
 unitLabel.setAttribute('aria-hidden', 'true');
 field.append(input, unitLabel);

 const limit = typeof max === 'function' ? max : () => max;
 const sync = () => {
  input.min = String(min);
  input.max = String(limit());
  input.value = String(readValue());
 };
 const setValue = value => {
  if (Number.isFinite(value)) {
   const bounded = Math.max(min, Math.min(limit(), integer ? Math.round(value) : value));
   writeValue(bounded);
  }
  sync();
 };
 const typedValue = () => input.value.trim() === '' || input.validity.badInput ? NaN : Number(input.value);
 input.onchange = () => setValue(typedValue());
 input.onkeydown = event => {
  if (event.key === 'Enter') input.blur();
  if (event.key === 'Escape') { sync(); input.blur(); }
 };
 const buttons = [-1, 1].map(direction => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quiet';
  button.textContent = direction < 0 ? '−' : '＋';
  button.setAttribute('aria-label', label + 'を' + step + unit + (direction < 0 ? '減らす' : '増やす'));
  const advance = () => {
   const before = Number(readValue());
   const pending = typedValue();
   const value = Number.isFinite(pending) ? pending : before;
   setValue(round(value + direction * step, 8));
   return Number(readValue()) !== before;
  };
  let pointer = null;
  let repeatTimer;
  let repeats = 0;
  const stopRepeat = event => {
   if (event && event.pointerId !== pointer) return;
   clearTimeout(repeatTimer);
   pointer = null;
  };
  const repeat = () => {
   if (!button.isConnected || document.hidden) {
    stopRepeat();
    return;
   }
   repeats++;
   if (advance()) repeatTimer = setTimeout(repeat, repeats < 7 ? 125 : 65);
  };
  button.onpointerdown = event => {
   if (!event.isPrimary || event.button !== 0 || pointer !== null) return;
   pointer = event.pointerId;
   repeats = 0;
   repeatTimer = setTimeout(repeat, 380);
  };
  button.onpointerup = button.onpointercancel = button.onpointerleave = button.onlostpointercapture = stopRepeat;
  button.oncontextmenu = event => event.preventDefault();
  button.onclick = event => {
   // A long press already changed the value before the release click.
   if (repeats && event?.detail !== 0) {
    repeats = 0;
    return;
   }
   advance();
  };
  return button;
 });
 control.append(buttons[0], field, buttons[1]);
 sync();
 return {control, sync};
}

function appendNumberControl(host, label, options) {
 const wrapper = document.createElement('div');
 wrapper.className = 'formula-control';
 const title = document.createElement('span');
 title.className = 'formula-control-label';
 title.textContent = label;
 const stepper = numberStepper({label, ...options});
 wrapper.append(title, stepper.control);
 $(host).append(wrapper);
 return stepper.sync;
}

function stateNumberControl(host, label, key, min, max, step, unit, integer = false) {
 appendNumberControl(host, label, {
  unit, min, max, step, integer,
  readValue: () => state[key],
  writeValue(value) {
   state[key] = value;
   if (key !== 'bigaHyd') prepareSeeds();
   persist();
   updateFlourRowsInPlace();
   results();
  },
 });
}

function redraw(){
 $('style').replaceChildren();for(const [k,p] of Object.entries(presets)){const o=document.createElement('option');o.value=k;o.textContent=p.name;$('style').append(o)}
 $('style').value=state.style;$('process').value=state.process;document.querySelectorAll('[data-process]').forEach(b=>{const active=b.dataset.process===state.process;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});$('yeastType').value=state.yeastType;
 $('styleSource').replaceChildren(document.createTextNode(presets[state.style].source+' '));if(presets[state.style].url){const a=document.createElement('a');a.textContent='参考元';a.href=presets[state.style].url;a.target='_blank';a.rel='noopener';$('styleSource').append(a)}
 document.querySelectorAll('[data-mode]').forEach(button => {
  const active = button.dataset.mode === state.mode;
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
 });
 $('baseControls').replaceChildren();
 $('ratioControls').replaceChildren();
 $('prefermentControls').replaceChildren();
 if (state.mode === 'flour') stateNumberControl('baseControls','総粉量','totalFlour',100,1800,1,'g',true);
 stateNumberControl('baseControls','1玉の重さ','ball',80,400,5,'g',true);
 if (state.mode === 'target') stateNumberControl('baseControls','玉数','quantity',1,24,1,'個',true);
 $('prefermentBox').hidden = state.process === 'straight';
 $('prefermentTitle').textContent = state.process === 'poolish' ? 'ポーリッシュ' : 'ビガ';
 if (state.process !== 'straight') {
  const poolish = state.process === 'poolish';
  stateNumberControl('prefermentControls','種の加水率','bigaHyd',poolish ? 80 : 40,poolish ? 120 : 80,1,'%',true);
 }
 stateNumberControl('ratioControls','最終加水率','hydration',45,90,0.5,'%');
 stateNumberControl('ratioControls','塩分率','salt',0,5,0.1,'%');
 stateNumberControl('ratioControls','オイル率','oil',0,10,0.5,'%');
 $('yeastSplitField').hidden = state.process === 'straight';
 syncTotalYeast();
 syncSeedYeast();
 for (let i = 0; i < 2; i++) {
  $('extraName' + i).value = state.extras[i].name;
  syncExtraRates[i]();
 }
 flourRows();
 results();
}

let syncFlourRows = [];
function updateFlourRowsInPlace() {
 for (const sync of syncFlourRows) sync();
}

function flourNameField(flour, key, label, placeholder) {
 const field = document.createElement('label');
 field.className = 'field flour-name-field';
 field.textContent = label;
 const input = document.createElement('input');
 input.value = flour[key] ?? '';
 input.placeholder = placeholder;
 input.oninput = () => {
  flour[key] = input.value;
  persist();
  results();
 };
 field.append(input);
 return field;
}

function flourRows() {
 const host = $('flourRows');
 host.replaceChildren();
 syncFlourRows = state.flours.map((flour, index) => {
  const row = document.createElement('div');
  row.className = 'formula-flour';
  const title = '粉 ' + (index + 1);
  const header = document.createElement('div');
  header.className = 'formula-flour-header';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const ratio = document.createElement('span');
  ratio.className = 'formula-flour-ratio';
  header.append(heading, ratio);
  if (state.flours.length > 1) {
   const remove = document.createElement('button');
   remove.className = 'quiet';
   remove.textContent = '×';
   remove.setAttribute('aria-label', title + 'を削除');
   remove.onclick = () => {
    state.flours.splice(index, 1);
    const sum = state.flours.reduce((total, item) => total + item.pct, 0);
    state.flours.forEach(item => item.pct = sum ? item.pct / sum * 100 : 100 / state.flours.length);
    prepareSeeds(); persist(); redraw();
   };
   header.append(remove);
  }
  row.append(header);
  const quantity = document.createElement('div');
  quantity.className = 'formula-control formula-flour-quantity';
  const label = document.createElement('span');
  label.className = 'formula-control-label';
  const automatic = index === state.flours.length - 1;
  label.textContent = automatic ? '粉の合計（自動）' : '粉の合計';
  quantity.append(label);

  const remaining = () => {
   const current = calc();
   const other = current.flours.slice(0,-1).reduce((total, item, i) => total + (i === index ? 0 : item.grams), 0);
   return Math.max(0, current.totalFlour - other);
  };
  let syncWeight;
  if (automatic) {
   const output = document.createElement('output');
   output.className = 'formula-auto-weight';
   output.setAttribute('aria-label', title + 'の自動計算粉量');
   quantity.append(output);
   syncWeight = grams => { output.textContent = fmt(grams) + 'g'; };
  } else {
   const weight = numberStepper({
    label:title + 'の粉量', unit:'g', step:1, integer:true, max:remaining,
    readValue:() => calc().flours[index].grams,
    writeValue(value) {
     const current = calc();
     const weights = current.flours.map(item => item.grams);
     weights[weights.length - 1] = remaining() - value;
     weights[index] = value;
     state.flours.forEach((item, i) => item.pct = current.totalFlour ? weights[i] / current.totalFlour * 100 : (i === weights.length - 1 ? 100 : 0));
     prepareSeeds(); persist(); updateFlourRowsInPlace(); results();
    },
   });
   quantity.append(weight.control);
   syncWeight = weight.sync;
  }
  row.append(quantity);
  const straight = state.process === 'straight';
  const mainName = flourNameField(flour, 'name', straight ? '使う粉の名前' : '本捏ねの粉の名前', '例：カプート');
  let seed;
  let mainAmount;
  if (!straight) {
   seed = numberStepper({
    label:title + 'の発酵種に使う粉量', unit:'g', step:1, integer:true,
    max:() => calc().flours[index].grams,
    readValue:() => flour.seed,
    writeValue(value) {
     flour.seed = value;
     prepareSeeds(); persist(); updateFlourRowsInPlace(); results();
    },
   });
   const seedGroup = document.createElement('div');
   seedGroup.className = 'flour-phase flour-phase-seed';
   const seedName = flourNameField(flour, 'seedName', '発酵種の粉の名前', '空欄なら本捏ねと同じ');
   const seedWeight = document.createElement('div');
   seedWeight.className = 'formula-control formula-flour-quantity';
   const seedLabel = document.createElement('span');
   seedLabel.className = 'formula-control-label';
   seedLabel.textContent = '発酵種の粉量';
   seedWeight.append(seedLabel, seed.control);
   seedGroup.append(seedName, seedWeight);
   row.append(seedGroup);

   const mainGroup = document.createElement('div');
   mainGroup.className = 'flour-phase';
   const mainWeight = document.createElement('div');
   mainWeight.className = 'formula-control formula-flour-quantity';
   const mainLabel = document.createElement('span');
   mainLabel.className = 'formula-control-label';
   mainLabel.textContent = '本捏ねの粉量（自動）';
   mainAmount = document.createElement('output');
   mainAmount.className = 'formula-auto-weight';
   mainAmount.setAttribute('aria-label', title + 'の本捏ねの粉量');
   mainWeight.append(mainLabel, mainAmount);
   mainGroup.append(mainName, mainWeight);
   row.append(mainGroup);
  } else {
   row.append(mainName);
  }
  host.append(row);
  return () => {
   const {grams, pct} = calc().flours[index];
   ratio.textContent = fmt(pct) + '%';
   syncWeight(grams);
   if (seed) {
    seed.sync();
    mainAmount.textContent = fmt(grams - flour.seed) + 'g';
   }
  };
 });
 updateFlourRowsInPlace();
 $('addFlour').hidden = state.flours.length >= 4;
}

function results() {
 const current = calc();
 updateStickySummary(current);
 updateSectionMetrics(current);
 $('yeastPercent').textContent = current.valid ? '総粉量に対して ' + (Number(state.yeast) / current.totalFlour * 100).toFixed(3) + '%' : '';
}

function applyPreset(k){const p=adopted[k]||presets[k];state.style=k;for(const key of ['hydration','salt','oil'])state[key]=p[key];state.extras=clone([p.extras?.[0]||{name:'',pct:0},p.extras?.[1]||{name:'',pct:0}]);if(p.flours)state.flours=clone(p.flours);if(p.process)state.process=p.process;if(p.bigaHyd!==undefined)state.bigaHyd=p.bigaHyd;normalise();prepareSeeds();persist();redraw()}
function savedRecipes(){const curr=read('ange-v3-recipes',[]),prev=[];return [...(Array.isArray(curr)?curr.map((r,i)=>({...r,_key:'ange-v3-recipes',_i:i})):[]),...(Array.isArray(prev)?prev.map((r,i)=>({...r,_key:'ange-recipes',_i:i,legacy:true})):[])]}
let recipeVisible=5;let editingRecipe=null;
function currentRecipeData(){const {stage,fermentMethod,room,fridge,beforeCold,...recipe}=state;return clone(recipe)}
function loadRecipeState(r){const s=r.state||{};if(r.legacy){state={...clone(defaults),...Object.fromEntries(['mode','bigaFlour','bigaHyd','extraFlour','hydration','salt','oil','ball','quantity'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]]))};state.totalFlour=Number(state.bigaFlour)+Number(state.extraFlour);state.yeast=round(state.totalFlour*Number(s.yeast??.15)/100);state.prefermentYeast=state.yeast}else{state={...clone(defaults),...clone(s)};state.totalFlour=Number(s.totalFlour??(Number(s.bigaFlour??300)+Number(s.extraFlour??360)))}normalise();prepareSeeds();persist();redraw()}
function recipeKey(r){return r.id||r._key+'::'+r._i}
const fermentationMethods = {room:'常温', cold:'冷蔵', mixed:'常温＋冷蔵庫'};

const processLabels = {biga:'ビガ', straight:'ストレート', poolish:'ポーリッシュ'};

function labelWithIcon(element, icon, label) {
 const symbol = document.createElement('span');
 symbol.className = 'ui-icon ui-icon-' + icon;
 symbol.setAttribute('aria-hidden', 'true');
 element.append(symbol, document.createTextNode(label));
}

function listAction(icon, label, iconOnly = false) {
 const button = document.createElement('button');
 button.type = 'button';
 button.className = 'quiet icon-action';
 labelWithIcon(button, icon, iconOnly ? '' : label);
 if (iconOnly) {
  button.classList.add('icon-only');
  button.setAttribute('aria-label', label);
  button.title = label;
 }
 return button;
}

function showRecipes() {
 const root = $('recipeList');
 root.replaceChildren();
 const query = $('recipeSearch').value.trim().toLocaleLowerCase();
 const matches = savedRecipes().filter(recipe => {
  const data = recipe.state || {};
  const flours = (data.flours || []).flatMap(flour => [flour.name, flour.seedName]).join(' ');
  const process = processLabels[data.process];
  return [recipe.name, flours, process, data.hydration, recipe.savedAt]
   .join(' ').toLocaleLowerCase().includes(query);
 });
 if ($('recipeSort').value === 'name') matches.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

 for (const recipe of matches.slice(0, recipeVisible)) {
  const item = document.createElement('div');
  item.className = 'saved-item';
  item.classList.toggle('edit-active', editingRecipe !== null && recipeKey(editingRecipe) === recipeKey(recipe));
  const info = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = recipe.name + (recipe.legacy ? '（旧版）' : '');
  const summary = document.createElement('small');
  summary.textContent = [
   processLabels[recipe.state?.process],
   recipe.state?.hydration !== undefined ? '加水 ' + recipe.state.hydration + '%' : '',
   recipe.savedAt,
  ].filter(Boolean).join(' · ');
  info.append(name, summary);
  item.append(info);
  if (recipe.conditions) item.append(recipeConditionDetails(recipe.conditions));

  const actions = document.createElement('div');
  actions.className = 'actions';
  const load = listAction('scale', '読込');
  load.onclick = () => {
   stopRecipeEditing();
   loadRecipeState(recipe);
   $('recipeEditStatus').textContent = 'レシピを配合画面に読み込みました';
   selectTab('recipe');
   showRecipes();
  };
  const edit = listAction('edit', '編集');
  edit.onclick = () => {
   loadRecipeState(recipe);
   editingRecipe = recipe;
   $('recipeName').value = recipe.name;
   fillRecipeConditions('editRecipeConditions', recipe.conditions);
   $('recipeEditor').hidden = false;
   $('editRecipeOptions').open = false;
   $('quickSaveLabel').textContent = '編集へ';
   $('recipeEditStatus').textContent = '編集中：' + recipe.name;
   showRecipes();
   $('recipeName').focus();
  };
  const remove = listAction('trash', 'レシピを削除', true);
  remove.onclick = () => {
   if (!confirm('このレシピを削除しますか？（過去のピザノートには影響しません）')) return;
   const list = read(recipe._key, []);
   const index = recipe.id ? list.findIndex(entry => entry.id === recipe.id) : recipe._i;
   if (index < 0 || index >= list.length) return;
   list.splice(index, 1);
   localStorage.setItem(recipe._key, JSON.stringify(list));
   if (editingRecipe && recipeKey(editingRecipe) === recipeKey(recipe)) stopRecipeEditing();
   showRecipes();
   refreshNoteRecipes();
  };
  actions.append(load, edit, remove);
  item.append(actions);
  root.append(item);
 }

 if (!matches.length) {
  const empty = document.createElement('p');
  empty.className = 'note';
  empty.textContent = query ? '一致するレシピはありません。' : 'まだ保存されたレシピはありません。';
  root.append(empty);
  if (!query) {
   const goToFormula = listAction('scale', '配合へ');
   goToFormula.onclick = () => selectTab('recipe');
   root.append(goToFormula);
  }
 }
 $('moreRecipes').hidden = matches.length <= recipeVisible;
 $('moreRecipes').textContent = 'さらに' + Math.min(5, matches.length - recipeVisible) + '件表示（残り' + (matches.length - recipeVisible) + '件）';
}

function recipeConditionDetails(conditions) {
 const detail = document.createElement('details');
 detail.className = 'recipe-conditions';
 const heading = document.createElement('summary');
 labelWithIcon(heading, 'drop', '発酵条件・メモ');
 const values = [
  fermentationMethods[conditions.method],
  conditions.room != null ? '室温 ' + conditions.room + '℃' : '',
  conditions.fridge != null ? '冷蔵庫 ' + conditions.fridge + '℃' : '',
  conditions.roomHours != null ? '常温 ' + conditions.roomHours + '時間' : '',
  conditions.coldHours != null ? '冷蔵 ' + conditions.coldHours + '時間' : '',
 ].filter(Boolean);
 detail.append(heading);
 if (values.length) {
  const summary = document.createElement('p');
  summary.textContent = values.join(' ／ ');
  detail.append(summary);
 }
 if (conditions.memo) {
  const memo = document.createElement('p');
  memo.textContent = conditions.memo;
  detail.append(memo);
 }
 return detail;
}

function stopRecipeEditing() {
 editingRecipe = null;
 $('quickSaveLabel').textContent = '保存';
 $('recipeEditStatus').textContent = '';
 $('recipeName').value = '';
 $('recipeEditor').hidden = true;
}

// Pizza notebook: saved separately from recipes; no forecasting or photos.
const NOTES_KEY='ange-v3-notes';
// Note records are stored independently of recipes.
let editingNoteId=null;
const TEMP_KEY = 'ange-v3-temp-defaults';
const NOTE_DRAFT_KEY = 'ange-v3-note-draft';
function saveNotes(notes){
 if(!Array.isArray(notes))throw new TypeError('Invalid note data');
 localStorage.setItem(NOTES_KEY,JSON.stringify(notes));
}

const dateTimeLocal=d=>{const pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())};
function durationText(a,b){if(!a||!b)return '日時を入力すると経過時間を表示します';const st=new Date(a),en=new Date(b);if(!Number.isFinite(+st)||!Number.isFinite(+en))return '日時を確認してください';const minutes=Math.round((en-st)/60000);if(minutes<0)return '終了日時が開始日時より前です';const hours=Math.floor(minutes/60),mins=minutes%60,days=Math.floor(hours/24);return '経過：'+(days?days+'日 ':'')+(hours%24||!days?(days?hours%24:hours)+'時間':'')+(mins?' '+mins+'分':'')};
function refreshNoteRecipes(){const select=$('noteRecipe');if(!select)return;const prev=select.value;select.replaceChildren(new Option('現在の配合','current'));for(const [i,r] of savedRecipes().entries()){const key=r._key+'::'+r._i;select.append(new Option(r.name+(r.legacy?'（旧版）':''),key))}if([...select.options].some(o=>o.value===prev))select.value=prev;else select.value='current';noteSeedVisibility()}
function pickedRecipe(){const key=$('noteRecipe').value;if(key==='current')return {name:flourAmounts(calc()).map(([name])=>name).filter(Boolean).join('＋')+'・'+fmt(state.hydration)+'%・'+{biga:'ビガ法',straight:'ストレート法',poolish:'ポーリッシュ法'}[state.process],snapshot:clone(state)};const r=savedRecipes().find(r=>r._key+'::'+r._i===key);return r?{name:r.name,snapshot:clone(r.state||{})}: {name:'現在の配合',snapshot:clone(state)}}
function noteSeedVisibility(){const selected=pickedRecipe();const process=selected.snapshot.process||'biga';$('noteSeedBlock').hidden=process==='straight'}
function updateDurations(){for(const [id,out] of [['noteSeedHours','noteSeedDuration'],['noteMatureHours','noteMatureDuration']]){const v=$(id).value;$(out).textContent=v!==''?('設定：'+Number(v)+'時間'):'未設定'}}
function noteInputs(){const ids=['noteStarted','noteTemp','noteHumidity','noteMethod','noteSeedHours','noteMatureHours','noteRating','noteMemo'];return Object.fromEntries(ids.map(k=>[k,$(k).value]))}
let noteVisible=5;
function showNotes(){const root=$('noteList');root.replaceChildren();const query=($('noteSearch')?.value||'').trim().toLocaleLowerCase();const ratingFilter=$('noteRatingFilter')?.value||'';const all=read(NOTES_KEY,[]);const notes=all.filter(n=>{const x=n.inputs||{};const hay=[n.recipeName,x.noteStarted,x.noteMemo,x.noteMethod,x.noteTemp,x.noteHumidity].join(' ').toLocaleLowerCase();if(!hay.includes(query))return false;const rating=Number(x.noteRating)||0;return !ratingFilter||(ratingFilter==='unrated'?rating===0:rating>=Number(ratingFilter))});if(!notes.length){const p=document.createElement('p');p.className='note';p.textContent=all.length?'該当する仕込み記録がありません。':'まだ仕込み記録がありません。';root.append(p)}for(const note of notes.slice(0,noteVisible)){const div=document.createElement('div');div.className='note-entry';const head=document.createElement('strong');head.textContent=note.recipeName;const meta=document.createElement('small');meta.textContent=(note.inputs.noteStarted||'日時未記入').replace('T',' ')+' ／ '+(note.inputs.noteRating?'★'.repeat(Number(note.inputs.noteRating)):'未評価');const detail=document.createElement('p');const segments=[];if(note.inputs.noteTemp!=='')segments.push('室温 '+note.inputs.noteTemp+'℃');if(note.inputs.noteHumidity!=='')segments.push('湿度 '+note.inputs.noteHumidity+'%');if(note.inputs.noteMatureHours!=='')segments.push('本練り後 '+note.inputs.noteMatureHours+'時間');if(note.inputs.noteSeedHours!=='')segments.push('種 '+note.inputs.noteSeedHours+'時間');if(note.inputs.noteMethod)segments.push({room:'常温',cold:'冷蔵',mixed:'常温＋冷蔵'}[note.inputs.noteMethod]||'');detail.textContent=segments.join(' ／ ')+(note.inputs.noteMemo?'\n'+note.inputs.noteMemo:'');const actions=document.createElement('div');actions.className='actions';const load=listAction('edit','編集');load.onclick=()=>{for(const [k,v] of Object.entries(note.inputs))if($(k))$(k).value=v;$('noteRecipe').value='current';editingNoteId=note.id;noteSeedVisibility();$('noteSeedBlock').hidden=note.recipeSnapshot?.process==='straight';updateDurations();syncDurationPicks();$('saveNote').textContent='この記録を更新';$('noteStatus').textContent='編集中：'+note.recipeName;switchNoteView('new');window.scrollTo(0,0)};const del=listAction('trash','仕込み記録を削除',true);del.onclick=()=>{if(!confirm('この仕込み記録を削除しますか？'))return;saveNotes(read(NOTES_KEY,[]).filter(n=>n.id!==note.id));showNotes()};actions.append(load,del);const preview=document.createElement('div');preview.className='note-entry-preview';const snapshot=note.recipeSnapshot||{};preview.textContent=[snapshot.process?({biga:'ビガ法',poolish:'ポーリッシュ法',straight:'ストレート法'}[snapshot.process]||''):'',snapshot.totalFlour?'粉'+Math.round(Number(snapshot.totalFlour))+'g':'',snapshot.hydration!==undefined?'加水率'+snapshot.hydration+'%':'',note.inputs.noteSeedHours?'種'+note.inputs.noteSeedHours+'時間':'',note.inputs.noteMatureHours?'本練り後'+note.inputs.noteMatureHours+'時間':''].filter(Boolean).join(' · ');const more=document.createElement('details');const summary=document.createElement('summary');labelWithIcon(summary,'note','詳細・メモ');more.append(summary,detail,actions);div.append(head,meta,preview,more);root.append(div)}$('moreNotes').hidden=notes.length<=noteVisible;$('moreNotes').textContent='さらに'+Math.min(5,notes.length-noteVisible)+'件表示（残り'+(notes.length-noteVisible)+'件）'}
function resetNoteForm(){editingNoteId=null;$('saveNote').textContent='仕込み記録を保存';for(const k of ['noteSeedHours','noteMatureHours','noteMemo','noteRating'])$(k).value='';updateDurations()}
function initNotes(){if(!$('noteStarted').value)$('noteStarted').value=dateTimeLocal(new Date());refreshNoteRecipes();$('noteRecipe').onchange=noteSeedVisibility;for(const id of ['noteSeedHours','noteMatureHours'])$(id).oninput=updateDurations;$('saveNote').onclick=()=>{const inp=noteInputs();if(inp.noteHumidity!==''&&(+inp.noteHumidity<0||+inp.noteHumidity>100)){$('noteStatus').textContent='湿度は0〜100%で入力してください';return}for(const id of ['noteSeedHours','noteMatureHours'])if(inp[id]!==''&&(!Number.isFinite(Number(inp[id]))||Number(inp[id])<0||Number(inp[id])>1000)){$('noteStatus').textContent='発酵時間を確認してください';return}const chosen=pickedRecipe();const notes=read(NOTES_KEY,[]);const existing=editingNoteId?notes.find(n=>n.id===editingNoteId):null;const item={id:existing?.id||'note-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),recipeName:existing?.recipeName||chosen.name,recipeSnapshot:existing?.recipeSnapshot||chosen.snapshot,inputs:inp,savedAt:new Date().toISOString()};if(existing)notes.splice(notes.findIndex(n=>n.id===existing.id),1,item);else notes.unshift(item);try{saveNotes(notes);$('noteStatus').textContent='✓ 記録を保存しました';resetNoteForm();showNotes();switchNoteView('history')}catch(e){$('noteStatus').textContent='保存できませんでした。端末の空き容量とブラウザ設定を確認してください'}};showNotes();updateDurations()}
const BACKUP_V1_KEYS = ['ange-v3-current', 'ange-v3-adopted', 'ange-v3-recipes', NOTES_KEY];
const BACKUP_KEYS = [...BACKUP_V1_KEYS, TEMP_KEY, NOTE_DRAFT_KEY];

function restoreBackup(backup) {
 const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
 const keys = backup?.formatVersion === 1 ? BACKUP_V1_KEYS : BACKUP_KEYS;
 if (backup?.app !== 'Ange Pizza Lab' || ![1, 2].includes(backup.formatVersion) || !isRecord(backup.items)) {
  throw new Error('Ange Pizza Labのバックアップファイルを選んでください');
 }
 const entries = Object.entries(backup.items);
 for (const [key, value] of entries) {
  const valid = key === 'ange-v3-recipes'
   ? Array.isArray(value) && value.every(recipe => isRecord(recipe) && typeof recipe.name === 'string')
   : key === NOTES_KEY
    ? Array.isArray(value) && value.every(note => isRecord(note) && isRecord(note.inputs))
    : isRecord(value);
  if (!keys.includes(key) || !valid) throw new Error('バックアップの保存データの形式を確認してください');
 }
 if (!confirm('ファイルに含まれる保存データを置き換えます。続けますか？')) return;

 const previous = new Map(entries.map(([key]) => [key, localStorage.getItem(key)]));
 const written = [];
 try {
  for (const [key, value] of entries) {
   localStorage.setItem(key, JSON.stringify(value));
   written.push(key);
  }
 } catch {
  for (const key of written.reverse()) {
   if (previous.get(key) === null) localStorage.removeItem(key);
   else localStorage.setItem(key, previous.get(key));
  }
  throw new Error('復元できません。空き容量とブラウザ設定を確認してください');
 }
 location.reload();
}

function initBackups() {
 $('exportBackup').onclick = () => {
  try {
   const items = {};
   for (const key of BACKUP_KEYS) {
    const stored = localStorage.getItem(key);
    if (stored !== null) items[key] = JSON.parse(stored);
   }
   const json = JSON.stringify({app:'Ange Pizza Lab', formatVersion:2, exportedAt:new Date().toISOString(), items}, null, 2);
   const link = document.createElement('a');
   const url = URL.createObjectURL(new Blob([json], {type:'application/json'}));
   link.href = url;
   link.download = 'Ange_Pizza_Lab_backup_' + new Date().toISOString().slice(0, 10) + '.json';
   link.click();
   setTimeout(() => URL.revokeObjectURL(url), 1000);
   $('backupStatus').textContent = 'バックアップを作成しました。iCloud Driveなどに保存してください';
  } catch {
   $('backupStatus').textContent = 'バックアップを作成できませんでした。保存データとブラウザ設定を確認してください';
  }
 };
 $('importBackup').onchange = async event => {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  try {
   restoreBackup(JSON.parse(await file.text()));
  } catch (error) {
   $('backupStatus').textContent = error instanceof SyntaxError
    ? 'Ange Pizza Labのバックアップファイルを選んでください' : error.message;
  } finally {
   input.value = '';
  }
 };
}
function switchNoteView(view){const history=view!=='new';const editor=document.querySelector('.note-editor-card');const list=document.querySelector('.note-history-card');if(!editor||!list)return;editor.hidden=history;list.hidden=!history;for(const [id,active] of [['noteHistoryTab',history],['noteNewTab',!history]]){const b=$(id);b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))}if(history)showNotes()}
let activeTab;
function selectTab(tab) {
 const tabChanged = activeTab && activeTab !== tab;
 activeTab = tab;
 document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === tab));
 document.querySelectorAll('[data-tab]').forEach(button => {
  const active = button.dataset.tab === tab;
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
 });
 document.body.classList.toggle('recipe-tab-active', tab === 'recipe');
 $('stickySummary').hidden = tab !== 'recipe';
 if (tab !== 'recipe') toggleMaterialTable(false);
 if (tab === 'ferment') switchNoteView('history');
 $('settingsMenu').open = false;
 if (tabChanged) window.scrollTo(0, 0);
}
$('noteHistoryTab').onclick=()=>switchNoteView('history');
$('noteNewTab').onclick=()=>{if(editingNoteId){resetNoteForm();$('noteStatus').textContent=''}switchNoteView('new')};
$('quickSaveRecipe').onclick = () => {
 if (editingRecipe) {
  selectTab('saved');
  $('recipeName').focus();
  return;
 }
 openRecipeModal();
};
$('style').onchange=e=>applyPreset(e.target.value);
$('process').onchange=e=>{state.process=e.target.value;if(state.process==='poolish'&&state.bigaHyd<80)state.bigaHyd=100;if(state.process==='biga'&&state.bigaHyd>80)state.bigaHyd=50;if(state.process!=='straight'&&state.flours.every(f=>f.seed===0))state.flours[0].seed=Math.min(300,flourTotal());normalise();persist();redraw()};
$('addFlour').onclick=()=>{if(state.flours.length>=4)return;const last=state.flours.at(-1);const newcomer=round(last.pct/2);last.pct=round(last.pct-newcomer);state.flours.push({id:Math.max(...state.flours.map(x=>x.id))+1,name:'',pct:newcomer,seed:0});prepareSeeds();persist();flourRows();results()};
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{if(state.mode==='target'&&button.dataset.mode==='flour'){const c=calc();state.totalFlour=Math.max(0,round(c.totalFlour))}state.mode=button.dataset.mode;prepareSeeds();persist();redraw()};
$('yeastType').onchange=e=>{const next=e.target.value;if(next!==state.yeastType){const factor=next==='fresh'?3:1/3;state.yeast=round(state.yeast*factor);state.prefermentYeast=round(state.prefermentYeast*factor);state.yeastType=next;persist();redraw()}};
const syncTotalYeast = appendNumberControl('yeastControl', 'イースト総量', {
 unit:'g', step:0.1, max:() => Math.max(10, Math.ceil(state.yeast)),
 readValue:() => state.yeast,
 writeValue(value) {
  state.yeast = value;
  state.prefermentYeast = Math.min(state.prefermentYeast, value);
  prepareSeeds(); syncSeedYeast(); persist(); updateFlourRowsInPlace(); results();
 },
});
const syncSeedYeast = appendNumberControl('prefermentYeastControl', '種に入れるイースト', {
 unit:'g', step:0.1, max:() => Number(state.yeast),
 readValue:() => state.prefermentYeast,
 writeValue(value) { state.prefermentYeast = value; persist(); results(); },
});
const syncExtraRates = [0, 1].map(index => {
 const updateExtras = () => { prepareSeeds(); persist(); updateFlourRowsInPlace(); results(); };
 $('extraName' + index).oninput = event => {
  state.extras[index].name = event.target.value;
  updateExtras();
 };
 return appendNumberControl('extraPct' + index + 'Control', '材料 ' + (index + 1) + ' の配合率', {
  unit:'%', step:0.1, max:50,
  readValue:() => state.extras[index].pct,
  writeValue(value) { state.extras[index].pct = value; updateExtras(); },
 });
});
$('adopt').onclick=()=>{adopted[state.style]={hydration:state.hydration,salt:state.salt,oil:state.oil,extras:clone(state.extras),flours:clone(state.flours),process:state.process,bigaHyd:state.bigaHyd};localStorage.setItem('ange-v3-adopted',JSON.stringify(adopted));$('adoptStatus').textContent='✓ '+presets[state.style].name+'の配合を保存しました'};
$('restorePreset').onclick=()=>{if(!confirm('このスタイルで採用した配合を初期値に戻しますか？'))return;delete adopted[state.style];localStorage.setItem('ange-v3-adopted',JSON.stringify(adopted));applyPreset(state.style);$('adoptStatus').textContent='初期配合に戻しました'};
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>selectTab(button.dataset.tab);
$('saveRecipe').onclick = () => saveRecipeEdit(false);
$('overwriteRecipe').onclick = () => saveRecipeEdit(true);
$('cancelRecipeEdit').onclick = () => { stopRecipeEditing(); showRecipes(); };
$('recipeEditFormula').onclick = () => selectTab('recipe');
$('recipeSearch').oninput=()=>{recipeVisible=5;showRecipes()};$('recipeSort').onchange=()=>{recipeVisible=5;showRecipes()};$('moreRecipes').onclick=()=>{recipeVisible+=5;showRecipes()};
$('noteSearch').oninput=()=>{noteVisible=5;showNotes()};$('noteRatingFilter').onchange=()=>{noteVisible=5;showNotes()};$('moreNotes').onclick=()=>{noteVisible+=5;showNotes()};
$('reset').onclick=()=>{$('settingsMenu').open=false;if(confirm('現在の配合だけ初期化しますか？（保存レシピと採用済みプリセットは残ります）')){state=clone(defaults);normalise();persist();redraw()}};
normalise();prepareSeeds();redraw();showRecipes();initNotes();initBackups();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});

function flourAmounts(calculated) {
 const byName = new Map();
 const add = (name, phase, grams) => {
  if (grams <= 0) return;
  const amounts = byName.get(name) ?? {seed:0, main:0};
  amounts[phase] += grams;
  byName.set(name, amounts);
 };
 for (const flour of calculated.flours) {
  const mainName = flour.name.trim();
  const seedName = flour.seedName?.trim() || mainName;
  const seed = calculated.seedFlour > 0 ? flour.seed : 0;
  add(seedName, 'seed', seed);
  add(mainName, 'main', flour.grams - seed);
 }
 return Array.from(byName, ([name, {seed, main}]) => [name, seed, main, seed + main]);
}

function updateStickySummary(c) {
 $('summaryWeight').textContent = c.valid ? fmt(c.dough) + 'g' : '—';
 $('summaryIngredients').hidden = c.valid;
 $('summaryIngredients').textContent = c.valid ? '' : '配合を確認してください';
 const straight = state.process === 'straight';
 const table = $('summaryMaterialRows');
 table.replaceChildren();
 $('summarySeedHeading').hidden = straight;
 if (c.valid) {
  const rows = [
   ['粉 合計', c.seedFlour, c.totalFlour - c.seedFlour, c.totalFlour],
   ...flourAmounts(c).map(([name, seed, main, total]) => [name || '名称未設定', seed || null, main || null, total, true]),
   ['水', c.seedWater, c.water - c.seedWater, c.water],
   ['塩', null, c.totalFlour * Number(state.salt) / 100, c.totalFlour * Number(state.salt) / 100],
   ['イースト', c.seedYeast, Number(state.yeast) - c.seedYeast, Number(state.yeast)],
  ];
  if (Number(state.oil) > 0) {
   const oil = c.totalFlour * Number(state.oil) / 100;
   rows.push(['オイル', null, oil, oil]);
  }
  for (const extra of c.extras) rows.push([extra.name, null, extra.grams, extra.grams]);
  for (const [name, seed, main, total, isFlourDetail] of rows) {
   const row = document.createElement('tr');
   if (isFlourDetail) row.className = 'summary-flour-detail';
   const heading = document.createElement('th');
   heading.scope = 'row';
   heading.textContent = name;
   row.append(heading);
   for (const amount of straight ? [main, total] : [seed, main, total]) {
    const cell = document.createElement('td');
    cell.textContent = amount === null ? '—' : fmt(amount);
    row.append(cell);
   }
   table.append(row);
  }
 }
 const balls = Number(state.ball) > 0 ? Math.floor(c.dough / Number(state.ball)) : 0;
 const remainder = Number(state.ball) > 0 ? Math.max(0, c.dough - balls * Number(state.ball)) : 0;
 $('summaryBalls').textContent = c.valid && Number(state.ball) > 0
  ? '生地玉 ' + fmt(Number(state.ball)) + 'g × ' + balls + '玉 ／ 余り ' + fmt(remainder) + 'g'
  : '配合または生地玉の設定を確認してください';
}
document.querySelectorAll('[data-process]').forEach(button=>button.addEventListener('click',()=>{const select=$('process');select.value=button.dataset.process;select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelectorAll('[data-process]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button))})}));
function toggleMaterialTable(show) {
 $('summaryDetails').hidden = !show;
 $('summaryToggle').setAttribute('aria-expanded', String(show));
}

$('summaryToggle').onclick = () => toggleMaterialTable($('summaryDetails').hidden);
updateStickySummary(calc());

// Ver.3.2: optional recipe conditions, saved temperature defaults, evidence-limited fermentation guidance.
function temperatureDefaults(){const v=read(TEMP_KEY,{room:24,fridge:4});return {room:Number.isFinite(Number(v.room))?Number(v.room):24,fridge:Number.isFinite(Number(v.fridge))?Number(v.fridge):4}}
for (const id of ['newRecipeConditions', 'editRecipeConditions']) {
 $(id).append($('recipeConditionsFields').content.cloneNode(true));
}

function fillRecipeConditions(id, values) {
 for (const field of $(id).querySelectorAll('[data-condition]')) {
  field.value = values?.[field.dataset.condition] ?? '';
 }
}

function readRecipeConditions(id) {
 const conditions = {};
 for (const field of $(id).querySelectorAll('[data-condition]')) {
  const key = field.dataset.condition;
  const value = field.value.trim();
  if (field.type === 'number') {
   const number = Number(value);
   if (field.validity.badInput || (value !== '' && (!Number.isFinite(number) ||
    number < Number(field.min) || number > Number(field.max)))) {
    throw new Error('入力した温度・時間の範囲を確認してください');
   }
   conditions[key] = value === '' ? null : number;
  } else {
   conditions[key] = value || null;
  }
 }
 return Object.values(conditions).some(value => value !== null) ? conditions : null;
}

function openRecipeModal() {
 $('modalRecipeName').value = '';
 fillRecipeConditions('newRecipeConditions', temperatureDefaults());
 $('modalError').hidden = true;
 $('recipeModal').showModal();
 $('modalRecipeName').focus();
}

function saveRecipeRecord(name, conditions, source = null) {
 const key = source?._key || 'ange-v3-recipes';
 const recipes = read(key, []);
 const record = {name, state:currentRecipeData(), conditions, savedAt:new Date().toLocaleDateString('ja-JP')};
 if (source) {
  const index = source.id ? recipes.findIndex(recipe => recipe.id === source.id) : source._i;
  if (index < 0 || index >= recipes.length) throw new Error('元のレシピが見つかりません');
  recipes[index] = {...recipes[index], ...record};
 } else {
  if (recipes.some(recipe => recipe.name === name) &&
   !confirm('同じ名前のレシピがあります。別のレシピとして保存しますか？')) return false;
  recipes.unshift({id:'recipe-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), ...record});
 }
 try {
  localStorage.setItem(key, JSON.stringify(recipes));
 } catch {
  throw new Error('保存に失敗しました。空き容量とブラウザ設定を確認してください');
 }
 return true;
}

function finishRecipeSave(message) {
 stopRecipeEditing();
 showRecipes();
 refreshNoteRecipes();
 selectTab('saved');
 $('recipeEditStatus').textContent = message;
}

function saveRecipeEdit(overwrite) {
 if (!editingRecipe) return;
 const name = $('recipeName').value.trim();
 try {
  if (!name) throw new Error('レシピ名を入力してください');
  if (!overwrite && name === editingRecipe.name) {
   throw new Error('別名で保存するには、元と異なるレシピ名を入力してください');
  }
  const conditions = readRecipeConditions('editRecipeConditions');
  if (saveRecipeRecord(name, conditions, overwrite ? editingRecipe : null)) {
   finishRecipeSave(overwrite ? '✓ レシピを更新しました' : '✓ 別名で保存しました');
  }
 } catch (error) {
  $('recipeEditStatus').textContent = error.message;
 }
}

function saveModalRecipe(skip) {
 try {
  const name = $('modalRecipeName').value.trim();
  if (!name) throw new Error('レシピ名を入力してください');
  const conditions = skip ? null : readRecipeConditions('newRecipeConditions');
  if (saveRecipeRecord(name, conditions)) {
   $('recipeModal').close();
   finishRecipeSave('✓ レシピを追加しました');
  }
 } catch (error) {
  $('modalError').hidden = false;
  $('modalError').textContent = error.message;
 }
}

$('modalCancel').onclick = () => $('recipeModal').close();
$('recipeModalForm').onsubmit = event => { event.preventDefault(); saveModalRecipe(false); };
$('modalSkip').onclick = () => saveModalRecipe(true);
$('openTempSettings').onclick=()=>{$('settingsMenu').open=false;const d=temperatureDefaults();$('defaultRoom').value=d.room;$('defaultFridge').value=d.fridge;$('tempError').hidden=true;$('tempSettingsModal').showModal()};
$('tempCancel').onclick=()=>$('tempSettingsModal').close();$('tempSave').onclick=()=>{const r=Number($('defaultRoom').value),f=Number($('defaultFridge').value);if(!$('defaultRoom').value||!$('defaultFridge').value||!Number.isFinite(r)||!Number.isFinite(f)||r< -10||r>50||f< -5||f>20){$('tempError').hidden=false;$('tempError').textContent='室温は-10〜50℃、冷蔵庫は-5〜20℃で設定してください';return}localStorage.setItem(TEMP_KEY,JSON.stringify({room:r,fridge:f}));$('tempSettingsModal').close();renderFermentReference()};
let referenceMethod='room';
function renderFermentReference(){
 const d=temperatureDefaults();document.querySelectorAll('[data-ferment]').forEach(b=>{b.classList.toggle('active',b.dataset.ferment===referenceMethod);b.setAttribute('aria-pressed',String(b.dataset.ferment===referenceMethod))});
 const method={biga:'ビガ法',poolish:'ポーリッシュ法',straight:'ストレート法'}[state.process];
 const cold=referenceMethod==='mixed'?'<span>冷蔵庫 <b>'+d.fridge+'℃</b></span>':'<span>冷蔵庫 <b>使用なし</b></span>';
 const details=state.process==='poolish'?'<details><summary>参考データを見る</summary><div class="ref-table"><span>18〜20℃・種粉に対するドライ酵母</span><div>0.08% <b>12〜16時間</b></div><div>0.28% <b>約8時間</b></div><div>0.5% <b>約4時間</b></div><small>一般的な参考例。現在の配合の予測ではありません。</small></div></details>':'<details><summary>参考情報を見る</summary><p class="note">温度・加水率・酵母量・生地の状態によって発酵時間は変わります。</p></details>';
 $('fermentReference').innerHTML='<div class="ref-method">'+method+'</div><div class="ref-temps"><span>室温 <b>'+d.room+'℃</b></span>'+cold+'</div><div class="ref-result"><small>現在の配合での参考時間</small><strong>算出対象外</strong><span>現在の条件に一致する検証データがありません。</span></div>'+details+(referenceMethod==='mixed'?'<p class="ref-caution">冷蔵しても発酵はすぐには止まりません。</p>':'');
}
document.querySelectorAll('[data-ferment]').forEach(b=>b.onclick=()=>{referenceMethod=b.dataset.ferment;renderFermentReference()});
const _originalSticky=updateStickySummary;updateStickySummary=function(c){_originalSticky(c);renderFermentReference()};renderFermentReference();

// RC1: duration choice controls; editable hours and visual selection.
function syncDurationPicks(){document.querySelectorAll('.duration-picks').forEach(group=>{const id=group.dataset.target,input=$(id),v=input.value;const values=[...group.querySelectorAll('button[data-hours]')].map(b=>b.dataset.hours).filter(x=>x!=='custom');const isCustom=v!==''&&!values.includes(v);group.querySelectorAll('button').forEach(b=>b.classList.toggle('active',v!==''&&(isCustom?b.dataset.hours==='custom':b.dataset.hours===v)));$(id==='noteSeedHours'?'noteSeedCustom':'noteMatureCustom').hidden=!isCustom});updateDurations()}
document.querySelectorAll('.duration-picks').forEach(group=>{const id=group.dataset.target;group.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.hours==='custom'){$(id==='noteSeedHours'?'noteSeedCustom':'noteMatureCustom').hidden=false;group.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));$(id).focus();return}$(id).value=b.dataset.hours;syncDurationPicks()}));$(id).addEventListener('input',()=>{const custom=$(id==='noteSeedHours'?'noteSeedCustom':'noteMatureCustom');custom.hidden=false;group.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.hours==='custom'));updateDurations()})});
const _showNotes=showNotes;showNotes=function(){_showNotes();syncDurationPicks()};
const _resetNoteForm=resetNoteForm;resetNoteForm=function(){_resetNoteForm();syncDurationPicks()};
// Collapsible headers show the live flour total and hydration.
function updateSectionMetrics(c) {
 $('flourMetric').textContent = fmt(c.totalFlour) + 'g';
 $('hydrationMetric').textContent = fmt(Number(state.hydration)) + '%';
}
updateSectionMetrics(calc());syncDurationPicks();

// RC2: preserve unfinished pizza-note input locally on this device.
function saveNoteDraft(){try{localStorage.setItem(NOTE_DRAFT_KEY,JSON.stringify({...noteInputs(),noteRecipe:$('noteRecipe').value}))}catch(e){}}
try{const draft=read(NOTE_DRAFT_KEY,null);if(draft){for(const [k,v] of Object.entries(draft)){if($(k)&&v!==undefined)$(k).value=v}noteSeedVisibility();syncDurationPicks()}}catch(e){}
$('ferment').addEventListener('input',saveNoteDraft);$('ferment').addEventListener('change',saveNoteDraft);
const _resetDraft=resetNoteForm;resetNoteForm=function(){_resetDraft();localStorage.removeItem(NOTE_DRAFT_KEY)};

selectTab(document.querySelector(".tabs [data-tab].active")?.dataset.tab||"recipe");
