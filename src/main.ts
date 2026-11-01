import Phaser from 'phaser';
import './style.css';

type Ingredient = 'Вода'|'Солнце'|'Трава'|'Огонь'|'Воздух'|'Земля'|'Роса'|'Пар'|'Росток'|'Искра'|'Туман'|'Жизнь';
type Secret = 'Туман'|'Лунная капля'|'Живой кристалл'|'Золотой эликсир';
type Recipe = {name:Ingredient|Secret; inputs:Ingredient[]; reward?:number};
type Player = {name:string; hand:Record<string,number>; flasks:number; bot:boolean};
type Save = {flasks:number; discoveries:string[]};
const BASE:Ingredient[]=['Вода','Солнце','Огонь'];
const LEVEL_RECIPES:Record<number,Recipe[]>={1:[
{name:'Роса',inputs:['Вода','Солнце']},
{name:'Пар',inputs:['Вода','Огонь']},
{name:'Лунная капля',inputs:['Роса','Вода'],reward:1}
],2:[{name:'Роса',inputs:['Вода','Солнце']},{name:'Пар',inputs:['Вода','Огонь']},{name:'Туман',inputs:['Роса','Пар'],reward:1}]};
let currentLevel=1;
const RECIPES=()=>LEVEL_RECIPES[currentLevel];
const ELEMENT_FILES:Record<string,string>={'Вода':'water','Солнце':'sun','Огонь':'fire','Роса':'dew','Пар':'steam','Лунная капля':'moon_drop'};
const elementImage=(name:string)=>ELEMENT_FILES[name]?'./assets/elements/'+ELEMENT_FILES[name]+'.png':'';
const EMOJI:Record<string,string>={'Вода':'💧','Солнце':'☀️','Трава':'🌿','Огонь':'🔥','Воздух':'🌬️','Земля':'🪨','Роса':'💠','Пар':'♨️','Росток':'🌱','Искра':'✨','Туман':'🌫️','Жизнь':'🍃'};
const SAVE_KEY='alchemy-atlas-v1';
function load():Save {try {const data=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');return {flasks:Math.max(0,Number(data?.flasks)||0),discoveries:Array.isArray(data?.discoveries)?data.discoveries:[]};}catch{return {flasks:0,discoveries:[]};}}
let saved=load();
let players:Player[]=[];
let claimed:Record<string,string>={};
let turn=1;
let actions=1;
let ended=false;
let messages:string[]=[];
let mapScene:AtlasScene|null=null;
const count=(p:Player,k:string)=>p.hand[k]||0;
const can=(p:Player,r:Recipe)=>!claimed[r.name]&&r.inputs.every(k=>count(p,k)>=r.inputs.filter(x=>x===k).length);
function add(p:Player,k:string,n=1){p.hand[k]=(p.hand[k]||0)+n;}
function draw(p:Player,n=2){for(let i=0;i<n;i++)add(p,BASE[Math.floor(Math.random()*BASE.length)]);}
function note(s:string){messages.unshift(s);messages=messages.slice(0,7);}
function craft(p:Player,r:Recipe):boolean {
 if(!can(p,r))return false;
 for(const k of r.inputs)p.hand[k]--;
 if(r.reward){
  claimed[r.name]=p.name;p.flasks+=r.reward;
  note(`🏆 ${p.name} открыл(а) «${r.name}» и получил(а) ${r.reward} 🧪`);
  if(!p.bot){saved.flasks+=r.reward;if(!saved.discoveries.includes(r.name))saved.discoveries.push(r.name);localStorage.setItem(SAVE_KEY,JSON.stringify(saved));}
 }else{
  add(p,r.name);
  if(!p.bot&&!saved.discoveries.includes(r.name)){saved.discoveries.push(r.name);localStorage.setItem(SAVE_KEY,JSON.stringify(saved));}
  note(`${p.name}: ${r.inputs.join(' + ')} → ${r.name}`);
 }
 if(Object.keys(claimed).length===1){ended=true;note('Первое зелье создано! Уровень пройден.');}
 return true;
}
function start(level=currentLevel){
 currentLevel=level;
 players=[{name:'Вы',hand:{},flasks:0,bot:false},{name:'Алхимик Лис',hand:{},flasks:0,bot:true},{name:'Мастер Сова',hand:{},flasks:0,bot:true}];
 claimed={};turn=1;actions=1;ended=false;messages=[];
 players.forEach(p=>draw(p,3));players[0].hand=currentLevel===1?{'Вода':2,'Солнце':1,'Огонь':1}:{'Вода':3,'Солнце':1,'Огонь':1};players[1].hand={'Вода':2,'Солнце':2};players[2].hand={'Вода':2,'Солнце':2};selectedRecipe='Роса';
 note('Новая партия. Создавайте вещества и опередите соперников!');
 render();
}
function targets():Recipe[]{return RECIPES().filter(r=>r.reward&&!claimed[r.name]);}
function ingredientCost(p:Player,name:string,seen=new Set<string>()):number{
 if(count(p,name)>0)return 0;
 if(seen.has(name))return 99;
 if(BASE.includes(name as Ingredient))return 3;
 const r=RECIPES().find(x=>x.name===name);
 if(!r)return 99;
 const next=new Set(seen);next.add(name);
 return 1+r.inputs.reduce((sum,k)=>sum+ingredientCost(p,k,next),0);
}
function chooseBotRecipe(p:Player):Recipe|undefined{
 const remaining=targets();
 if(!remaining.length)return;
 const goal=[...remaining].sort((a,b)=>{
 const ac=a.inputs.reduce((s,k)=>s+ingredientCost(p,k),0);
 const bc=b.inputs.reduce((s,k)=>s+ingredientCost(p,k),0);
 return p.name==='Мастер Сова'?(bc/(b.reward||1)-ac/(a.reward||1)):(ac-bc);
 })[0];
 const direct=RECIPES().find(r=>r.name===goal.name&&can(p,r));if(direct)return direct;
 function needed(name:string,seen=new Set<string>()):Recipe|undefined{
  if(count(p,name)>0||seen.has(name))return;
  const r=RECIPES().find(x=>x.name===name);
  if(!r)return;
  if(can(p,r))return r;
  const next=new Set(seen);next.add(name);
  for(const k of r.inputs){const sub=needed(k,next);if(sub)return sub;}
 }
 for(const k of goal.inputs){const r=needed(k);if(r)return r;}
 return RECIPES().find(r=>can(p,r)&&!r.reward);
}
async function nextTurn(){
 if(ended)return;
 for(let i=1;i<3;i++){
  const bot=players[i];
  const recipe=currentLevel===1?RECIPES().find(r=>r.name==='Роса'&&can(bot,r)):(turn<3?RECIPES().find(r=>!r.reward&&can(bot,r)):chooseBotRecipe(bot));
  const card=document.querySelectorAll<HTMLElement>('.level-rival')[i];
  if(card){
   card.classList.add('rival-taking-turn');
   const label=document.createElement('span');
   label.className='rival-action-label';
   label.textContent=recipe?'✦ Создано: '+recipe.name:'✦ Собирает ингредиенты';
   card.append(label);
  }
  if(recipe)craft(bot,recipe);else draw(bot,1);
  await new Promise<void>(resolve=>setTimeout(resolve,1050));
  if(!document.querySelector('.level-screen'))return;
  card?.classList.remove('rival-taking-turn');
  card?.querySelector('.rival-action-label')?.remove();
 }
 turn++;actions=1;
 draw(players[0],2);
 note('Ход '+turn+': получены новые ингредиенты.');
 render();
}
const app=document.querySelector<HTMLDivElement>('#app')!;
let game:Phaser.Game|null=null;
function showHome(){
 craftingAnimation=false;
 app.innerHTML=`<div class="art-screen"><div class="art-stage">
 <img class="art-image" src="./assets/backgrounds/forest_straight_preview.webp" alt="Волшебная лесная дорога">
 <div class="art-fallback"><h1>⚗️ Алхимический атлас</h1><p>Путь алхимика</p></div>
 <div class="level-viewport" id="level-viewport" aria-label="Прокрутка уровней"><div id="moving-levels"></div></div>
 <div class="map-topbar"><span>⚗️ Алхимик</span><span>🧪 ${saved.flasks}</span></div>
 <div class="map-actions"><button id="collection">Коллекция</button><button id="rules">Рецепты</button><button id="chests">Сундуки</button></div>
 <div class="map-footer"><button id="play-first">Играть</button><span id="level-range">Уровни 1–5</span></div>
 <div id="home-message" class="art-dialog" hidden><button id="close-dialog" aria-label="Закрыть">✕</button><div id="dialog-content"></div></div>
 </div></div>`;
 const stage=document.querySelector<HTMLElement>('.art-stage')!;
 const illustration=document.querySelector<HTMLImageElement>('.art-image')!;
 illustration.onload=()=>stage.classList.add('art-ready');
 if(illustration.complete&&illustration.naturalWidth>0)stage.classList.add('art-ready');
 const begin=(level=1)=>{currentLevel=level;showGame();start(level);};
 document.querySelector<HTMLButtonElement>('#play-first')!.onclick=()=>begin(1);
 const dialog=document.querySelector<HTMLElement>('#home-message')!;
 const openDialog=(message:string)=>{document.querySelector('#dialog-content')!.textContent=message;dialog.hidden=false;};
 document.querySelector<HTMLButtonElement>('#close-dialog')!.onclick=()=>{dialog.hidden=true;};
 document.querySelector<HTMLButtonElement>('#collection')!.onclick=()=>openDialog('Открытые вещества: '+(saved.discoveries.join(', ')||'пока нет')+'.');
 document.querySelector<HTMLButtonElement>('#rules')!.onclick=()=>openDialog('Создавайте вещества по рецептам и первыми раскрывайте три тайны.');
 document.querySelector<HTMLButtonElement>('#chests')!.onclick=()=>openDialog('Сундуки появятся в следующих обновлениях.');

 // Straight road: all levels share one centerline, with perspective.
 // Coordinates are relative to the viewport, from near to far.
 const point=(t:number)=>{
  const depth=Math.max(0,Math.min(1,t));
  return {x:0.5,y:0.82-depth*0.78};
 };
 const layer=document.querySelector<HTMLElement>('#moving-levels')!;
 const viewport=document.querySelector<HTMLElement>('#level-viewport')!;
 const range=document.querySelector<HTMLElement>('#level-range')!;
 let offset=0,dragging=false,lastY=0,moved=false,velocity=0,frame=0;
 const visibleCount=4,step=0.245;
 const update=()=>{
  const start=Math.max(1,Math.floor(offset)+1);
  range.textContent='Уровни '+start+'–'+(start+visibleCount-1);
  layer.replaceChildren();
  for(let n=Math.max(1,Math.floor(offset)-1);n<=Math.ceil(offset)+visibleCount+2;n++){
   const t=0.035+(n-1-offset)*step;
   if(t< -0.14||t>0.80)continue;
   const p={x:0.5,y:0.82-t*0.78};
   const button=document.createElement('button');
   const color=n===1?'gold':(['purple','blue','teal'][(n-2)%3]);
   button.className='moving-flask asset-level '+(n<=2?'unlocked':'locked');
   button.style.left=(p.x*100)+'%';
   button.style.top=(p.y*100)+'%';
   button.style.transform='translate(-50%,-50%) scale('+(0.92-0.32*t)+')';
   button.setAttribute('aria-label','Уровень '+n+(n<=2?' доступен':' закрыт'));
   button.innerHTML=
     '<img class="level-complete" src="./assets/levels/level_'+color+'.png" alt="">'+
     '<span class="level-number">'+n+'</span>'+
     (n>2?'<img class="level-lock" src="./assets/levels/lock.png" alt="">':'');
   button.onclick=()=>{if(moved)return;if(n<=2)begin(n);else openDialog('Уровень '+n+' пока закрыт.');};
   layer.appendChild(button);
  }
 };
 viewport.addEventListener('pointerdown',e=>{if(dialog.hidden===false)return;dragging=true;moved=false;velocity=0;cancelAnimationFrame(frame);lastY=e.clientY;viewport.setPointerCapture(e.pointerId);});
 viewport.addEventListener('pointermove',e=>{
  if(!dragging)return;
  const dy=e.clientY-lastY;lastY=e.clientY;
  if(Math.abs(dy)>2)moved=true;
  velocity=dy/Math.max(1,viewport.clientHeight)*4.2;
  offset=Math.max(0,Math.min(995,offset+dy/Math.max(1,viewport.clientHeight)*4.2));
  update();
 });
 const stop=()=>{
  if(!dragging)return;
  dragging=false;
  cancelAnimationFrame(frame);
  let speed=Math.max(-0.22,Math.min(0.22,velocity));
  const glide=()=>{speed*=0.88;if(Math.abs(speed)<0.002)return;offset=Math.max(0,Math.min(995,offset+speed));update();frame=requestAnimationFrame(glide);};
  frame=requestAnimationFrame(glide);
 };
 viewport.addEventListener('pointerup',stop);
 viewport.addEventListener('pointercancel',stop);
 viewport.addEventListener('wheel',e=>{e.preventDefault();offset=Math.max(0,Math.min(995,offset+e.deltaY/120));update();},{passive:false});
 update();
}
let craftingAnimation=false;
async function animateCraft(recipe:Recipe){
 const screen=document.querySelector<HTMLElement>('.level-screen');
 const board=document.querySelector<HTMLElement>('#board');
 if(!screen||!board)return;
 const target=Array.from(board.querySelectorAll<HTMLElement>('[data-element]')).find(el=>el.dataset.element===recipe.name);
 if(!target)return;
 const targetRect=target.getBoundingClientRect();
 const tx=targetRect.left+targetRect.width/2,ty=targetRect.top+targetRect.height/2;
 const layer=document.createElement('div');
 layer.className='craft-animation-layer';
 layer.setAttribute('aria-hidden','true');
 screen.append(layer);
 const motions:Promise<unknown>[]=[];
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const duration=reduced?100:650;
 const sources=recipe.inputs.map(name=>Array.from(screen.querySelectorAll<HTMLElement>('.level-ingredient')).find(el=>el.querySelector('img')?.alt===name)).filter((el):el is HTMLElement=>!!el);
 for(const [i,source] of sources.entries()){
  const rect=source.getBoundingClientRect();
  const sx=rect.left+rect.width/2,sy=rect.top+rect.height/2;
  const spark=document.createElement('span');
  spark.className='craft-flying-spark';
  spark.style.left=sx+'px';spark.style.top=sy+'px';
  layer.append(spark);
  const animation=spark.animate([
   {transform:'translate(-50%,-50%) scale(.5)',opacity:0},
   {transform:'translate(-50%,-50%) scale(1.2)',opacity:1,offset:.18},
   {transform:`translate(calc(-50% + ${tx-sx}px),calc(-50% + ${ty-sy}px)) scale(.35)`,opacity:0}
  ],{duration,delay:i*90,easing:'ease-in-out',fill:'forwards'});
  motions.push(animation.finished.catch(()=>{}));
  source.classList.add('craft-ingredient-active');
 }
 await Promise.all(motions);
 if(!screen.isConnected){layer.remove();return;}
 const flash=document.createElement('span');
 flash.className='craft-target-flash';
 flash.style.left=tx+'px';flash.style.top=ty+'px';
 layer.append(flash);
 target.classList.add('craft-target-active');
 await new Promise<void>(resolve=>setTimeout(resolve,reduced?80:390));
 layer.remove();
 target.classList.remove('craft-target-active');
 sources.forEach(el=>el.classList.remove('craft-ingredient-active'));
}
let selectedRecipe:string='Роса';
function showGame(){
 craftingAnimation=false;
 app.innerHTML=`<div class="level-screen">
  <header class="level-head"><button id="back" aria-label="К уровням">←</button><strong>Уровень ${currentLevel}</strong></header>
  <section id="players" class="level-rivals"></section>
  <section class="level-map-wrap"><div id="board" class="level-board"></div></section>
  <section class="level-controls">
   <div class="level-hint-wrap"><div id="hint" class="level-recipe-hint"></div></div>
   <div class="level-inventory-title">Твои ингредиенты</div>
   <div id="hand" class="level-hand"></div>
   <div class="level-buttons"><button id="make-selected">Создать</button></div>
  </section>
  <div id="level-result" class="level-result" hidden><div class="level-result-card"><h2>Первое зелье готово!</h2><p id="result-text"></p><button id="restart">Новая партия</button><button id="result-back">К уровням</button></div></div>
 </div>`;
 document.querySelector<HTMLButtonElement>('#back')!.onclick=showHome;
 document.querySelector<HTMLButtonElement>('#restart')!.onclick=()=>start(currentLevel);
 document.querySelector<HTMLButtonElement>('#result-back')!.onclick=showHome;
 document.querySelector<HTMLButtonElement>('#make-selected')!.onclick=async()=>{
  const r=RECIPES().find(x=>x.name===selectedRecipe);
  if(craftingAnimation||!r||actions<=0||ended||!can(players[0],r))return;
  craftingAnimation=true;
  const button=document.querySelector<HTMLButtonElement>('#make-selected')!;
  button.disabled=true;
  try{
   await animateCraft(r);
   if(!document.querySelector('.level-screen'))return;
   if(craft(players[0],r)){
    actions--;render();
    const card=document.querySelectorAll<HTMLElement>('.level-rival')[0];
    if(card){
     card.classList.add('rival-taking-turn');
     const label=document.createElement('span');
     label.className='rival-action-label';
     label.textContent='✦ Создано: '+r.name;
     card.append(label);
     await new Promise<void>(resolve=>setTimeout(resolve,1050));
     label.remove();
     card.classList.remove('rival-taking-turn');
    }
    if(!ended&&document.querySelector('.level-screen'))await nextTurn();
   }
  }finally{craftingAnimation=false;}
 };
 drawLevelMap();
}
function render(){
 const me=players[0];if(!me||!document.querySelector('.level-screen'))return;

 document.querySelector('#players')!.innerHTML=players.map((p,i)=>`<div class="level-rival ${i===0?'is-me':''}"><div class="rival-top"><div class="rival-face">${i===0?'🧙‍♀️':i===1?'🦊':'🦉'}</div><b class="rival-flasks"><span>🧪</span><span>${p.flasks}</span></b></div><span class="rival-name">${p.name}</span></div>`).join('');

 document.querySelector('#hand')!.innerHTML=Object.entries(me.hand).filter(([,n])=>n>0).map(([k,n])=>`<div class="level-ingredient"><img src="${elementImage(k)}" alt="${k}"><b>×${n}</b></div>`).join('')||'<span>Ингредиенты закончились</span>';
 const r=RECIPES().find(x=>x.name===selectedRecipe)||RECIPES()[0];
 const missing=r.inputs.filter(k=>count(me,k)<r.inputs.filter(x=>x===k).length);
 document.querySelector('#hint')!.innerHTML=`<b>${r.name}</b><span>${r.inputs.map(k=>(EMOJI[k]||'✦')+' '+k).join(' + ')}</span><small>${claimed[r.name]?'Тайна уже открыта':missing.length?'Не хватает: '+[...new Set(missing)].join(', '):'✓ Можно создать'}</small>`;
 const make=document.querySelector<HTMLButtonElement>('#make-selected')!;
 make.disabled=ended||actions===0||!can(me,r);
 const result=document.querySelector<HTMLElement>('#level-result')!;
 result.hidden=!ended;
 if(ended)document.querySelector('#result-text')!.textContent=players.map(p=>p.name+': '+p.flasks+' 🧪').join(' · ');
 drawLevelMap();
}
function drawLevelMap(){
 const board=document.querySelector<HTMLElement>('#board');
 if(!board)return;
 const names=currentLevel===1?['Вода','Солнце','Роса','Лунная капля']:['Вода','Солнце','Огонь','Роса','Пар','Туман'];
 const positions:Record<string,[number,number]>=currentLevel===1?{'Вода':[28,16],'Солнце':[72,16],'Роса':[50,49],'Лунная капля':[50,83]}:{'Вода':[18,14],'Солнце':[50,14],'Огонь':[82,14],'Роса':[30,48],'Пар':[70,48],'Туман':[50,83]};
 const lines='<svg class="alchemy-connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="alchemy-glow"><feGaussianBlur stdDeviation="1.2"/></filter></defs><path d="M28 16 Q28 31 50 49 M72 16 Q72 31 50 49 M50 49 L50 83" fill="none" stroke="#ffc36c" stroke-width="1.8" filter="url(#alchemy-glow)"/><path d="M28 16 Q28 31 50 49 M72 16 Q72 31 50 49 M50 49 L50 83" fill="none" stroke="#ffe8a5" stroke-width=".65"/></svg>';
 board.innerHTML=lines+names.map(name=>{
  const [x,y]=positions[name];
  const recipe=RECIPES().find(r=>r.name===name);
  const ready=!!recipe&&players.length>0&&actions>0&&!ended&&can(players[0],recipe);
  const chosen=selectedRecipe===name;
  const owned=players.length>0&&count(players[0],name)>0;
  const locked=!!recipe?.reward&&!claimed[name];
  return `<button type="button" class="alchemy-map-card ${owned?'owned':ready?'ready':''} ${chosen?'chosen':''} ${locked?'secret':''}" data-element="${name}" style="left:${x}%;top:${y}%" aria-label="${name}"><img src="${elementImage(name)}" alt="${name}"></button>`;
 }).join('');
 board.querySelectorAll<HTMLButtonElement>('[data-element]').forEach(button=>{
  button.onclick=()=>{const name=button.dataset.element!;if(RECIPES().some(r=>r.name===name)){selectedRecipe=name;render();}};
 });
}
class AtlasScene extends Phaser.Scene{
 constructor(){super('Atlas');}
 preload(){for(const [name,file] of Object.entries(ELEMENT_FILES))this.load.image('element-'+name,'./assets/elements/'+file+'.png');}
 create(){mapScene=this;this.drawMap();}
 drawMap(){
  const w=this.scale.width,h=this.scale.height;
  this.children.removeAll();
  const g=this.add.graphics();
  const positions:Record<string,[number,number]>={
   'Вода':[180,65],'Солнце':[420,65],
   'Роса':[300,202],'Лунная капля':[300,350]
  };
  const scale=Math.min((w-20)/600,(h-20)/405), ox=(w-600*scale)/2,oy=(h-405*scale)/2;
  const pt=(n:string)=>{const p=positions[n];return [ox+p[0]*scale,oy+p[1]*scale] as const;};
  g.lineStyle(1.6,0x9b774b,.8);
  for(const r of RECIPES()){const [x2,y2]=pt(r.name);for(const i of r.inputs){const [x1,y1]=pt(i);g.lineBetween(x1,y1,x2,y2);}}
  for(const [name] of Object.entries(positions)){
   const [x,y]=pt(name),secret=RECIPES().find(r=>r.name===name)?.reward;
   const owner=claimed[name];
   const recipe=RECIPES().find(r=>r.name===name);
   const ready=!!recipe&&players.length>0&&actions>0&&!ended&&can(players[0],recipe);
   const side=Math.max(80,132*scale);
   if(ready){g.fillStyle(0xffd46c,.22);g.fillRoundedRect(x-side/2-5,y-side/2-5,side+10,side+10,17*scale);}
   const key='element-'+name;
   if(this.textures.exists(key)){
    const img=this.add.image(x,y,key).setDisplaySize(side,side*1.25);
    if(ready)img.setTint(0xfff4cd);
    if(secret&&!owner)img.setAlpha(.82);
   }else{
    this.add.text(x,y,EMOJI[name]||'✦',{fontSize:'34px'}).setOrigin(.5);
   }
   const hit=this.add.zone(x,y,side,side*1.25).setInteractive({useHandCursor:true});
   hit.on('pointerdown',()=>{if(recipe){selectedRecipe=name;render();}});

  }
 }
}
showHome();
