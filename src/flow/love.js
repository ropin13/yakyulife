import {S} from '../core/state.js?v=offline-0.31.0';
import {R, ri, pick, chance, clamp} from '../core/rng.js?v=offline-0.31.0';
import {card, choose, board} from '../ui/dom.js?v=offline-0.31.0';
import {REL_DB} from '../data/relationship/database.js?v=offline-0.31.1';
import {STUDENT_PEOPLE} from '../data/relationship/people_student.js?v=offline-0.31.0';
import {PROFESSIONAL_PEOPLE} from '../data/relationship/people_professional.js?v=offline-0.31.0';
import {pregnancyChance, PREGNANCY_RULES} from '../data/relationship/pregnancy_rules.js?v=offline-0.31.0';
import {tlNote} from '../ui/timeline.js?v=offline-0.31.0';

/*
 * v0.11.0 relationship engine
 * --------------------------------
 * One person owns exactly one active relationship value:
 * known/friend -> affinity, dating -> romance, married -> marriage.
 * All three values are 0..100. 30 is only the crisis threshold for dating/marriage.
 * The data files under src/data/relationship/ are intentionally editable without
 * changing this engine.
 */

const STAGE_POOL=()=>S.stage==='PRO'?PROFESSIONAL_PEOPLE:(['MS','HS','U'].includes(S.stage)?STUDENT_PEOPLE:[]);
const ACTIVE_STAGES=['MS','HS','U','PRO'];
const LOVE_STAGES=['HS','U','PRO'];

