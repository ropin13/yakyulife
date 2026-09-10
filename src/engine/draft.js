import {S} from '../core/state.js?v=offline-0.31.1';
import {R, ri, pick, chance} from '../core/rng.js?v=offline-0.31.1';
import {CPBL_TEAMS,NPB_TEAMS,MLB_TEAMS,AMA_TEAMS,LV,schoolList,schoolTier} from '../data/teams.js?v=offline-0.31.1';
import {card, choose, board, menuModal} from '../ui/dom.js?v=offline-0.31.1';
import {tlNote,tlRestage} from '../ui/timeline.js?v=offline-0.31.1';
import {ovr, playerType} from './ability.js?v=offline-0.31.1';
import {primaryPos} from './career.js?v=offline-0.31.1';
import {fmtMoney, makeOffers, pickOfferUI, signTo, mlbEntryStatus} from './contract.js?v=offline-0.31.1';
import {startYear} from '../flow/phases.js?v=offline-0.31.1';
import {endGame} from '../ui/retire.js?v=offline-0.31.1';
/* ---------- 選秀與生涯路口 ---------- */
const STAGE_N={MS:'國中',HS:'高中',U:'大學'};
function chooseRookieUsage(lv,title,onChoose,onBack){
  if(S.pos!=='TW'){onChoose(S.pos);return;}
  const a=S.ab||{},pit=(a.vel+a.ctl+a.brk)/3,hit=a.con*.5+a.pow*.2+a.eye*.18+a.spd*.12,min=LV[lv].min;
  const option=(usage,label,value,needBoth=false)=>{const need=needBoth?Math.max(0,min-Number(S.twoWayContractThresholdReduction??1)):min,ok=needBoth?pit>=need&&hit>=need:value>=need;return {t:`${label}${ok?'':'（球團拒絕）'}`,main:usage==='TW'&&ok,warn:!ok,s:needBoth?`投手 ${pit.toFixed(1)}／打者 ${hit.toFixed(1)}，兩項都須達 ${need}（原門檻 ${min}）`:`評估 ${value.toFixed(1)}／最低 ${need}`,f:()=>{if(!ok){card('bad','登錄身分未獲同意',needBoth?'投打兩項都必須達到二刀流合約門檻。':`${label}評估尚未達到球團門檻。`);chooseRookieUsage(lv,title,onChoose,onBack);return;}S.contractUsage=usage;onChoose(usage);}};};
  choose(`${title}｜選擇合約出賽身分`,[
    option('P','投手身分',pit),option('H','打者身分',hit),option('TW','二刀流身分',0,true),
    ...(onBack?[{t:'← 返回上一頁',f:onBack}]:[])
  ]);
}
function setSchool(stage,country,school){
  S.stage=stage; S.stageYr=0; S.schoolCountry=country; S.team=school;
  S.schoolTier=schoolTier(school,stage,country); S.hsTier=stage==='HS'?S.schoolTier:2;
}
export function chooseSchool(stage,country,title,after,back){
  const opts=schoolList(stage,country).map((school,i)=>({t:school,s:i<4?'傳統名校｜競爭激烈':i<9?'中堅球隊｜機會均衡':'新興球隊｜容易取得出賽',f:()=>{setSchool(stage,country,school);card('info','升學',`你決定前往 <b class="hl">${school}</b>，展開${country==='JP'?'日本':''}${STAGE_N[stage]}生涯。`);after();}}));
  opts.push({t:'自訂學校名稱',main:true,s:'輸入你想就讀的學校',f:()=>{const school=(prompt('請輸入學校名稱')||'').trim();if(!school){chooseSchool(stage,country,title,after,back);return;}setSchool(stage,country,school);card('info','升學',`你決定前往 <b class="hl">${school}</b>。`);after();}});
  if(back)opts.push({t:'← 返回上一頁',f:back});
  choose(title,opts);
}
export function schoolTransition(stage,back){
  choose(`選擇下一階段：${STAGE_N[stage]}`, [
    {t:`留在台灣就讀${STAGE_N[stage]}`,main:true,f:()=>chooseSchool(stage,'TW','選擇台灣學校',advance,()=>schoolTransition(stage,back))},
    {t:`前往日本就讀${STAGE_N[stage]}`,s:'適應、語言與競爭都是全新的挑戰',f:()=>chooseSchool(stage,'JP','選擇日本學校',advance,()=>schoolTransition(stage,back))},
    ...(back?[{t:'← 返回上一頁',f:back}]:[])
  ]);
}
export function usaEntryLv(o){return o>=50?'A3':o>=43?'A2':o>=36?'A1':'R';}
function weightedTeam(teams,preferred){
  const mult=Math.max(1,Math.min(100,Number(S.draftIntentMult??3)));
  if(!preferred||!teams.includes(preferred)||mult<=1)return pick(teams);
  const total=teams.length-1+mult,roll=R()*total;
  if(roll<mult)return preferred;
  return pick(teams.filter(t=>t!==preferred));
}
export function runDraft(fromSchool,cb,preferred=null){
  const o=ovr(); const score=o+Math.max(0,22-S.age)*2+ri(-4,4);
  /* 綜合與年齡先形成選秀評價，再在相鄰輪次內波動。頂尖球員較容易首輪，
     但不再只要跨過門檻就百分之百固定第一輪。 */
  const rd=score>=64?(chance(70)?1:2)
    :score>=58?(chance(35)?1:2)
    :score>=53?(chance(10)?1:ri(2,3))
    :score>=48?ri(2,4)
    :score>=43?ri(3,5)
    :score>=37?ri(5,7)
    :score>=30?ri(8,10):0;
  if(rd===0){
    card('bad','選秀落榜',`唱名一輪又一輪，始終沒有你的名字。（綜合 ${o}｜年齡加權後評價 ${score}）`);
    if(fromSchool){ card('info','','本次沒有獲得指名，可以返回大學繼續磨練或選擇其他道路。'); cb('fail'); }
    else cb('fail');
    return;
  }
  const bonus=[0,1000,600,350,350,150,150,150,50,50,50][rd]||50;
  const lv=(rd===1&&o>=50)?'CPBL1':'CPBL2';
  const team=weightedTeam(CPBL_TEAMS,preferred);
  const accept=()=>chooseRookieUsage(lv,`${team}・第 ${rd} 輪`,()=>{
    S.stage='PRO'; S.team=''; S.salary+=bonus; S.cash=(S.cash||0)+bonus*10000; S.svc=0; S.faElig=false;
    signTo('CPBL',lv,team,ri(2,3),1); /* 菜鳥分段短約(2~3年) */
    card('gold','中華職棒選秀會',`第 <b class="hl">${rd}</b> 輪獲 <b class="hl">${team}</b> 指名！簽約金依順位為 <b class="hl">${fmtMoney(bonus)}</b>。${lv==='CPBL1'?'即戰力評價，直接放入一軍名單。':'先從二軍出發。'}`);
    tlNote(4,'選秀第'+rd+'輪');
    board(0); cb('ok');
  });
  /* 輪次不滿意(第 3 輪以後)可選擇重返業餘再拚一年;年齡太大(24+)則不給這選項,避免拖太久 */
  if(rd>=3 && S.age<24){
    choose(`中華職棒選秀會 · 第 ${rd} 輪獲 ${team} 指名`,[
      {t:'接受指名，加盟球隊',main:true,s:`簽約金 ${fmtMoney(bonus)}｜${lv==='CPBL1'?'一軍':'二軍'}出發`,f:accept},
      {t: (S.stage==='HS'||(S.stage==='U'&&S.stageYr<4))?'重返校園，再拚一年':'重返業餘，再拚一年',warn:true,s:'放棄本次指名，明年重新參加選秀',f:()=>{
        const goUni = (S.stage==='HS')||(S.stage==='U'&&S.stageYr<4);
        const fresh = (S.stage==='HS');
        card('info', goUni?'重返校園':'重返業餘', `看到被選到的輪次，雙眼發黑，原本以為會在前段輪次被選中，卻落到了後段的輪次。你握緊了拳頭，決定${goUni?(fresh?'進入大學繼續深造':'留在校隊繼續磨練'):'重返業餘'}，這一次，你一定要上台戴上所屬球隊的帽子。`);
        if(fresh){ S.stage='U'; S.stageYr=0; S.team=pick(['文化大學','輔仁大學','國立體大','台灣體大','開南大學']); }
        else if(!goUni){ S.stage='AMA'; S.team=pick(['合電','台庫','安妞先物','美麗珊瑚']); }
        if(fromSchool) cb('reject'); else advance();
      }}]);
    return;
  }
  accept();
}
export function runNpbDraft(cb,preferred=null){
  const o=ovr(),jp=S.schoolCountry==='JP';
  if(!jp){card('bad','日職選秀資格','台灣學校畢業生原則上走國際自由球員、入團測試或主動洽談；曾在日本長期就學才具選秀資格。');cb('ineligible');return;}
  /* 同一能力區間仍保留球探評價波動；第一指名只屬於真正頂尖候選人，
     不再因單一固定門檻讓大量球員每次都成為第一指名。 */
  const evalScore=o+ri(-4,4);let kind='',bonus=0,lv='NPB2',round=0;
  if(evalScore>=61){round=chance(75)?1:2;}
  else if(evalScore>=56){round=chance(35)?1:ri(2,3);}
  else if(evalScore>=51){round=chance(8)?1:ri(2,4);}
  else if(evalScore>=46){round=ri(4,6);}
  else if(evalScore>=42){round=ri(6,7);}
  if(round){kind=round===1?'第一指名':`第 ${round} 輪支配下指名`;bonus=[0,1000,700,550,400,300,220,150][round];lv=round<=2&&o>=52?'NPB1':'NPB2';}
  else if(evalScore>=38||chance(Math.max(2,(o-30)*3))){kind=`育成第 ${ri(1,3)} 輪指名`;bonus=evalScore>=42?100:50;}
  if(!kind){card('bad','日本職棒選秀','最後一輪唱名結束，沒有球團指名。你仍可選擇社會人球隊、回台選秀或接受球團測試。');cb('fail');return;}
  const team=weightedTeam(NPB_TEAMS,preferred),accept=()=>chooseRookieUsage(lv,`${team}・${kind}`,()=>{S.stage='PRO';S.team='';S.salary+=bonus;S.cash=(S.cash||0)+bonus*10000;S.svc=0;S.faElig=false;S.npbDraftControlRemaining=6;signTo('NPB',lv,team,6,1);card('gold','日本職棒選秀',`<b class="hl">${team}</b>以${kind}選中你。簽約金 ${fmtMoney(bonus)}，${lv==='NPB1'?'一軍':'二軍／育成'}起步。`);tlNote(4,'日職'+kind);board(0);cb('ok');});
  choose(`日本職棒選秀｜${team}・${kind}`,[
    {t:'接受指名，加盟球隊',main:true,s:`簽約金 ${fmtMoney(bonus)}`,f:accept},
    {t:'拒絕指名，選擇其他道路',warn:true,s:'本次指名失效',f:()=>cb('reject')}
  ]);
}
export function draftChoice(kind,fromSchool,cb,back){
  const teams=kind==='NPB'?NPB_TEAMS:CPBL_TEAMS,label=kind==='NPB'?'日本職棒':'中華職棒';
  const run=preferred=>kind==='NPB'?runNpbDraft(cb,preferred):runDraft(fromSchool,cb,preferred);
  const mode=()=>choose(`${label}選秀｜選擇參選方式`,[
    {t:'隨機選秀',main:true,s:'所有球隊採相同權重',f:()=>run(null)},
    {t:'設定意向球隊',s:`意向隊權重目前為 ${Math.max(1,Math.min(100,Number(S.draftIntentMult??3)))} 倍；仍不保證獲該隊指名`,f:()=>teamPage()},
    {t:'← 返回上一頁',f:back}
  ]);
  const teamPage=()=>choose(`${label}選秀｜選擇意向球隊`,[
    ...teams.map(team=>({t:team,s:`意向權重 ${Math.max(1,Math.min(100,Number(S.draftIntentMult??3)))} 倍`,f:()=>run(team)})),
    {t:'← 返回參選方式',f:mode}
  ]);
  mode();
}
export function amateurTeamChoice(after,back){
  const join=team=>{S.stage='AMA';S.team=team;S.org=null;S.orgTeam=null;S.lv=null;S.ct=null;card('good','加入台灣業餘成棒',`你加入 <b class="hl">${team}</b>，一邊工作、一邊繼續等待職業舞台。`);after();};
  choose('台灣業餘成棒｜選擇球隊',[
    ...AMA_TEAMS.map(team=>({t:team,f:()=>join(team)})),
    {t:'🎲 隨機球隊',main:true,f:()=>join(pick(AMA_TEAMS))},
    {t:'← 返回上一頁',f:back}
  ]);
}
export function usaTestFlow(after,back){
  const o=ovr(),levels=[['R','新人聯盟'],['A1','1A'],['A2','2A'],['A3','3A'],['MLB','大聯盟']];
  const levelPage=()=>choose(`美職體系測試｜選擇挑戰層級<div style="margin-top:7px;color:var(--dim);font-size:13px">目前綜合：<b class="hl">${o}</b></div>`,[
    ...levels.map(([lv,label])=>{const identity=lv!=='MLB'||mlbEntryStatus().ok,eligible=o>=LV[lv].min&&identity;return {t:label,main:eligible,s:eligible?`最低門檻 ${LV[lv].min}｜可以參加測試`:o<LV[lv].min?`門檻不足｜最低 ${LV[lv].min}，目前 ${o}`:`身分門檻不足｜${mlbEntryStatus().reason}`,f:()=>{
      if(!eligible){card('bad','測試資格不足',o<LV[lv].min?`目前綜合 <b>${o}</b>，尚未達到 ${label} 最低門檻 <b class="dn">${LV[lv].min}</b>。`:`目前能力足夠，但${mlbEntryStatus().reason}`);levelPage();return;}teamPage(lv,label);
    }};}),{t:'← 返回上一頁',f:back}
  ]);
  const teamPage=(lv,label)=>{const sign=team=>{
    const pct=Math.max(15,Math.min(95,45+(o-LV[lv].min)*7));
    if(!chance(pct)){card('bad',`${label}測試未通過`,`你選擇挑戰 <b>${team}</b> 體系，但本次測試未獲合約（成功率 ${pct}%）。可以返回改試其他球團或層級。`);teamPage(lv,label);return;}
    const bonus=Math.max(50,Math.round(1500-(S.age-18)*250));chooseRookieUsage(lv,`${team}・${label}`,()=>{S.stage='PRO';S.team='';S.svc=0;S.faElig=false;signTo('MiLB',lv,team,1,1);S.orgControlRemaining=6;
    S.salary+=bonus;S.cash=(S.cash||0)+bonus*10000;
    card('gold','美職測試合格',`<b class="hl">${team}</b> 提供 ${label} 合約；簽約金 ${fmtMoney(bonus)}。初始組織控制期為 <b class="hl">6 年</b>。`);after();},()=>teamPage(lv,label));};
    choose(`${label}｜選擇測試球團`,[
      ...MLB_TEAMS.map(team=>({t:team,s:`參加 ${team} 的 ${label} 測試`,f:()=>sign(team)})),
      {t:'🎲 隨機球團',main:true,f:()=>sign(pick(MLB_TEAMS))},
      {t:'← 返回層級選擇',f:levelPage}
    ]);
  };
  levelPage();
}
export function npbTest(after,back){
  const o=ovr();
  const pct=Math.max(5,Math.min(75,10+(o-35)*9));
  if(!chance(pct)){card('bad','日職入團測試',`測試未通過（成功率 ${pct}%）。球探建議先累積比賽經驗。`);back();return;}
  const sign=team=>chooseRookieUsage('NPB2',`${team}・日職入團測試`,()=>{S.stage='PRO';S.team='';S.svc=0;S.faElig=false;signTo('NPB','NPB2',team,1,1);card('gold','日職入團測試合格',`你通過測試並選擇加入 <b class="hl">${team}</b>，從日職二軍／育成展開挑戰。`);after();},back);
  choose(`日職入團測試合格｜選擇球團`,[
    ...NPB_TEAMS.map(team=>({t:team,f:()=>sign(team)})),
    {t:'🎲 隨機球團',main:true,f:()=>sign(pick(NPB_TEAMS))},
    {t:'← 返回上一頁',f:back}
  ]);
}
export function pathChoiceHS(){
  const o=ovr();
  const opts=[{t:'就讀台灣大學',s:'高中畢業後進入台灣大學棒球',f:()=>chooseSchool('U','TW','選擇台灣大學',advance,pathChoiceHS)},
    {t:'就讀日本大學',s:'高中畢業後挑戰日本大學棒球',f:()=>chooseSchool('U','JP','選擇日本大學',advance,pathChoiceHS)},
    {t:'投入中華職棒選秀',s:'可採隨機選秀或設定意向球隊',f:()=>draftChoice('CPBL',false,r=>r==='ok'?advance():pathChoiceHS(),pathChoiceHS)}];
  if(S.schoolCountry==='JP')opts.push({t:'參加日本職棒選秀',main:o>=44,s:'可採隨機選秀或設定意向球隊',f:()=>draftChoice('NPB',false,r=>r==='ok'?advance():pathChoiceHS(),pathChoiceHS)});
  else opts.push({t:'參加日本職棒選秀（資格不足）',s:'台灣畢業生請走國際自由球員或入團測試',f:()=>{card('bad','資格提示','須在日本高中／大學長期就學才可直接參加日職選秀。');pathChoiceHS();}});
  opts.push({t:'申請日職球團測試',s:o<36?`目前 ${o}｜仍可申請，成功率極低`:`目前 ${o}｜測試成功率隨能力增加`,f:()=>npbTest(advance,pathChoiceHS)});
  opts.push({t:'參加美職體系測試',main:true,s:'自行選擇新人聯盟、1A、2A、3A或大聯盟挑戰',f:()=>usaTestFlow(advance,pathChoiceHS)});
  choose(`高中畢業 · 綜合能力 ${o} · 人生的第一個路口`,opts);
}
export function pathChoiceUYear(continueYear){
  const o=ovr(),grade=Math.max(1,Math.min(4,S.stageYr)),goNewStage=()=>{tlNote(2,'休學轉銜');tlRestage();continueYear();};
  const transfer=(country)=>{const keep=grade,oldTeam=S.team;chooseSchool('U',country,country==='JP'?'選擇日本大學':'選擇台灣大學',()=>{
    S.stageYr=keep;
    /* The year was already pushed before the spring transfer choice. Restamp that same
       year immediately; otherwise the new school first appears one grade too late. */
    tlRestage();tlNote(2,`轉學 ${oldTeam}→${S.team}`);
    if(!Array.isArray(S.transitions))S.transitions=[];
    S.transitions.push({year:S.year,effectiveYear:S.year,reason:'大學轉學',oldTeam,newTeam:S.team,stage:'U',grade:keep});
    continueYear();
  },pathChoiceUYear.bind(null,continueYear));};
  const opts=[
    {t:'留在大學繼續磨練',main:true,s:`繼續完成大${['一','二','三','四'][grade-1]}球季`,f:continueYear},
    {t:'轉往其他台灣大學',f:()=>transfer('TW')},
    {t:'轉往日本大學',f:()=>transfer('JP')},
    {t:'休學投入中華職棒選秀',s:'選秀成功後正式結束學生身分',f:()=>draftChoice('CPBL',true,r=>r==='ok'?goNewStage():pathChoiceUYear(continueYear),()=>pathChoiceUYear(continueYear))}
  ];
  if(S.schoolCountry==='JP')opts.push({t:'休學參加日本職棒選秀',f:()=>draftChoice('NPB',true,r=>r==='ok'?goNewStage():pathChoiceUYear(continueYear),()=>pathChoiceUYear(continueYear))});
  else opts.push({t:'休學申請日職球團測試',s:`目前綜合 ${o}`,f:()=>npbTest(goNewStage,()=>pathChoiceUYear(continueYear))});
  opts.push({t:'休學參加美職體系測試',s:'自行選擇挑戰層級與球團',f:()=>usaTestFlow(goNewStage,()=>pathChoiceUYear(continueYear))});
  opts.push({t:'休學加入台灣業餘成棒',f:()=>amateurTeamChoice(goNewStage,()=>pathChoiceUYear(continueYear))});
  choose(`大${['一','二','三','四'][grade-1]}季前｜繼續就學或休學轉銜`,opts);
}
export function pathChoiceU4(){
  S.universityGraduated=true;
  const o=ovr();
  const opts=[{t:'投入中華職棒選秀',main:true,s:'可採隨機選秀或設定意向球隊',f:()=>draftChoice('CPBL',false,r=>r==='ok'?advance():pathChoiceU4(),pathChoiceU4)}];
  if(S.schoolCountry==='JP')opts.push({t:'參加日本職棒選秀',main:o>=44,s:'可採隨機選秀或設定意向球隊',f:()=>draftChoice('NPB',false,r=>r==='ok'?advance():pathChoiceU4(),pathChoiceU4)});
  else opts.push({t:'日職選秀（資格不足）',s:'台灣大學畢業生走國際自由球員或測試',f:()=>{card('bad','資格提示','須有日本長期就學資格。');pathChoiceU4();}});
  opts.push({t:'申請日職球團測試',s:`目前綜合 ${o}`,f:()=>npbTest(advance,pathChoiceU4)});
  opts.push({t:'參加美職體系測試',s:'自行選擇挑戰層級與球團',f:()=>usaTestFlow(advance,pathChoiceU4)});
  opts.push({t:'加入台灣業餘成棒',f:()=>amateurTeamChoice(advance,pathChoiceU4)});
  opts.push({t:'高掛球鞋',warn:true,f:()=>endGame('大學畢業後決定告別球場。')});
  choose(`大學畢業 · 綜合能力 ${o}`,opts);
}
if(typeof document!=='undefined'&&document.getElementById('btn-menu')){
  document.getElementById('btn-menu').onclick=menuModal;
}
export function advance(){
  S.age++; S.year++; S.stageYr++; startYear();
}
