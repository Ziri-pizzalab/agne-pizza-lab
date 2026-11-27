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
const defaults={style:'mine',process:'biga',mode:'flour',totalFlour:660,bigaFlour:300,bigaHyd:50,extraFlour:360,hydration:65,salt:2.5,oil:0,ball:180,quantity:6,secondBall:null,secondQuantity:1,yeastType:'dry',yeast:1,prefermentYeast:1,extras:[{name:'',pct:0},{name:'',pct:0}],flours:defaultFlours(),stage:'biga',fermentMethod:'room',room:25,fridge:4,beforeCold:3};
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
let state=clone(defaults),adopted=read('ange-v3-adopted',{});
const old=null,savedV2=read('ange-v3-current',null);
if(savedV2&&typeof savedV2==='object'){state={...state,...savedV2};state.totalFlour=Number(savedV2.totalFlour??(Number(savedV2.bigaFlour??300)+Number(savedV2.extraFlour??360)));}
else if(old&&typeof old==='object'){
 for(const k of ['mode','bigaFlour','bigaHyd','extraFlour','hydration','salt','oil','ball','quantity'])if(old[k]!==undefined)state[k]=old[k];
 state.totalFlour=Number(state.bigaFlour)+Number(state.extraFlour);state.yeastType=old.yeastType==='fresh'?'fresh':'dry';state.yeast=round((Number(old.bigaFlour??300)+Number(old.extraFlour??360))*Number(old.yeast??.15)/100);state.prefermentYeast=state.yeast;
}
function normalise(){
 const secondWeight = Number(state.secondBall);
 state.secondBall = secondWeight >= 80 && secondWeight <= 400 ? Math.round(secondWeight) : null;
 state.secondQuantity = Math.max(1, Math.min(24, Math.round(Number(state.secondQuantity)) || 1));
 state.extras=Array.from({length:2},(_,i)=>({name:String(state.extras?.[i]?.name||''),pct:Math.max(0,Math.min(50,Number(state.extras?.[i]?.pct)||0))}));
 const arr=Array.isArray(state.flours)&&state.flours.length?state.flours.slice(0,4):[{id:1,name:state.flourName||'カプート',pct:100,seed:Number(state.bigaFlour)||0}];
 state.flours=arr.map((f,i)=>({id:Number(f.id)||i+1,name:String(f.name||''),seedName:String(f.seedName??''),pct:Math.max(0,Number(f.pct)||0),seed:Math.max(0,Number(f.seed)||0)}));
 // Preserve existing proportions, but always make the last flour the 100% remainder.
 if(state.flours.length===1)state.flours[0].pct=100;
 else{let used=0;for(let i=0;i<state.flours.length-1;i++){state.flours[i].pct=round(Math.min(state.flours[i].pct,100-used),8);used+=state.flours[i].pct}state.flours.at(-1).pct=round(100-used,8)}
 if (state.flourGroups) {
  for (const phase of ['seed','main']) {
   const rows = state.flourGroups[phase];
   state.flourGroups[phase] = Array.isArray(rows) && rows.length
    ? rows.map(row => ({name:String(row?.name ?? ''),grams:Math.max(0,Math.round(Number(row?.grams) || 0))}))
    : [{name:'',grams:0}];
  }
 }
 state.stage=state.process==='straight'?'final':state.stage==='final'?'final':'biga';
 state.fermentMethod=['room','cold','mixed'].includes(state.fermentMethod)?state.fermentMethod:'room';
}
normalise();
function persist(){try{localStorage.setItem('ange-v3-current',JSON.stringify(state))}catch(e){console.warn('Storage unavailable',e)}}
function hasSecondBallSize() {
 return state.mode === 'target' && state.secondBall !== null;
}

function targetDoughWeight() {
 const first = Number(state.ball) * Number(state.quantity);
 return hasSecondBallSize() ? first + state.secondBall * state.secondQuantity : first;
}