function L(){
  if(!S.love)S.love={};
  const l=S.love;
  if(!Array.isArray(l.contacts))l.contacts=[];
  if(!Array.isArray(l.exes))l.exes=[];
  if(!Number.isFinite(l.kids))l.kids=0;
  if(!Number.isFinite(l.aff))l.aff=0;
  if(!Number.isFinite(l.caught))l.caught=0;
  if(!Number.isFinite(l.affairs))l.affairs=0;
  if(!Number.isFinite(l.lastTargetYear))l.lastTargetYear=0;
  if(!Number.isFinite(l.yearInteractions))l.yearInteractions=0;
  if(!l.interactedThisYear||typeof l.interactedThisYear!=='object')l.interactedThisYear={};
  if(!Number.isFinite(l.lastRelationshipYear))l.lastRelationshipYear=S.year-1;
  if(!Number.isFinite(l.probabilityTriggeredYear))l.probabilityTriggeredYear=0;
  if(!Number.isFinite(l.mandatoryTriggeredYear))l.mandatoryTriggeredYear=0;
  l.loveSaveUsed=!!l.loveSaveUsed;
  l.marriageSaveUsed=!!l.marriageSaveUsed;
  return l;
}
function ensurePeople(){
  const l=L(), pool=STAGE_POOL();
  if(!pool.length)return;
  pool.forEach(([name,identity])=>{
    if(!l.contacts.some(c=>c.name===name)){
      l.contacts.push({id:`${S.stage}-${name}-${S.year}`,name,identity,stage:S.stage,status:'friend',value:0,crisisYears:0,lastInteractedYear:0,ex:false,children:0,metYear:S.year,custom:false});
    }
  });
  /* Keep the currently married person as the sole spouse even when a legacy save used old fields. */
  if(l.partner){
    let c=l.contacts.find(x=>x.name===l.partner);
    if(!c){c={id:`legacy-${l.partner}`,name:l.partner,identity:'舊版人物',stage:S.stage,status:l.st==='married'?'married':l.st==='dating'?'dating':'friend',value:clamp(Number(l.aff)||0,0,100),crisisYears:0,lastInteractedYear:S.year-1,ex:false,children:l.kids||0,metYear:S.year,custom:false};l.contacts.push(c);}
    if(l.st==='married')c.status='married';
    else if(l.st==='dating')c.status='dating';
  }
}
function migrateLegacy(){
  const l=L(); ensurePeople();
  if(l._migrated011)return;
  l.contacts.forEach(c=>{
    if(!Number.isFinite(Number(c.value))&&Number.isFinite(Number(c.aff)))c.value=Number(c.aff);
    c.value=clamp(Number(c.value)||0,0,100);
    if(!Array.isArray(c.history))c.history=[];
  });
  if(l.partner){
    const c=l.contacts.find(x=>x.name===l.partner);
    if(c){c.status=l.st==='married'?'married':l.st==='dating'?'dating':'friend';c.value=clamp(Number(l.aff)||0,0,100);c.children=Number(l.kids)||0;}
  }
  /* Repair impossible legacy combinations. One spouse only; a current lover/spouse is not an ex. */
  let keptSpouse=false;
  l.contacts.forEach(c=>{
    if(c.status==='married'){
      if(!keptSpouse){keptSpouse=true;c.ex=false;c.marriedSince=c.marriedSince||S.year;}
      else{c.status='friend';c.ex=true;c.value=Math.max(50,contactValue(c));}
    }else if(c.status==='dating'){c.ex=false;c.datingSince=c.datingSince||S.year;}
  });
  if(!Array.isArray(l.history))l.history=[];
  l._migrated011=true;
}
function contactValue(c){return clamp(Number(c.value)||0,0,100)}
function setValue(c,v){c.value=clamp(Math.round(v),0,100);board(1);}
function statusLabel(c){return c.status==='married'?'婚姻':c.status==='dating'?'戀愛':'朋友'}
function isFriend(c){return c.status==='friend'}
function isDating(c){return c.status==='dating'}
function isMarried(c){return c.status==='married'}
function spouse(){return L().contacts.find(c=>c.status==='married')||null}
function dating(){return L().contacts.filter(isDating)}
function friends(){return L().contacts.filter(isFriend)}
function exes(){return L().contacts.filter(c=>c.status==='friend'&&(c.ex||L().exes.some(e=>e.name===c.name)))}
function currentTarget(){
  const l=L(),sp=spouse(); if(sp)return sp;
  const ds=dating().slice().sort((a,b)=>contactValue(b)-contactValue(a)); if(ds.length)return ds[0];
  const fs=friends().slice().sort((a,b)=>contactValue(b)-contactValue(a)); if(fs.length)return fs[0];
  return null;
}
function currentOrPreferred(){
  const l=L();
  /* 年度互動必須跟儀表板第六格使用同一人物；highlightId 是 board() 已依
     配偶 > 戀人 > 朋友、同層最高值算出的顯示人物。 */
  let c=l.highlightId&&l.contacts.find(x=>x.id===l.highlightId);
  if(c&&contactValue(c)>0&&['friend','dating','married'].includes(c.status)){l.primaryId=c.id;return c;}
  c=currentTarget(); if(c){l.primaryId=c.id;l.highlightId=c.id;} return c;
}
function relationKind(c){return isMarried(c)?'marriage':isDating(c)?'dating':'friend'}
function interactionCostRange(action){
  const stage=ACTIVE_STAGES.includes(S.stage)?S.stage:'HS';
  const c=REL_DB.actions[action].cost;
  return Array.isArray(c)?c:c[stage];
}
function interactionCost(action){const c=interactionCostRange(action);return ri(c[0],c[1]);}
function interactionGain(action){const g=REL_DB.actions[action].gain;return ri(g[0],g[1]);}
function spend(cost,done){
  if((S.cash||0)<cost){card('bad','現金不足',`這次互動需要約 <b>${cost.toLocaleString()} 元</b>，目前現金 ${(S.cash||0).toLocaleString()} 元。請改選其他互動。`);return false;}
  S.cash-=cost;S.yearWorkExpense=(S.yearWorkExpense||0)+cost;done();return true;
}
function markInteracted(c){const l=L();l.interactedThisYear[c.id]=true;l.yearInteractions=(l.yearInteractions||0)+1;c.lastInteractedYear=S.year;l.primaryId=c.id;l.lastTargetYear=S.year;}
function activeInteractionNames(kind){return REL_DB.texts[kind]||REL_DB.texts.friend}
function remember(c,type,text){
  const l=L();if(!Array.isArray(l.history))l.history=[];
  l.history.push({year:S.year,personId:c?.id||null,person:c?.name||'',type,text});
  if(c){if(!Array.isArray(c.history))c.history=[];c.history.push({year:S.year,type,text});}
  tlNote(2,text);
}
function relationTitle(c){return `${c.name} · ${statusLabel(c)} ${contactValue(c)}/100`}
function chooseTarget(done){
  const l=L();
  const opts=l.contacts.filter(c=>['friend','dating','married'].includes(c.status)).map(c=>({t:c.name,s:`${c.identity}｜${statusLabel(c)} ${contactValue(c)}/100`,main:c.id===l.primaryId,f:()=>{l.primaryId=c.id;done(c);}}));
  opts.push({t:'＋自訂人物',s:'輸入姓名與職業，加入目前人物池',f:()=>{
    const name=(prompt('請輸入人物姓名')||'').trim();if(!name){chooseTarget(done);return;}
    const identity=(prompt('請輸入人物職業／身分')||'').trim()||'自訂人物';
    let c=l.contacts.find(x=>x.name===name);if(!c){c={id:`custom-${Date.now()}`,name,identity,stage:S.stage,status:'friend',value:0,crisisYears:0,lastInteractedYear:0,ex:false,children:0,metYear:S.year,custom:true};l.contacts.push(c);}l.primaryId=c.id;done(c);
  }});
  choose('更換本次互動人物',opts);
}
function convertToDating(c){
  const l=L(),sp=spouse();
  c.status='dating';setValue(c,30);c.crisisYears=0;c.ex=false;c.datingSince=S.year;c.marriedSince=null;l.primaryId=c.id;
  /* 已婚者仍可能接受其他人的告白，但舊版相容欄位必須繼續指向配偶，
     否則下一次同步時會把婚姻誤判為一般戀愛。 */
  if(sp){l.partner=sp.name;l.st='married';l.aff=contactValue(sp);}
  else{l.partner=c.name;l.st='dating';l.aff=30;}
  remember(c,'dating',`與${c.name}開始交往`);card('gold','告白成功',`你與 <b class="hl">${c.name}</b> 正式公開承認交往。關係進入戀愛階段，戀愛度從 <b>30</b> 開始。`);}
