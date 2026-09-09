import {$, actClear, actToggleSync, board, scrollBottom} from './dom.js?v=offline-0.30.0';
import {S} from '../core/state.js?v=offline-0.30.0';
import {ABL, POS_AB, ABILITY_MAX, POTENTIAL_MAX} from '../data/abilities.js?v=offline-0.30.0';
import {abCost, normalizeAbCarry, addAb} from '../engine/ability.js?v=offline-0.30.0';
import {allocDone} from '../flow/events.js?v=offline-0.30.0';
import {isMobileLayout} from './prefs.js?v=offline-0.30.0';
import {recordFlowAction,replayFlowActions} from '../core/session.js?v=offline-0.30.0';

export function allocFullOpen(){ const f=$('alloc-full'); if(f)f.classList.add('show'); }
export function allocFullClose(){ const f=$('alloc-full'); if(f)f.classList.remove('show'); }
/* The live allocation, so its nodes can be re-homed when a setting changes mid-way.
   render() only ever writes into these same three nodes, which is what makes moving
   them between the panel and the overlay safe. */
export let ALLOC=null;
export function setAlloc(v){ ALLOC=v; }
export function clearAlloc(){ ALLOC=null; }
export function refreshAlloc(){ if(ALLOC)ALLOC.render(); }
export function allocPlace(){
  if(!ALLOC)return;
  const a=$('act'), full=document.body.classList.contains('big-text')&&isMobileLayout();
  const s=$('act-side'); if(s)s.classList.toggle('alloc',!full);
  if(full){
    /* move the nodes out of #act before rewriting it, or the rewrite would destroy them */
    const fb=$('af-body');
    fb.appendChild(ALLOC.top); fb.appendChild(ALLOC.rows); fb.appendChild(ALLOC.btm);
    const ft=$('af-title'); if(ft)ft.textContent=ALLOC.label;
    a.innerHTML=`<div class="title">${ALLOC.label}</div><div class="pool" id="al-cue"></div>`;
    /* both entry points already sit behind an explicit 分配 button, so the overlay opens
       straight away; this one is only the way back after the player dismisses it */
    const ob=document.createElement('button'); ob.className='btn main'; ob.id='al-open';
    ob.style.textAlign='center'; ob.textContent='繼續分配 ▸'; ob.onclick=allocFullOpen;
    a.appendChild(ob);
    allocFullOpen();
  }else{
    const frag=document.createDocumentFragment();
    frag.appendChild(ALLOC.top); frag.appendChild(ALLOC.rows); frag.appendChild(ALLOC.btm);
    a.innerHTML=`<div class="title">${ALLOC.label}</div>`;
    a.appendChild(frag);
    allocFullClose();
  }
  ALLOC.render();
  /* the sticky panel just grew (or moved between panel and overlay), which adds the same
     amount to scrollHeight; without this the log's tail is left hidden behind the panel —
     every other event path re-pins the bottom (card()/choose()), this one must too */
  scrollBottom();
}
/* 加點介面：mode {dice:[..]} 或 {pool:n} */
export function allocUI(mode,label,done){
  actClear();
  const a=$('act'); const keys=POS_AB[S.pos];
  let dice=mode.dice?mode.dice.slice():null, pool=mode.pool||0, idx=0, hist=[];
  a.innerHTML=`<div class="title">${label}</div><div id="al-top"></div><div id="al-rows"></div><div class="row2" id="al-btm"></div>`;
  const touchedKeys={};
  const top=$('al-top'),rows=$('al-rows'),btm=$('al-btm');
  /* allocPlace() below decides panel vs overlay from the current settings, and can be
     called again by applyMobileUI / applyBigText if the player changes them mid-allocation */
  setAlloc({top,rows,btm,label,render});
  function remaining(){ return dice?dice.length-idx:pool; }
  function addOne(k,save=true){
    if(!keys.includes(k)||S.ab[k]>=ABILITY_MAX||remaining()<=0)return;
    const amt=dice?dice[idx]:1,pc=(S.carry&&S.carry[k])||0;
    const got=addAb(k,amt);touchedKeys[k]=(touchedKeys[k]||0)+amt;hist.push([k,got,pc]);if(dice)idx++;else pool--;
    if(save)recordFlowAction({type:'allocation',op:'add',key:k});
    render();board(0);
  }
  function undoOne(save=true){
    if(!hist.length)return;const [k,got,pc]=hist.pop();S.ab[k]-=got;if(S.carry)S.carry[k]=pc;if(dice)idx--;else pool++;
    if(save)recordFlowAction({type:'allocation',op:'undo'});
    render();board(0);
  }
  function confirmAllocation(save=true){
    if(save)recordFlowAction({type:'allocation',op:'confirm'});
    actClear();allocDone(touchedKeys,dice?true:false);done();
  }
  function render(){
    if(dice){ top.innerHTML='<div id="dice">'+dice.map((v,i)=>`<div class="die ${i<idx?'used':''} ${i===idx?'active':''} ${v===6?'six':''}">${v}</div>`).join('')+'</div>'; }
    else top.innerHTML=`<div class="pool">剩餘可分配點數：${pool} 點（點一下能力 +1點）</div>`;
    const cue=$('al-cue'); if(cue)cue.textContent=dice?`剩餘 ${remaining()} 顆骰子未分配`:`剩餘 ${remaining()} 點未分配`;
    rows.innerHTML='';
    keys.forEach(k=>{ normalizeAbCarry(k); const v=S.ab[k],cap=v>=ABILITY_MAX;
      const r=document.createElement('div'); r.className='abrow'+(cap?' capped':'');
      const pk=(S.pot&&S.pot[k])||62, cst=abCost(k), cr=(S.carry&&S.carry[k])||0;
      r.innerHTML=`<span class="nm">${ABL[k]}</span><span class="bar"><i style="width:${Math.min(100,v/POTENTIAL_MAX*100)}%"></i><em style="left:${Math.min(100,pk/POTENTIAL_MAX*100)}%"></em></span><span class="val" style="line-height:1.1">${v}<small style="opacity:.5">/${pk}</small>${cst>1?`<span style="display:block;opacity:.5;font-size:10.5px;letter-spacing:1px;margin-top:-2px">${cr}/${cst}</span>`:''}</span>`;
      if(!cap&&remaining()>0)r.onclick=()=>addOne(k);
      rows.appendChild(r); });
    btm.innerHTML='';
    /* 復原鈕固定佔位:無可復原時 disabled 而非消失,避免版面跳動誤觸 */
    const u=document.createElement('button'); u.className='btn'; u.style.textAlign='center';
    u.textContent='↩ 復原'; u.disabled=!hist.length;
    u.style.opacity=hist.length?'1':'0.35'; u.style.cursor=hist.length?'pointer':'default';
    if(hist.length)u.onclick=()=>undoOne();
    btm.appendChild(u);
    const allCap=keys.every(k=>S.ab[k]>=ABILITY_MAX);
    if(remaining()===0||allCap){ const c=document.createElement('button'); c.className='btn main';
      c.textContent=(remaining()>0&&allCap)?'能力已達上限，捨棄剩餘骰子 ▸':'確認 ▸';
      c.onclick=()=>confirmAllocation(); btm.appendChild(c); }
    actToggleSync();
  }
  allocPlace();
  /* v0.22: allocation clicks are first-class replay actions.  A save made while
     this panel is open can now rebuild the exact remaining dice/pool and undo stack. */
  replayFlowActions('allocation',a=>{
    if(a.op==='add')addOne(String(a.key||''),false);
    else if(a.op==='undo')undoOne(false);
    else if(a.op==='confirm')confirmAllocation(false);
  });
  /* Roll-in animation on first render only; purely visual (Math.random, not the
     seeded RNG) — game values always come from dice[]. Scoped to `top` rather than #act
     because in the overlay form the dice live in #af-body, where #act cannot see them. */
  if(dice && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    top.querySelectorAll('#dice .die').forEach((el,i)=>{
      el.classList.add('rolling');
      const iv=setInterval(()=>{ el.textContent=1+Math.floor(Math.random()*6); },70);
      setTimeout(()=>{ clearInterval(iv); el.classList.remove('rolling'); el.textContent=dice[i];
        if(dice[i]===6)el.classList.add('flash6'); },260+i*90);
    });
  }
}