function flourTotal(){
 const extraPct=state.extras.filter(x=>x.name.trim()).reduce((s,x)=>s+Number(x.pct),0);
 const factor=1+(Number(state.hydration)+Number(state.salt)+Number(state.oil)+extraPct)/100;
 if (state.mode !== 'target') return Number(state.totalFlour);
 const grams = (targetDoughWeight() - Number(state.yeast)) / factor;
 // A mixed batch should have enough dough for every requested ball after whole-gram rounding.
 return hasSecondBallSize() ? Math.ceil(grams - 1e-9) : grams;
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
function phaseWeights(rows, budget, remainder) {
 let available = Math.max(0, budget);
 return rows.map((row, index) => {
  const end = remainder && index === rows.length - 1;
  const grams = end ? available : Math.min(available, Math.max(0, Math.round(Number(row.grams) || 0)));
  available -= grams;
  return {name:String(row.name ?? ''), grams};
 });
}

function independentPhaseWeights(total, groups = state.flourGroups) {
 const seed = state.process === 'straight' ? [] : phaseWeights(groups.seed, total, false);
 const mainTotal = total - seed.reduce((sum, row) => sum + row.grams, 0);
 return {seed, main:phaseWeights(groups.main, mainTotal, true)};
}

function currentFlourGroups() {
 if (state.flourGroups) return state.flourGroups;
 const weights = allocateFlourGrams(flourTotal(), state.flours);
 const seed = state.flours.map((row, i) => ({
  name:row.seedName.trim() || (row.seed ? row.name : ''), grams:Math.min(weights[i], row.seed),
 })).filter(row => row.grams || row.name);
 const main = state.flours.map((row, i) => ({
  name:row.name, grams:weights[i] - (state.process === 'straight' ? 0 : Math.min(weights[i], row.seed)),
 })).filter(row => row.grams || row.name);
 return {seed:seed.length ? seed : [{name:'',grams:0}], main:main.length ? main : [{name:'',grams:0}]};
}

function editableFlourGroups() {
 return state.flourGroups ??= currentFlourGroups();
}

function prepareSeeds(){
 const total=flourTotal();if(!Number.isFinite(total))return;
 if (state.flourGroups) {
  const phases = independentPhaseWeights(Math.round(total));
  for (const phase of ['seed','main']) phases[phase].forEach((row,i) => {
   if (phase === 'seed' || i < phases.main.length - 1) state.flourGroups[phase][i].grams = row.grams;
  });
  state.bigaFlour = phases.seed.reduce((sum,row) => sum + row.grams,0);
  return;
 }
 const weights=allocateFlourGrams(total,state.flours);
 state.flours.forEach((f,i)=>{f.seed=Math.max(0,Math.min(Number(f.seed)||0,weights[i]))})
 state.bigaFlour=state.process==='straight'?0:round(state.flours.reduce((s,f)=>s+f.seed,0),5);
}
function calc(){
 const totalFlour=Math.round(flourTotal());
 const weights=allocateFlourGrams(totalFlour,state.flours);
 const phases=state.flourGroups ? independentPhaseWeights(totalFlour) : null;
 const flours=phases ? [...phases.seed.map(row => ({...row,seed:row.grams})),...phases.main.map(row => ({...row,seed:0}))]
  : state.flours.map((f,i)=>({...f,grams:weights[i],pct:totalFlour?weights[i]/totalFlour*100:0}));
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

function renderBallSizes() {
 const target = state.mode === 'target';
 const hasSecond = hasSecondBallSize();
 $('ballSizeList').hidden = !target;
 $('ballSizeList').classList.toggle('has-second-size', hasSecond);
 $('addBallSize').hidden = !target || hasSecond;
 $('secondBallSize').hidden = !hasSecond;
 $('firstBallControls').replaceChildren();
 $('secondBallControls').replaceChildren();
 if (!target) return;

 stateNumberControl('firstBallControls','1玉の重さ','ball',80,400,5,'g',true);
 stateNumberControl('firstBallControls','玉数','quantity',1,24,1,'個',true);
 if (!hasSecond) return;

 stateNumberControl('secondBallControls','2種類目の1玉の重さ','secondBall',80,400,5,'g',true);
 stateNumberControl('secondBallControls','2種類目の玉数','secondQuantity',1,24,1,'個',true);
}

function changeSecondBallSize(weight) {
 state.secondBall = weight;
 state.secondQuantity = 1;
 prepareSeeds();
 persist();
 renderBallSizes();
 updateFlourRowsInPlace();
 results();
 if (weight === null) $('addBallSize').focus();
 else $('secondBallControls').querySelector('input').focus();
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
 if (state.mode === 'flour') {
  stateNumberControl('baseControls','総粉量','totalFlour',100,1800,1,'g',true);
  stateNumberControl('baseControls','1玉の重さ','ball',80,400,5,'g',true);
 }
 renderBallSizes();
 $('prefermentBox').hidden = state.process === 'straight';
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

function commitFlourChange() {
 prepareSeeds();
 persist();
 updateFlourRowsInPlace();
 results();
}

function flourRows() {
 const host = $('flourRows');
 const groups = currentFlourGroups();
 const hydration = $('prefermentBox');
 hydration.remove();
 host.replaceChildren();
 syncFlourRows = [];
 for (const phase of state.process === 'straight' ? ['main'] : ['seed','main']) {
  const isSeed = phase === 'seed';
  const label = isSeed ? '発酵種' : '本捏ね';
  const section = document.createElement('section');
  section.className = 'flour-phase flour-phase-' + phase;
  const title = document.createElement('h3');
  title.textContent = label;
  section.append(title);
  const effective = () => {
   if (!state.flourGroups) return currentFlourGroups()[phase];
   return independentPhaseWeights(Math.round(flourTotal()))[phase];
  };
  groups[phase].forEach((entry,index) => {
   const row = document.createElement('div');
   row.className = 'flour-phase-row';
   const heading = document.createElement('div');
   heading.className = 'flour-phase-row-heading';
   const name = document.createElement('strong');
   name.lang = 'it';
   name.textContent = 'Farina ' + (index + 1);
   heading.append(name);
   if (index > 0) {
    const remove = listAction('trash', label + 'の粉' + (index + 1) + 'を削除', true);
    remove.onclick = () => {
     editableFlourGroups()[phase].splice(index,1);
     prepareSeeds(); persist(); flourRows(); results();
     host.querySelector('#addFlour-' + phase).focus();
    };
    heading.append(remove);
   }
   const input = document.createElement('input');
   input.setAttribute('list','flourNameOptions');
   input.setAttribute('aria-label', label + 'の粉' + (index + 1) + 'の名前');
   input.placeholder = '粉の名前';
   input.value = entry.name;
   input.oninput = () => {
    editableFlourGroups()[phase][index].name = input.value;
    persist();
    results();
   };
   row.append(heading,input);
   const weightLabel = label + 'の粉' + (index + 1) + 'の重量';
   if (!isSeed && index === groups[phase].length - 1) {
    const weight = document.createElement('div');
    weight.className = 'flour-phase-weight';
    const hint = document.createElement('span');
    hint.textContent = '自動';
    const value = document.createElement('output');
    value.setAttribute('aria-label',weightLabel + '（自動）');
    weight.append(hint,value);
    row.append(weight);
    syncFlourRows.push(() => { value.textContent = fmt(effective()[index].grams) + 'g'; });
   } else {
    const stepper = numberStepper({
     label:weightLabel,unit:'g',step:1,integer:true,
     max() {
      const total = calc().totalFlour;
      const current = effective();
      const phaseTotal = isSeed ? total : total - calc().seedFlour;
      return Math.max(0,phaseTotal - current.reduce((sum, item, i) =>
       sum + (i !== index && (isSeed || i < current.length - 1) ? item.grams : 0),0));
     },
     readValue:() => effective()[index].grams,
     writeValue(value) {
      editableFlourGroups()[phase][index].grams = value;
      commitFlourChange();
     },
    });
    row.append(stepper.control);
    syncFlourRows.push(stepper.sync);
   }
   section.append(row);
  });
  const add = listAction('plus','粉を追加');
  add.id = 'addFlour-' + phase;
  add.setAttribute('aria-label',label + 'の粉を追加');
  add.onclick = () => {
   const rows = editableFlourGroups()[phase];
   if (!isSeed) rows.at(-1).grams = effective().at(-1).grams;
   rows.push({name:'',grams:0});
   prepareSeeds(); persist(); flourRows(); results();
   host.querySelector('.flour-phase-' + phase + ' .flour-phase-row:last-of-type input')?.focus();
  };
  section.append(add);
  if (isSeed) section.append(hydration);
  host.append(section);
 }
 if (state.process === 'straight') host.append(hydration);
 updateFlourRowsInPlace();
}

function results() {
 const current = calc();
 updateStickySummary(current);
 updateSectionMetrics(current);
 $('yeastPercent').textContent = current.valid ? '総粉量に対して ' + (Number(state.yeast) / current.totalFlour * 100).toFixed(3) + '%' : '';
}

function applyPreset(k){const p=adopted[k]||presets[k];state.style=k;for(const key of ['hydration','salt','oil'])state[key]=p[key];state.extras=clone([p.extras?.[0]||{name:'',pct:0},p.extras?.[1]||{name:'',pct:0}]);if(p.flours){state.flours=clone(p.flours);delete state.flourGroups;if(p.flourGroups)state.flourGroups=clone(p.flourGroups)}if(p.process)state.process=p.process;if(p.bigaHyd!==undefined)state.bigaHyd=p.bigaHyd;normalise();prepareSeeds();persist();redraw()}
function localRecipes() {
 const recipes = read('ange-v3-recipes', []);
 return Array.isArray(recipes) ? recipes.map((recipe,index) => ({...recipe,_key:'ange-v3-recipes',_i:index})) : [];
}
const driveRecipes = window.angeDriveRecipes;
function savedRecipes() { return driveRecipes.enabled ? driveRecipes.list() : localRecipes(); }
function sameRecipeRevision(first, second) {
 return recipeKey(first) === recipeKey(second) && first._driveRevision === second._driveRevision;
}
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
  const flours = recipeFlourNames(data).join(' ');
  const process = processLabels[data.process];
  return [recipe.name, flours, process, data.hydration, recipe.savedAt]
   .join(' ').toLocaleLowerCase().includes(query);
 });
 if ($('recipeSort').value === 'name') matches.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

 for (const recipe of matches.slice(0, recipeVisible)) {
  const item = document.createElement('details');
  item.className = 'saved-item';
  item.setAttribute('name', 'saved-recipes');
  item.classList.toggle('edit-active', editingRecipe !== null && sameRecipeRevision(editingRecipe, recipe));
  const heading = document.createElement('summary');
  const info = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = recipe.name + (recipe.legacy ? '（旧版）' : '');
  const summary = document.createElement('small');
  summary.textContent = [
   processLabels[recipe.state?.process],
   recipe.state?.hydration !== undefined ? '加水 ' + recipe.state.hydration + '%' : '',
   recipe.savedAt,
   recipe._driveConflict ? '別端末の変更と競合' : '',
  ].filter(Boolean).join(' · ');
  info.append(name, summary);
  heading.append(info);
  item.append(heading);
  const history = listAction('clock', '履歴');
  history.setAttribute('aria-label', '仕込み履歴');
  history.onclick = () => showRecipeNoteHistory(recipe);

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
  remove.onclick = async () => {
   if (recipeOperationPending) return;
   const message = recipe._driveConflict ? '競合しているこの版を削除しますか？' : 'このレシピを削除しますか？（過去のピザノートには影響しません）';
   if (!confirm(message)) return;
   if (driveRecipes.enabled) {
    await runRecipeOperation($('recipeEditStatus'), async () => {
     await driveRecipes.save(null, recipe, true);
     if (editingRecipe && sameRecipeRevision(editingRecipe, recipe)) stopRecipeEditing();
     renderRecipeBook();
     $('recipeEditStatus').textContent = 'Driveのレシピ帳から削除しました。';
    });
    return;
   }
   const list = read(recipe._key, []);
   const index = recipe.id ? list.findIndex(entry => entry.id === recipe.id) : recipe._i;
   if (index < 0 || index >= list.length) return;
   list.splice(index, 1);
   localStorage.setItem(recipe._key, JSON.stringify(list));
   if (editingRecipe && sameRecipeRevision(editingRecipe, recipe)) stopRecipeEditing();
   showRecipes();
   refreshNoteRecipes();
  };
  actions.append(load, history, edit, remove);
  item.append(actions);
  if (recipe.conditions) item.append(recipeConditionDetails(recipe.conditions));
  root.append(item);
 }

 if (!matches.length) {
  const empty = document.createElement('p');
  empty.className = 'note';
  empty.textContent = driveRecipes.enabled && !driveRecipes.ready ? 'Driveに接続するとレシピを表示できます。' :
   query ? '一致するレシピはありません。' : 'まだ保存されたレシピはありません。';
  root.append(empty);
  if (!query && (!driveRecipes.enabled || driveRecipes.ready)) {
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
  conditions.roomHours != null ? '常温 ' + fermentationDurationLabel(conditions.roomHours) : '',
  conditions.coldHours != null ? '冷蔵 ' + fermentationDurationLabel(conditions.coldHours, true) : '',
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

// Saved separately so recipe changes never rewrite a past batch.
const NOTES_KEY = 'ange-v3-notes';
const TEMP_KEY = 'ange-v3-temp-defaults';
const NOTE_DRAFT_KEY = 'ange-v3-note-draft';
const PLAN_KEY = 'ange-v3-preparation-plan';
const FLOUR_NAMES_KEY = 'ange-v3-flour-names';
const noteInputIds = ['noteStarted','noteTemp','noteHumidity','noteMethod','noteSeedHours','noteMatureHours','noteRating','noteMemo','noteBakeCondition','noteImprovement'];
const stageLabels = {mixStart:'捏ね始め',mainStart:'本捏ね開始',bake:'焼き始め',starter:'発酵種の仕込み',kneaded:'捏ね上げ',chill:'冷蔵庫に入れる',unchill:'冷蔵庫から出す',divide:'分割・丸め',beforeBake:'焼く前',other:'その他'};
const nextStage = {starter:'kneaded',kneaded:'chill',chill:'unchill',unchill:'divide',divide:'beforeBake'};
const driveNotes = window.angeDriveNotes;
let editingNote = null;
let noteWriteTime = null;
let noteRecipeFilter = null;
let noteVisible = 5;

function localNotes() {
 const notes = read(NOTES_KEY, []);
 return Array.isArray(notes) ? notes : [];
}

function savedNotes() {
 if (!driveRecipes.enabled) return localNotes();
 return [...driveNotes.list(), ...localNotes().filter(note => !driveNotes.contains(note.id))];
}

function updateNoteDriveControls() {
 const enabled = driveRecipes.enabled;
 const connected = window.angeDriveConnection.connected();
 $('noteDriveControls').hidden = !enabled;
 $('openNoteDrive').hidden = $('editNoteDrive').hidden = !enabled || connected;
 const remaining = localNotes().filter(note => !driveNotes.contains(note.id)).length;
 $('importLocalNotes').hidden = !enabled || !remaining;
 $('noteDriveStatus').textContent = !connected ? '保存先 Google Drive ・ 未接続'
  : driveNotes.ready ? '保存先 Google Drive' : '保存先 Google Drive ・ 未読み込み';
}

function refreshDriveNotes() {
 if (!driveRecipes.enabled || !window.angeDriveConnection.connected()) return;
 return runRecipeOperation($('noteHistoryStatus'), async () => {
  await driveNotes.load();
  showNotes();
  $('noteHistoryStatus').textContent = '';
 });
}

const dateTimeLocal=d=>{const pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())};

function selectNoteRecipe(key) {
 const field = $('noteRecipe');
 field.value = [...field.options].some(option => option.value === key) ? key : 'current';
}

function refreshNoteRecipes() {
 const select = $('noteRecipe');
 const previous = select.value;
 select.replaceChildren(new Option('現在の配合','current'));
 for (const recipe of savedRecipes()) {
  select.append(new Option(recipe.name + (recipe.legacy ? '（旧版）' : ''), recipeKey(recipe)));
 }
 selectNoteRecipe(previous);
 noteSeedVisibility();
}

function pickedRecipe() {
 const recipe = savedRecipes().find(entry => recipeKey(entry) === $('noteRecipe').value);
 if (recipe) return {id:recipeKey(recipe), name:recipe.name, snapshot:clone(recipe.state || {})};
 const flours = flourAmounts(calc()).map(([name]) => name).filter(Boolean).join('＋');
 return {id:null, name:[flours, fmt(state.hydration) + '%', processLabels[state.process] + '法'].filter(Boolean).join('・'), snapshot:clone(state)};
}

function linkedNoteRecipe(note, recipes) {
 if (note.recipeId !== undefined) return recipes.find(recipe => (recipeKey(recipe) === note.recipeId || recipe.legacyRecipeKey === note.recipeId));
 const matches = recipes.filter(recipe => recipe.name === note.recipeName &&
  JSON.stringify(recipe.state) === JSON.stringify(note.recipeSnapshot));
 return matches.length === 1 ? matches[0] : undefined;
}

function noteSeedVisibility() {
 const snapshot = editingNote ? editingNote.recipeSnapshot : pickedRecipe().snapshot;
 $('noteSeedBlock').hidden = snapshot?.process === 'straight';
}

function updateDurations() {
 for (const [id,out] of [['noteSeedHours','noteSeedDuration'],['noteMatureHours','noteMatureDuration']]) {
  const value = $(id).value;
  $(out).textContent = value === '' ? '未設定' : '設定：' + fermentationDurationLabel(value, id === 'noteMatureHours');
 }
}

function noteInputs() {
 return Object.fromEntries(noteInputIds.map(id => [id, $(id).value]));
}

function noteStages(stages) {
 return Array.isArray(stages) ? stages.filter(stage => stage && typeof stage === 'object' && !Array.isArray(stage)) : [];
}

function noteStageValues(validate = false) {
 return [...$('noteStages').children].map(row => Object.fromEntries(
  [...row.querySelectorAll('[data-stage-field]')].map(field => {
   const value = field.value.trim();
   if (validate && field.type === 'number' && (field.validity.badInput ||
    (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < Number(field.min) || Number(value) > Number(field.max))))) {
    field.focus();
    throw new Error('工程の温度は−30〜65℃で入力してください');
   }
   return [field.dataset.stageField, value];
  })
 ));
}

function appendNoteStage(entry) {
 const row = $('noteStageFields').content.firstElementChild.cloneNode(true);
 for (const field of row.querySelectorAll('[data-stage-field]')) {
  field.value = entry[field.dataset.stageField] ?? '';
 }
 row.querySelector('[data-stage-remove]').onclick = () => {
  row.remove();
  saveNoteDraft();
  $('addNoteStage').focus();
 };
 $('noteStages').append(row);
 return row;
}

function showRecipeNoteHistory(recipe) {
 resetNoteForm();
 noteRecipeFilter = recipe;
 noteVisible = 5;
 $('noteSearch').value = '';
 $('noteRatingFilter').value = '';
 $('noteHistoryStatus').textContent = '';
 selectTab('saved');
 $('recipeListView').hidden = true;
 $('ferment').hidden = false;
 switchNoteView('history');
 if (!driveNotes.ready) refreshDriveNotes();
 $('backToRecipes').focus();
}

function showNotes() {
 const root = $('noteList');
 root.replaceChildren();
 const query = $('noteSearch').value.trim().toLocaleLowerCase();
 const ratingFilter = $('noteRatingFilter').value;
 const all = savedNotes();
 updateNoteDriveControls();
 const recipes = savedRecipes();
 const currentRecipeKey = noteRecipeFilter ? recipeKey(noteRecipeFilter) : null;
 $('noteRecipeFilterBar').hidden = !noteRecipeFilter;
 $('noteRecipeFilterName').textContent = noteRecipeFilter?.name || '';
 const notes = all.filter(note => {
  if (currentRecipeKey) {
   const linked = linkedNoteRecipe(note, recipes);
   if (!linked || recipeKey(linked) !== currentRecipeKey) return false;
  }
  const x = note.inputs;
  const stageTerms = noteStages(note.stages).flatMap(entry => [stageLabels[entry.kind],entry.time,entry.observation]);
  const searchable = [note.recipeName,x.noteStarted,x.noteMemo,x.noteMethod,x.noteTemp,x.noteHumidity,x.noteBakeCondition,x.noteImprovement,...stageTerms];
  if (!searchable.join(' ').toLocaleLowerCase().includes(query)) return false;
  const rating = Number(x.noteRating) || 0;
  return !ratingFilter || (ratingFilter === 'unrated' ? rating === 0 : rating >= Number(ratingFilter));
 });
 if (!notes.length) {
  const empty = document.createElement('p');
  empty.className = 'note';
  empty.textContent = driveRecipes.enabled && !driveNotes.ready ? 'Driveの仕込み記録は未読み込みです。' :
   all.length ? '該当する仕込み記録がありません。' : 'まだ仕込み記録がありません。';
  root.append(empty);
 }
 for (const note of notes.slice(0, noteVisible)) {
  const card = document.createElement('div');
  card.className = 'note-entry';
  const name = document.createElement('strong');
  name.textContent = note.recipeName;
  const meta = document.createElement('small');
  const x = note.inputs;
  meta.textContent = (x.noteStarted || '日時未記入').replace('T',' ') + ' ／ ' + (x.noteRating ? '★'.repeat(Number(x.noteRating)) : '未評価');
  const preview = document.createElement('div');
  preview.className = 'note-entry-preview';
  const snapshot = note.recipeSnapshot || {};
  preview.textContent = [
   processLabels[snapshot.process],
   snapshot.totalFlour ? '粉 ' + Math.round(Number(snapshot.totalFlour)) + 'g' : '',
   snapshot.hydration !== undefined ? '加水 ' + snapshot.hydration + '%' : '',
   x.noteSeedHours ? '種 ' + fermentationDurationLabel(x.noteSeedHours) : '',
   x.noteMatureHours ? '本捏ね後 ' + fermentationDurationLabel(x.noteMatureHours,true) : '',
  ].filter(Boolean).join(' · ');
  const more = document.createElement('details');
  const heading = document.createElement('summary');
  labelWithIcon(heading,'note','詳細・メモ');
  const detail = document.createElement('p');
  detail.textContent = [
   x.noteTemp ? '室温 ' + x.noteTemp + '℃' : '',
   x.noteHumidity ? '湿度 ' + x.noteHumidity + '%' : '',
   fermentationMethods[x.noteMethod],
  ].filter(Boolean).join(' ／ ') + (x.noteMemo ? '\n' + x.noteMemo : '');
  more.append(heading);
  if (detail.textContent.trim()) more.append(detail);
  for (const [label,value] of [['焼成条件',x.noteBakeCondition], ['次回の改善点',x.noteImprovement]]) {
   if (!value) continue;
   const info = document.createElement('p');
   info.textContent = label + '：' + value;
   more.append(info);
  }
  const entries = noteStages(note.stages);
  if (entries.length) {
   const stages = document.createElement('ol');
   stages.className = 'impasto-history';
   for (const stage of entries) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = stageLabels[stage.kind] || 'その他';
    const facts = document.createElement('small');
    facts.textContent = [
     String(stage.time ?? '').replace('T',' '),
     stage.dough !== '' && stage.dough != null ? '生地 ' + stage.dough + '℃' : '',
     stage.ambient !== '' && stage.ambient != null ? '室温・庫内 ' + stage.ambient + '℃' : '',
    ].filter(Boolean).join(' ／ ');
    item.append(title, facts);
    if (stage.observation) {
     const observation = document.createElement('p');
     observation.textContent = stage.observation;
     item.append(observation);
    }
    stages.append(item);
   }
   more.append(stages);
  }
  const actions = document.createElement('div');
  actions.className = 'actions';
  if (driveRecipes.enabled && !note._driveRevision) {
   const local = document.createElement('small');
   local.textContent = '端末内の記録 ・ Driveに取り込むと編集できます';
   more.append(local);
  } else {
   const edit = listAction('edit','編集');
   edit.onclick = () => editSavedNote(note);
   const remove = listAction('trash','仕込み記録を削除',true);
   remove.onclick = () => {
    if (!confirm('この仕込み記録を削除しますか？')) return;
    runRecipeOperation($('noteHistoryStatus'), async () => {
     if (driveRecipes.enabled) await driveNotes.save(null,note,true);
     else localStorage.setItem(NOTES_KEY,JSON.stringify(localNotes().filter(item => item.id !== note.id)));
     showNotes();
     $('noteHistoryStatus').textContent = '仕込み記録を削除しました。';
    });
   };
   actions.append(edit,remove);
   more.append(actions);
  }
  if (note._driveConflict) {
   const conflict = document.createElement('small');
   conflict.textContent = '別端末の変更と競合';
   more.append(conflict);
  }
  card.append(name,meta,preview,more);
  root.append(card);
 }
 $('moreNotes').hidden = notes.length <= noteVisible;
 $('moreNotes').textContent = 'さらに' + Math.min(5,notes.length - noteVisible) + '件表示（残り' + (notes.length - noteVisible) + '件）';
}