function convertToMarried(c){
  const sp=spouse();if(sp&&sp.id!==c.id)return false;
  c.status='married';setValue(c,30);c.crisisYears=0;c.ex=false;c.marriedSince=S.year;L().primaryId=c.id;L().partner=c.name;L().st='married';L().aff=30;L().kids=c.children||0;remember(c,'married',`與${c.name}結婚`);card('gold','求婚成功',`<b class="hl">${c.name}</b> 接受你的求婚，你們正式結為夫妻。婚姻度從 <b>30</b> 開始。`);return true;
}
function backToFriend(c,reason){
  const divorce=/離婚/.test(reason),breakup=/分手/.test(reason);
  if(divorce||breakup){
    const loss=divorce?4:2;
    S.pendingAbilityPenalty=(Number(S.pendingAbilityPenalty)||0)+loss;
    S.pendingAbilityPenaltyYear=S.year+1;
    if(divorce)S.cash=Math.floor(Math.max(0,Number(S.cash)||0)*.5);
  }
  c.status='friend';setValue(c,50);c.crisisYears=0;c.ex=true;c.datingSince=null;c.marriedSince=null;remember(c,'separation',`${reason}：${c.name}`);
  const l=L();l.primaryId=c.id;if(l.partner===c.name){l.partner=null;l.st='single';l.aff=50;l.kids=0;}
  card('info',reason,`你與 <b class="hl">${c.name}</b> 回到朋友關係，好感度恢復為 <b>50</b>。${divorce?`共同財產完成分配，錢包現金剩下 <b class="dn">${Math.round(S.cash||0).toLocaleString()} 元</b>；下一年度全部實際能力 −4。`:breakup?'下一年度全部實際能力 −2。':''}未來仍然可以重新追求。`);
}
function handlePositive(c,action,left,next){
  const gain=interactionGain(action),cost=interactionCost(action),name=activeInteractionNames(relationKind(c))[['free','low1','low2','mid1','mid2','high'].indexOf(action)];
  const apply=()=>{setValue(c,contactValue(c)+gain);markInteracted(c);card('good',name||'互動完成',`你和 <b class="hl">${c.name}</b> 的互動完成。<b>${statusLabel(c)} +${gain}</b>（目前 ${contactValue(c)}/100）。${cost?`花費 ${cost.toLocaleString()} 元。`:''}`);loveRounds(next,left-1);};
  if(cost){
    /* 現金不足只代表本選項失敗：不扣次數、不改關係值，並立即還原原人物選單。 */
    if(!spend(cost,apply))loveRounds(next,left,c);
  }else apply();
}
function actionOptions(c,left,next){
  const kind=relationKind(c),texts=activeInteractionNames(kind);
  const base=['free','low1','low2','mid1','mid2','high'];
  const opts=base.map((id,i)=>{const a=REL_DB.actions[id],range=interactionCostRange(id);return {t:texts[i],main:id==='free',s:id==='free'?`免費｜好感 +${a.gain[0]}～${a.gain[1]}`:`${range[0].toLocaleString()}～${range[1].toLocaleString()} 元｜好感 +${a.gain[0]}～${a.gain[1]}`,f:()=>handlePositive(c,id,left,next)};});
  if(kind==='friend' && contactValue(c)>=40){
    opts.push({t:'告白',main:true,s:contactValue(c)<60?`成功率 10%｜失敗好感 −10`:`成功率 ${contactValue(c)-20}%｜失敗好感 −10`,f:()=>{
      const p=contactValue(c)<60?10:contactValue(c)-20;
      if(chance(p)){convertToDating(c);markInteracted(c);loveRounds(next,left-1);}
      else{setValue(c,contactValue(c)-10);markInteracted(c);card('bad','告白失敗',`你鼓起勇氣向 ${c.name} 告白，但對方沒有接受。好感度 −10，目前 ${contactValue(c)}/100。`);loveRounds(next,left-1);}
    }});
  }
  if(kind==='friend'){
    opts.push({t:'故意冷漠',warn:true,compact:true,s:'好感度 −10（最低降至 30）',f:()=>{const before=contactValue(c),after=Math.max(30,before-10);setValue(c,after);markInteracted(c);card('bad','故意冷漠',`你刻意保持距離，<b>${c.name}</b> 的好感度 ${after-before}，目前 ${after}/100。`);loveRounds(next,left-1);}});
    opts.push({t:'絕交',warn:true,compact:true,s:'好感度直接降為 30',f:()=>{setValue(c,30);markInteracted(c);card('bad','絕交',`你主動結束這段友誼，<b>${c.name}</b> 的好感度降到 30。`);loveRounds(next,left-1);}});
  }else if(kind==='dating'){
    if(!spouse() && S.age>=21 && contactValue(c)>=40){
      opts.push({t:'求婚',main:true,s:contactValue(c)<60?`成功率 10%｜失敗戀愛度 −10`:`成功率 ${contactValue(c)-20}%｜失敗戀愛度 −10`,f:()=>{
        const p=contactValue(c)<60?10:contactValue(c)-20;
        if(chance(p)){convertToMarried(c);markInteracted(c);loveRounds(next,left-1);}
        else{setValue(c,contactValue(c)-10);markInteracted(c);card('bad','求婚失敗',`你向 ${c.name} 求婚，但對方希望再等等。戀愛度 −10，目前 ${contactValue(c)}/100。`);loveRounds(next,left-1);}
      }});
    }
    opts.push({t:'故意冷漠',warn:true,compact:true,s:'戀愛度 −10（最低降至 30）',f:()=>{const before=contactValue(c),after=Math.max(30,before-10);setValue(c,after);markInteracted(c);card('bad','故意冷漠',`你刻意冷落 <b>${c.name}</b>，戀愛度 ${after-before}，目前 ${after}/100。`);loveRounds(next,left-1);}});
    opts.push({t:'主動分手',warn:true,compact:true,s:'回到朋友，好感度 50',f:()=>{markInteracted(c);backToFriend(c,'主動分手');loveRounds(next,left-1);}});
  }else{
    opts.push({t:'生小孩',s:`懷孕成功率依年齡與胎次計算｜目前第 ${(c.children||0)+1} 胎`,f:()=>startPregnancy(c,left,next)});
    opts.push({t:'主動提離婚',warn:true,compact:true,s:'回到朋友，好感度 50',f:()=>{markInteracted(c);backToFriend(c,'主動離婚');loveRounds(next,left-1);}});
  }
  opts.push({t:'更換互動人物',compact:true,s:'不消耗本次互動次數',f:()=>chooseTarget(nc=>loveRounds(next,left,nc))});
  opts.push({t:'專心打球',s:'本次跳過感情互動',f:()=>loveRounds(next,left-1)});
  return opts;
}
function startPregnancy(c,left,next){
  const l=L(),parity=c.children||0,ch=pregnancyChance(S.age,parity);
  markInteracted(c);
  if(parity>=PREGNANCY_RULES.maxChildren){card('info','家庭規劃',`目前已經有 ${parity} 個孩子，這套設定暫時不再進行懷孕判定。`);loveRounds(next,left-1);return;}
  if(chance(ch)){l.pregnancy={motherId:c.id,mother:c.name,attemptYear:S.year,dueYear:S.year+1,order:parity+1};card('gold','懷孕成功',`你們決定生第 ${parity+1} 個孩子。本次懷孕成功率 <b>${ch}%</b>，已確認懷孕，預計於下一年度生產。`);}
  else card('info','這次沒有懷孕',`本次第 ${parity+1} 胎的懷孕成功率為 <b>${ch}%</b>，今年沒有懷孕成功。`);
  loveRounds(next,left-1);
}
function loveRounds(next,left,forcedTarget=null){
  const l=L();
  if(left<=0){syncLegacyFields();afterInteractions(next);return;}
  const c=forcedTarget||currentOrPreferred();
  if(!c){chooseTarget(nc=>loveRounds(next,left,nc));return;}
  l.primaryId=c.id;
  choose(`年度感情互動 ${4-left}/3 · 目前：${relationTitle(c)}`,actionOptions(c,left,next));
}
function syncLegacyFields(){
  const l=L(),sp=spouse(),ds=dating().sort((a,b)=>contactValue(b)-contactValue(a));
  const c=sp||ds[0]||friends().sort((a,b)=>contactValue(b)-contactValue(a))[0];
  l.partner=sp?.name||ds[0]?.name||null;l.st=sp?'married':ds.length?'dating':'single';l.aff=c?contactValue(c):0;l.kids=sp?.children||0;
}
function applyAnnualDecay(){
  const l=L();l.interactedThisYear={};l.yearInteractions=0;
  l.contacts.forEach(c=>{
    if(c.status==='friend'){
      if(c.lastInteractedYear!==S.year-1)setValue(c,contactValue(c)-5);
    }else if(c.status==='dating'){
      if(c.lastInteractedYear!==S.year-1)setValue(c,contactValue(c)-10);
    }else if(c.status==='married'){
      if(c.lastInteractedYear!==S.year-1)setValue(c,contactValue(c)-8);
    }
    /* Crisis years are finalized after all three interactions and the multi-relation penalty. */
  });
}
function updateCrisisCounters(){
  L().contacts.forEach(c=>{
    if(c.status==='dating'||c.status==='married') c.crisisYears=contactValue(c)<30?(c.crisisYears||0)+1:0;
  });
}
function multiPenalty(){
  const l=L(),high=l.contacts.filter(c=>(c.status==='friend'||c.status==='dating')&&contactValue(c)>=70),n=high.length;
  if(n<2)return;
  const d=n===2?5:n===3?10:15;
  high.forEach(c=>setValue(c,contactValue(c)-d));
  const sp=spouse();if(sp)setValue(sp,contactValue(sp)-d);
  card('bad','多重關係懲罰',`共有 <b>${n}</b> 名朋友／戀人達到 70 以上，本年度每人關係值 −${d}。${sp?`配偶 ${sp.name} 也受到 −${d} 的關係壓力。`:''}`);
}
function eventContext(){
  const l=L(),sp=spouse(),ds=dating(),fs=friends(),es=exes();
  return {year:S.year,married:!!sp,spouse:sp,dating:ds,friends:fs,datingCount:ds.length,friendCount:fs.length,highFriendCount:fs.filter(c=>contactValue(c)>=70).length,highExCount:es.filter(c=>contactValue(c)>=60).length,exCount:es.length,datingCrisis:ds.filter(c=>(c.crisisYears||0)>=1),marriageCrisis:sp&&sp.crisisYears>=1?[sp]:[],pregnancy:l.pregnancy||null,marriageValue:sp?contactValue(sp):0};
}
function probabilityPhase(next){
  const ctx=eventContext();
  /* 主動告白以「人物」為事件單位。兩位朋友達到門檻，就在機率池中
     放入兩個各自鎖定人物的事件；配偶與現任戀人不會混入候選名單。 */
  const eligible=REL_DB.probability.filter(e=>e.condition(ctx)).flatMap(e=>{
    if(e.resolve!=='friend_confess')return [e];
    return ctx.friends.filter(c=>contactValue(c)>=70).map(c=>({...e,id:`${e.id}:${c.id}`,name:`${c.name}主動告白`,targetId:c.id}));
  });
  if(!eligible.length){card('info','今年無機率觸發事件','今年沒有符合條件的機率觸發事件。');mandatoryPhase(next);return;}
  const chosen=weightedPick(eligible),chancePct=Math.min(80,eligible.length<=3?30:eligible.length*10);
  if(!chance(chancePct)){card('info','今年無機率觸發事件',`符合條件的事件有 ${eligible.length} 項，本次抽中的事件「${chosen.name}」真正出現機率為 ${chancePct}%，本年度沒有機率事件。`);mandatoryPhase(next);return;}
  resolveProbability(chosen,next,ctx,eligible.length,chancePct);
}
function weightedPick(arr){const total=arr.reduce((a,e)=>a+(e.weight||1),0);let r=R()*total;for(const e of arr){r-=e.weight||1;if(r<0)return e;}return arr[arr.length-1];}
function resolveProbability(e,next,ctx,count,pct){
  const l=L(),sp=spouse(),ds=dating(),fs=friends(),es=exes();
  card('info','機率觸發事件',`今年符合 ${count} 項機率事件，抽中「<b>${e.name}</b>」，實際出現率 ${pct}%。`);
  if(e.resolve==='affair'){
    const target=pick(ds.length?ds:fs.filter(c=>contactValue(c)>=70));l.affairs++;
    choose('外遇誘惑出現了',[
      {t:'接受誘惑',warn:true,f:()=>{if(sp)setValue(sp,contactValue(sp)-10);if(target)setValue(target,contactValue(target)+ri(0,5));card('bad','越界選擇','你做了一個可能改變多段關係的選擇。配偶關係受到傷害。');mandatoryPhase(next);}},
      {t:'拒絕誘惑',main:true,f:()=>{if(sp)setValue(sp,contactValue(sp)+ri(3,8));card('good','守住界線','你拒絕了誘惑，伴侶對你的信任增加。');mandatoryPhase(next);}}
    ]);return;
  }
  if(e.resolve==='rumor'){
    const target=pick(fs.filter(c=>contactValue(c)>=70));
    choose('媒體緋聞',[
      {t:'公開澄清',main:true,f:()=>{if(target)setValue(target,contactValue(target)-ri(2,6));if(sp)setValue(sp,contactValue(sp)+ri(2,6));else ds.forEach(c=>setValue(c,contactValue(c)+ri(0,2)));card('info','澄清成功','你選擇正面處理媒體，緋聞沒有進一步擴大。');mandatoryPhase(next);}},
      {t:'保持沉默',f:()=>{if(target)setValue(target,contactValue(target)-ri(5,10));if(sp)setValue(sp,contactValue(sp)-ri(3,8));card('bad','緋聞延燒','沉默讓外界自行解讀，你的關係受到壓力。');mandatoryPhase(next);}}
    ]);return;
  }
  if(e.resolve==='ex_contact'||e.resolve==='old_flame'){
    const ex=pick(es);
    choose(e.name,[
      {t:'見面聊聊',f:()=>{setValue(ex,contactValue(ex)+ri(3,8));card('info',e.name,`你與 ${ex.name} 重新聯絡，過去的情緒再次浮現。`);mandatoryPhase(next);}},
      {t:'保持距離',main:true,f:()=>{card('good','保持界線',`你選擇不讓過去干擾現在的生活。`);mandatoryPhase(next);}}
    ]);return;
  }
  if(e.resolve==='friend_confess'){
    const f=fs.find(c=>c.id===e.targetId);
    if(!f){mandatoryPhase(next);return;}
    choose(`${f.name}主動向你告白`,[
      {t:`接受 ${f.name} 的告白`,main:true,f:()=>{convertToDating(f);markInteracted(f);card('good','正式交往',`你接受了 <b class="hl">${f.name}</b> 的告白，兩人正式成為戀人。`);mandatoryPhase(next);}},
      {t:'拒絕但珍惜友誼',f:()=>{setValue(f,contactValue(f)-15);markInteracted(f);card('info','維持朋友',`你婉拒了 <b class="hl">${f.name}</b> 的告白。${f.name} 好感度 −15，目前 ${contactValue(f)}/100，雙方維持朋友關係。`);mandatoryPhase(next);}}
    ]);return;
  }
  if(e.resolve==='jealous'){
    const other=pick(fs.filter(c=>contactValue(c)>=70));
    choose('伴侶吃醋',[
      {t:'耐心解釋',main:true,f:()=>{if(sp)setValue(sp,contactValue(sp)+ri(3,8));card('good','解開心結','你花時間讓伴侶知道自己在關係中的位置。');mandatoryPhase(next);}},
      {t:'覺得對方太敏感',warn:true,f:()=>{if(sp)setValue(sp,contactValue(sp)-ri(5,10));if(other)setValue(other,contactValue(other)-2);card('bad','爭執','你沒有處理好情緒，關係留下裂痕。');mandatoryPhase(next);}}
    ]);return;
  }
  if(e.resolve==='family_surprise'||e.resolve==='chance_date'){
    const target=sp||pick(ds)||pick(fs);
    choose(e.name,[
      {t:'接受這份心意',main:true,f:()=>{if(target)setValue(target,contactValue(target)+ri(5,10));card('good','美好時刻',`你和 ${target?.name||'重要的人'} 留下了一段值得記住的回憶。`);mandatoryPhase(next);}},
      {t:'把時間留給工作',f:()=>{if(target)setValue(target,contactValue(target)-ri(2,6));card('info','錯過','這一次，你把工作放在了前面。');mandatoryPhase(next);}}
    ]);return;
  }
  mandatoryPhase(next);
}
function mandatoryPhase(next){
  const ctx=eventContext(),eligible=REL_DB.mandatory.filter(e=>e.condition(ctx)).sort((a,b)=>(b.priority||0)-(a.priority||0));
  if(!eligible.length){card('info','今年無必然觸發事件','今年沒有達到必然觸發門檻的事件。');randomPhase(next);return;}
  runMandatoryQueue(eligible,next,false);
}
function runMandatoryQueue(events,next,blocked){
  if(!events.length){randomPhase(next);return;}
  const e=events.shift();
  if(blocked&&!e.allowTogether){runMandatoryQueue(events,next,blocked);return;}
  if(e.resolve==='birth')resolveBirth(next,()=>runMandatoryQueue(events,next,blocked||!e.allowTogether));
  else if(e.resolve==='dating_crisis')resolveDatingCrisis(e,next,()=>runMandatoryQueue(events,next,true));
  else if(e.resolve==='marriage_crisis')resolveMarriageCrisis(e,next,()=>runMandatoryQueue(events,next,true));
  else runMandatoryQueue(events,next,blocked);
}
function resolveDatingCrisis(e,next,done){
  const target=eventContext().datingCrisis[0];if(!target){done();return;}
  choose('戀愛危機',[
    {t:'挽回',main:true,s:L().loveSaveUsed?'本次人生的戀愛挽回機會已經使用過':'一生一次的戀愛挽回機會',f:()=>{
      if(L().loveSaveUsed){backToFriend(target,'分手危機');done();return;}
      L().loveSaveUsed=true;setValue(target,30);target.crisisYears=0;card('good','挽回成功',`你決定再努力一次。${target.name} 願意留下，戀愛度恢復到 <b>30</b>。`);done();}},
    {t:'放手',warn:true,f:()=>{backToFriend(target,'分手');done();}}
  ]);
}
function resolveMarriageCrisis(e,next,done){
  const target=eventContext().marriageCrisis[0];if(!target){done();return;}
  choose('婚姻危機',[
    {t:'挽回',main:true,s:L().marriageSaveUsed?'本次人生的婚姻挽回機會已經使用過':'一生一次的婚姻挽回機會',f:()=>{
      if(L().marriageSaveUsed){backToFriend(target,'離婚危機');done();return;}
      L().marriageSaveUsed=true;setValue(target,30);target.crisisYears=0;card('good','挽回成功',`你們決定重新開始。${target.name} 願意留下，婚姻度恢復到 <b>30</b>。`);done();}},
    {t:'放手',warn:true,f:()=>{backToFriend(target,'離婚');done();}}
  ]);
}
function resolveBirth(next,done){
  const l=L(),p=l.pregnancy;if(!p){done();return;}
  if(Number(S.year)<Number(p.dueYear)){done();return;}
  const mother=l.contacts.find(c=>c.id===p.motherId);if(!mother){l.pregnancy=null;done();return;}
  choose('生小孩',[
    {t:'男',main:true,f:()=>finishBirth(mother,'男',done)},
    {t:'女',main:true,f:()=>finishBirth(mother,'女',done)},
    {t:'隨機',f:()=>finishBirth(mother,R()<.5?'男':'女',done)}
  ]);
}
function finishBirth(mother,gender,done){
  const l=L();mother.children=(mother.children||0)+1;l.kids=mother.children;(l.childList||(l.childList=[])).push({gender,birthYear:S.year,motherId:mother.id,mother:mother.name});l.pregnancy=null;remember(mother,'birth',`與${mother.name}迎接第${mother.children}名孩子（${gender}）`);card('gold','已經生小孩了',`恭喜！你與 <b class="hl">${mother.name}</b> 生下了第 <b>${mother.children}</b> 胎，${gender}孩。`);done();}
