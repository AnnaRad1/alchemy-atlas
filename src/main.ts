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
app.innerHTML=`<div class="shell"><h1>⚗️ Алхимический атлас</h1><div class="subtitle">Глава I · Пробуждение стихий</div><div id="stats" class="stats"></div><div id="players" class="players"></div><div id="board" class="board"></div><div class="boardnote">Нажимайте на доступные рецепты под картой</div><div id="hint" class="hint"></div><div id="recipes" class="actions"></div><h2>Мои ингредиенты</h2><div id="hand" class="hand"></div><div class="footer"><button id="next">Завершить ход →</button><button id="restart">Новая партия</button></div><h2>Летопись открытий</h2><div id="log" class="log"></div></div>`;
document.querySelector<HTMLButtonElement>('#next')!.onclick=nextTurn;
document.querySelector<HTMLButtonElement>('#restart')!.onclick=start;
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
 document.querySelector('#hand')!.innerHTML=Object.entries(me.hand).filter(([,n])=>n>0).map(([k,n])=>`<span class="pill">${EMOJI[k]||'⚗️'} ${k} ×${n}</span>`).join('')||'Нет ингредиентов';
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
   g.fillStyle(owner?0xb5c49b:secret?0xb38a4c:0xf7e7c5,1);g.lineStyle(2,0x75512c,1);
   g.fillCircle(x,y,Math.max(12,20*scale));g.strokeCircle(x,y,Math.max(12,20*scale));
   this.add.text(x,y-2,secret?(owner?'✓':'?'):(EMOJI[name]||'✦'),{fontSize:`${Math.max(14,21*scale)}px`,color:'#4c311d'}).setOrigin(.5);
   this.add.text(x,y+Math.max(16,24*scale),name,{fontSize:`${Math.max(9,12*scale)}px`,color:'#533b25',backgroundColor:'#ead8b5'}).setOrigin(.5);
  }
 }
}
new Phaser.Game({type:Phaser.AUTO,parent:'board',width:640,height:430,backgroundColor:'#ead8b5',scene:[AtlasScene],scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}});
start();