function loadNoteFields(inputs = {}, stages = []) {
 for (const id of noteInputIds) $(id).value = inputs[id] ?? '';
 if (!$('noteStarted').value) $('noteStarted').value = dateTimeLocal(new Date());
 if (!$('noteMethod').value) $('noteMethod').value = 'room';
 $('noteStages').replaceChildren();
 for (const stage of noteStages(stages)) appendNoteStage(stage);
 noteSeedVisibility();
 syncDurationPicks();
}

function editSavedNote(note) {
 editingNote = note;
 noteWriteTime = null;
 const linked = linkedNoteRecipe(note, savedRecipes());
 const field = $('noteRecipe');
 field.querySelector('option[value="past-note"]')?.remove();
 if (!linked) field.append(new Option(note.recipeName || '仕込み時の配合','past-note'));
 selectNoteRecipe(linked ? recipeKey(linked) : 'past-note');
 field.disabled = true;
 $('cancelNoteEdit').hidden = false;
 $('saveNote').textContent = 'この記録を更新';
 $('noteStatus').textContent = '編集中：' + note.recipeName;
 loadNoteFields(note.inputs,note.stages);
 switchNoteView('new');
 window.scrollTo(0,0);
}

function noteDraftStorage() {
 const saved = read(NOTE_DRAFT_KEY, null);
 if (!saved) return {last:'current', byRecipe:{}};
 if (saved.byRecipe && typeof saved.byRecipe === 'object') return saved;
 const legacy = savedRecipes().find(recipe => recipe._key + '::' + recipe._i === saved.noteRecipe);
 const last = legacy ? recipeKey(legacy) : saved.noteRecipe || 'current';
 return {last, byRecipe:{[last]:saved}};
}

