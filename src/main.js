import {SEED, setSeed, seedInit} from './core/rng.js?v=offline-0.31.0';
import {S, setS, newState} from './core/state.js?v=offline-0.31.0';
import {APP_VER} from './config.js?v=offline-0.31.0';
import {POSN} from './data/abilities.js?v=offline-0.31.0';
import {LV,canonicalTeamName,schoolList} from './data/teams.js?v=offline-0.31.0';
import {$, card, modalClose, actToggleSync} from './ui/dom.js?v=offline-0.31.0';
import {THEME_KEY, BIG_KEY, applyTheme, applyMobileUI, applyBigText, updDispSum} from './ui/prefs.js?v=offline-0.31.0';
import {allocFullClose} from './ui/alloc.js?v=offline-0.31.0';
import {TL, resetTL, renderTimeline, tlScrollTo} from './ui/timeline.js?v=offline-0.31.0';
import {startYear} from './flow/phases.js?v=offline-0.31.0';
import {installTrainer} from './trainer.js?v=offline-0.31.0';
import {loadRelationshipDatabase} from './data/relationship/database.js?v=offline-0.31.0';
import {loadInternationalDatabase} from './data/international.js?v=offline-0.31.0';

/* ================= 開場設定 ================= */
/* iOS Safari zoom guards. Pinch: Safari ignores maximum-scale/user-scalable, so the
   WebKit-only gesture events are cancelled (other browsers honor the viewport meta).
   Double-tap: touch-action:manipulation should cover it, but iOS still zooms on fast
   taps in places (observed on device during point allocation), so a tap landing
   within 350ms of the previous one is swallowed and replayed as a synthetic click:
   tapping keeps working at any speed while the zoom gesture never forms. Drags are
   exempt (finger travel over 12px), so scrolling and flicks are unaffected. */
