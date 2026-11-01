import Phaser from 'phaser';
import './style.css';

type Ingredient = 'Вода'|'Солнце'|'Трава'|'Огонь'|'Воздух'|'Земля'|'Роса'|'Пар'|'Росток'|'Искра'|'Туман'|'Жизнь';
type Secret = 'Лунная капля'|'Живой кристалл'|'Золотой эликсир';
type Recipe = {name:Ingredient|Secret; inputs:Ingredient[]; reward?:number};
type Player = {name:string; hand:Record<string,number>; flasks:number; bot:boolean};
type Save = {flasks:number; discoveries:string[]};
const BASE:Ingredient[]=['Вода','Солнце','Трава','Огонь','Воздух','Земля'];
const RECIPES:Recipe[]=[
{name:'Роса',inputs:['Вода','Солнце']},{name:'Пар',inputs:['Вода','Огонь']},
{name:'Росток',inputs:['Земля','Вода']},{name:'Искра',inputs:['Огонь','Воздух']},
{name:'Туман',inputs:['Пар','Воздух']},{name:'Жизнь',inputs:['Росток','Солнце']},
{name:'Лунная капля',inputs:['Роса','Туман'],reward:1},
{name:'Живой кристалл',inputs:['Жизнь','Искра'],reward:2},
{name:'Золотой эликсир',inputs:['Роса','Жизнь','Искра'],reward:3}
];
const EMOJI:Record<string,string>={'Вода':'💧','Солнце':'☀️','Трава':'🌿','Огонь':'🔥','Воздух':'🌬️','Земля':'🪨','Роса':'💠','Пар':'♨️','Росток':'🌱','Искра':'✨','Туман':'🌫️','Жизнь':'🍃'};
const SAVE_KEY='alchemy-atlas-v1';
function load():Save {try {const data=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');return {flasks:Math.max(0,Number(data?.flasks)||0),discoveries:Array.isArray(data?.discoveries)?data.discoveries:[]};}catch{return {flasks:0,discoveries:[]};}}
let saved=load();
let players:Player[]=[];
let claimed:Record<string,string>={};
let turn=1;
let actions=2;
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
  if(!p.bot){saved.flasks+=r.reward;localStorage.setItem(SAVE_KEY,JSON.stringify(saved));}
 }else{
  add(p,r.name);
  if(!p.bot&&!saved.discoveries.includes(r.name)){saved.discoveries.push(r.name);localStorage.setItem(SAVE_KEY,JSON.stringify(saved));}
  note(`${p.name}: ${r.inputs.join(' + ')} → ${r.name}`);
 }
 if(Object.keys(claimed).length===3){ended=true;note('Все три тайны раскрыты! Партия завершена.');}
 return true;
}
function start(){
 players=[{name:'Вы',hand:{},flasks:0,bot:false},{name:'Алхимик Лис',hand:{},flasks:0,bot:true},{name:'Мастер Сова',hand:{},flasks:0,bot:true}];
 claimed={};turn=1;actions=2;ended=false;messages=[];
 players.forEach(p=>draw(p,4));
 note('Новая партия. Создавайте вещества и опередите соперников!');
 render();
}
function targets():Recipe[]{return RECIPES.filter(r=>r.reward&&!claimed[r.name]);}
function ingredientCost(p:Player,name:string,seen=new Set<string>()):number{
 if(count(p,name)>0)return 0;
 if(seen.has(name))return 99;
 if(BASE.includes(name as Ingredient))return 3;
 const r=RECIPES.find(x=>x.name===name);
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
 const direct=RECIPES.find(r=>r.name===goal.name&&can(p,r));if(direct)return direct;
 function needed(name:string,seen=new Set<string>()):Recipe|undefined{
  if(count(p,name)>0||seen.has(name))return;
  const r=RECIPES.find(x=>x.name===name);
  if(!r)return;
  if(can(p,r))return r;
  const next=new Set(seen);next.add(name);
  for(const k of r.inputs){const sub=needed(k,next);if(sub)return sub;}
 }
 for(const k of goal.inputs){const r=needed(k);if(r)return r;}
 return RECIPES.find(r=>can(p,r)&&!r.reward);
}
function nextTurn(){
 if(ended)return;
 for(const bot of players.slice(1)){
  draw(bot,2);
  for(let i=0;i<2&&!ended;i++){const recipe=chooseBotRecipe(bot);if(recipe)craft(bot,recipe);}
 }
 if(!ended){turn++;actions=2;draw(players[0],2);note(`Ход ${turn}: вы получили два новых элемента.`);}
 render();
}
const app=document.querySelector<HTMLDivElement>('#app')!;
let game:Phaser.Game|null=null;
function showHome(){
 app.innerHTML=`<div class="art-screen"><div class="art-stage">
 <img class="art-image" src="./assets/home-art.webp" alt="Волшебная лесная дорога">
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
 const begin=()=>{showGame();start();};
 document.querySelector<HTMLButtonElement>('#play-first')!.onclick=begin;
 const dialog=document.querySelector<HTMLElement>('#home-message')!;
 const openDialog=(message:string)=>{document.querySelector('#dialog-content')!.textContent=message;dialog.hidden=false;};
 document.querySelector<HTMLButtonElement>('#close-dialog')!.onclick=()=>{dialog.hidden=true;};
 document.querySelector<HTMLButtonElement>('#collection')!.onclick=()=>openDialog('Открытые вещества: '+(saved.discoveries.join(', ')||'пока нет')+'.');
 document.querySelector<HTMLButtonElement>('#rules')!.onclick=()=>openDialog('Создавайте вещества по рецептам и первыми раскрывайте три тайны.');
 document.querySelector<HTMLButtonElement>('#chests')!.onclick=()=>openDialog('Сундуки появятся в следующих обновлениях.');

 // The background is stationary. Level nodes move continuously along a fixed
 // normalized curve; changing scroll shifts them one by one, never in batches.
 const path:[[number,number],...Array<[number,number]>]=[
  [0.48,0.91],[0.46,0.79],[0.48,0.67],[0.53,0.55],
  [0.61,0.43],[0.66,0.31],[0.65,0.19],[0.60,0.07]
 ];
 const point=(t:number)=>{
  const v=Math.max(0,Math.min(path.length-1,t*(path.length-1)));
  const i=Math.min(path.length-2,Math.floor(v)),f=v-i;
  const smooth=f*f*(3-2*f);
  return {x:path[i][0]+(path[i+1][0]-path[i][0])*smooth,
          y:path[i][1]+(path[i+1][1]-path[i][1])*smooth};
 };
 const layer=document.querySelector<HTMLElement>('#moving-levels')!;
 const viewport=document.querySelector<HTMLElement>('#level-viewport')!;
 const range=document.querySelector<HTMLElement>('#level-range')!;
 let offset=0,dragging=false,lastY=0,moved=false;
 const visibleCount=4,step=0.225;
 const update=()=>{
  const start=Math.max(1,Math.floor(offset)+1);
  range.textContent='Уровни '+start+'–'+(start+visibleCount);
  layer.replaceChildren();
  for(let n=Math.max(1,Math.floor(offset)-1);n<=Math.ceil(offset)+visibleCount+2;n++){
   const t=0.08+(n-1-offset)*step;
   if(t<0.02||t>0.98)continue;
   const p=point(t);
   const button=document.createElement('button');
   button.className='moving-flask '+(n===1?'unlocked':'locked');
   button.style.left=(p.x*100)+'%';
   button.style.top=(p.y*100)+'%';
   button.style.transform='translate(-50%,-50%) scale('+(0.77+0.23*t)+')';
   button.setAttribute('aria-label','Уровень '+n+(n===1?' доступен':' закрыт'));
   button.innerHTML='<span class="flask-glyph">'+(n===1?'⚗️':'🔒')+'</span><span class="flask-number">'+n+'</span>';
   button.onclick=()=>{if(moved)return;if(n===1)begin();else openDialog('Уровень '+n+' пока закрыт. Сейчас доступен первый уровень.');};
   layer.appendChild(button);
  }
 };
 viewport.addEventListener('pointerdown',e=>{if(dialog.hidden===false)return;dragging=true;moved=false;lastY=e.clientY;viewport.setPointerCapture(e.pointerId);});
 viewport.addEventListener('pointermove',e=>{
  if(!dragging)return;
  const dy=e.clientY-lastY;lastY=e.clientY;
  if(Math.abs(dy)>0.5)moved=true;
  offset=Math.max(0,Math.min(995,offset+dy/Math.max(1,viewport.clientHeight)*4.2));
  update();
 });
 const stop=()=>{dragging=false;};
 viewport.addEventListener('pointerup',stop);
 viewport.addEventListener('pointercancel',stop);
 viewport.addEventListener('wheel',e=>{e.preventDefault();offset=Math.max(0,Math.min(995,offset+e.deltaY/120));update();},{passive:false});
 update();
}
function showGame(){
 app.innerHTML='<div class="shell game"><div class="game-header"><button id="back">← Уровни</button><span>Глава I · Пробуждение стихий</span></div><h1>⚗️ Алхимический атлас</h1><div id="stats" class="stats"></div><div id="players" class="players"></div><div id="board" class="board"></div><div class="boardnote">Подсвеченные золотом рецепты можно создать прямо сейчас</div><div id="hint" class="hint"></div><h2>Превращения</h2><div id="recipes" class="actions"></div><h2>Мои ингредиенты</h2><div id="hand" class="hand"></div><div class="footer"><button id="next">Завершить ход →</button><button id="restart">Новая партия</button></div><h2>Летопись открытий</h2><div id="log" class="log"></div></div>';
 document.querySelector<HTMLButtonElement>('#back')!.onclick=showHome;
 document.querySelector<HTMLButtonElement>('#next')!.onclick=nextTurn;
 document.querySelector<HTMLButtonElement>('#restart')!.onclick=start;
 if(!game)game=new Phaser.Game({type:Phaser.AUTO,parent:'board',width:640,height:430,backgroundColor:'#ead8b5',scene:[AtlasScene],scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}});
 else {document.querySelector('#board')!.appendChild(game.canvas);game.scale.refresh();mapScene?.drawMap();}
}
function render(){
 const me=players[0];if(!me)return;
 document.querySelector('#stats')!.innerHTML=`<span class="pill">🧪 Всего накоплено: <b>${saved.flasks}</b></span><span class="pill">Ход: ${turn}</span><span class="pill">Превращений: ${actions}</span><span class="pill">Коллекция: ${saved.discoveries.length}/6</span>`;
 document.querySelector('#players')!.innerHTML=players.map(p=>`<span class="pill">${p.name}: ${p.flasks} 🧪</span>`).join('');
 document.querySelector('#hint')!.textContent=ended?'Партия завершена. Нажмите «Новая партия», чтобы заработать ещё колбочки.': 'Собирайте ингредиенты, создавайте промежуточные вещества и первыми открывайте тайны. Все рецепты показаны на карте.';
 const recipeEl=document.querySelector('#recipes')!;recipeEl.innerHTML='';
 RECIPES.forEach(r=>{
  const btn=document.createElement('button');btn.className='element '+(r.reward?'secret ':'')+(can(me,r)&&actions>0?'ready':'');
  btn.textContent=`${r.reward?'❓ ':EMOJI[r.name]||'⚗️ '}${r.name} ${r.reward?'('+r.reward+' 🧪)':''}`;
  btn.title=r.inputs.join(' + ')+' → '+r.name;
  btn.disabled=ended||actions===0||!!claimed[r.name]||!can(me,r);
  btn.onclick=()=>{if(craft(me,r)){actions--;render();}};
  recipeEl.appendChild(btn);
 });
 document.querySelector('#hand')!.innerHTML=Object.entries(me.hand).filter(([,n])=>n>0).map(([k,n])=>'<span class="ingredient-tile"><span class="ingredient-icon">'+(EMOJI[k]||'⚗️')+'</span><span>'+k+'</span><b>×'+n+'</b></span>').join('')||'Нет ингредиентов';
 document.querySelector<HTMLButtonElement>('#next')!.disabled=ended;
 document.querySelector('#log')!.innerHTML=messages.map(m=>`<div>• ${m}</div>`).join('');
 mapScene?.drawMap();
}
class AtlasScene extends Phaser.Scene{
 constructor(){super('Atlas');}
 create(){mapScene=this;this.drawMap();}
 drawMap(){
  const w=this.scale.width,h=this.scale.height;
  this.children.removeAll();
  const g=this.add.graphics();
  const positions:Record<string,[number,number]>={
   'Вода':[45,50],'Солнце':[145,50],'Трава':[245,50],'Огонь':[345,50],'Воздух':[445,50],'Земля':[545,50],
   'Роса':[95,155],'Пар':[215,155],'Росток':[335,155],'Искра':[455,155],
   'Туман':[215,260],'Жизнь':[395,260],
   'Лунная капля':[110,355],'Живой кристалл':[325,355],'Золотой эликсир':[535,355]
  };
  const scale=Math.min((w-20)/600,(h-20)/405), ox=(w-600*scale)/2,oy=(h-405*scale)/2;
  const pt=(n:string)=>{const p=positions[n];return [ox+p[0]*scale,oy+p[1]*scale] as const;};
  g.lineStyle(1.6,0x9b774b,.8);
  for(const r of RECIPES){const [x2,y2]=pt(r.name);for(const i of r.inputs){const [x1,y1]=pt(i);g.lineBetween(x1,y1,x2,y2);}}
  for(const [name] of Object.entries(positions)){
   const [x,y]=pt(name),secret=RECIPES.find(r=>r.name===name)?.reward;
   const owner=claimed[name];
   const recipe=RECIPES.find(r=>r.name===name);
   const ready=!!recipe&&players.length>0&&actions>0&&!ended&&can(players[0],recipe);
   const side=Math.max(23,43*scale),radius=Math.max(5,8*scale);
   if(ready){g.fillStyle(0xf5c950,.5);g.fillRoundedRect(x-side/2-5,y-side/2-5,side+10,side+10,radius+3);}
   g.fillStyle(owner?0xb5c49b:ready?0xffdf88:secret?0xb38a4c:0xf7e7c5,1);g.lineStyle(ready?3:2,ready?0xd89b22:0x75512c,1);
   g.fillRoundedRect(x-side/2,y-side/2,side,side,radius);g.strokeRoundedRect(x-side/2,y-side/2,side,side,radius);
   this.add.text(x,y-2,secret?(owner?'✓':'?'):(EMOJI[name]||'✦'),{fontSize:`${Math.max(14,21*scale)}px`,color:'#4c311d'}).setOrigin(.5);
   this.add.text(x,y+Math.max(16,24*scale),name,{fontSize:`${Math.max(9,12*scale)}px`,color:'#533b25',backgroundColor:'#ead8b5'}).setOrigin(.5);
  }
 }
}
showHome();