function restoreNoteDraft(key) {
 const stored = noteDraftStorage();
 selectNoteRecipe(key ?? stored.last);
 const draft = Object.hasOwn(stored.byRecipe, $('noteRecipe').value) ? stored.byRecipe[$('noteRecipe').value] : null;
 const plan = read(PLAN_KEY,null);
 const initial = plan && {noteTemp:plan.room, noteHumidity:plan.humidity, noteMethod:plan.method};
 loadNoteFields(draft ?? initial ?? {},draft?.stages);
 return !!draft;
}

function resetNoteForm() {
 editingNote = null;
 noteWriteTime = null;
 $('noteRecipe').querySelector('option[value="past-note"]')?.remove();
 $('noteRecipe').disabled = false;
 $('cancelNoteEdit').hidden = true;
 $('saveNote').textContent = '仕込みを保存';
 $('noteStatus').textContent = '';
}

function forgetNoteDraft(key) {
 try {
  const stored = noteDraftStorage();
  delete stored.byRecipe[key];
  if (!Object.keys(stored.byRecipe).length) localStorage.removeItem(NOTE_DRAFT_KEY);
  else {
   if (stored.last === key) stored.last = Object.keys(stored.byRecipe)[0];
   localStorage.setItem(NOTE_DRAFT_KEY, JSON.stringify(stored));
  }
 } catch {}
}

function saveNoteEntry() {
 const input = noteInputs();
 const status = $('noteStatus');
 if (input.noteHumidity !== '' && (+input.noteHumidity < 0 || +input.noteHumidity > 100)) {
  status.textContent = '湿度は0〜100%で入力してください';
  return;
 }
 for (const id of ['noteSeedHours','noteMatureHours']) if (input[id] !== '' &&
  (!Number.isFinite(Number(input[id])) || Number(input[id]) < 0 || Number(input[id]) > 1000)) {
  status.textContent = '発酵時間を確認してください';
  return;
 }
 let stages;
 try { stages = noteStageValues(true); }
 catch (error) { status.textContent = error.message; return; }
 const existing = editingNote;
 const chosen = pickedRecipe();
 const linked = existing && linkedNoteRecipe(existing,savedRecipes());
 const clean = existing && Object.fromEntries(Object.entries(existing).filter(([key])=> !key.startsWith('_drive')));
 const item = {
  ...clean,
  recipeId:existing
   ? (existing.recipeId !== undefined ? existing.recipeId : linked ? recipeKey(linked) : null)
   : chosen.id,
  recipeName:existing?.recipeName || chosen.name,
  recipeSnapshot:existing?.recipeSnapshot || chosen.snapshot,
  inputs:input, stages, savedAt:noteWriteTime ??= new Date().toISOString(),
 };
 runRecipeOperation(status, async () => {
  if (driveRecipes.enabled) {
   if (existing && !existing._driveRevision) throw new Error('仕込み履歴から端末内の記録をDriveに取り込んでください。');
   await driveNotes.save(item,existing);
  } else {
   const notes = localNotes();
   const position = existing ? notes.findIndex(note => note.id === existing.id) : -1;
   if (existing && position < 0) throw new Error('編集中の仕込み記録が見つかりません。');
   if (existing) notes[position] = item;
   else notes.unshift({...item,id:'note-' + crypto.randomUUID()});
   localStorage.setItem(NOTES_KEY,JSON.stringify(notes));
  }
  if (!existing) forgetNoteDraft($('noteRecipe').value);
  if (noteRecipeFilter && item.recipeId !== recipeKey(noteRecipeFilter)) noteRecipeFilter = null;
  noteVisible = 5;
  $('noteSearch').value = '';
  $('noteRatingFilter').value = '';
  resetNoteForm();
  $('noteHistoryStatus').textContent = driveRecipes.enabled ? '✓ 仕込み記録をGoogle Driveに保存しました' : '✓ 仕込みを保存しました';
  switchNoteView('history');
  window.scrollTo(0,0);
 });
}