['gesturestart','gesturechange'].forEach(t=>document.addEventListener(t,e=>e.preventDefault()));
(function(){
  let last=0,sx=0,sy=0,drag=false;
  document.addEventListener('touchstart',e=>{ const t=e.touches[0];
    if(e.touches.length===1&&t){ sx=t.clientX; sy=t.clientY; drag=false; } else drag=true;
  },{passive:true});
  document.addEventListener('touchmove',e=>{ const t=e.touches[0];
    if(t&&(Math.abs(t.clientX-sx)>12||Math.abs(t.clientY-sy)>12))drag=true;
  },{passive:true});
  document.addEventListener('touchend',e=>{
    const now=Date.now(), fast=now-last<350; last=now;
    if(!fast||drag||e.changedTouches.length!==1||!e.cancelable)return;
    const t=e.changedTouches[0], el=document.elementFromPoint(t.clientX,t.clientY);
    /* form fields keep native behavior (focus/caret need the default action) */
    if(el&&/^(INPUT|TEXTAREA|SELECT|LABEL)$/.test(el.tagName))return;
    e.preventDefault();
    if(el)el.click();
  },{passive:false});
})();
(function(){ const t=document.getElementById('act-toggle');
  /* actToggleSync owns the button's contents (the shared chevron): writing the label here
     would replace the icon element it just built */
  if(t)t.onclick=()=>{ document.getElementById('act').classList.toggle('collapsed'); actToggleSync(); };
})();
(function(){ /* theme init + timeline click delegation */
  try{ applyMobileUI(localStorage.getItem('yakyu-mobile-ui')==='1'); }catch(e){}
  document.querySelectorAll('#seg-ui button').forEach(b=>b.onclick=()=>applyMobileUI(b.dataset.u==='1'));
  try{ applyBigText(localStorage.getItem(BIG_KEY)==='1'); }catch(e){}
  document.querySelectorAll('#seg-big button').forEach(b=>b.onclick=()=>applyBigText(b.dataset.b==='1'));
  const afc=$('af-close'); if(afc)afc.onclick=allocFullClose;
  /* the layout entry appears and disappears at the breakpoint, so the summary re-syncs on resize */
  window.addEventListener('resize',updDispSum);
  /* Slide the panel open and shut. ::details-content only interpolates with
     interpolate-size, which is Chromium-only, so Firefox and Safari saw it snap; the Web
     Animations API works everywhere. While collapsing, `open` has to stay set until the
     animation ends or the content would vanish on the first frame. Reduced motion is
     checked here because the global *{transition:none} rule cannot match a pseudo-element. */
  (function(){ const det=document.getElementById('fld-display'); if(!det)return;
    const body=document.getElementById('disp-body'), sum=det.querySelector('summary');
    if(!body||!sum)return; let anim=null;
    sum.addEventListener('click',ev=>{
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      ev.preventDefault();
      if(anim){ anim.cancel(); anim=null; }
      const opening=!det.open;
      if(opening)det.open=true;
      const h=body.getBoundingClientRect().height;
      body.style.overflow='hidden';
      anim=body.animate({height:opening?['0px',h+'px']:[h+'px','0px'],
        opacity:opening?[0,1]:[1,0]},{duration:280,easing:'ease'});
      anim.onfinish=()=>{ body.style.overflow=''; anim=null; if(!opening)det.open=false; };
    }); })();
  let t='a'; try{t=localStorage.getItem(THEME_KEY)||'a';}catch(e){}
  document.querySelectorAll('#seg-theme button').forEach(b=>b.onclick=()=>applyTheme(b.dataset.t));
  applyTheme(t);
  ['tl-list','tl-strip'].forEach(id=>{ const el=$(id);
    if(el)el.onclick=ev=>{ const n=ev.target.closest('[data-i]'); if(n)tlScrollTo(TL[+n.dataset.i]); }; });
  const md=$('modal'); if(md)md.onclick=ev=>{ if(ev.target===md)modalClose(); };
  document.addEventListener('keydown',ev=>{ if(ev.key==='Escape'){ modalClose(); allocFullClose(); } });
})();
let selPos='P';
let startStage='HS',startCountry='TW';
const START_AGES={ES:7,MS:13,HS:16,U:19};
function updateBirthYearHint(){
  const input=$('in-birth-year'),hint=$('birth-year-hint');if(!input||!hint)return;
  const y=Math.trunc(Number(input.value));
  hint.textContent=Number.isInteger(y)&&y>=1972
    ?`最低 1972 年；目前設定將從 ${y+START_AGES[startStage]} 年${{ES:'小一',MS:'國一',HS:'高一',U:'大一'}[startStage]}開始。`
    :'請輸入 1972 年或之後的四位數出生年份。';
}
function renderSchools(){
  const el=$('in-school'), custom=$('in-school-custom'); if(!el)return;
  el.innerHTML=schoolList(startStage,startCountry).map(n=>`<option value="${n}">${n}</option>`).join('')+'<option value="__custom">自訂學校…</option>';
  custom.style.display='none';
  $('btn-start').textContent=`開始生涯 ▸ ${{ES:'小一',MS:'國一',HS:'高一',U:'大一'}[startStage]}`;
  updateBirthYearHint();
}
['stage','country'].forEach(kind=>document.querySelectorAll(`#seg-start-${kind} button`).forEach(b=>b.onclick=()=>{
  document.querySelectorAll(`#seg-start-${kind} button`).forEach(x=>x.classList.remove('on')); b.classList.add('on');
  if(kind==='stage')startStage=b.dataset.v; else startCountry=b.dataset.v; renderSchools();
}));
$('in-school').onchange=()=>{$('in-school-custom').style.display=$('in-school').value==='__custom'?'':'none';};
$('in-birth-year').addEventListener('input',updateBirthYearHint);
renderSchools();
const DEFAULT_PLAYERS={P:{name:'有有子',jersey:11},IF:{name:'抹茶多',jersey:13}};
const DEFAULT_PLAYER_PAIRS=[
  DEFAULT_PLAYERS.P,DEFAULT_PLAYERS.IF,{name:'藥帝士',jersey:23},{name:'黃鎖頭',jersey:22}
];
function defaultPlayer(pos){
  if(DEFAULT_PLAYERS[pos])return DEFAULT_PLAYERS[pos];
  return DEFAULT_PLAYER_PAIRS[2+Math.floor(Math.random()*2)];
}
const PLAYER_NAME_KEY='yakyu-player-name';
const PLAYER_JERSEY_KEY='yakyu-player-jersey';
export function attachTeamName(state){
  if(!state)return state;
  if(!Number.isInteger(Number(state.birthYear)))state.birthYear=Math.trunc(Number(state.year)-Number(state.age));
  state.birthYear=Math.max(1972,Math.trunc(Number(state.birthYear)||1972));
  state.twoWay=state.pos==='TW'||!!state.twoWay;
  if(!Number.isFinite(Number(state.twoWayPointsMult)))state.twoWayPointsMult=state.twoWay?1.5:1;
  if(!Number.isFinite(Number(state.twoWayWorkloadMult)))state.twoWayWorkloadMult=.6;
  if(!Number.isFinite(Number(state.twoWayAmateurImpactMult)))state.twoWayAmateurImpactMult=1;
  if(!Number.isFinite(Number(state.twoWayIntlImpactMult)))state.twoWayIntlImpactMult=1;
  if(!Number.isFinite(Number(state.twoWayProImpactMult)))state.twoWayProImpactMult=1;
  if(!Number.isFinite(Number(state.medicalNormalReductionPct)))state.medicalNormalReductionPct=0;
  if(!Number.isFinite(Number(state.medicalProReductionPct)))state.medicalProReductionPct=30;
  if(!Number.isFinite(Number(state.medicalFullReductionPct)))state.medicalFullReductionPct=60;
  if(!Number.isFinite(Number(state.medicalTwoWayReductionPct)))state.medicalTwoWayReductionPct=80;
  if(!['auto','custom'].includes(state.injuryRateMode))state.injuryRateMode='auto';
  state.injuryRateCustom=Math.max(0,Math.min(95,Number(state.injuryRateCustom)||0));
  state.tjLockZero=!!state.tjLockZero;
  if(state.tjLockZero)state.tj=0;
  if(state.effort==='普通')state.effort='普通投';
  if(!['養生球','普通投','全力投'].includes(state.effort))state.effort='普通投';
  if(!Number.isFinite(Number(state.seasonFactor)))state.seasonFactor=1;
  if(!Number.isFinite(Number(state.pitcherAwardMult)))state.pitcherAwardMult=1;
  if(!Number.isFinite(Number(state.mvpAwardMult)))state.mvpAwardMult=1;
  if(!Number.isFinite(Number(state.intlTryoutMult)))state.intlTryoutMult=1;
  if(!Number.isFinite(Number(state.potentialCostMult)))state.potentialCostMult=.1;
  if(!Number.isFinite(Number(state.potentialPivotAge)))state.potentialPivotAge=30;
  if(!Number.isFinite(Number(state.potentialYearMin)))state.potentialYearMin=0;
  if(!Number.isFinite(Number(state.potentialYearMax)))state.potentialYearMax=2;
  if(!Number.isFinite(Number(state.annualStatFontSize)))state.annualStatFontSize=13;
  if(!Number.isFinite(Number(state.declineStartAge)))state.declineStartAge=32;
  if(!Number.isFinite(Number(state.declineStartValue)))state.declineStartValue=2;
  if(!Number.isFinite(Number(state.declineStepMult)))state.declineStepMult=.5;
  if(!Number.isFinite(Number(state.bulkAbilityValue)))state.bulkAbilityValue=60;
  if(!Number.isFinite(Number(state.bulkPotentialValue)))state.bulkPotentialValue=60;
  const varianceKeys=['seasonBatAvgVarPct','seasonBatHrRateVarPct','seasonBatGamesVarPct','seasonBatSbVarPct',
    'seasonPitchEraVarPct','seasonPitchStarterIpgVarPct','seasonPitchReliefIpgVarPct','seasonPitchK9VarPct','seasonPitchBb9VarPct','seasonPitchH9VarPct','seasonPitchWinProbVarPct',
    'intlBatAvgVarPct','intlBatHrRateVarPct','intlPitchEraVarPct','intlPitchStarterIpgVarPct','intlPitchReliefIpgVarPct','intlPitchK9VarPct','intlPitchWinProbVarPct'];
  varianceKeys.forEach(k=>{if(!Number.isFinite(Number(state[k])))state[k]=0;});
  if(!Number.isFinite(Number(state.intlChampionMult)))state.intlChampionMult=1;
  if(!Number.isFinite(Number(state.wbcChampionMult)))state.wbcChampionMult=1;
  if(!Number.isFinite(Number(state.amateurTournamentMult)))state.amateurTournamentMult=1;
  if(!Number.isFinite(Number(state.startPotentialMult)))state.startPotentialMult=1;
  state.potentialCostMult=Math.max(0,Math.min(10,Number(state.potentialCostMult)));
  state.potentialPivotAge=Math.max(1,Math.min(99,Math.round(Number(state.potentialPivotAge))));
  state.potentialYearMin=Math.max(0,Math.min(150,Math.round(Number(state.potentialYearMin))));
  state.potentialYearMax=Math.max(state.potentialYearMin,Math.min(150,Math.round(Number(state.potentialYearMax))));
  state.annualStatFontSize=Math.max(9,Math.min(15,Math.round(Number(state.annualStatFontSize)*2)/2));
  state.declineStartAge=Math.max(1,Math.min(99,Math.round(Number(state.declineStartAge))));
  state.declineStartValue=Math.max(0,Math.min(150,Number(state.declineStartValue)));
  state.declineStepMult=Math.max(0,Math.min(100,Number(state.declineStepMult)));
  state.bulkAbilityValue=Math.max(1,Math.min(150,Math.round(Number(state.bulkAbilityValue))));
  state.bulkPotentialValue=Math.max(1,Math.min(150,Math.round(Number(state.bulkPotentialValue))));
  state.healthCareMult=1;state.healthCarePlan='normal';
  state.pitcherAwardMult=Math.max(0,Math.min(100,Number(state.pitcherAwardMult)));
  state.mvpAwardMult=Math.max(0,Math.min(100,Number(state.mvpAwardMult)));
  state.intlTryoutMult=Math.max(0,Math.min(100,Number(state.intlTryoutMult)));
  varianceKeys.forEach(k=>state[k]=Math.max(0,Math.min(100,Number(state[k]))));
  state.intlChampionMult=Math.max(0,Math.min(100,Number(state.intlChampionMult)));
  state.wbcChampionMult=Math.max(0,Math.min(100,Number(state.wbcChampionMult)));
  state.amateurTournamentMult=Math.max(0,Math.min(100,Number(state.amateurTournamentMult)));
  state.startPotentialMult=Math.max(.1,Math.min(3,Number(state.startPotentialMult)));
  state.universityGraduated=!!state.universityGraduated;
  if(!Number.isFinite(Number(state.pendingAbilityPenalty)))state.pendingAbilityPenalty=0;
  if(!Number.isFinite(Number(state.bigInj)))state.bigInj=0;
  if(!Number.isFinite(Number(state.tjCrises)))state.tjCrises=0;
  if(!state.schoolCountry)state.schoolCountry='TW';
  if(!Number.isFinite(state.schoolTier))state.schoolTier=state.hsTier||2;
  if(!state.love)state.love={st:'single',partner:null,kids:0,contacts:[],primaryId:null,aff:0,loveSaveUsed:false,marriageSaveUsed:false,pregnancy:null,interactedThisYear:{},yearInteractions:0};
  if(!Array.isArray(state.love.contacts))state.love.contacts=[];
  if(!Array.isArray(state.love.exes))state.love.exes=[];
  if(!state.love.interactedThisYear||typeof state.love.interactedThisYear!=='object')state.love.interactedThisYear={};
  state.love.loveSaveUsed=!!state.love.loveSaveUsed;
  state.love.marriageSaveUsed=!!state.love.marriageSaveUsed;
  if(state.love.pregnancy===undefined)state.love.pregnancy=null;
  if(!Array.isArray(state.love.childList))state.love.childList=[];
  if(!Number.isFinite(Number(state.love.aff)))state.love.aff=0;
  ['orgTeam','lastCpblTeam','franchiseTeamName','champTeam','mrTeamName'].forEach(k=>{if(state[k])state[k]=canonicalTeamName(state[k]);});
  if(Array.isArray(state.log))state.log.forEach(r=>{if(r&&r.tm)r.tm=canonicalTeamName(r.tm);});
  if(state.teamTally&&typeof state.teamTally==='object'){
    Object.keys(state.teamTally).forEach(bucket=>{
      const tally=state.teamTally[bucket]; if(!tally||typeof tally!=='object')return;
      const next={}; Object.entries(tally).forEach(([k,v])=>{const nk=canonicalTeamName(k);next[nk]=(next[nk]||0)+Number(v||0);}); state.teamTally[bucket]=next;
    });
  }
  state.teamName=function(){
    if(!this.orgTeam)return '';
    if(this.lv==='MLB')return this.orgTeam;
    const info=LV[this.lv];
    if(info&&info.org==='MiLB')return this.orgTeam+({R:'新人聯盟',A1:'1A',A2:'2A',A3:'3A'}[this.lv]||'');
    if(this.lv==='CPBL1'||this.lv==='NPB1')return this.orgTeam;
    return this.orgTeam+'二軍';
  };
  return state;
}
/* 第一次進入保持空白；玩家開始過生涯後，重新整理或重新開始時帶回上次輸入。 */
try{
  $('in-name').value=(localStorage.getItem(PLAYER_NAME_KEY)||'').slice(0,10);
  $('in-number').value=(localStorage.getItem(PLAYER_JERSEY_KEY)||'').slice(0,2);
}catch(e){}
$('seed-show').value=SEED;
$('seed-re').onclick=e=>{e.preventDefault();setSeed(Math.random().toString(36).slice(2,10));$('seed-show').value=SEED;};
document.querySelectorAll('#seg-pos button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#seg-pos button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on'); selPos=b.dataset.v;
});
$('btn-start').onclick=async()=>{
  const sv=$('seed-show').value.trim(); if(sv)setSeed(sv); /* 玩家可直接輸入流水碼 */
  history.replaceState(null,'','?seed='+encodeURIComponent(SEED));
  seedInit(SEED);
  const enteredName=$('in-name').value.trim();
  const rawNo=$('in-number').value.trim();
  const birthYear=Math.trunc(Number($('in-birth-year').value));
  const startPotentialMult=Number($('in-potential-mult').value);
  if(!/^\d{4}$/.test($('in-birth-year').value.trim())||birthYear<1972){
    $('in-birth-year').setCustomValidity('出生年份請輸入 1972 年或之後的四位數年份。');
    $('in-birth-year').reportValidity();return;
  }
  $('in-birth-year').setCustomValidity('');
  if(!Number.isFinite(startPotentialMult)||startPotentialMult<.1||startPotentialMult>3){
    $('in-potential-mult').setCustomValidity('起始潛力倍率請輸入 0.10～3.00。');
    $('in-potential-mult').reportValidity();return;
  }
  $('in-potential-mult').setCustomValidity('');
  const useDefault=!enteredName&&!rawNo;
  let nm=enteredName,jersey=Number(rawNo);
  if(useDefault){
    const def=defaultPlayer(selPos);
    nm=def.name; jersey=def.jersey;
  }else{
    /* 只填其中一欄仍視為資料不完整，避免自訂姓名配到系統背號或反過來。 */
    if(!nm){
      $('in-name').setCustomValidity('請輸入球員姓名，或將姓名與背號都留空使用預設球員。');
      $('in-name').reportValidity(); return;
    }
    $('in-name').setCustomValidity('');
    if(rawNo===''||!Number.isInteger(jersey)||jersey<0||jersey>99){
      $('in-number').setCustomValidity('背號請輸入 0～99 的整數，或將姓名與背號都留空使用預設球員。');
      $('in-number').reportValidity(); return;
    }
  }
  $('in-name').setCustomValidity('');
  $('in-number').setCustomValidity('');
  if(!useDefault){
    try{
      localStorage.setItem(PLAYER_NAME_KEY,nm);
      localStorage.setItem(PLAYER_JERSEY_KEY,String(jersey));
    }catch(e){}
  }
  let school=$('in-school').value;
  if(school==='__custom'){
    school=$('in-school-custom').value.trim();
    if(!school){$('in-school-custom').setCustomValidity('請輸入自訂校名。');$('in-school-custom').reportValidity();return;}
  }
  const [dbLoad,intlDbLoad]=await Promise.all([loadRelationshipDatabase(),loadInternationalDatabase()]);
  setS(attachTeamName(newState(nm,jersey,selPos,null,{stage:startStage,country:startCountry,school,birthYear,startPotentialMult})));
  $('start').style.display='none';
  $('board').style.display=''; $('act').style.display='';
  resetTL(); renderTimeline();
  const ts=$('tl-seed'); if(ts)ts.textContent=SEED;
  card('info','球員誕生',`${S.name} 出生於 <b class="hl">${S.birthYear}</b> 年。${S.year} 年春天，${POSN[S.pos]} <b class="hl">${S.name}</b> 加入 <b class="hl">${S.team}</b> 棒球隊，從${S.schoolCountry==='JP'?'日本':''}${{ES:'小學',MS:'國中',HS:'高中',U:'大學'}[S.stage]}展開棒球人生。起始潛力倍率為 <b class="hl">${S.startPotentialMult.toFixed(2)}</b>。<br><span style="color:var(--dim);font-size:12px">提示：22 歲前累積擲出 5 次「6」可覺醒隱藏素質。</span>`);
  if(!dbLoad.ok)card('bad','感情資料庫使用備援版本',`無法讀取 relationship-db.json：${dbLoad.error}。遊戲已使用內建資料繼續執行，不會卡住。`);
  if(!intlDbLoad.ok)card('bad','國際賽資料庫使用備援版本',`無法讀取 international-db.json：${intlDbLoad.error}。遊戲已使用內建賽程與門檻繼續執行，不會卡住。`);
  startYear();
};
installTrainer({attachTeamName});
/* ================= PWA installability: manifest built at runtime as a Blob; icons are
   assets/ files (the logo system ships file assets, so the single-file constraint is gone) ================= */