function randomPhase(next){
  const l=L(),eligible=REL_DB.random.filter(e=>randomEligible(e,l));
  const pool=weightedSample(eligible,8);
  if(!pool.length){card('info','今年無隨機事件','目前沒有符合條件的隨機事件。');syncLegacyFields();finishLoveFlow(next);return;}
  choose('年度隨機事件 · 請選擇一項',pool.map(e=>({t:e.title,s:'選擇後還有下一層決定',f:()=>runRandomEvent(e,next)})));
}
function randomEligible(e,l){
  const c=currentTarget();
  if(e.scope==='friend')return friends().length>0;
  if(e.scope==='dating_or_friend')return friends().length>0||dating().length>0;
  if(e.scope==='relationship')return !!c;
  if(e.scope==='married_or_family')return !!spouse();
  return true;
}
function weightedSample(arr,n){
  const src=arr.slice(),out=[];while(src.length&&out.length<n){const e=weightedPick(src);out.push(e);src.splice(src.indexOf(e),1);}return out;
}
function runRandomEvent(e,next){
  const c=currentOrPreferred();
  choose(e.title,e.choices.map(ch=>({t:ch.text,s:'選擇後依固定或機率結果結算',f:()=>resolveChoice(e,ch,c,next)})));
}
function resolveChoice(e,ch,c,next){
  if(ch.next){choose(`${e.title} · 第二層`,ch.next.map(n=>({t:n.text,f:()=>applyEffects(n.effects,c,next)})));return;}
  const out=weightedOutcome(ch.outcomes||[]);applyEffects(out?.effects||{},c,next);
}
function weightedOutcome(arr){if(!arr.length)return null;return weightedPick(arr.map(x=>({weight:x.chance||1,effects:x.effects})));}
function applyEffects(effects,c,next){
  if(effects.relation&&c)setValue(c,contactValue(c)+ri(effects.relation[0],effects.relation[1]));
  if(effects.cash)S.cash=Math.max(0,Math.round((S.cash||0)+ri(effects.cash[0],effects.cash[1])));
  if(effects.stamina){const n=ri(effects.stamina[0],effects.stamina[1]);S.tmpInj=(S.tmpInj||0)-n;}
  if(effects.fame){S.fame=(Number(S.fame)||0)+ri(effects.fame[0],effects.fame[1]);}
  if(effects.ability){const keys=Object.keys(S.ab||{});if(keys.length){const k=pick(keys);S.ab[k]=clamp((S.ab[k]||0)+ri(effects.ability[0],effects.ability[1]),0,150);}}
  syncLegacyFields();board(1);card('info','事件結算','選擇完成，事件效果已立即套用。');finishLoveFlow(next);
}
function finishLoveFlow(next){document.body.classList.remove('love-rounds');next();}
function afterInteractions(next){
  /* 固定互動結束後仍保留全頁右欄，直到機率、必然與隨機事件全部結束。
     這三類資料庫未來可擴充，選項過多時由右欄本身向上捲動。 */
  multiPenalty();
  updateCrisisCounters();
  probabilityPhase(next);
}
function yearlySetup(){
  const l=L();migrateLegacy();
  applyAnnualDecay();
  /* Pregnancy is deliberately not cleared by the annual reset. */
  l.probabilityTriggeredYear=0;l.mandatoryTriggeredYear=0;
  syncLegacyFields();
}
export function loveEvent(next){
  if(!LOVE_STAGES.includes(S.stage)){next();return;}
  yearlySetup();
  document.body.classList.add('love-rounds');
  const l=L(),hasChosen=!!(l.firstPersonChosen||l.primaryId||l.partner||l.contacts.some(c=>contactValue(c)>0||c.status==='dating'||c.status==='married'));
  if(!hasChosen){
    chooseTarget(c=>{l.firstPersonChosen=true;l.primaryId=c.id;loveRounds(next,3,c);});
    return;
  }
  l.firstPersonChosen=true;
  loveRounds(next,3);
}
export function divorceRec(){
  const l=L(),sp=spouse();if(!sp)return;
  backToFriend(sp,'離婚');syncLegacyFields();
}
/* Compatibility hooks retained for older event calls. */
export function loveCaught(next){
  const l=L(),sp=spouse()||dating()[0];if(sp){l.caught=(l.caught||0)+1;setValue(sp,contactValue(sp)-10);card('bad','外遇曝光','舊版事件呼叫已轉接到新版關係系統，伴侶關係值下降。');}next();
}
export function loveCaughtDating(next){
  const ds=dating();if(ds.length){setValue(ds[0],contactValue(ds[0])-10);card('bad','戀情曝光','舊版事件呼叫已轉接到新版關係系統，戀愛度下降。');}next();
}
export function loveGainTxt(k,amt){return `能力／事件效果 +${amt}`;}