function initNotes() {
 if (!$('noteStarted').value) $('noteStarted').value = dateTimeLocal(new Date());
 refreshNoteRecipes();
 $('noteRecipe').onchange = noteSeedVisibility;
 for (const id of ['noteSeedHours','noteMatureHours']) $(id).oninput = updateDurations;
 $('saveNote').onclick = saveNoteEntry;
 $('refreshNotes').onclick = refreshDriveNotes;
 $('importLocalNotes').onclick = () => {
  const notes = localNotes();
  if (!confirm('この端末にある仕込み記録をDriveに取り込みますか？')) return;
  runRecipeOperation($('noteHistoryStatus'), async () => {
   const count = await driveNotes.migrate(notes);
   showNotes();
   $('noteHistoryStatus').textContent = count ? '仕込み記録をDriveに取り込みました（新規 ' + count + '件）。'
    : '対象の仕込み記録はすでにDriveに取り込まれています。';
  });
 };
 $('addNoteStage').onclick = () => {
  const stages = noteStageValues();
  const kind = stages.length ? nextStage[stages.at(-1).kind] || 'other' : 'kneaded';
  const row = appendNoteStage({kind,time:dateTimeLocal(new Date())});
  saveNoteDraft();
  row.querySelector('[data-stage-field="kind"]').focus();
 };
 $('cancelNoteEdit').onclick = () => { resetNoteForm(); switchNoteView('history'); };
 $('clearNoteRecipeFilter').onclick = () => { noteRecipeFilter = null; noteVisible = 5; showNotes(); };
 showNotes();
 updateDurations();
}
const BACKUP_V1_KEYS = ['ange-v3-current', 'ange-v3-adopted', 'ange-v3-recipes', NOTES_KEY];
const BACKUP_KEYS = [...BACKUP_V1_KEYS, TEMP_KEY, NOTE_DRAFT_KEY, PLAN_KEY, FLOUR_NAMES_KEY];

function validatedBackupEntries(backup) {
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
 return entries;
}

function restoreBackup(backup) {
 const entries = validatedBackupEntries(backup);
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
   $('backupStatus').textContent = 'この端末のバックアップを作成しました。';
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
 if (tab === 'saved') {
  $('recipeListView').hidden = false;
  $('ferment').hidden = true;
  if (tabChanged && driveRecipes.enabled && window.angeDriveConnection.connected()) refreshDriveBook();
 }
 if (tab === 'plan') updatePlanFields();
 $('settingsMenu').open = false;
 if (tabChanged) window.scrollTo(0, 0);
}
$('backToRecipes').onclick = () => {
 selectTab('saved');
 $('allNoteHistory').focus();
 window.scrollTo(0,0);
};
$('allNoteHistory').onclick = () => showRecipeNoteHistory(null);
$('noteHistoryTab').onclick = () => {
 resetNoteForm();
 switchNoteView('history');
};
function openNewNote(initialStage) {
 resetNoteForm();
 $('noteHistoryStatus').textContent = '';
 const hasDraft = restoreNoteDraft(noteRecipeFilter ? recipeKey(noteRecipeFilter) : undefined);
 $('noteRecipe').disabled = !!noteRecipeFilter;
 if (!hasDraft && initialStage) appendNoteStage({kind:'kneaded',time:dateTimeLocal(new Date())});
 switchNoteView('new');
 return hasDraft;
}
$('noteNewTab').onclick = () => openNewNote(true);
$('quickSaveRecipe').onclick = () => {
 if (editingRecipe) {
  selectTab('saved');
  $('recipeName').focus();
  return;
 }
 openRecipeModal();
};
$('style').onchange=e=>applyPreset(e.target.value);
function changeFormulaProcess(process) {
 state.process = process;
 if (process === 'poolish' && state.bigaHyd < 80) state.bigaHyd = 100;
 if (process === 'biga' && state.bigaHyd > 80) state.bigaHyd = 50;
 if (!state.flourGroups && process !== 'straight' && state.flours.every(flour => flour.seed === 0)) {
  state.flours[0].seed = Math.min(300,flourTotal());
 }
 normalise();
 persist();
 redraw();
}
$('process').onchange = event => changeFormulaProcess(event.target.value);
$('addBallSize').onclick = () => changeSecondBallSize(Number(state.ball) === 250 ? 180 : 250);
$('removeBallSize').onclick = () => changeSecondBallSize(null);
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
$('adopt').onclick=()=>{adopted[state.style]={hydration:state.hydration,salt:state.salt,oil:state.oil,extras:clone(state.extras),flours:clone(state.flours),flourGroups:state.flourGroups ? clone(state.flourGroups) : undefined,process:state.process,bigaHyd:state.bigaHyd};localStorage.setItem('ange-v3-adopted',JSON.stringify(adopted));$('adoptStatus').textContent='✓ '+presets[state.style].name+'の配合を保存しました'};
$('restorePreset').onclick=()=>{if(!confirm('このスタイルで採用した配合を初期値に戻しますか？'))return;delete adopted[state.style];localStorage.setItem('ange-v3-adopted',JSON.stringify(adopted));applyPreset(state.style);$('adoptStatus').textContent='初期配合に戻しました'};
for (const button of document.querySelectorAll('[data-tab]')) button.onclick = () => {
 selectTab(button.dataset.tab);
};
$('saveRecipe').onclick = () => saveRecipeEdit(false);
$('overwriteRecipe').onclick = () => saveRecipeEdit(true);
$('cancelRecipeEdit').onclick = () => { stopRecipeEditing(); showRecipes(); };
$('recipeEditFormula').onclick = () => selectTab('recipe');
$('recipeSearch').oninput=()=>{recipeVisible=5;showRecipes()};$('recipeSort').onchange=()=>{recipeVisible=5;showRecipes()};$('moreRecipes').onclick=()=>{recipeVisible+=5;showRecipes()};
$('noteSearch').oninput=()=>{noteVisible=5;showNotes()};$('noteRatingFilter').onchange=()=>{noteVisible=5;showNotes()};$('moreNotes').onclick=()=>{noteVisible+=5;showNotes()};
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
 if (!c.valid || Number(state.ball) <= 0) {
  $('summaryBalls').textContent = '配合または生地玉の設定を確認してください';
 } else if (hasSecondBallSize()) {
  const remaining = Math.max(0, c.dough - targetDoughWeight());
  $('summaryBalls').textContent = '生地玉 ' + fmt(Number(state.ball)) + 'g × ' + state.quantity +
   '玉 ＋ ' + fmt(state.secondBall) + 'g × ' + state.secondQuantity + '玉 ／ 余り ' + fmt(remaining) + 'g';
 } else {
  $('summaryBalls').textContent = '生地玉 ' + fmt(Number(state.ball)) + 'g × ' + balls + '玉 ／ 余り ' + fmt(remainder) + 'g';
 }
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
  const value = values?.[field.dataset.condition] ?? '';
  if (field.dataset.duration) fillFermentationTimes(field, value);
  else field.value = value;
 }
}

function fermentationDurationLabel(value, useDays = false) {
 const hours = Number(value);
 if (useDays && hours >= 24) {
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  if (!rest) return days + '日';
  if (rest === 12) return days + '日半';
  return days + '日' + fermentationDurationLabel(rest);
 }
 const minutes = round(hours * 60, 8);
 if (!Number.isInteger(minutes)) return hours + '時間';
 const wholeHours = Math.floor(minutes / 60);
 const rest = minutes % 60;
 if (!wholeHours) return rest + '分';
 return wholeHours + '時間' + (rest ? rest + '分' : '');
}

function fillFermentationTimes(field, value) {
 const cold = field.dataset.duration === 'cold';
 const wholeHours = Array.from({length: cold ? 23 : 24}, (_, i) => i + 1);
 const short = [5, 10, 15, 20, 30, 45].map(minutes => minutes / 60);
 const hours = cold ? wholeHours : [...wholeHours, 1.5, 2.5, 3.5, 30, 36, 48].sort((a, b) => a - b);
 const days = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 10, 14, 20].map(days => 24 * days);
 const groups = cold ? [['日数', days], ['時間', hours], ['分', short]] : [['分', short], ['時間', hours]];
 const selected = value === '' ? '' : String(Number(value));
 field.replaceChildren(new Option('未設定', ''));
 for (const [label, durations] of groups) {
  const group = document.createElement('optgroup');
  group.label = label;
  for (const duration of durations) group.append(new Option(fermentationDurationLabel(duration, cold), String(duration)));
  field.append(group);
 }
 if (selected && !Array.from(field.options).some(option => option.value === selected)) {
  field.append(new Option(fermentationDurationLabel(value, cold) + '（保存済み）', selected));
 }
 field.value = selected;
}

function readRecipeConditions(id) {
 const conditions = {};
 for (const field of $(id).querySelectorAll('[data-condition]')) {
  const key = field.dataset.condition;
  const value = field.value.trim();
  if (field.dataset.duration) {
   const hours = Number(value);
   if (value && (!Number.isFinite(hours) || hours < 0 || hours > 500)) throw new Error('発酵時間を確認してください');
   conditions[key] = value === '' ? null : hours;
  } else if (field.type === 'number') {
   const number = Number(value);
   if (field.validity.badInput || (value !== '' && (!Number.isFinite(number) ||
    number < Number(field.min) || number > Number(field.max)))) {
    throw new Error('入力した温度の範囲を確認してください');
   }
   conditions[key] = value === '' ? null : number;
  } else {
   conditions[key] = value || null;
  }
 }
 return Object.values(conditions).some(value => value !== null) ? conditions : null;
}

function recipeFlourNames(recipe) {
 const groups = recipe.flourGroups;
 return groups
  ? [...groups.seed,...groups.main].map(row => row.name)
  : (recipe.flours || []).flatMap(row => [row.name,row.seedName]);
}