(function(){
  if(!/^https?:$/.test(location.protocol))return; /* keep file:// double-click usage untouched */
  try{
    const dir=location.origin+location.pathname.replace(/[^/]*$/,'');
    const mf={id:dir,name:document.title||'YaKyoLife - 棒球人生模擬器',short_name:'YaKyoLife',
      description:'從高中三大賽到名人堂，一場種子化的台灣棒球員生涯模擬。',
      lang:'zh-Hant',start_url:dir,scope:dir,display:'standalone',
      background_color:'#081510',theme_color:'#081510',
      icons:[{src:dir+'assets/app-icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
        {src:dir+'assets/app-icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
        {src:dir+'assets/app-icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]};
    const l=document.createElement('link'); l.rel='manifest';
    l.href=URL.createObjectURL(new Blob([JSON.stringify(mf)],{type:'application/manifest+json'}));
    document.head.appendChild(l);
  }catch(e){}
})();
(function(){ const vb=document.getElementById('ver-badge'); if(vb)vb.textContent=APP_VER;
  const tv=document.getElementById('tl-ver'); if(tv)tv.textContent=APP_VER;
  const lv=document.getElementById('lm-ver'); if(lv)lv.textContent=APP_VER; })();
/* touch has no hover: tap the salary cell to reveal the full amount, tap again to close.
   Never dismisses on a timer — the user decides when it goes away. */
(function(){ const cell=document.getElementById('bd-sal-cell'); if(!cell)return;
  cell.addEventListener('click',()=>cell.classList.toggle('show'));
  /* on pointer devices :hover already governs the tip; make sure a stray click cannot
     leave it pinned open after the cursor has left the cell */
  if(window.matchMedia('(hover:hover)').matches)
    cell.addEventListener('mouseleave',()=>cell.classList.remove('show')); })();
