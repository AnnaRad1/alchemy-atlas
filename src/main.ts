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
 app.innerHTML='<div class="shell home"><div class="home-header">⚗️ АЛХИМИЧЕСКИЙ АТЛАС <span>🧪 '+saved.flasks+'</span></div><div class="home-title"><div class="crest">✧ ⚗ ✧</div><h1>Путь алхимика</h1><p>Открывайте тайны стихий, поднимаясь к вершинам мастерства</p></div><div class="level-path"><div class="path-line"></div><div class="level locked">🔒<small>Уровень 4</small></div><div class="level locked left">🔒<small>Уровень 3</small></div><div class="level locked">🔒<small>Уровень 2</small></div><button id="level-one" class="level available left">Ⅰ<small>Пробуждение стихий</small><b>ИГРАТЬ</b></button></div><div class="home-bottom"><button id="collection">📖 Коллекция</button><button id="rules">❔ Правила</button></div><div id="home-message" class="home-message"></div></div>';
 document.querySelector<HTMLButtonElement>('#level-one')!.onclick=()=>{showGame();start();};
 document.querySelector<HTMLButtonElement>('#collection')!.onclick=()=>{document.querySelector('#home-message')!.textContent='Открытые вещества: '+(saved.discoveries.join(', ')||'пока нет')+'.';};
 document.querySelector<HTMLButtonElement>('#rules')!.onclick=()=>{document.querySelector('#home-message')!.textContent='Собирайте ингредиенты, создавайте подсвеченные рецепты и первыми открывайте три тайны. Колбочки сохраняются навсегда.';};
}
function showGame(){
 app.innerHTML='<div class="shell game"><div class="game-header"><button id="back">← Уровни</button><span>Глава I · Пробуждение стихий</span></div><h1>⚗️ Алхимический атлас</h1><div id="stats" class="stats"></div><div id="players" class="players"></div><div id="board" class="board"></div><div class="boardnote">Подсвеченные золотом рецепты можно создать прямо сейчас</div><div id="hint" class="hint"></div><h2>Превращения</h2><div id="recipes" class="actions"></div><h2>Мои ингредиенты</h2><div id="hand" class="hand"></div><div class="footer"><button id="next">Завершить ход →</button><button id="restart">Новая партия</button></div><h2>Летопись открытий</h2><div id="log" class="log"></div></div>';
 document.querySelector<HTMLButtonElement>('#back')!.onclick=showHome;
 document.querySelector<HTMLButtonElement>('#next')!.onclick=nextTurn;
 document.querySelector<HTMLButtonElement>('#restart')!.onclick=start;
 if(!game)game=showHome();