function uniqueFlourNames(names) {
 const result = new Map();
 for (const name of names) {
  const label = String(name ?? '').trim();
  const key = label.normalize('NFKC').toLocaleLowerCase('ja-JP');
  if (key && !result.has(key)) result.set(key,label);
 }
 return [...result.values()];
}

function flourCatalog() {
 const saved = read(FLOUR_NAMES_KEY,null);
 return Array.isArray(saved?.names) ? uniqueFlourNames(saved.names)
  : uniqueFlourNames(savedRecipes().flatMap(recipe => recipeFlourNames(recipe.state || {})));
}

function updateFlourOptions() {
 $('flourNameOptions').replaceChildren(...flourCatalog().map(name => new Option(name,name)));
}

function showFlourCatalog() {
 const host = $('flourNamesList');
 host.replaceChildren();
 const names = flourCatalog();
 if (!names.length) {
  const empty = document.createElement('p');
  empty.className = 'note';
  empty.textContent = 'レシピを保存すると、入力した粉の名称がここに登録されます。';
  host.append(empty);
 }
 names.forEach((name,index) => {
  const form = document.createElement('form');
  form.className = 'flour-name-edit';
  const input = document.createElement('input');
  input.value = name;
  input.required = true;
  input.setAttribute('aria-label',name + 'の名称');
  const save = listAction('edit','変更',true);
  save.type = 'submit';
  const remove = listAction('trash',name + 'を候補から削除',true);
  function write(next) {
   try { localStorage.setItem(FLOUR_NAMES_KEY,JSON.stringify({names:next})); }
   catch { $('flourNamesStatus').textContent = '変更を保存できませんでした。'; return; }
   updateFlourOptions();
   showFlourCatalog();
   $('flourNamesStatus').textContent = '粉の名称リストを更新しました。';
  }
  form.onsubmit = event => {
   event.preventDefault();
   const replacement = input.value.trim();
   const next = uniqueFlourNames(names.map((current,i) => i === index ? replacement : current));
   if (!replacement || next.length !== names.length) {
    $('flourNamesStatus').textContent = '別の名称を入力してください。';
    return;
   }
   write(next);
  };
  remove.onclick = () => {
   if (confirm('「' + name + '」を粉の名称候補から削除しますか？')) write(names.filter((_,i) => i !== index));
  };
  form.append(input,save,remove);
  host.append(form);
 });
}

$('openBackup').onclick = () => {
 $('settingsMenu').open = false;
 $('backupDialog').showModal();
};
$('openFlourNames').onclick = () => {
 $('settingsMenu').open = false;
 $('flourNamesStatus').textContent = '';
 showFlourCatalog();
 $('flourNamesDialog').showModal();
};

function openRecipeModal() {
 $('modalRecipeName').value = '';
 const plan = read(PLAN_KEY,null);
 fillRecipeConditions('newRecipeConditions', plan ? {room:plan.room,fridge:plan.method === 'mixed' ? plan.fridge : '',method:plan.method,coldHours:plan.method === 'mixed' ? plan.coldHours : ''} : temperatureDefaults());
 $('modalError').hidden = true;
 $('recipeModal').showModal();
 updateDriveBookControls();
 $('modalRecipeName').focus();
}

