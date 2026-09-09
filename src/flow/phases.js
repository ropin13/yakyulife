import {S, stepQ, nextStep, stageLabel} from '../core/state.js?v=offline-0.31.0';
import {R, ri, chance, clamp} from '../core/rng.js?v=offline-0.31.0';
import {ABL, POS_AB, ABILITY_MAX, POTENTIAL_MAX} from '../data/abilities.js?v=offline-0.31.0';
import {LV, PATHS, teamNick} from '../data/teams.js?v=offline-0.31.0';
import {AMA_ANNUAL} from '../data/economy.js?v=offline-0.31.0';
import {card, choose, board, divider} from '../ui/dom.js?v=offline-0.31.0';
import {tlNote, tlPush, tlRestage} from '../ui/timeline.js?v=offline-0.31.0';
import {allocUI} from '../ui/alloc.js?v=offline-0.31.0';
import {addAb, ovr, dposReview, statBonusTxt} from '../engine/ability.js?v=offline-0.31.0';
import {rollInjury, healthCheck, tjCap} from '../engine/injury.js?v=offline-0.31.0';
import {isMrTeamEligible} from '../engine/tenure.js?v=offline-0.31.0';
import {amateurSeason, proSeason, slgOf, currentSalaryRating, baseballERA, baseballWHIP, seasonGrade} from '../engine/season.js?v=offline-0.31.0';
import {seasonChampionshipResult,professionalSeasonPoints,minorSeasonResult} from '../engine/championship.js?v=offline-0.31.0';
import {buyoutRemaining, contractAnnual, contractMarketProfile, controlledAnnual, crossOffers, daibaFarewell, extensionOffer, faFlow, fmtMoney, handleDemotion, levelMinAnnual, makeContract, makeOffers, offseasonTradeCheck, pickOfferUI, signTo, teamChampRate, teamChampRates, mlbEntryStatus} from '../engine/contract.js?v=offline-0.31.0';
import {drawEvents, removeTrait, checkChampionTrait} from './events.js?v=offline-0.31.0';
import {loveEvent} from './love.js?v=offline-0.31.0';
import {runDraft, draftChoice, npbTest, amateurTeamChoice, usaTestFlow, pathChoiceHS, pathChoiceU4, pathChoiceUYear, schoolTransition, advance} from '../engine/draft.js?v=offline-0.31.0';
import {endGame} from '../ui/retire.js?v=offline-0.31.0';
import {yearWorkChoice,paidTrainingFlow} from './life-economy.js?v=offline-0.31.0';
import {maybeIntl} from '../engine/intl.js?v=offline-0.31.0';
import {beginYearCheckpoint,isReplaying} from '../core/session.js?v=offline-0.31.0';
/* ================= 年度流程 ================= */
function backupDue(){
  /* 舊版年度檢查點沒有此欄位；視為關閉，避免重播時多插入一個不存在的選項。 */
  if((S.backupMode||'off')==='off')return false;
  const gap=Math.max(1,Math.round(Number(S.backupInterval)||1)),last=Number(S.backupLastYear);
  return !Number.isFinite(last)||S.year-last>=gap;
}
export function startYear(){
  beginYearCheckpoint(S);S.yearOutsideIncome=0;stepQ.length=0;stepQ.push(phasePre,phaseMid,phaseEnd);
  divider(`${S.year} 年 · ${S.age} 歲 · ${stageLabel()}`);tlPush();
  if(!backupDue()){nextStep();return;}
  if(S.backupMode==='auto'){
    S.backupLastYear=S.year;
    if(!isReplaying())window.dispatchEvent(new CustomEvent('yakyo:backup-internal'));
    nextStep();return;
  }
  choose('年度安全備份',[{t:'匯出本年度安全備份',main:true,s:'保存年度剛開始、尚未進行任何選擇的安全檢查點',f:()=>{S.backupLastYear=S.year;if(!isReplaying())window.dispatchEvent(new CustomEvent('yakyo:backup-export'));nextStep();}},{t:'本次略過',s:'繼續本年度流程',f:()=>{S.backupLastYear=S.year;nextStep();}}]);
}
/* ---------- 季初 ---------- */
export function phasePre(){
  board(0); S.tmpInj=0; S.seasonFactor=1; S.skipMid=false; S.marketInjury='healthy'; S.prevD=S.lastD||0; S.lastD=0; S.lastPayD=0; /* 先保留上季 d 供投手定位判定 */
  if((S.pendingAbilityPenalty||0)>0&&S.year>=(S.pendingAbilityPenaltyYear||S.year)){
    const loss=Math.max(0,Math.round(S.pendingAbilityPenalty));
    POS_AB[S.pos].filter(k=>k in S.ab).forEach(k=>{S.ab[k]=clamp(S.ab[k]-loss,1,ABILITY_MAX);});
    card('bad','感情事件後遺症',`受到上一年度感情事件影響，所有目前能力 <b class="dn">−${loss}</b>；潛力上限不受影響。`);
    S.pendingAbilityPenalty=0;S.pendingAbilityPenaltyYear=null;board(0);
  }
  checkChampionTrait(); /* 舊存檔已有五冠時也會補解鎖。 */
  /* 50 歲是最後一個完整球季；進入 51 歲春訓才強制引退。 */
  if(S.age>50){ buyoutRemaining(1,true); endGame('已完成 50 歲最後球季，'+S.year+' 年春訓後依年齡規定宣布引退。'); return; }
  /* 年度潛力變化：臨界年齡（含）以前逐項獨立增加，之後逐項獨立衰退。
     0～0 代表關閉；不取代傷病、事件卡與付費突破等既有潛力機制。 */
  {
    const pivot=clamp(Math.round(Number(S.potentialPivotAge)||30),1,99);
    let lo=clamp(Math.round(Number(S.potentialYearMin)||0),0,POTENTIAL_MAX);
    let hi=clamp(Math.round(Number(S.potentialYearMax)||0),0,POTENTIAL_MAX);
    if(lo>hi){const t=lo;lo=hi;hi=t;}
    if(hi>0){
      const grow=S.age<=pivot,changes=[];
      POS_AB[S.pos].filter(k=>k in S.pot).forEach(k=>{
        const d=ri(lo,hi);if(!d)return;
        const before=S.pot[k],after=clamp(before+(grow?d:-d),1,POTENTIAL_MAX);
        S.pot[k]=after;if(after!==before)changes.push(`${ABL[k]} ${grow?'+':'−'}${Math.abs(after-before)}`);
      });
      card(grow?'good':'bad','年度潛力變化',`${grow?`尚未超過 ${pivot} 歲臨界點，潛力持續成長`:`已超過 ${pivot} 歲臨界點，潛力開始衰退`}。${changes.length?changes.join('、'):'本年度各項皆抽到 0，潛力不變。'}`);
      board(0);
    }
  }
  const declineStart=clamp(Math.round(Number(S.declineStartAge)||32),1,99);
  const declAge=S.age-(S.traits.disc?2:0); /* 自律狂:修改器設定的衰退起點再延後兩年 */
  if(declAge>=declineStart){
    const years=Math.max(0,declAge-declineStart);
    const start=Math.max(0,Number(S.declineStartValue)||0),step=Math.max(0,Number(S.declineStepMult)||0);
    const baseDec=Math.max(0,Math.round(start*(1+years*step)));
    if(baseDec>0){
    const oldGhostActive=!!(S.oldGhostPending&&!S.oldGhostUsed);
    const dec=oldGhostActive?Math.round(baseDec*0.5):baseDec;
    const catcherCallDec=S.pos==='C'?Math.round(dec*0.5):dec;
    POS_AB[S.pos].forEach(k=>S.ab[k]=clamp(S.ab[k]-(k==='cat'?catcherCallDec:dec),1,ABILITY_MAX));
    if(oldGhostActive){ S.oldGhostPending=false; S.oldGhostUsed=true; }
    const declineText=S.pos==='C'
      ?`配球以外能力 <b class="dn">−${dec}</b>（你的配球經驗是你珍貴的財產，不會急遽衰退，配球<b class="dn">−${catcherCallDec}</b>）`
      :`所有能力 <b class="dn">−${dec}</b>`;
    card('bad','歲月不饒人',`自訂老化第 ${years+1} 年衰退：${declineText}${S.traits.disc?'（自律狂：設定起點延後兩年）':''}${oldGhostActive?`（老鬼：原衰退 −${baseDec}，本年減緩 50%）`:''}。訓練加點照常，但身體回不去了。`); board(0); }}
  if(S.rehab>0){ S.rehab--; S.skipMid=true; S.seasonFactor=0; S.marketInjury='rehab';
    card('bad','復健年',`大傷尚未痊癒，本季確定<b class="dn">全年報銷</b>，只能在復健室度過。（擲骰減為 2 顆）`);
    const dummySt = {G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,avg:0,era:0,WHIP:0,DEF:0};
    S.log.push({y:S.year,age:S.age,tm:S.stage==='PRO'?S.teamName():(S.team||stageLabel()),line:'復健年・全年報銷', inj: true, st: S.stage==='PRO'?dummySt:null}); }
  let afterAsk=()=>{
    let n=S.skipMid?2:(()=>{const r=R();return r<0.35?3:r<0.75?4:r<0.95?5:6;})();
    if(S.traits.distract&&!S.skipMid)n=Math.max(2,n-1); /* 外務纏身 */
    if(S.traits.academy&&!S.skipMid&&chance(35))n++; /* 學院派:期望值略升 */
    if(S.workDicePenalty>0&&!S.skipMid){const cut=S.workDicePenalty<1?(chance(S.workDicePenalty*100)?1:0):Math.round(S.workDicePenalty);n=Math.max(1,n-cut);}
    /* 二刀流骰數在所有原版增減完成後只套一次；無條件進位，介面上限 7 顆。 */
    if(S.pos==='TW')n=Math.min(7,Math.max(1,Math.ceil(n*clamp(Number(S.twoWayDiceMult??1.5),.1,10))));
    
    const dice=[]; let newSix=0;
    for(let i=0;i<n;i++){ const v=S.traits.genius?ri(4,6):S.traits.late?ri(3,6):ri(1,6); dice.push(v);
      if(v===6&&S.age<22&&!S.traits.genius){S.six++;newSix++;} }
      
    let msg=`自主訓練擲出 <b class="hl">${n}</b> 顆骰。`;
    if(newSix&&!S.traits.genius)msg+=` 高標值「6」累計 <b class="hl">${S.six}/5</b> 次。`;
    
    /* 【修正】大巧不工改為：自動擲骰並加點，滿額溢出轉為成績加成 */
    if(S.traits.combo && !S.skipMid && (S.comboKey||S.samePickKey)) {
      const ck = S.comboKey||S.samePickKey; /* 永遠用解鎖當下鎖定的能力 */
      const cv = S.traits.genius?ri(4,6):S.traits.late?ri(3,6):ri(1,6);
      const gained = addAb(ck, cv);
      const overflow = S.lastOverflow || 0;

      if(overflow > 0) S.pendStat = (S.pendStat || 0) + overflow;

      let cmsg = `<br>大巧不工發動：系統自動擲出 <b class="hl">${cv}</b> 點，挹注於 <b class="hl">${ABL[ck]}</b>`;
      if(gained > 0) cmsg += `（<b class="up">+${gained}</b>）`;
      if(overflow > 0) cmsg += `（頂峰造極：溢出的 ${overflow} 點轉為${statBonusTxt(overflow)}）`;
      if(gained===0 && overflow===0) cmsg += `（<b class="dn">未升級</b>）`;
      msg += cmsg + `。`;
    }
    
    card('','季初特訓',msg);
    if(S.six>=5&&!S.traits.genius&&S.age<22){ S.traits.genius=true;
      {
      const exDef=S.pos==='C'?['rng','fld','arm','cat']:[];
      const cands=POS_AB[S.pos].filter(k=>S.ab[k]<70&&!exDef.includes(k));
      for(let i=cands.length-1;i>0;i--){const j=Math.floor(R()*(i+1));const t=cands[i];cands[i]=cands[j];cands[j]=t;}
      const boost=cands.slice(0,2), bl=[];
      boost.forEach(k=>{ S.pot[k]=Math.min(POTENTIAL_MAX,(S.pot[k]||62)+10);
        S.ab[k]=clamp(S.ab[k]+5,1,ABILITY_MAX); bl.push(`${ABL[k]} <b class="up">+5</b>（潛力上限 +10 → ${S.pot[k]}）`); });
      card('gold','隱藏素質解鎖：天才','22 歲前五度擲出高標值！從今以後，每一顆訓練骰<b class="hl">永久固定 4 點以上</b>，事件卡好結果機率提升至 <b class="hl">70%</b>。'+(bl.length?`天賦覺醒，潛能重新被評估：${bl.join('、')}。`:'')+'天賦，是藏不住的。');
      board(1);
    } }
    choose('',[{t:`▸ 分配訓練成果（${dice.length} 顆骰）`,main:true,f:()=>dposReview(()=>allocUI({dice},'分配訓練成果（點骰套用｜球探量表：'+(S.pos==='P'?'60/70/75':'70/75')+' 以上成長遞減）',()=>paidTrainingFlow(()=>nextStep())))}]);
  };
  const trainAfterWork=afterAsk;
  afterAsk=()=>yearWorkChoice(trainAfterWork);
  /* 投手開季：投球強度(續航+TJ 量表) */
  const preAsk=afterAsk;
  if(['P','TW'].includes(S.pos)&&S.stage==='PRO'&&!S.skipMid){
    afterAsk=()=>{
      choose(`開季投球規劃（手臂狀況：${(function(){const r=S.tj/tjCap();return S.rehab>0?'復健中':r>=0.85?'手肘隱隱作痛':r>=0.6?'手臂略感疲勞':r>=0.35?'狀況尚可':'手感輕盈';})()}）`,[
        {t:'全力投',warn:true,s:'成績最佳｜手臂負荷最大（TJ 累積 ×1.30）',f:()=>{S.effort='全力投';preAsk();}},
        {t:'普通投',main:true,s:'標準強度｜TJ 累積正常',f:()=>{S.effort='普通投';preAsk();}},
        {t:'養生球',s:'成績保守｜省手臂（TJ 累積 ×0.80）',f:()=>{S.effort='養生球';preAsk();}}]);
    };
  }
  /* 大學每一學年季前皆可留校、轉學、休學投入職業或業餘成棒。 */
  if(S.stage==='U'&&S.stageYr>=1&&S.stageYr<=4){pathChoiceUYear(afterAsk);return;}
  if(false&&S.stage==='PRO'&&S.age>=36&&S.rehab===0){
    const oldOpts=[{t:'再戰一年',main:true,f:afterAsk}];
    /* 旅外老將(衰退期):放棄現有合約,落葉歸根返台;ovr<30(真的打不動)不給 */
    if(S.org!=='CPBL'&&ovr()>=LV.CPBL2.min){
      oldOpts.push({t:'放棄合約，落葉歸根',s:'狀態不再，仍想把最後的球打給家鄉看',f:()=>{
        card('good','落葉歸根',`狀態雖然已經不在巔峰，但家鄉球隊仍然向你招手——他們要的不是你的實力，是你在國際賽、在海外聯賽建立起的回憶。你決定放棄合約，回家，把職業生涯最後幾年奉獻給大家。`);
        signTo('CPBL','CPBL1'); tlRestage(); afterAsk(); /* spring move: this season is already CPBL */
      }});
    }
    oldOpts.push({t:'召開引退記者會',warn:true,s:'結束選手生涯',f:()=>{buyoutRemaining(0.7,true);daibaFarewell(()=>endGame('功成身退，於 '+S.year+' 年宣布引退。'));}});
    choose('又是一年春訓，身體大不如前了',oldOpts);
    return;
  }
  afterAsk();
}
/* ---------- 賽季中 ---------- */
export function phaseMid(){
  board(1);
  if(S.skipMid){ S.ironStreak=0; nextStep(); return; }
  loveEvent(()=>drawEvents(()=>{
    if(S.stage==='ES'||S.stage==='MS'){
      S.tmpInj=0; S.injNext=0; S.tj=0; S.marketInjury='healthy';
      card('good','成長期健康保護','國小與國中階段不累積一般傷病、復健年或手肘負荷；高中起才啟用一般受傷判定。');
      choose('',[{t:'▸ 查看球季表現',main:true,f:()=>amateurSeason()}]);
      return;
    }
    choose('',[{t:'▸ 季中健康檢查',main:true,f:()=>{ healthCheck(()=>{rollInjury();
      choose('',[{t:'▸ 查看球季表現',main:true,f:()=>{
        if(S.stage==='PRO')proSeason();
        else amateurSeason(); }}]);}); }}]);
  }));
}
/* 球隊年資在季末交易前結算：交易屬於下一季異動，剛打完的球季必須記在原隊。 */
export function updateTeamTenureTraits(){
  if(S.stage!=='PRO'||!S.orgTeam)return;
  S.teamSeasons=(S.teamSeasons||0)+1; /* 同一球團全部球季：二軍、復健年也算忠誠年資。 */
  if(LV[S.lv].top&&!S.skipMid)S.teamYears=(S.teamYears||0)+1; /* 全年復健算球團年資，但不算實際頂級球季。 */

  if(!S.traits.goldcloth&&S.orgTeam==='中信兄弟'&&(S.teamTally.CPBL&&S.teamTally.CPBL['中信兄弟']>=10)){
    S.traits.goldcloth=true;
    card('gold','隱藏屬性解鎖：黃金聖衣','效力中信兄弟滿十年，你愛兄弟，不離不棄。'); board(1);
  }

  if(!S.traits.franchise&&S.teamYears>=7&&S.champThisTeam&&S.champTeam===S.orgTeam){
    const removedCancer=!!S.traits.cancer;
    if(removedCancer)removeTrait('cancer','更衣室毒瘤');
    S.traits.franchise=true; S.franchiseActive=true; S.franchiseTeamName=S.orgTeam;
    card('gold','隱藏屬性解鎖：神主牌','小孩指著你說：「我媽媽從小就看你打球」。球團高層很清楚，放你走球迷會把主場拆了——<b class="hl">合約市場保有 4% 招牌球星溢價，並提高引退評價</b>。'+(removedCancer?'<br><b class="hl">你以長年貢獻重新贏回休息室信任，「更衣室毒瘤」解除。</b>':'')); board(1);
  }else if(S.traits.franchise&&!S.franchiseActive&&S.teamYears>=7){
    S.franchiseActive=true; S.franchiseTeamName=S.orgTeam;
    card('gold','神主牌效果恢復',`來到 <b class="hl">${S.orgTeam}</b> 的第七個頂級球季，你再一次成為城市無法割捨的招牌——<b class="hl">交易保護與 4% 合約溢價重新生效</b>。`); board(1);
  }

  /* ◯◯先生：同隊至少 15 季，且其中至少 2/3 是頂級聯盟球季。 */
  const mrEligible=isMrTeamEligible(S.teamSeasons,S.teamYears);
  if(!S.traits.mrteam&&mrEligible){ S.traits.mrteam=true; S.mrTeamName=S.orgTeam;
    const nick=teamNick(S.orgTeam);
    card('gold','隱藏稱號：'+nick+'先生',`在同一支球隊走過 <b class="hl">${S.teamSeasons}</b> 個球季，其中 <b class="hl">${S.teamYears}</b> 季站在頂級舞台。球迷不再喊你的名字，他們喊你「<b class="hl">${nick}先生</b>」——你就是這支球隊的代名詞。`); board(1);
  }

  /* ◯◯七彩球衣：同一聯盟生涯效力球隊數超標（中職>3、日職>5、美職>5）。 */
  if(!S.traits.rainbow){
    const RB={CPBL:['中職',3],NPB:['日職',5],MLB:['大聯盟',5]};
    for(const lg in RB){
      const n=Object.keys((S.teamTally&&S.teamTally[lg])||{}).length;
      if(n>RB[lg][1]){ S.traits.rainbow=true; S.rainbowLg=RB[lg][0];
        card('info','隱藏稱號：'+RB[lg][0]+'七彩球衣',`打開衣櫃，${n} 件不同的球衣掛在眼前——${RB[lg][0]}的球隊你快穿過一輪了。球迷笑稱你是「<b class="hl">七彩球衣</b>」：去到哪裡都能活下來，這也是一種本事。`); board(1); break; }
    }
  }
}
/* ---------- 季末 ---------- */
export function phaseEnd(){
  /* 球季模擬通常已做國際賽檢查；傷缺或其他特殊分支若跳過，這裡補做一次且不會重複。 */
  if(S.stage==='PRO'&&S.intlCheckedYear!==S.year){maybeIntl(()=>phaseEnd());return;}
  board(2);
  const workNet=(S.yearWorkIncome||0)-(S.yearWorkExpense||0);
  if(S.stage!=='ES'||S.yearWorkIncome||S.yearWorkExpense)card(workNet<0?'bad':'info','年度生活收支',`安排：<b class="hl">${S.workPlan||'專心練球'}</b>｜打工／額外收入：<b class="up">${(S.yearWorkIncome||0).toLocaleString()} 元</b>｜特訓與生活支出：<b class="dn">${(S.yearWorkExpense||0).toLocaleString()} 元</b>｜現金餘額：<b class="hl">${(S.cash||0).toLocaleString()} 元</b>。`);
  const outside=Math.round(S.yearOutsideIncome||0);
  const outsideText=outside?`<br>業外收入：<b class="hl">+${fmtMoney(outside)}</b>`:'';
  if(S.stage==='PRO'){
    if(!S.ct)S.ct=makeContract(1,1,S.lv,currentSalaryRating(S.lastD||0));
    const sal=contractAnnual(); /* 合約保證年薪：不因本季表現、受傷或能力變動而重算 */
    S.salary+=sal; S.cash=(S.cash||0)+sal*10000;
    let extra='';
    if(LV[S.lv].top&&S.seasonFactor>0){
      const tp=LV[S.lv].top,rates=teamChampRates(S.orgTeam,S.year);
      const result=seasonChampionshipResult(tp,S.year,rates,S.orgTeam,{championmaker:!!S.traits.championmaker,tradeRefuse:S.tradeRefuse>0});
      const titles=result.titlesFor(S.orgTeam);
      const seasonSummary=result.summaryFor?result.summaryFor(S.orgTeam):'';
      const teamPoints=professionalSeasonPoints(tp,seasonSummary,titles);
      S.pool=(S.pool||0)+teamPoints;
      S.teamSeasonHistory=S.teamSeasonHistory||[];S.teamSeasonHistory.push({y:S.year,team:S.orgTeam,lv:S.lv,summary:seasonSummary});
      const currentLog=[...(S.log||[])].reverse().find(r=>r.y===S.year&&r.st);if(currentLog)currentLog.teamSeason=seasonSummary;
      titles.forEach(t=>S.honors.push(`${S.year} ${t}`));
      if(titles.includes(result.finalTitle)){
        S.wonChamp=true; S.champThisTeam=true; S.champTeam=S.orgTeam; checkChampionTrait();
      }
      if(seasonSummary)extra=`<br>球隊本季結果：<b class="hl">${seasonSummary}</b>。`+(titles.length?`<br>球隊本季榮譽：<b class="hl">${titles.join('、')}</b>。`:``)+`<br>職業球季團隊成果：獲得能力點 <b class="hl">${teamPoints}</b> 點。`;
    }else if(!LV[S.lv].top){
      const result=minorSeasonResult(S.lv,S.year,S.orgTeam,{playerDelta:ovr()-LV[S.lv].par,impactMult:S.champImpactMult,seasonFactor:S.seasonFactor});
      if(result){
        const teamPoints=S.seasonFactor>0?result.points:0;
        S.pool=(S.pool||0)+teamPoints;
        S.teamSeasonHistory=S.teamSeasonHistory||[];S.teamSeasonHistory.push({y:S.year,team:S.orgTeam,lv:S.lv,summary:result.summary});
        const currentLog=[...(S.log||[])].reverse().find(r=>r.y===S.year&&r.st);if(currentLog)currentLog.teamSeason=result.summary;
        extra=`<br>球隊本季結果：<b class="hl">${result.summary}</b>。<br>二軍／小聯盟團隊成果：獲得能力點 <b class="hl">${teamPoints}</b> 點${S.seasonFactor<=0?'（本季未實際出賽，不取得團隊能力點）':''}。`;
      }
    }
    if(S.tradeRefuse>0)S.tradeRefuse--;
    if(S.tradeHeat>0)S.tradeHeat=Math.max(0,S.tradeHeat-5);
    card('','季末結算',`本年度薪資：<b class="hl">${fmtMoney(sal)}</b>（生涯累計 ${fmtMoney(Math.round(S.salary))}）${S.ct?`｜合約剩 ${Math.max(0,S.ct.yrs-1)} 年`:''}${S.org==='MiLB'?`｜組織控制剩 ${Math.max(0,S.orgControlRemaining||0)} 年`:''}${outsideText}${extra}`);
    board(2);
  }else if(S.stage==='AMA'){
    S.salary+=AMA_ANNUAL; S.cash=(S.cash||0)+AMA_ANNUAL*10000;
    card('','企業隊年度收入',`本年度工作年薪：<b class="hl">${fmtMoney(AMA_ANNUAL)}</b>（每月 4 萬；生涯累計 ${fmtMoney(Math.round(S.salary))}）。有時候你分不清，你是員工，還是球員？${outsideText}`);
    board(2);
  }
  /* 冠軍、薪資與國際賽都結算完畢後，先把本季記在原隊，再進入季末交易。 */
  if(S.stage==='PRO')updateTeamTenureTraits();
  const go=()=>S.stage==='PRO'?offseasonTradeCheck(()=>movement()):movement();
  if(S.pool>0){ const p=S.pos==='TW'?Math.max(1,Math.ceil(S.pool*clamp(Number(S.twoWaySeasonPointMult??1.5),.1,10))):S.pool; S.pool=0;
    choose('',[{t:`▸ 分配能力點（${p} 點·大賽／國際賽成果）`,main:true,f:()=>allocUI({pool:p},'季末能力點分配（大賽／國際賽成果）',go)}]); }
  else go();
}
/* ---------- 升降級與去向 ---------- */
export function finishContractYear(o){
  if(!S.ct)S.ct=makeContract(2,1,S.lv,currentSalaryRating(S.lastD||0));
  S.ct.yrs--;
  if(S.org==='MiLB'&&S.orgControlRemaining>0)S.orgControlRemaining--;
  if(S.ct.annualSchedule&&S.ct.annualSchedule.length)S.ct.annualSchedule.shift();
  /* 母隊延長/換約時機:多年約跑到倒數第二年、或最後一張約剩1年,可談延長 */
  if(S.ct.yrs===1&&LV[S.lv].top&&!S.ct.extOffered&&S.faElig&&(S.lastD||0)>=1&&chance(45)){
    S.ct.extOffered=true; extensionOffer(o); return;
  }
  if(S.ct.yrs<=0){
    if(S.org==='MiLB'){
      if((S.orgControlRemaining||0)<=0){S.faElig=true;card('info','美職組織控制期結束','球團控制年限已結束，你正式取得自由球員資格，可以選擇台灣、日本、美國或引退。');faFlow(o);return;}
      const renewalD=currentSalaryRating(S.lastD||0),renewalAnnual=Math.max(levelMinAnnual(S.lv),controlledAnnual(S.lv,renewalD,1));
      S.ct=makeContract(1,1,S.lv,renewalD,renewalAnnual,{controlled:true});
      card('info','美職球團行使續約權',`原合約已到期；你仍在 <b class="hl">${S.orgTeam}</b> 的組織控制期內（剩餘 ${S.orgControlRemaining} 年），球團提出固定年薪 <b class="hl">${fmtMoney(S.ct.annual)}</b> 的一年續約。下季仍可能依表現升降級或遭到釋出。`);board(1);
    }else if(LV[S.lv].top){
      if(S.faElig){ faFlow(o); return; }
      /* 菜鳥5年內:球團行使續約權,續短約,薪資不低於層級基數 */
      const renewalProfile=contractMarketProfile(S.lastD||0), renewalD=renewalProfile.rating, renewalAnnual=controlledAnnual(S.lv,renewalD,renewalProfile.aav);
      S.ct=makeContract(ri(1,2),1,S.lv,renewalD,renewalAnnual,{extOffered:false,controlled:true});
      card('info','球團續約',`你仍在選秀球隊掌控期（服務 ${S.svc}/5 年），球團依服務年資與近年表現行使續約權——固定年薪 <b class="hl">${fmtMoney(S.ct.annual)}</b> × <b class="hl">${S.ct.yrs} 年</b>，合約總額 <b class="hl">${fmtMoney(S.ct.annual*S.ct.yrs)}</b>。`); board(1);
    } else { S.ct=makeContract(ri(1,2),1,S.lv,currentSalaryRating(S.lastD||0)); } /* 非頂級層級 */
  }
  crossOffers(o);
}
export function movement(){
  const o=ovr();
  if(S.stage==='ES'){ if(S.stageYr<6)advance(); else schoolTransition('MS'); return; }
  if(S.stage==='MS'){ if(S.stageYr<3)advance(); else schoolTransition('HS'); return; }
  if(S.stage==='HS'){ if(S.stageYr<3)advance(); else pathChoiceHS(); return; }
  if(S.stage==='U'){ if(S.stageYr<4)advance(); else pathChoiceU4(); return; }
  if(S.stage==='AMA'){
    const amaMenu=()=>choose('業餘成棒年度結束｜選擇下季道路',[
      {t:'留在原業餘球隊',main:true,f:advance},
      {t:'轉往其他業餘球隊',f:()=>amateurTeamChoice(advance,amaMenu)},
      {t:'再次投入中職選秀',f:()=>draftChoice('CPBL',false,r=>r==='ok'?advance():amaMenu(),amaMenu)},
      ...(S.schoolCountry==='JP'?[{t:'參加日本職棒選秀',f:()=>draftChoice('NPB',false,r=>r==='ok'?advance():amaMenu(),amaMenu)}]:[{t:'申請日職球團測試',f:()=>npbTest(advance,amaMenu)}]),
      {t:'參加美職體系測試',f:()=>usaTestFlow(advance,amaMenu)},
      {t:'高掛球鞋',warn:true,f:()=>endGame('在業餘球隊劃下句點。')}]);
    amaMenu();
    return;
  }
  /* 職業 */
  if(S.org==='NPB')S.npbYears++;
  if(LV[S.lv].top){ /* 轉換聯盟：直接解除球團 5 年控制期限制，往後只要合約到期就是自由球員 */
    if(S.svcOrg && S.svcOrg!==S.org){ S.faElig=true; }
    S.svcOrg=S.org;
    S.svc=(S.svc||0)+1; if(S.svc>=5)S.faElig=true;
  }
  if(S.skipMid){ finishContractYear(o); return; } /* 復健年不升降級，但照常累積年資、消耗合約年度與處理到期續約。 */
  if(o<30){ buyoutRemaining(1); endGame('能力已跌破中職二軍最低水準，'+S.year+' 年球季後遭釋出，被迫引退。'); return; }
  const path=PATHS[S.org], idx=path.indexOf(S.lv);
  let minReq=LV[S.lv].min;
  if(S.org==='NPB'&&S.npbYears>=8){ minReq-=4; }
  const perf=(S.seasonFactor>=0.5)?(S.lastD||0):null; /* 傷缺季不看成績 */
  /* 得獎保護傘:當季拿過個人獎項(MVP/王/最佳投手,不含明星賽)→絕不下放/釋出 */
  const wonAward = S.honors.some(x=>x.startsWith(String(S.year))&&/王|MVP|賽揚|澤村|最佳投手|最佳打者|金手套|守備聖經/.test(x)&&!/明星賽/.test(x));
  /* Fix C:實際成績達標保護傘——用當季真實數據(不看能力 d),打得好就不下放 */
  let goodReal=false;
  { const st=S.lastSt;
    if(st&&S.seasonFactor>=0.5){
      if(S.pos==='P'){
        const era=baseballERA(st)??99, whip=baseballWHIP(st)??99;
        /* 投手:ERA 或 WHIP 達聯盟一線水準,或有一定救援/中繼產能 */
        if(era<=4.20||whip<=1.35||(st.SV||0)>=15||(st.HLD||0)>=15)goodReal=true;
      }else{
        const obp=st.PA>0?(st.H+st.BB)/st.PA:0, slg=slgOf(st), ops=obp+slg;
        /* 野手:OPS 達聯盟主力水準(.720+),或雙位數轟/盜等實質產能 */
        if(ops>=0.720||st.HR>=12||st.SB>=15||st.RBI>=(LV[S.lv].g>=150?70:55))goodReal=true;
      }
    }
  }
  if(wonAward||goodReal){ /* 拿獎 或 帳面成績達標 → 球團不會處理掉 */ }
  else if(o<minReq){
    if(perf!==null&&perf>=0){ /* 帳面成績夠好,球團續留觀察 */
      card('info','球團評估',`體能檢測數字亮紅燈，但你用<b class="hl">實際成績</b>說話——本季表現達聯盟水準，球團決定續留一線觀察。`);
    }else{ handleDemotion(o,path,idx); return; }
  }else if(perf!==null&&perf<=-6&&chance(55)){ /* 能力還在但成績崩盤,一樣會被下放 */
    card('bad','球團評估','帳面數據遠低於聯盟水準，教練團失去耐心。');
    handleDemotion(o,path,idx); return;
  }
  /* 升級：能力門檻 ＋ 帳面成績（壓倒性表現可連跳兩級）
     舊版只看 ovr 與能力值 d，等於「體檢過關就上一軍」，實際打得如何完全不影響。
     現在是兩道關卡：能力達標之後還要看當季真實數據(seasonGrade)，打不出來就再練一年；
     反過來，能力檢測差最多 3 點但成績壓倒性，球團會破格拔擢——真實棒球的「打出來的」升法。

     判定順序刻意是「先看能力是否遠超門檻，再看樣本是否足夠，最後才看成績」：
     ① 能力已達「再下一級」的門檻(overQual) → 無條件升級。這種球員留在原層級沒有任何
        意義，不該被一次擲骰卡住（實例：能力 62 的外野手在 1A，連大聯盟門檻 56 都過了，
        卻因為受傷只出賽 25 場而被留隊）。
     ② 樣本不足(grade<0：傷缺季或打席/局數太少) → 無從論斷成績，回到看能力的舊行為。
     ③ 樣本足夠 → 依成績評等決定機率。
     ②③ 必須分開，否則「打擊率 .358 但只出賽 25 場」會被當成「成績普通」，
     跳出的訊息還會反過來說他帳面成績不夠好。 */
  if(idx<path.length-1){ const nx=path[idx+1];
    const grade=S.lastSt?seasonGrade(S.lastSt,S.lv):-1;
    const abilityOK=o>=LV[nx].min;
    const nx2=idx<path.length-2?path[idx+2]:null;
    /* 遠超門檻＝已達再下一級的標準；沒有再下一級時以 min+5 代之(各層級間距約 4~5)。 */
    const overQual=abilityOK&&(nx2?o>=LV[nx2].min:o>=LV[nx].min+5);
    const forced=!abilityOK&&o>=LV[nx].min-3&&grade>=3;
    let promote=false;
    if(abilityOK){
      if(overQual)promote=true;                    /* ① 能力遠超門檻 */
      else if(grade<0)promote=chance(85);          /* ② 樣本不足:看能力 */
      else promote=grade>=3?true:grade===2?chance(90):grade===1?chance(70):chance(25);
    }
    else if(forced)promote=chance(55);
    if(!promote&&abilityOK){
      if(grade<0)card('info','球團評估',`體能檢測已達 <b>${LV[nx].n}</b> 的標準，但本季<b class="hl">出賽場數不足</b>，球團看不到足夠的樣本——再打一個完整球季。`);
      else if(grade<=1)card('info','球團評估',`體能檢測已達 <b>${LV[nx].n}</b> 的標準，但帳面成績還沒說服教練團——<b class="hl">再打一年給他們看</b>。`);
    }
    if(promote){
      let to=nx;
      /* 連跳兩級:成績壓倒性,或能力已明顯凌駕再下一級(受傷球季也給得到) */
      if(nx2&&o>=LV[nx2].min+2&&(grade>=3||o>=LV[nx2].min+6))to=nx2;
      if(to==='MLB'&&!mlbEntryStatus().ok){to='A3';card('info','大聯盟身分門檻',`能力已達標，但${mlbEntryStatus().reason}本季先留在 3A。`);}
      const oldAnnual=S.ct?(S.ct.annualSchedule&&S.ct.annualSchedule.length?S.ct.annualSchedule[0]:S.ct.annual):null;
      S.lv=to;
      if(forced)card('good','破格拔擢','體能檢測的數字還差一點，但你的成績讓球團無法忽視——<b class="hl">直接把你拉上去</b>。');
      card('good','升級通知',`表現獲得肯定，${to!==nx?'<b class="hl">連跳兩級</b>':'晉升'} <b class="hl">${LV[to].n}</b>！`); board(2);
      if(S.ct&&Number.isFinite(oldAnnual)&&levelMinAnnual(to)>oldAnnual){
        const raised=contractAnnual();
        card('info','升級薪資保障',`原合約固定年薪 <b>${fmtMoney(oldAnnual)}</b> 低於 ${LV[to].n}保障標準；自下季起調整為 <b class="hl">${fmtMoney(raised)}</b>，後續即使下放也不會再降回原薪。`);
      }
      if(LV[to].top)tlNote(2,'升上'+LV[to].n);
      if(S.traits.yips){ removeTrait('yips','失憶症'); card('good','走出陰影','將身體與心靈重新來過，終於爬回了原本的高度，——<b class="hl">失憶症痊癒</b>。'); } } }
  finishContractYear(o);
}
