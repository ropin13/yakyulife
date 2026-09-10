import {R, ri} from './rng.js?v=offline-0.31.0';
import {POS_AB,POTENTIAL_MAX} from '../data/abilities.js?v=offline-0.31.0';
import {LV,TW_HS_SCHOOLS,schoolList,schoolTier} from '../data/teams.js?v=offline-0.31.1';

/* ================= 遊戲狀態 ================= */
export let S=null, stepQ=[];
export function setS(v){ S=v; }
export function newState(name,jersey,pos,role,setup){
  setup=setup&&typeof setup==='object'?setup:{stage:'HS',country:'TW',school:String(setup||'')};
  const stage=['ES','MS','HS','U'].includes(setup.stage)?setup.stage:'HS';
  const country=setup.country==='JP'?'JP':'TW';
  const ranges={ES:[5,13],MS:[12,23],HS:[20,32],U:[28,40]},ages={ES:7,MS:13,HS:16,U:19};
  const [lo,hi]=ranges[stage],ab={}; POS_AB[pos].forEach(k=>ab[k]=ri(lo,hi));
  const boost=stage==='ES'?2:stage==='MS'?4:6;
  if(pos==='P'||pos==='TW'){ab.vel+=ri(0,boost);ab.brk+=ri(0,Math.max(2,boost-2));}
  if(pos!=='P'){ab.con+=ri(0,boost);ab.pow+=ri(0,Math.max(2,boost-2));}
  /* OOTP 式潛力天花板:洗牌後 1 項頂尖工具、1 項優質、1 項中上,其餘平庸 */
  /* 捕手沿用一般野手的 8 項潛力分配，但以配球取代守備範圍的席位；額外的守備範圍只給低上限。 */
  const pot={}, sh=(pos==='C'?POS_AB[pos].filter(k=>k!=='rng'):POS_AB[pos].slice());
  for(let i=sh.length-1;i>0;i--){const j=Math.floor(R()*(i+1));const t=sh[i];sh[i]=sh[j];sh[j]=t;}
  if(pos==='P'){
    /* 投手只有 4 項能力,天花板更集中:1 項招牌武器,其餘明顯壓低,避免動輒雙 70/四滿天賦 */
    sh.forEach((k,i)=>{ pot[k]= i===0?ri(70,80) : i===1?ri(58,68) : i===2?ri(50,60) : ri(44,54); });
  } else if(pos==='TW'){
    const pitch=['vel','ctl','brk','sta'].sort(()=>R()-.5),bat=['con','pow','eye','spd','rng','fld','arm'].sort(()=>R()-.5);
    pitch.forEach((k,i)=>pot[k]=i===0?ri(68,80):i===1?ri(58,70):ri(46,62));
    bat.forEach((k,i)=>pot[k]=i===0?ri(68,80):i===1?ri(60,72):i===2?ri(54,66):ri(44,60));
  } else {
    sh.forEach((k,i)=>{ pot[k]= i===0?ri(72,80) : i===1?ri(64,74) : i===2?ri(56,68) : ri(46,62); });
    if(pos==='C')pot.rng=ri(32,40); /* 不參與頂尖工具洗牌，初始守備範圍潛力永不超過 40 */
  }
  /* 開局倍率只在角色誕生時套用一次；之後年度成長不會重複乘算。 */
  const startPotentialMult=Math.max(.1,Math.min(3,Number(setup.startPotentialMult)||1));
  Object.keys(pot).forEach(k=>pot[k]=Math.min(POTENTIAL_MAX,Math.max(1,Math.round(pot[k]*startPotentialMult))));
  /* 高中固定分級表(隱藏):T1 名門 +6 / T2 中堅 ±0 / T3 弱旅 -6 */
  const hsMap=Object.fromEntries(TW_HS_SCHOOLS.map((s,i)=>[s,i<4?1:i<9?2:3]));
  const list=schoolList(stage,country),myTeam=(setup.school||'').trim()||list[Math.floor(R()*list.length)];
  const birthYear=Math.max(1972,Math.trunc(Number(setup.birthYear)||2010));
  const startYear=birthYear+ages[stage];
  return {name,jersey,pos,role:pos==='P'?null:null,birthYear,age:ages[stage],year:startYear,stage,stageYr:1,pot,startPotentialMult,
    hsMap,hsTier:stage==='HS'?schoolTier(myTeam,stage,country):2,schoolTier:schoolTier(myTeam,stage,country),team:myTeam,schoolCountry:country,potSum0:Object.values(pot).reduce((a,b)=>a+b,0),
    league:null,org:null,orgTeam:null,lastCpblTeam:null,teamTally:{CPBL:{},NPB:{},MLB:{}},champImpactMult:1,draftIntentMult:3,
    twoWay:pos==='TW',twoWayBatPos:null,twoWayPointsMult:pos==='TW'?1.5:1,twoWayWorkloadMult:.6,
    twoWayDiceMult:1.5,twoWaySeasonPointMult:1.5,twoWayWorkIncomeMult:1.5,
    twoWayInjuryMult:1,twoWayBatMinStamina:50,contractUsage:pos==='TW'?'TW':pos,intlUsage:null,
    twoWayAmateurImpactMult:1,twoWayIntlImpactMult:1,twoWayProImpactMult:1,twoWayContractThresholdReduction:1,
    pitcherAwardMult:1,mvpAwardMult:1,intlTryoutMult:1,potentialCostMult:.1,amateurTournamentMult:1,proAwardPointMult:1,intlAwardThresholdReductionMult:1,
    potentialPivotAge:30,potentialYearMin:0,potentialYearMax:2,annualStatFontSize:13,
    declineStartAge:32,declineStartValue:2,declineStepMult:.5,
    bulkAbilityValue:60,bulkPotentialValue:60,
    seasonBatAvgVarPct:0,seasonBatHrRateVarPct:0,seasonBatGamesVarPct:0,seasonBatSbVarPct:0,
    seasonPitchEraVarPct:0,seasonPitchStarterIpgVarPct:0,seasonPitchReliefIpgVarPct:0,
    seasonPitchK9VarPct:0,seasonPitchBb9VarPct:0,seasonPitchH9VarPct:0,seasonPitchWinProbVarPct:0,
    intlBatAvgVarPct:0,intlBatHrRateVarPct:0,
    intlPitchEraVarPct:0,intlPitchStarterIpgVarPct:0,intlPitchReliefIpgVarPct:0,
    intlPitchK9VarPct:0,intlPitchWinProbVarPct:0,intlChampionMult:1,wbcChampionMult:1,
    backupMode:'prompt',backupInterval:1,backupKeep:3,backupLastYear:null,
    healthCareMult:1,healthCarePlan:'normal',medicalNormalReductionPct:0,medicalProReductionPct:30,medicalFullReductionPct:60,medicalTwoWayReductionPct:80,universityGraduated:false,pendingAbilityPenalty:0,pendingAbilityPenaltyYear:null,
    teamSeasonHistory:[],orgControlRemaining:0,
    ab,traits:{genius:false,glass:false,iron:false,scum:false,
      late:false,disc:false,academy:false,intlace:false,franchise:false,clutch:false,favorite:false,phoenix:false,combo:false,onetool:false,rubber:false,legend:false,
      oldghost:false,adking:false,miraclegen:false,strongpitch:false,stronghit:false,championmaker:false,
      yips:false,distract:false,cancer:false,ambience:false,goldcloth:false,thief:false,mrteam:false,confidante:false,smallschool:false,grinder:false,rainbow:false,taiwan:false,pitcherTC:false,hitterTC:false},
    removed:[], /* 被覆蓋/解除的特性,結算畫刪除線 */
    cntSave:0,cntSaveWin:0,cntNormWin:0,cntSnack:0,cntBoldWin:0,cntBoldFail:0,cntSocialBoldFail:0,cntEndorseBoldWin:0,
    hsChampions:0,oldGhostPending:false,oldGhostUsed:false,samePick:0,samePickKey:null,
    teamSeasons:0,teamYears:0,franchiseActive:false,franchiseTeamName:null,
    six:0,bigInj:0,ironStreak:0,npbYears:0,
    injNext:0,tmpInj:0,rehab:0,marketInjury:'healthy',injuryRateMode:'auto',injuryRateCustom:0,
    salary:0,cash:0,outsideIncome:0,yearOutsideIncome:0,yearWorkIncome:0,yearWorkExpense:0,workPlan:null,workDicePenalty:0,workTrainMarkup:0,workSeasonPenalty:0,trainingYear:null,trainingSpent:0,trainingPointsUsed:0,breakthroughYear:null,pool:0,pendStat:0,seasonFactor:1,npbDraftControlRemaining:0,
    stats:{CPBL:null,NPB:null,MLB:null,MINOR:null},honors:[],legendLeagues:[],pitcherTCLeagues:[],hitterTCLeagues:[],intlCount:0,intlLock:null,intlCheckedYear:null,intlStat:{G:0,PA:0,AB:0,H:0,HR:0,RBI:0,IP:0,SO:0,ER:0,W:0,SV:0},intlLog:[],intlBest:null,dpos:null,dposYears:{},roleYears:{},tradeRefuse:0,champThisTeam:false,svc:0,svcOrg:null,faElig:false,tradeHeat:0,complainCount:0,demotionRefused:false,tj:0,tjCount:0,tjCrises:0,tjSecondYear:null,tjLockZero:false,effort:'普通投',tjSuccess:0,lastLv:null,love:{st:'single',partner:null,kids:0,childList:[],caught:0,affairs:0,exes:[],dyrs:0,datedTimes:0,contacts:[],primaryId:null,aff:0,loveSaveUsed:false,marriageSaveUsed:false,pregnancy:null,interactedThisYear:{},yearInteractions:0},traits2:{},log:[],ct:null,done:false};
}
export function playerName(){ return `${S.name} #${S.jersey}`; }
export function blankStat(){return {yr:0,G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,AS:0,DEF:0,DPG:{},pitchG:0,batG:0,pitchH:0,pitchBB:0,twoWayYears:0};}
export function bucketOf(lv){ const l=lv&&LV[lv]; return l&&l.top?l.top:'MINOR'; } /* 業餘引退時 lv 為空,歸類 MINOR */
export function nextStep(){ if(S.done){ stepQ=[]; return; } /* 已引退:清空後續步驟,不再跑續約/結算 */ const f=stepQ.shift(); if(f)f(); }
export function stageLabel(){
  const jp=S.schoolCountry==='JP'?'日本':'';
  if(S.stage==='ES')return jp+'小'+['一','二','三','四','五','六'][S.stageYr-1];
  if(S.stage==='MS')return jp+'國'+['一','二','三'][S.stageYr-1];
  if(S.stage==='HS')return jp+'高'+['一','二','三'][S.stageYr-1];
  if(S.stage==='U')return jp+'大'+['一','二','三','四'][S.stageYr-1];
  if(S.stage==='AMA')return '業餘成棒';
  return LV[S.lv].n;
}