async function saveRecipeRecord(name, conditions, source = null) {
 const key = source?._key || 'ange-v3-recipes';
 const record = {name, state:currentRecipeData(), conditions, savedAt:new Date().toLocaleDateString('ja-JP')};
 if (driveRecipes.enabled) {
  if (source && !source._driveRevision) throw new Error('Driveのレシピ帳からレシピを開き直してください。');
  if (!source && savedRecipes().some(recipe => recipe.name === name) &&
   !confirm('同じ名前のレシピがあります。別のレシピとして保存しますか？')) return false;
  await driveRecipes.save({...record, ...(source?.legacyRecipeKey ? {legacyRecipeKey:source.legacyRecipeKey} : {})}, source);
  try {
   localStorage.setItem(FLOUR_NAMES_KEY,JSON.stringify({names:uniqueFlourNames([...flourCatalog(),...recipeFlourNames(record.state)])}));
  } catch {}
  updateFlourOptions();
  return true;
 }
 const recipes = read(key, []);
 if (source) {
  const index = source.id ? recipes.findIndex(recipe => recipe.id === source.id) : source._i;
  if (index < 0 || index >= recipes.length) throw new Error('元のレシピが見つかりません');
  recipes[index] = {...recipes[index], ...record};
 } else {
  if (recipes.some(recipe => recipe.name === name) &&
   !confirm('同じ名前のレシピがあります。別のレシピとして保存しますか？')) return false;
  recipes.unshift({id:'recipe-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), ...record});
 }
 const previousNames = localStorage.getItem(FLOUR_NAMES_KEY);
 const names = uniqueFlourNames([...flourCatalog(),...recipeFlourNames(record.state)]);
 let namesWritten = false;
 try {
  localStorage.setItem(FLOUR_NAMES_KEY,JSON.stringify({names}));
  namesWritten = true;
  localStorage.setItem(key, JSON.stringify(recipes));
 } catch {
  if (namesWritten) {
   if (previousNames === null) localStorage.removeItem(FLOUR_NAMES_KEY);
   else localStorage.setItem(FLOUR_NAMES_KEY,previousNames);
  }
  throw new Error('保存に失敗しました。空き容量とブラウザ設定を確認してください');
 }
 updateFlourOptions();
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
 runRecipeOperation($('recipeEditStatus'), async () => {
  if (!name) throw new Error('レシピ名を入力してください');
  if (!overwrite && name === editingRecipe.name) {
   throw new Error('別名で保存するには、元と異なるレシピ名を入力してください');
  }
  const conditions = readRecipeConditions('editRecipeConditions');
  if (await saveRecipeRecord(name, conditions, overwrite ? editingRecipe : null)) {
   finishRecipeSave(driveRecipes.enabled ? '✓ Google Driveに保存しました' : overwrite ? '✓ レシピを更新しました' : '✓ 別名で保存しました');
  }
 });
}

function saveModalRecipe(skip) {
 runRecipeOperation($('modalError'), async () => {
  const name = $('modalRecipeName').value.trim();
  if (!name) throw new Error('レシピ名を入力してください');
  const conditions = skip ? null : readRecipeConditions('newRecipeConditions');
  if (await saveRecipeRecord(name, conditions)) {
   $('recipeModal').close();
   finishRecipeSave(driveRecipes.enabled ? '✓ Google Driveに保存しました' : '✓ レシピを追加しました');
  }
 });
}

let recipeOperationPending = false;
const recipeOperationButtons = ['overwriteRecipe','saveRecipe','cancelRecipeEdit','modalCancel','modalSave','modalSkip',
 'enableDriveRecipes','importLocalRecipes','selectDriveBackup','driveBackupFiles','retryDriveBackup','reloadDriveRecipes','editDriveConnect','modalDriveConnect','saveNote','cancelNoteEdit','refreshNotes','importLocalNotes'];

function updateDriveBookControls() {
 const connected = window.angeDriveConnection.connected();
 const localCount = localRecipes().length;
 $('driveRecipesControls').hidden = !driveRecipes.enabled;
 $('driveBackupNotice').hidden = !driveRecipes.enabled;
 updateNoteDriveControls();
 $('modalDriveConnect').hidden = $('editDriveConnect').hidden = !driveRecipes.enabled || connected;
 $('enableDriveRecipes').hidden = driveRecipes.enabled;
 $('importLocalRecipes').hidden = localCount === 0;
 $('driveLocalInfo').textContent = localCount
  ? 'この端末に保存されたレシピ ' + localCount + '件をDriveに取り込めます。端末内の元データは残ります。'
  : 'Driveを保存先にすると、同じGoogleアカウントでレシピを開けます。';
 $('driveRecipesStatus').textContent = !connected ? '保存先 Google Drive ・ 未接続'
  : driveRecipes.ready ? '保存先 Google Drive' : '保存先 Google Drive ・ 一覧を更新してください';
}

function renderRecipeBook() {
 updateDriveBookControls();
 showRecipes();
 refreshNoteRecipes();
 updateFlourOptions();
}

async function runRecipeOperation(status, task) {
 if (recipeOperationPending) return;
 recipeOperationPending = true;
 status.hidden = false;
 status.textContent = driveRecipes.enabled || status.id.startsWith('drive') ? 'Google Driveを確認しています…' : '';
 for (const id of recipeOperationButtons) $(id).disabled = true;
 try { await task(); }
 catch (error) {
  window.angeDriveConnection.expireIfUnauthorized(error);
  status.textContent = error.message;
  if (activeTab === 'saved') showRecipes();
 } finally {
  for (const id of recipeOperationButtons) $(id).disabled = false;
  recipeOperationPending = false;
  updateDriveBookControls();
 }
}

function refreshDriveBook() {
 return runRecipeOperation($('recipeEditStatus'), async () => {
  await driveRecipes.load();
  renderRecipeBook();
  $('recipeEditStatus').textContent = '';
 });
}

$('reloadDriveRecipes').onclick = refreshDriveBook;
$('enableDriveRecipes').onclick = () => runRecipeOperation($('driveRecipeOperation'), async () => {
 await driveRecipes.load();
 driveRecipes.activate();
 stopRecipeEditing();
 renderRecipeBook();
 $('driveRecipeOperation').textContent = 'Driveのレシピ帳を有効にしました。';
});
async function importRecipesToDrive(records) {
 const imported = await driveRecipes.migrate(records);
 const wasEnabled = driveRecipes.enabled;
 driveRecipes.activate();
 if (!wasEnabled) stopRecipeEditing();
 renderRecipeBook();
 $('driveRecipeOperation').textContent = imported ? 'Driveにレシピを取り込みました（新規 ' + imported + '件）。'
  : '対象のレシピはすでにDriveに取り込まれています。';
}

function recipeRecordsFromBackups(backups) {
 return backups.flatMap(backup => {
  const recipes = validatedBackupEntries(backup).find(([key]) => key === 'ange-v3-recipes')?.[1] ?? [];
  if (!recipes.length) throw new Error('レシピが入ったAnge Pizza Labのバックアップを選んでください。');
  return recipes.map((recipe,index) => ({...recipe,_key:'ange-v3-recipes',_i:index}));
 });
}

$('importLocalRecipes').onclick = () => {
 const records = localRecipes();
 if (!confirm('この端末にある ' + records.length + '件のレシピを、接続中のGoogle Driveに取り込みますか？')) return;
 runRecipeOperation($('driveRecipeOperation'), () => importRecipesToDrive(records));
};

let backupImportRecords;
function importSelectedBackups() {
 runRecipeOperation($('driveRecipeOperation'), async () => {
  if (!backupImportRecords) return;
  await importRecipesToDrive(backupImportRecords);
  backupImportRecords = undefined;
  $('retryDriveBackup').hidden = true;
 });
}

$('selectDriveBackup').onclick = () => {
 if (!window.angeDriveConnection.connected()) {
  $('driveRecipeOperation').textContent = '先に「Google Driveに接続」を押してください。';
  return;
 }
 $('driveBackupFiles').click();
};
$('driveBackupFiles').onchange = async event => {
 const input = event.target;
 const files = [...input.files];
 input.value = '';
 if (!files.length) return;
 backupImportRecords = undefined;
 $('retryDriveBackup').hidden = true;
 let records;
 try {
  const backups = await Promise.all(files.map(async file => JSON.parse(await file.text())));
  records = recipeRecordsFromBackups(backups);
 } catch (error) {
  $('driveRecipeOperation').textContent = error instanceof SyntaxError
   ? 'Ange Pizza Labのバックアップファイルを選んでください。' : error.message;
  return;
 }
 const device = localRecipes();
 const count = 'バックアップのレシピ ' + records.length + '件';
 const withDevice = device.length ? 'と、この端末のレシピ ' + device.length + '件' : '';
 if (!confirm(count + withDevice + 'を、接続中のGoogle Driveにまとめますか？')) return;
 backupImportRecords = [...records,...device];
 $('retryDriveBackup').hidden = false;
 importSelectedBackups();
};
$('retryDriveBackup').onclick = importSelectedBackups;
document.addEventListener('ange-drive-session', () => {
 backupImportRecords = undefined;
 $('retryDriveBackup').hidden = true;
 renderRecipeBook();
 if (!$('ferment').hidden) {
  showNotes();
  refreshDriveNotes();
 } else if (driveRecipes.enabled && window.angeDriveConnection.connected()) refreshDriveBook();
});
$('recipeModal').addEventListener('cancel', event => { if (recipeOperationPending) event.preventDefault(); });

$('modalCancel').onclick = () => $('recipeModal').close();
$('recipeModalForm').onsubmit = event => { event.preventDefault(); saveModalRecipe(false); };
$('modalSkip').onclick = () => saveModalRecipe(true);
let referenceMethod='room';
function renderFermentReference() {
 const plan = read(PLAN_KEY,null);
 const defaults = temperatureDefaults();
 const usesPlan = plan?.method === 'room' || plan?.method === 'mixed';
 const method = usesPlan ? plan.method : referenceMethod;
 const room = usesPlan && plan.room !== '' && Number.isFinite(Number(plan.room)) ? Number(plan.room) : defaults.room;
 const fridge = usesPlan && plan.fridge !== '' && Number.isFinite(Number(plan.fridge)) ? Number(plan.fridge) : defaults.fridge;
 $('referenceMethodSwitch').hidden = usesPlan;
 for (const button of document.querySelectorAll('[data-ferment]')) {
  const active = button.dataset.ferment === method;
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
 }
 const process = processLabels[state.process] + '法';
 const cold = method === 'mixed'
  ? '<span>冷蔵庫 <b>' + fridge + '℃</b></span>'
  : '<span>冷蔵庫 <b>使用なし</b></span>';
 const source = usesPlan ? '仕込み予定の温度' : '温度の初期設定';
 const details = state.process === 'poolish' ? '<details><summary>参考データを見る</summary><div class="ref-table"><span>18〜20℃・種粉に対するドライ酵母</span><div>0.08% <b>12〜16時間</b></div><div>0.28% <b>約8時間</b></div><div>0.5% <b>約4時間</b></div><small>一般的な参考例。現在の配合の予測ではありません。</small></div></details>' : '<details><summary>参考情報を見る</summary><p class="note">温度・加水率・酵母量・生地の状態によって発酵時間は変わります。</p></details>';
 $('fermentReference').innerHTML = '<div class="ref-method">' + process + ' ／ ' + source + '</div>' +
  '<div class="ref-temps"><span>室温 <b>' + room + '℃</b></span>' + cold + '</div>' +
  (plan?.bake ? '' : '<div class="ref-result"><small>現在の配合での参考時間</small><strong>算出対象外</strong><span>現在の条件に一致する検証データがありません。</span></div>') +
  details + (method === 'mixed' ? '<p class="ref-caution">冷蔵しても発酵はすぐには止まりません。</p>' : '');
}

document.querySelectorAll('[data-ferment]').forEach(b=>b.onclick=()=>{referenceMethod=b.dataset.ferment;renderFermentReference()});
const _originalSticky = updateStickySummary;
updateStickySummary = function(c) {
 _originalSticky(c);
 renderFermentReference();
 renderPlanReference(c);
};
renderFermentReference();

// RC1: duration choice controls; editable hours and visual selection.
function syncDurationPicks(){document.querySelectorAll('.duration-picks').forEach(group=>{const id=group.dataset.target,input=$(id),v=input.value;const values=[...group.querySelectorAll('button[data-hours]')].map(b=>b.dataset.hours).filter(x=>x!=='custom');const isCustom=v!==''&&!values.includes(v);group.querySelectorAll('button').forEach(b=>b.classList.toggle('active',v!==''&&(isCustom?b.dataset.hours==='custom':b.dataset.hours===v)));$(id==='noteSeedHours'?'noteSeedCustom':'noteMatureCustom').hidden=!isCustom});updateDurations()}
document.querySelectorAll('.duration-picks').forEach(group=>{const id=group.dataset.target;group.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.hours==='custom'){$(id==='noteSeedHours'?'noteSeedCustom':'noteMatureCustom').hidden=false;group.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));$(id).focus();return}$(id).value=b.dataset.hours;syncDurationPicks();saveNoteDraft()}));$(id).addEventListener('input',()=>{const custom=$(id==='noteSeedHours'?'noteSeedCustom':'noteMatureCustom');custom.hidden=false;group.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.hours==='custom'));updateDurations()})});
// Collapsible headers show the live flour total and hydration.
function updateSectionMetrics(c) {
 $('flourMetric').textContent = fmt(c.totalFlour) + 'g';
 $('hydrationMetric').textContent = fmt(Number(state.hydration)) + '%';
}
updateSectionMetrics(calc());syncDurationPicks();

function saveNoteDraft() {
 if (editingNote) return;
 try {
  const key = $('noteRecipe').value;
  const stored = noteDraftStorage();
  const draft = {...noteInputs(), noteRecipe:key, stages:noteStageValues()};
  localStorage.setItem(NOTE_DRAFT_KEY, JSON.stringify({last:key, byRecipe:{...stored.byRecipe, [key]:draft}}));
 } catch {}
}

$('ferment').addEventListener('input',saveNoteDraft);
$('ferment').addEventListener('change',saveNoteDraft);

const planFields = {
 start:'planStart', bake:'planBake', room:'planRoom', humidity:'planHumidity',
 method:'planMethod', fridge:'planFridge', coldHours:'planColdHours', main:'planMain',
};

let planProcess;
const planProcessButtons = document.querySelectorAll('[data-plan-process]');

function updatePlanFields() {
 for (const button of planProcessButtons) {
  const selected = button.dataset.planProcess === planProcess;
  button.classList.toggle('active', selected);
  button.setAttribute('aria-pressed', String(selected));
 }
 const mixed = $('planMethod').value === 'mixed';
 $('planColdFields').hidden = !mixed;
 for (const id of ['planFridge', 'planColdHours']) {
  $(id).disabled = !mixed;
  $(id).required = mixed;
 }
 const direct = planProcess === 'straight';
 $('planStartLabel').textContent = direct ? '捏ね始め' : processLabels[planProcess] + 'の仕込み開始';
 $('planMainField').hidden = direct;
 $('planMain').disabled = direct;
 $('planColdLabel').textContent = direct ? '冷蔵する時間' : '本捏ね後の冷蔵時間';
}

function preparationWindows(plan, process) {
 if (!plan) return null;
 const start = new Date(plan.start).getTime();
 const bake = plan.bake ? new Date(plan.bake).getTime() : null;
 const main = process !== 'straight' && plan.main ? new Date(plan.main).getTime() : null;
 const total = bake === null ? null : (bake - start) / 3600000;
 const seed = main === null ? null : (main - start) / 3600000;
 const cold = plan.method === 'mixed' ? Number(plan.coldHours) : 0;
 if (!Number.isFinite(start) || (total !== null && (!Number.isFinite(total) || total <= 0))) return {error:'焼き始めを仕込み開始より後に設定してください。'};
 if (seed !== null && (!Number.isFinite(seed) || seed <= 0 || (total !== null && seed >= total))) {
  return {error:'本捏ねは、種の仕込み開始と焼き始めの間に設定してください。'};
 }
 if (!Number.isFinite(cold) || cold < 0 || (plan.method === 'mixed' && (!cold || (total !== null && cold > total - (seed ?? 0))))) {
  return {error:'冷蔵時間を本捏ねから焼くまでの範囲で設定してください。'};
 }
 return {total, seed, cold};
}

function avpnYeastRange(plan, windows, formula, calculated) {
 if (!calculated.valid || formula.process !== 'straight' || plan.method !== 'room' ||
     windows.total < 12 || windows.total > 24 || Number(plan.room) < 18 || Number(plan.room) > 20 ||
     !plan.humidity || Number(plan.humidity) < 60 || Number(plan.humidity) > 70 ||
     formula.oil > 0 || calculated.extras.length > 0) return null;
 const waterLiters = calculated.water / 1000;
 const flourPerLiter = calculated.totalFlour / waterLiters;
 const saltPerLiter = calculated.totalFlour * Number(formula.salt) / 100 / waterLiters;
 if (!(flourPerLiter >= 1600 && flourPerLiter <= 1800 && saltPerLiter >= 40 && saltPerLiter <= 60)) return null;
 const factor = formula.yeastType === 'fresh' ? 1 : 1/3;
 return [0.1 * waterLiters * factor, 3 * waterLiters * factor];
}

function renderPlanReference(calculated) {
 const plan = read(PLAN_KEY, null);
 $('planReference').hidden = false;
 $('planFromFormula').hidden = !!plan?.bake;
 $('planReferenceSource').hidden = true;
 $('planTimeReference').textContent = '';
 $('planYeastReference').textContent = '';
 if (plan?.process && plan.process !== state.process) {
  $('planTimeReference').textContent = '仕込み予定で製法を確認してください。';
  return;
 }
 const windows = plan ? preparationWindows(plan,state.process) : null;
 if (windows?.error) {
  $('planTimeReference').textContent = windows.error;
  return;
 }
 if (!plan?.bake) $('planTimeReference').textContent = '参考発酵時間：算出対象外';
 if (!plan) return;
 const range = avpnYeastRange(plan, windows, state, calculated);
 const type = state.yeastType === 'fresh' ? '生' : 'ドライ';
 const grams = value => value > 0 && value < 0.01 ? '0.01未満' : Number(value.toFixed(2)).toString();
 $('planYeastReference').textContent = range
  ? type + 'イーストの参考範囲 ' + range.map(grams).join('〜') + ' g（常温ストレート法）'
  : 'イーストの参考量はこの条件では未算出。現在の配合は ' + type + ' ' + fmt(Number(state.yeast)) + ' g。';
 $('planReferenceSource').hidden = !range;
}

function agendaSteps(plan) {
 return [
  plan.process === 'straight' ? ['mixStart',plan.start] : ['starter',plan.start],
  ...(plan.process === 'straight' ? [] : [['mainStart',plan.main]]),
  ['bake',plan.bake],
 ];
}

function renderAgendaStages() {
 const plan = read(PLAN_KEY,null);
 $('agendaStages').hidden = !plan;
 if (!plan) return;
 const steps = agendaSteps(plan);
 const actual = plan.actual ?? {};
 const next = steps.find(([kind]) => !actual[kind])?.[0];
 const list = $('agendaStageList');
 list.replaceChildren();
 for (const [kind,when] of steps) {
  const row = document.createElement('div');
  row.className = 'agenda-step';
  const label = document.createElement('strong');
  label.textContent = stageLabels[kind];
  const values = document.createElement('small');
  values.textContent = '予定 ' + (when ? when.replace('T',' ') : '未定');
  if (kind === next) {
   row.classList.add('next-agenda-step');
   label.textContent += ' ・次の工程';
  }
  const field = document.createElement('label');
  field.className = 'field';
  field.textContent = '実施日時';
  const time = document.createElement('input');
  time.type = 'datetime-local';
  time.value = actual[kind] ?? '';
  const save = value => {
   const latest = read(PLAN_KEY,null);
   if (!latest || latest.start !== plan.start || latest.process !== plan.process) {
    $('agendaStatus').textContent = '仕込み予定が変更されました。確認してから実施日時を記録してください。';
    renderAgendaStages();
    return;
   }
   const events = {...latest.actual};
   if (value) events[kind] = value;
   else delete events[kind];
   try { localStorage.setItem(PLAN_KEY,JSON.stringify({...latest,actual:events})); }
   catch { $('agendaStatus').textContent = '実施日時を保存できませんでした。'; return; }
   renderAgendaStages();
   $('agendaStatus').textContent = value ? '実施日時を記録しました。' : '実施日時を消去しました。';
  };
  time.onchange = () => save(time.value);
  const now = listAction('clock','今を記録');
  now.onclick = () => save(dateTimeLocal(new Date()));
  field.append(time);
  row.append(label,values,field,now);
  list.append(row);
 }
 $('recordAgendaInDiario').disabled = !steps.some(([kind]) => actual[kind]);
}

function recordAgendaInDiario() {
 const plan = read(PLAN_KEY,null);
 if (!plan) return;
 showRecipeNoteHistory(null);
 const hasDraft = openNewNote(false);
 const existing = noteStageValues();
 const start = plan.actual?.[plan.process === 'straight' ? 'mixStart' : 'starter'];
 if (start && !hasDraft) $('noteStarted').value = start;
 for (const [kind] of agendaSteps(plan)) {
  const time = plan.actual?.[kind];
  if (time && !existing.some(stage => stage.kind === kind && stage.time === time)) appendNoteStage({kind,time});
 }
 saveNoteDraft();
}

function initPreparationPlan() {
 const defaults = temperatureDefaults();
 const plan = read(PLAN_KEY, null) ?? {start:dateTimeLocal(new Date()), room:defaults.room, fridge:defaults.fridge, method:'room'};
 planProcess = Object.keys(processLabels).includes(plan.process) ? plan.process : state.process;
 for (const button of planProcessButtons) button.onclick = () => {
  planProcess = button.dataset.planProcess;
  $('planStatus').textContent = '';
  updatePlanFields();
 };
 fillFermentationTimes($('planColdHours'), plan.coldHours ?? '');
 for (const [key,id] of Object.entries(planFields)) $(id).value = plan[key] ?? '';
 $('planForm').addEventListener('input', () => { $('planStatus').textContent = ''; });
 $('planMethod').onchange = updatePlanFields;
 $('recordAgendaInDiario').onclick = recordAgendaInDiario;
 renderAgendaStages();
 $('planFromFormula').onclick = () => { $('ratioSection').open = true; };
 $('planForm').onsubmit = event => {
  event.preventDefault();
  const values = Object.fromEntries(Object.entries(planFields).map(([key,id]) => [key,$(id).value]));
  values.process = planProcess;
  if (planProcess === 'straight') values.main = '';
  const windows = preparationWindows(values, planProcess);
  if (windows.error) {
   $('planStatus').textContent = windows.error;
   return;
  }
  const previous = read(PLAN_KEY,null);
  if (previous?.start === values.start && previous.process === values.process) values.actual = previous.actual;
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(values)); }
  catch { $('planStatus').textContent = '仕込み予定を保存できませんでした。'; return; }
  renderAgendaStages();
  if (state.process !== planProcess) changeFormulaProcess(planProcess);
  else {
   renderFermentReference();
   renderPlanReference(calc());
  }
  selectTab('recipe');
  document.querySelector('[data-tab="recipe"]').focus();
 };
 renderPlanReference(calc());
}

updateFlourOptions();
updateDriveBookControls();
initPreparationPlan();
selectTab("plan");
