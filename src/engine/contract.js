import {S} from '../core/state.js?v=offline-0.31.0';
import {R, ri, pick, chance, clamp, SEED} from '../core/rng.js?v=offline-0.31.0';
import {LV, PATHS, CPBL_TEAMS, NPB_TEAMS, MLB_TEAMS} from '../data/teams.js?v=offline-0.31.1';
import {AMA_ANNUAL, LEVEL_MIN_ANNUAL, MLB_SERVICE_MINOR_MIN} from '../data/economy.js?v=offline-0.31.0';
import {card, choose, board} from '../ui/dom.js?v=offline-0.31.0';
import {tlNote} from '../ui/timeline.js?v=offline-0.31.0';
import {ovr} from './ability.js?v=offline-0.31.0';
import {injuryMarketStatus} from './injury.js?v=offline-0.31.0';
import {hasActiveFranchise} from './tenure.js?v=offline-0.31.0';
import {seasonSalaryRating, currentSalaryRating} from './season.js?v=offline-0.31.0';
import {capTeam} from './career.js?v=offline-0.31.0';
import {traitCard, removeTrait} from '../flow/events.js?v=offline-0.31.0';
import {advance} from './draft.js?v=offline-0.31.0';
import {finishContractYear} from '../flow/phases.js?v=offline-0.31.0';
import {endGame} from '../ui/retire.js?v=offline-0.31.0';
export function pitcherContractCap(){ return ({SP:7,CL:5,MR:4})[S.role]||7; }
/* 年薪（萬台幣）。頂級聯盟採漸進曲線：底薪貼近聯盟現況，明星價值才逐步拉開。 */
export function hasMlbService(){
  return !!(S&&((S.stats&&S.stats.MLB&&S.stats.MLB.yr>0)||(S.log||[]).some(r=>r.lv==='MLB')));
}
export function mlbEntryStatus(){
  const age=Number(S.age)||0;
  const university=!!S.universityGraduated;
  const aaa=age>20&&S.lv==='A3';
  const asia=age>20&&(((S.stats&&S.stats.CPBL&&S.stats.CPBL.yr)||0)>=1||((S.stats&&S.stats.NPB&&S.stats.NPB.yr)||0)>=1);
  return {ok:university||aaa||asia,university,aaa,asia,
    reason:'須符合以下任一身分：大學畢業；年滿 21 歲且由 3A 升上；年滿 21 歲且已有中職或日職一軍完整球季。'};
}
export function levelMinAnnual(lv){
  return /^R$|^A[123]$/.test(lv)&&hasMlbService()?MLB_SERVICE_MINOR_MIN:(LEVEL_MIN_ANNUAL[lv]||0);
}
export function salaryFor(lv,d){
  /* 只設最低值、不設最高值：歷史級種子應能持續刷新薪資紀錄。 */
  const p=Math.max(0,d||0);
  switch(lv){
    case 'CPBL2':case 'NPB2':case 'R':case 'A1':case 'A2':case 'A3':return levelMinAnnual(lv);
    case 'CPBL1':return Math.round(120+p*65+p*p*3);
    case 'NPB1':return Math.round(360+p*210+p*p*14);
    /* MLB 頂端刻意保留高成長：長期 MVP／歷史級球員可突破 20 億年薪。 */
    case 'MLB':return Math.round(2400+p*1000+p*p*500);
  } return 0;
}
export const fmtMoney=w=>{ const y=Math.floor(w/10000),m=Math.round(w%10000); return (y?y+'億':'')+(m?m.toLocaleString()+'萬':(y?'':'0萬')); };
export function calcContractAnnual(lv,d,mult){
  return Math.round(Math.max(levelMinAnnual(lv),salaryFor(lv,d)*(mult||1)));
}
/* 成績評價 d 是「相對當時層級平均」；跨層級核薪時必須換算到目標層級，不能把二軍 +10 當成一軍 +10。 */
export function ratingAtLevel(d,fromLv,toLv){
  const value=Number.isFinite(d)?d:0,from=LV[fromLv],to=LV[toLv];
  return from&&to?+(value+from.par-to.par).toFixed(2):value;
}
export function contractAnnual(){
  const floor=levelMinAnnual(S.lv);
  if(S.ct&&S.ct.annualSchedule&&S.ct.annualSchedule.length){
    const annual=Math.round(Math.max(floor,S.ct.annualSchedule[0])); S.ct.annualSchedule[0]=annual; return annual;
  }
  if(S.ct&&Number.isFinite(S.ct.annual)){
    const annual=Math.round(Math.max(floor,S.ct.annual)); S.ct.annual=annual; return annual;
  }
  const annual=calcContractAnnual(S.lv,currentSalaryRating(S.lastD||0),S.ct&&S.ct.mult||1);
  if(S.ct)S.ct.annual=annual; /* 舊狀態第一次讀取時鎖定，後續年度不再隨成績浮動 */
  return annual;
}
export function makeContract(yrs,mult,lv,d,annual,extra){
  const m=mult||1,targetLv=lv||S.lv;
  const pay=Math.round(Math.max(levelMinAnnual(targetLv),Number.isFinite(annual)?annual:calcContractAnnual(targetLv,d===undefined?currentSalaryRating(S.lastD||0):d,m)));
  return Object.assign({yrs:yrs||1,mult:m,annual:pay},extra||{});
}
/* 日美入札讓渡金（萬台幣）。以 1 美元＝30 台幣換算 MLB 制度的 2,500／5,000 萬美元級距。 */
export function postingReleaseFee(guaranteed){
  const first=Math.min(Math.max(0,guaranteed),75000);
  const second=Math.min(Math.max(0,guaranteed-75000),75000);
  const rest=Math.max(0,guaranteed-150000);
  return Math.round(first*0.20+second*0.175+rest*0.15);
}
/* 球隊掌控期不是自由市場：中、日職逐年靠近市場價；MLB 前段年資接近底薪、後段才進入仲裁級薪資。 */
export function controlledAnnual(lv,d,healthMult){
  const market=salaryFor(lv,d), svc=clamp(S.svc||1,1,4);
  const cfg={
    CPBL1:{rates:[0,0.70,0.78,0.86,0.94]},
    NPB1:{rates:[0,0.70,0.80,0.90,0.96]},
    MLB:{rates:[0,0.08,0.12,0.35,0.60]}
  }[lv];
  if(!cfg)return calcContractAnnual(lv,d,1);
  return Math.round(Math.max(levelMinAnnual(lv),market*cfg.rates[svc]*(healthMult||1)));
}
/* 記分板專用縮寫：未滿一億顯示萬；一億以上四捨五入到小數一位。完整金額仍由 fmtMoney 顯示。 */
export const salParts=w=>w<10000
  ?{v:Math.round(w).toLocaleString(),u:'萬'}
  :{v:(Math.round(w/1000)/10).toFixed(1),u:'億'};
function champHash(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++){ h^=text.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0)/4294967295;
}
function champLeague(team){
  if(CPBL_TEAMS.includes(team))return {key:'CPBL',teams:CPBL_TEAMS};
  if(NPB_TEAMS.includes(team))return {key:'NPB',teams:NPB_TEAMS};
  if(MLB_TEAMS.includes(team))return {key:'MLB',teams:MLB_TEAMS};
  return {key:null,teams:[]};
}
/* 各聯盟的年度戰力級距。share 是該級所有球隊合計的 100% 奪冠率配額：
   中職 6 隊分 3 級、日職 12 隊分 4 級、大聯盟 30 隊分 5 級。
   大聯盟最強 3 隊合計 36%，確保真正的頂級強權能自然突破單隊 10%。 */
export const TEAM_CHAMP_TIERS={
  CPBL:[{count:2,share:58},{count:2,share:28},{count:2,share:14}],
  NPB:[{count:2,share:42},{count:4,share:30},{count:4,share:22},{count:2,share:6}],
  MLB:[{count:3,share:36},{count:6,share:32},{count:9,share:22},{count:8,share:8},{count:4,share:2}],
};
function champStrength(team,year){
  const foundation=(champHash('club|'+team)-0.5)*0.7;
  const form=(champHash(`${SEED}|season|${year}|${team}`)-0.5)*1.3;
  const carry=(champHash(`${SEED}|season|${year-1}|${team}`)-0.5)*0.3;
  return foundation+form+carry;
}
function tieredChampRates(key,teams,year){
  const tiers=TEAM_CHAMP_TIERS[key]||[], ranked=teams
    .map(team=>({team,strength:champStrength(team,year)}))
    .sort((a,b)=>b.strength-a.strength||a.team.localeCompare(b.team));
  const rates={}; let offset=0;
  tiers.forEach(tier=>{
    const group=ranked.slice(offset,offset+tier.count), n=group.length;
    /* 同級內仍保留排名差：首尾權重為 1.12／0.88，避免每隊完全同率。 */
    const weights=group.map((_,i)=>n<=1?1:1.12-i*(0.24/(n-1)));
    const total=weights.reduce((a,b)=>a+b,0)||1;
    group.forEach((entry,i)=>{ rates[entry.team]=tier.share*weights[i]/total; });
    offset+=tier.count;
  });
  return rates;
}
/* 每年先依球隊底蘊、當季狀態與前季延續性重新排名，再套用聯盟級距分配 100%。
   同種子同年度查詢結果固定，但球隊可以隨年度在各級之間升降。 */
export function teamChampRates(team,year){
  const league=champLeague(team), teams=league.teams, y=Number.isFinite(year)?year:(S&&S.year)||2026;
  if(!teams.length)return {};
  const rates=tieredChampRates(league.key,teams,y);
  const playerTeam=S&&S.stage==='PRO'&&LV[S.lv]&&LV[S.lv].top&&teams.includes(S.orgTeam)?S.orgTeam:null;
  if(playerTeam){
    const base=rates[playerTeam], delta=ovr()-LV[S.lv].par;
    /* F10 可把原版個人影響放大 0～50 倍；原始正負仍由能力高低決定。
       0%/100% 是真正邊界，不保留暗中的最低中獎權重。 */
    const mult=clamp(Number(S.champImpactMult??1),0,50);
    const rawShift=delta>=0?Math.min(5,delta*0.5):delta*0.8;
    const shift=rawShift*mult;
    const target=clamp(base+shift,0,100), scale=base>=100?0:(100-target)/(100-base);
    teams.forEach(t=>{ rates[t]=t===playerTeam?target:rates[t]*scale; });
  }
  return rates;
}
export function teamChampRate(team,year){
  const rate=teamChampRates(team,year)[team];
  return Number.isFinite(rate)?Number(rate.toFixed(1)):0;
}
export function marketRating(d,targetLv,sourceLv){
  const target=targetLv||S.lv,source=sourceLv||S.lastLv||S.lv;
  const cur=ratingAtLevel(currentSalaryRating(d),source,target), status=injuryMarketStatus();
  const prior=(S.log||[]).filter(r=>r.y!==S.year&&r.st&&Number.isFinite(r.st.d)).slice(-2).reverse()
    .map(r=>ratingAtLevel(seasonSalaryRating(r.st,r.lv||source,S.pos==='P'?r.role:r.p),r.lv||source,target));
  const weights=status==='rehab'?[0.20,0.50,0.30]:status==='major'?[0.35,0.40,0.25]:status==='minor'?[0.55,0.30,0.15]:[0.65,0.25,0.10];
  const vals=[cur].concat(prior); let sum=0,ws=0;
  vals.forEach((v,i)=>{sum+=v*weights[i];ws+=weights[i];});
  return +(sum/(ws||1)).toFixed(2);
}
export function contractMarketProfile(d,targetLv,sourceLv){
  const target=targetLv||S.lv,source=sourceLv||S.lastLv||S.lv;
  const status=injuryMarketStatus(), rating=marketRating(d,target,source);
  const prior=(S.log||[]).filter(r=>r.y!==S.year&&r.st&&Number.isFinite(r.st.d)).slice(-2)
    .map(r=>ratingAtLevel(seasonSalaryRating(r.st,r.lv||source,S.pos==='P'?r.role:r.p),r.lv||source,target));
  const reputation=prior.length?prior.reduce((a,b)=>a+b,0)/prior.length:rating;
  const star=reputation>=7;
  const map={
    healthy:{aav:1,bonus:1,drop:0,maxYears:99,label:''},
    minor:{aav:0.93,bonus:0.80,drop:0,maxYears:99,label:'小傷使市場略為觀望'},
    major:{aav:star?0.82:0.70,bonus:star?0.50:0.35,drop:star?1:2,maxYears:3,label:star?'重大傷勢：履歷保住部分身價，但只能先證明健康':'重大傷勢：報價、年限與簽約金大幅縮水'},
    rehab:{aav:star?0.72:0.55,bonus:star?0.35:0.20,drop:star?2:3,maxYears:2,label:star?'整季復健：球團只願承擔證明約風險':'整季復健：市場接近凍結'}
  }[status];
  return {...map,status,rating,reputation,star,proveIt:(status==='major'||status==='rehab')};
}
export function faYears(d,cap,profile){ /* FA 年限:近三年成績穩定+傷病少→年限長;上限 cap(野手15/投手7) */
  const mp=profile||contractMarketProfile(d), value=mp.rating;
  const perf=Math.max(0,Math.min(1,(value+2)/8)); /* d=-2→0, d=6→1 */
  const injPenalty=(S.bigInj||0)*0.12+(S.tjCount||0)*0.15;
  let yrs=Math.round(2+perf*(cap-2)-injPenalty*cap);
  /* 年齡上限:球團不會賭老將的長約(考慮引退年齡與衰退) */
  let ageCap=cap;
  if(S.age>=36)ageCap=2; else if(S.age>=34)ageCap=3; else if(S.age>=32)ageCap=5; else if(S.age>=30)ageCap=8;
  yrs=Math.min(yrs,ageCap,mp.maxYears);
  return Math.max(1,Math.min(cap,yrs));
}
export function demotionAudit(cont){
  if(!S.demotionRefused){ cont(); return; }
  S.demotionRefused=false;
  /* 打回身價:d >= 該合約薪資係數應有的水準(mult 越高要求越高) */
  const need=Math.round((S.ct&&S.ct.mult?S.ct.mult:1)*2)-1; /* mult1→1, mult1.2→1.4→1, mult2→3 */
  if((S.lastD||0)>=need){
    if(S.traits.cancer){ removeTrait('cancer','更衣室毒瘤');
      card('good','用成績說話','你用一整季的表現堵住了所有人的嘴——<b class="hl">更衣室毒瘤洗刷</b>。當初拒絕下放的決定，被證明是對的。'); board(1); }
    else card('good','守住身價','你證明了自己還配得上這份合約。');
  } else {
    if(!S.traits.thief){ S.traits.thief=true;
      card('bad','隱藏屬性解鎖：薪水小倫','拒絕下放後，你的成績依然沒有起色。球迷開始在社群叫你「薪水小倫」——<b class="dn">事件卡失敗率永久 +10%</b>，這個名聲跟著你到退休。'); board(1); }
    else card('bad','薪水小倫','又是虛擲的一年。看台上的噓聲更大了。');
  }
  cont();
}
export function offseasonTradeCheck(cont){
  if(S.stage!=='PRO'||!LV[S.lv].top||S.seasonFactor<=0){ cont(); return; }
  if((S.ct&&S.ct.yrs<=1)||ovr()<LV[S.lv].min){cont();return;}
  const star = ovr()>=LV[S.lv].par+4; /* 明星:綜合≥聯盟平均+4 */
  let p=15+ (S.tradeHeat||0); /* 基礎 15% + 累積怨氣 */
  if(S.traits.cancer)p+=25; if(S.traits.ambience)p+=20;
  if(!chance(p)){ cont(); return; }
  /* 現役神主牌／◯◯先生是城市象徵；神主牌轉隊後只保留身分，不再提供交易保護。 */
  if(hasActiveFranchise(S)||S.traits.mrteam){
    card('info','非賣品',`他隊捧著誘人的包裹來詢價，高層連會議都沒開就回絕了——<b class="hl">「他是這座城市的象徵，非賣品。」</b>`);
    board(1); cont(); return;
  }
  const tradeList=S.org==='CPBL'?CPBL_TEAMS:S.org==='NPB'?NPB_TEAMS:MLB_TEAMS;
  const target=pick(tradeList.filter(t=>t!==S.orgTeam));
  if(star){
    /* 明星:否決權詢問(同舊設定) */
    if(S.traits.cancer){ doTradeExec(target); card('bad','毒瘤交易',`球團受夠了休息室的氣氛，直接把你交易到 <b class="hl">${target}</b>。`); board(1); cont(); return; }
    choose(`球季結束：${target} 送來交易報價，原球團徵詢你的否決權`,[
      {t:`點頭同意，轉往 ${target}`,main:true,s:`交易確定後，下季效力 ${target}`,f:()=>{ doTradeExec(target); card('info','轉隊',`你同意交易，打包行李前往 <b class="hl">${target}</b>。`); board(1); cont(); }},
      {t:'行使否決權，我要留下',warn:true,s:'未來 2 年冠軍機率略降、下張合約薪水 −15%',f:()=>{
        S.tradeRefuse=2; card('info','否決交易',`你按下否決鍵。忠誠是一種選擇——球團的重建計畫被你打亂了，短期戰力和你的下張合約都會付出一點代價，但這件球衣，你留下來了。`); board(1); cont(); }}]);
    return;
  }
  /* 非明星:季末交易傳言,可抱怨或沉默 */
  choose('季末交易傳言：媒體報導你可能在休賽季被交易',[
    {t:'公開抱怨表達不滿',warn:true,s:'增加本次被交易的可能性',f:()=>{
      S.complainCount=(S.complainCount||0)+1;
      if(S.complainCount>=2&&!S.traits.ambience){ S.traits.ambience=true;
        card('bad','隱藏屬性解鎖：氣氛大師','你又一次對媒體大吐苦水。球團高層看在眼裡——這種選手，留著也是不定時炸彈。<b class="dn">往後轉隊機率永久提高</b>。'); board(1); }
      if(chance(60)){ doTradeExec(target); card('bad','弄假成真',`你的抱怨上了頭條，球團順勢把你交易到 <b class="hl">${target}</b>。`); board(1); }
      else card('info','雷聲大雨點小','抱怨歸抱怨，這次交易最後沒有成局。你還在原隊，但氣氛有點僵。');
      cont(); }},
    {t:'保持沉默，專心打球',main:true,s:'交易機率不變',f:()=>{
      if(chance(35)){ doTradeExec(target); card('info','交易成局',`儘管你不動聲色，球團仍把你交易到 <b class="hl">${target}</b>。`); board(1); }
      else card('info','留了下來','傳言就是傳言。下個球季，你還是穿著同一件球衣。');
      cont(); }}]);
}
export function doTradeExec(target){
  /* 季末交易只更換下季球隊，當季成績仍完整歸屬原隊。 */
  const oldTeam=S.orgTeam,effectiveYear=S.year+1;
  S.teamSeasons=0; S.teamYears=0; S.franchiseActive=false; S.champThisTeam=false; S.champTeam=null;
  const list=S.org==='CPBL'?CPBL_TEAMS:S.org==='NPB'?NPB_TEAMS:MLB_TEAMS;
  const nt=(target&&list.includes(target)&&target!==oldTeam)?target:pick(list.filter(t=>t!==oldTeam)); S.orgTeam=nt;
  if(S.org==='CPBL')S.lastCpblTeam=nt;
  if(!Array.isArray(S.transitions))S.transitions=[];
  S.transitions.push({year:S.year,effectiveYear,reason:'休賽季交易',oldTeam,newTeam:nt,org:S.org,lv:S.lv});
  tlNote(2,`下季轉隊 ${nt}`); board(1);
}
export function buyoutRemaining(rate,includeCurrent){ /* 合約剩餘年數給付:季前需包含尚未支付的當年度；季末則扣除已入帳年度。 */
  rate=rate||0.7;
  const paidYears=includeCurrent?0:1;
  if(!S.ct||!(S.ct.yrs>paidYears)||(!LV[S.lv].top&&rate<1))return 0; /* 球團主動終止不受二軍守衛限制 */
  const remain=S.ct.yrs-paidYears;
  if(remain<=0)return 0;
  const schedule=S.ct.annualSchedule&&S.ct.annualSchedule.length?S.ct.annualSchedule.slice(paidYears,paidYears+remain):null;
  const yearly=contractAnnual();
  const full=schedule&&schedule.length===remain?schedule.reduce((a,b)=>a+b,0):yearly*remain; /* 依剩餘各年固定薪資計算 */
  const total=Math.round(full*rate);
  if(total>0){ S.salary+=total; S.cash=(S.cash||0)+total*10000;
    if(rate>=1) card('gold','合約全額給付',`合約還有 <b class="hl">${remain} 年</b>，但這次不是你要走——球團主動終止合約，依約剩餘薪資<b class="hl">十成全額</b>給付，<b class="hl">${fmtMoney(total)}</b> 一次入帳。白紙黑字的長約，在此刻護住了你。`);
    else card('gold','合約買斷',`你仍在合約中，球團依約買斷剩餘 <b class="hl">${remain} 年</b>合約——雙方談定以 <b class="hl">七成</b> 價碼結清，<b class="hl">${fmtMoney(total)}</b> 一次入帳。合約精神，該給的一毛不少。`); }
  S.ct=makeContract(1,S.ct.mult,S.lv,S.lastD||0,yearly); /* 給付後合約結清 */
  return total;
}
/* 引退時若沒回中職,補一場大巨蛋開球告別 */
export function daibaFarewell(cont){
  if(S.stage==='PRO'&&S.org!=='CPBL'&&!S._daiba){ S._daiba=true;
    card('gold','最後一球',`雖然沒能回到家鄉獻技，你還是接受了邀請，回到 <b class="hl">臺北大巨蛋</b> 當一日中職球員。開球儀式上，四萬人的注視下，你投出了生涯的最後一球——不為勝負，只為那個曾經在紅土上作夢的自己。`);
  }
  cont();
}
export function handleDemotion(o,path,idx){
  if((S.lv==='CPBL1'||S.lv==='NPB1'||S.lv==='MLB')&&(S.lastD||0)<=-6&&!S.traits.yips&&S.seasonFactor>=0.5){
    traitCard('yips','失憶症',`生理上明明沒受傷，但站上場的瞬間，腦海全是上個賽季被痛宰的畫面——<b class="dn">系統評價暫時 −3，直到再次升級或奪得年度獎項才能解除</b>。`,'bad'); }
  const doDemote=()=>{
    /* 找同組織中符合的層級 */
    let t=-1; for(let i=idx-1;i>=0;i--){ if(o>=LV[path[i]].min){t=i;break;} }
    if(t>=0){
      /* 旅外體系下放時,亞洲球團同步遞約 */
      const alts=[];
      if(false&&S.org==='MiLB'){
        if(o>=LV.NPB1.min&&chance(Math.round(60*ageGateJP())))alts.push({t:'跳槽日職一軍',s:'旅日合約',f:()=>{buyoutRemaining();signTo('NPB','NPB1');advance();}});
        else if(o>=LV.NPB2.min&&chance(50))alts.push({t:'轉戰日職二軍（支配下）',f:()=>{buyoutRemaining();signTo('NPB','NPB2');advance();}});
        if(o>=LV.CPBL1.min)alts.push({t:'返台加盟中職一軍',s:'落葉歸根',f:()=>{buyoutRemaining();signTo('CPBL','CPBL1');advance();}});
      }else if(false&&S.org==='NPB'&&o>=LV.CPBL1.min&&chance(70)){
        alts.push({t:'返台加盟中職一軍',f:()=>{buyoutRemaining();signTo('CPBL','CPBL1');advance();}});
      }
      if(alts.length){
        card('bad','降級通知',`成績未達標，球團打算將你下放 <b class="dn">${LV[path[t]].n}</b>——但消息一出，其他聯盟的邀請也到了。`);
        choose('接受下放，還是換個舞台？',[
          {t:'接受下放 '+LV[path[t]].n,main:true,f:()=>{S.lv=path[t];board(2);finishContractYear(o);}},...alts]);
      }else{ S.lv=path[t]; card('bad','降級通知',`成績未達標，被下放至 <b class="dn">${LV[path[t]].n}</b>。`); board(2); finishContractYear(o); }
    }
    else outOfOrg(o);
  };
  const longContract = S.ct && S.ct.yrs>1 && LV[S.lv].top;
  const confirmDemotionRetire=(text,back)=>choose('確認引退',[
    {t:'確定結束球員生涯',warn:true,s:'確認後進入生涯結算',f:()=>{buyoutRemaining();daibaFarewell(()=>endGame(text));}},
    {t:'← 返回球團約談',main:true,f:back}
  ]);
  if(longContract){
    const showLong=()=>choose('球團約談：成績未達當前層級要求，打算將你下放',[
      {t:'接受下放，繼續奮鬥',main:true,f:doDemote},
      {t:'行使長約條款，拒絕下放',warn:true,s:'觸發更衣室毒瘤；隔年成績打回身價才能洗刷，否則更慘',f:()=>{
        S.demotionRefused=true;
        if(!S.traits.cancer&&!S.traits.franchise&&!S.traits.intlace){ S.traits.cancer=true;
          card('bad','隱藏屬性解鎖：更衣室毒瘤','你搬出合約條款拒絕下放。教練搖頭，隊友私下議論——你保住了位置，卻失去了更衣室。'); }
        else card('info','拒絕下放','你搬出合約條款留在一軍。球團記住了這件事。');
        board(1); finishContractYear(o); }},
      {t:'就此引退',warn:true,s:'將再進入一次確認畫面',f:()=>confirmDemotionRetire('不願下放，'+S.year+' 年宣布引退。',showLong)}]);
    showLong();
  } else if(S.age>=33){
    const showOlder=()=>choose('球團約談：成績未達當前層級的最低要求',[
      {t:'接受下放，繼續奮鬥',f:doDemote},
      {t:'選擇引退',warn:true,s:'將再進入一次確認畫面',f:()=>confirmDemotionRetire('不願下放低階聯盟，'+S.year+' 年宣布引退。',showOlder)}]);
    showOlder();
  } else doDemote();
}
export function outOfOrg(o){
  buyoutRemaining(1);
  transitionFlow('戰力外釋出',`綜合能力 ${o} 已低於原球團組織可以留用的最低層級，因此遭到釋出並成為自由球員。`,{allowStay:false});
}
/* 轉銜用合約類型：先通過層級門檻，再由年齡、超越門檻幅度與健康決定年限。 */
function transitionTerms(lv,stay=false){
  const level=LV[lv],o=ovr(),gap=o-(level?.min||0),age=S.age;
  const mp=contractMarketProfile(S.lastD||0,lv,S.lastLv||S.lv);
  let baseM=mp.aav*(S.tradeRefuse>0?.85:1);
  if(stay&&hasActiveFranchise(S))baseM*=1.04;
  const shortY=mp.status==='rehab'?1:(gap>=2?2:1);
  let medReq=Infinity,medMax=0;
  if(age<=29){medReq=4;medMax=5;}else if(age<=32){medReq=5;medMax=5;}
  else if(age<=35){medReq=6;medMax=5;}else if(age<=39){medReq=8;medMax=3;}
  let longReq=Infinity,longMax=0;
  if(age<=29){longReq=8;longMax=8;}else if(age<=32){longReq=10;longMax=6;}
  const blocked=mp.proveIt;
  const medOK=!blocked&&gap>=medReq, longOK=!blocked&&gap>=longReq;
  const medY=medOK?Math.min(medMax,3+Math.floor((gap-medReq)/2)):0;
  const longY=longOK?Math.min(longMax,6+Math.floor((gap-longReq)/2)):0;
  const mk=(kind,y,m)=>{const mult=+(baseM*m).toFixed(2),annual=calcContractAnnual(lv,mp.rating,mult);return {kind,y,m:mult,annual,total:annual*y};};
  const healthReason=blocked?(mp.status==='rehab'?'整季復健中，只提供一年證明約':'重大傷病後只提供短期證明約'):'';
  return {o,gap,mp,short:mk('短約',shortY,1.05),medium:medOK?mk('中約',medY,1):null,long:longOK?mk('長約',longY,.95):null,
    mediumReason:healthReason||(age>=40?'40歲以上不提供中約':`中約需要高於層級門檻 ${medReq} 點；目前 ${gap} 點`),
    longReason:healthReason||(age>=33?'33歲以上不提供長約':`長約需要高於層級門檻 ${longReq} 點；目前 ${gap} 點`)};
}
function transitionTermChoice(lv,label,team,stay,onBack,onSign){
  const usageChoice=(ct,back)=>{if(S.pos!=='TW'){onSign(ct);return;}const a=S.ab||{},pit=(Number(a.vel||0)+Number(a.ctl||0)+Number(a.brk||0))/3,hit=Number(a.con||0)*.5+Number(a.pow||0)*.2+Number(a.eye||0)*.18+Number(a.spd||0)*.12,min=Number(LV[lv]?.min||0),twMin=Math.max(0,min-Number(S.twoWayContractThresholdReduction??1));
    const pickUsage=(u,name)=>{S.contractUsage=u;onSign(ct);card('info','合約登錄身分',`本張合約以 <b class="hl">${name}</b> 登錄；球季將依此產生成績。`);};
    const blocked=(name,why)=>({t:`${name}（球團拒絕）`,warn:true,s:why,f:()=>{card('bad','登錄身分未獲同意',why);usageChoice(ct,back);}});
    choose(`${team}｜選擇本張合約出賽身分`,[
      pit>=min?{t:'投手身分',s:`投手評估 ${pit.toFixed(1)}｜最低 ${min}`,f:()=>pickUsage('P','投手')}:blocked('投手身分',`投手評估 ${pit.toFixed(1)}，未達 ${min}。`),
      hit>=min?{t:'打者身分',s:`打者評估 ${hit.toFixed(1)}｜最低 ${min}`,f:()=>pickUsage('H','打者')}:blocked('打者身分',`打者評估 ${hit.toFixed(1)}，未達 ${min}。`),
      pit>=twMin&&hit>=twMin?{t:'二刀流身分',main:true,s:`投手 ${pit.toFixed(1)}／打者 ${hit.toFixed(1)} 均達 ${twMin}（原門檻 ${min}）`,f:()=>pickUsage('TW','二刀流')}:blocked('二刀流身分',`投手與打者評估都必須達 ${twMin}（原門檻 ${min}）；目前 ${pit.toFixed(1)}／${hit.toFixed(1)}。`),
      {t:'← 返回合約年限',f:back}
    ]);
  };
  const show=()=>{const tp=transitionTerms(lv,stay),desc=x=>`固定年薪 ${fmtMoney(x.annual)} × ${x.y} 年｜合約總額 ${fmtMoney(x.total)}`;
    const unavailable=(name,why)=>({t:`${name}（未達門檻）`,s:why,f:()=>{card('bad',`${name}未獲提供`,`${team}目前不願提供${name}：${why}。請選擇其他年限，或返回改選較低層級。`);show();}});
    choose(`${team}｜選擇合約類型<div style="margin-top:8px;color:var(--dim);font-size:13px">${label}最低綜合 ${LV[lv].min}｜目前 ${tp.o}｜高出門檻 ${tp.gap} 點</div>`,[
      {t:`短約｜${tp.short.y} 年`,main:true,s:desc(tp.short),f:()=>usageChoice(tp.short,show)},
      tp.medium?{t:`中約｜${tp.medium.y} 年`,s:desc(tp.medium),f:()=>usageChoice(tp.medium,show)}:unavailable('中約',tp.mediumReason),
      tp.long?{t:`長約｜${tp.long.y} 年`,s:desc(tp.long),f:()=>usageChoice(tp.long,show)}:unavailable('長約',tp.longReason),
      {t:'← 返回球隊選擇',f:onBack}
    ]);
  };show();
}
export function transitionFlow(reason,detail,options={}){
  const o=ovr(),amaTeams=['合作金庫','台灣電力','安永鮮物','台中台壽霸龍','全越運動'];
  const original={org:S.org,team:S.orgTeam,lv:S.lv};
  const canStay=options.allowStay!==false&&!!(original.org&&original.team&&original.lv&&LV[original.lv]);
  const countries=[['TW','台灣','中職一軍、中職二軍或業餘成棒'],['JP','日本','日職一軍或日職二軍／育成'],['US','美國','新人聯盟至大聯盟']];
  const levels={TW:[['CPBL1','中職一軍',LV.CPBL1.min],['CPBL2','中職二軍',LV.CPBL2.min],['AMA','業餘成棒',25]],JP:[['NPB1','日職一軍',LV.NPB1.min],['NPB2','日職二軍／育成',LV.NPB2.min]],US:[['R','新人聯盟',LV.R.min],['A1','1A',LV.A1.min],['A2','2A',LV.A2.min],['A3','3A',LV.A3.min],['MLB','大聯盟',LV.MLB.min]]};
  const cname=c=>c==='TW'?'台灣':c==='JP'?'日本':'美國';
  const retireConfirm=()=>choose('確認引退',[
    {t:'確定結束球員生涯',warn:true,s:'確認後進入生涯結算；此決定不能返回',f:()=>daibaFarewell(()=>endGame(`${reason}後選擇結束球員生涯。`))},
    {t:'← 返回生涯轉銜',main:true,s:'繼續尋找合約',f:countryPage}
  ]);
  const stayOriginal=()=>{
    const min=LV[original.lv].min;
    if(o<min){card('bad','原球隊不續約',`目前綜合 <b>${o}</b>，未達原層級 ${LV[original.lv].n} 的最低門檻 <b class="dn">${min}</b>。原球隊不提供續約，請選擇其他發展方向。`);countryPage();return;}
    transitionTermChoice(original.lv,LV[original.lv].n,original.team,true,countryPage,ct=>{
      S.stage='PRO';signTo(original.org,original.lv,original.team,ct.y,ct.m,ct.annual);
      card('good','續留原球隊',`你選擇留在 <b class="hl">${original.team}</b>，簽下${ct.kind}：固定年薪 <b class="hl">${fmtMoney(ct.annual)}</b> × <b class="hl">${ct.y} 年</b>。`);advance();
    });
  };
  const countryPage=()=>choose(`生涯轉銜｜${reason}<div style="margin-top:8px;color:var(--dim);font-size:13px">${detail||''}<br>目前綜合：<b class="hl">${o}</b></div>`,[
    ...(canStay?[{t:`續留原球隊｜${original.team}`,main:true,s:`維持 ${LV[original.lv].n}，直接洽談短約、中約或長約`,f:stayOriginal}]:[]),
    ...countries.map(([key,name,desc])=>({t:name,s:desc,f:()=>levelPage(key)})),
    {t:'引退',warn:true,s:'將再進入一次確認畫面，不會立即引退',f:retireConfirm}
  ]);
  const levelPage=country=>choose(`${cname(country)}｜選擇發展層級`,[
    ...levels[country].map(([lv,label,min])=>{const identity=lv!=='MLB'||mlbEntryStatus().ok,eligible=o>=min&&identity;return {t:label,main:eligible,s:eligible?`最低門檻 ${min}｜目前 ${o}`:o<min?`門檻不足｜最低 ${min}，目前 ${o}（差 ${min-o}）`:`身分門檻不足｜${mlbEntryStatus().reason}`,f:()=>{
      if(!eligible){card('bad','球團拒絕',o<min?`目前綜合 <b>${o}</b>，未達 ${label} 最低門檻 <b class="dn">${min}</b>。`:`目前能力足夠，但${mlbEntryStatus().reason}`);levelPage(country);return;}teamPage(country,lv,label);
    }};}),{t:'← 返回國家選擇',f:countryPage}
  ]);
  const teamPage=(country,lv,label)=>{const teams=lv==='AMA'?amaTeams:country==='TW'?CPBL_TEAMS:country==='JP'?NPB_TEAMS:MLB_TEAMS;
    const join=team=>{if(lv==='AMA'){S.stage='AMA';S.team=team;S.org=null;S.orgTeam=null;S.lv=null;S.ct=null;card('good','加入業餘成棒',`你選擇加入 <b class="hl">${team}</b>。`);advance();return;}
      const org=country==='TW'?'CPBL':country==='JP'?'NPB':'MiLB';
      transitionTermChoice(lv,label,team,false,()=>teamPage(country,lv,label),ct=>{S.stage='PRO';signTo(org,lv,team,ct.y,ct.m,ct.annual);card('good','完成轉銜',`轉銜原因：${reason}。你加盟 <b class="hl">${team}</b>，從 <b class="hl">${label}</b>出發，簽下 <b>${ct.y} 年${ct.kind}</b>。`);advance();});};
    choose(`${label}｜選擇球隊`,[...teams.map(team=>({t:team,s:lv==='AMA'?'加入業餘成棒':team===S.orgTeam?'目前／原所屬球隊｜選擇後洽談合約年限':'選擇後洽談短約、中約或長約',f:()=>join(team)})),{t:'🎲 隨機球隊',main:true,f:()=>join(pick(teams))},{t:'← 返回層級選擇',f:()=>levelPage(country)}]);};
  countryPage();
}
export function teamListOf(org){ return org==='CPBL'?CPBL_TEAMS:org==='NPB'?NPB_TEAMS:MLB_TEAMS; }
export function signTo(org,lv,team,yrs,mult,annual){
  const previousOrg=S.org,previousTeam=S.orgTeam;
  const sourceLv=S.lastLv||S.lv,contractD=ratingAtLevel(currentSalaryRating(S.lastD||0),sourceLv,lv);
  S.org=org; S.lv=lv;
  /* 【修正】先決定新球隊是誰，比對不一樣才把年資歸零，最後再蓋掉 S.orgTeam */
  const newTeam = team || pick(teamListOf(org));
  if(newTeam !== S.orgTeam){ S.teamSeasons=0; S.teamYears=0; S.franchiseActive=false; S.champThisTeam=false; S.champTeam=null; tlNote(2,'加盟 '+newTeam); }
  S.orgTeam = newTeam;
  if(org==='MiLB'&&(previousOrg!=='MiLB'||previousTeam!==newTeam))S.orgControlRemaining=lv==='MLB'?0:6;
  else if(org!=='MiLB')S.orgControlRemaining=0;
  if(org==='CPBL')S.lastCpblTeam=newTeam;
  S.ct=makeContract(yrs||2,mult||1,lv,contractD,annual);
  if(org!=='NPB')S.npbYears=0;
  card('info','簽約',`與 <b class="hl">${S.teamName()}</b> 簽下固定年薪 <b class="hl">${fmtMoney(S.ct.annual)}</b> × <b class="hl">${S.ct.yrs} 年</b>，合約薪資總額 <b class="hl">${fmtMoney(S.ct.annual*S.ct.yrs)}</b>。`); board(2);
}
/* 多隊報價選擇:opts=[{team,bonus,yrs,mult,lv}] */
export function pickOfferUI(title,org,offers,after){
  const active=(offers||[]).slice(),seen=new Set(active.map(o=>o.team));
  /* 業餘旅外：真正報價列前面；其餘每支球隊仍可主動洽談一年最低保障。 */
  if(S.stage==='PRO'&&(!S.svc||S.svc===0))teamListOf(org).forEach(team=>{if(!seen.has(team))active.push({team,bonus:0,yrs:1,lv:(offers[0]&&offers[0].lv)||S.lv,mult:.72,contact:true});});
  choose(title,active.map(of=>{ const lv=of.lv||S.lv, offerD=ratingAtLevel(currentSalaryRating(S.lastD||0),S.lastLv||S.lv,lv), annual=calcContractAnnual(lv,offerD,of.mult||1);
    return {
      t:of.team+(of.lv?`（${LV[of.lv].n}）`:''),
      s:`${of.contact?'主動洽談｜一年最低保障｜':'正式報價｜'}簽約金 ${fmtMoney(of.bonus)}｜固定年薪 ${fmtMoney(annual)} × ${of.yrs} 年｜合約薪資總額 ${fmtMoney(annual*of.yrs)}`,
      f:()=>{const complete=usage=>{if(S.pos==='TW')S.contractUsage=usage;S.salary+=of.bonus;S.cash=(S.cash||0)+of.bonus*10000;
        signTo(org,lv,of.team,of.yrs,of.mult||1,annual);
        card('gold','簽約金',`入袋 <b class="hl">${fmtMoney(of.bonus)}</b>。${S.pos==='TW'?`本張合約登錄：${usage==='P'?'投手':usage==='H'?'打者':'二刀流'}。`:''}`);after();};
        if(S.pos!=='TW'){complete(S.pos);return;}
        const a=S.ab||{},pit=(a.vel+a.ctl+a.brk)/3,hit=a.con*.5+a.pow*.2+a.eye*.18+a.spd*.12,min=LV[lv].min,twMin=Math.max(0,min-Number(S.twoWayContractThresholdReduction??1));
        choose(`${of.team}｜選擇合約出賽身分`,[
          {t:'投手身分',warn:pit<min,s:`投手評估 ${pit.toFixed(1)}／門檻 ${min}`,f:()=>pit>=min?complete('P'):card('bad','未達門檻','球團不接受投手登錄。')},
          {t:'打者身分',warn:hit<min,s:`打者評估 ${hit.toFixed(1)}／門檻 ${min}`,f:()=>hit>=min?complete('H'):card('bad','未達門檻','球團不接受打者登錄。')},
          {t:'二刀流身分',main:true,warn:pit<twMin||hit<twMin,s:`投手 ${pit.toFixed(1)}／打者 ${hit.toFixed(1)} 均須達 ${twMin}（原門檻 ${min}）`,f:()=>pit>=twMin&&hit>=twMin?complete('TW'):card('bad','未達二刀流門檻','投打兩項都必須通過。')}
        ]);}
    };
  }));
}
export function makeOffers(org,n,bonusBase,yrsLo,yrsHi,lv,exclude){
  const list=teamListOf(org).filter(t=>t!==exclude);
  const teams=[]; const pool=list.slice();
  for(let i=0;i<n&&pool.length;i++)teams.push(pool.splice(Math.floor(R()*pool.length),1)[0]);
  return teams.map(t=>({team:t,bonus:Math.round(bonusBase*(0.8+R()*0.5)),yrs:ri(yrsLo,yrsHi),lv,mult:1}));
}
/* ---------- 長約/短約 選擇器 ---------- */
export function termParams(d,lv,profile,franchisePremium){ /* 長約 >2 年、短約 1-2 年；大傷／復健年只提供證明約 */
  const mp=profile||contractMarketProfile(d);
  const cap=S.pos==='P'?pitcherContractCap():15;
  const maxY=faYears(mp.rating,cap,mp);    /* 已含年齡與健康上限 */
  const longEligible = !mp.proveIt && maxY>2 && mp.rating>=0;
  const longY=Math.max(3,maxY);           /* 長約至少 3 年 */
  const shortY=mp.proveIt?1:Math.min(2,Math.max(1,maxY));
  let baseM=mp.aav;                       /* 表現已反映於 salaryFor，不再重複加價 */
  if(franchisePremium!==false&&hasActiveFranchise(S))baseM*=1.04; /* 只套用母隊合約；轉隊報價不帶走 */
  if(S.tradeRefuse>0)baseM*=0.85;
  return {longEligible,longY,shortY,longM:+(baseM*0.95).toFixed(2),shortM:+(baseM*1.05).toFixed(2),profile:mp};
}
export function termEstimate(lv,d,offerMult,profile,franchisePremium){
  const source=S.lastLv||S.lv;
  const mp=(lv===S.lv&&profile)?profile:contractMarketProfile(d,lv,source),tp=termParams(d,lv,mp,franchisePremium),bm=offerMult||1;
  const line=(y,m)=>{ const annual=calcContractAnnual(lv,mp.rating,+(m*bm).toFixed(2)); return `${fmtMoney(annual)}×${y}年＝${fmtMoney(annual*y)}`; };
  return tp.longEligible?`長約 ${line(tp.longY,tp.longM)}／短約 ${line(tp.shortY,tp.shortM)}`:`${mp.proveIt?'證明約':'短約'} ${line(tp.shortY,tp.shortM)}`;
}
export function termChoice(o,d,baseTitle,onPick,onReject,rejectLabel,rejectDesc,offerMult,franchisePremium){
  const mp=contractMarketProfile(d), tp=termParams(d,S.lv,mp,franchisePremium);
  const now=contractAnnual(), baseMult=offerMult||1;
  const offer=(y,m)=>{ const actualMult=+(m*baseMult).toFixed(2), annual=calcContractAnnual(S.lv,mp.rating,actualMult); return {y,m:actualMult,annual,total:annual*y}; };
  const describe=x=>`固定年薪 <b>${fmtMoney(x.annual)}</b> × ${x.y} 年｜合約總額 <b>${fmtMoney(x.total)}</b>`;
  const opts=[];
  if(tp.longEligible){ /* 夠格才給長約選項 */
    const long=offer(tp.longY,tp.longM), short=offer(tp.shortY,tp.shortM);
    opts.push({t:`長約｜${fmtMoney(long.annual)} × ${long.y} 年`,main:true,s:`${describe(long)}｜年薪略低；受傷、衰退與下放仍享固定保障`,
      f:()=>onPick(long.y,long.m,long.annual,long.total)});
    opts.push({t:`短約｜${fmtMoney(short.annual)} × ${short.y} 年`,warn:true,s:`${describe(short)}｜年薪較高，賭下次身價`,
      f:()=>onPick(short.y,short.m,short.annual,short.total)});
  } else { /* 年齡大或成績不佳:只能短約(不出現長約) */
    const short=offer(tp.shortY,tp.shortM);
    opts.push({t:`${mp.proveIt?'證明約':'短約'}｜${fmtMoney(short.annual)} × ${short.y} 年`,main:true,s:`${describe(short)}｜${mp.proveIt?'傷勢讓市場只願先確認你能健康回歸':'以你目前的年齡與成績，球團只願提供短約'}`,
      f:()=>onPick(short.y,short.m,short.annual,short.total)});
  }
  if(onReject)opts.push({t:rejectLabel||'拒絕，維持現狀',s:rejectDesc||'不接受這份合約',f:onReject});
  const health=mp.label?`｜<span class="dn">${mp.label}</span>`:'';
  choose(`${baseTitle}<div style="margin-top:8px;color:var(--dim);font-size:13px">目前年薪：<b class="hl">${fmtMoney(now)}</b>｜市場依最近三季加權估值${health}</div>`,opts);
}
/* 母隊延長續約:提前綁約 */
export function extensionOffer(o){
  const d=S.lastD||0;
  const team=S.teamName(),show=()=>{
    const tp=transitionTerms(S.lv,true),desc=x=>`固定年薪 ${fmtMoney(x.annual)} × ${x.y} 年｜合約總額 ${fmtMoney(x.total)}`;
    const sign=x=>{
      const effectiveYear=S.year+1;
      /* 提前續約直接覆蓋剩餘舊約；下一球季起領新約，不額外多綁舊約年數。 */
      S.ct=makeContract(x.y,x.m,S.lv,d,x.annual,{extOffered:true});
      card('gold','延長續約',`為了提前留下你，<b class="hl">${team}</b>提出 <b>${x.kind}</b>：固定年薪 <b class="hl">${fmtMoney(x.annual)}</b> × <b class="hl">${x.y} 年</b>（合約總額 <b class="hl">${fmtMoney(x.total)}</b>），並從 <b class="hl">${effectiveYear} 年</b>生效！`);board(1);crossOffers(o);
    };
    const unavailable=(name,why)=>({t:`${name}（球團不提供）`,s:why,f:()=>{card('bad',`${name}未獲提供`,`${team}目前不願提供${name}：${why}。`);show();}});
    choose(`母隊提前延長續約 · ${team}（原合約剩 1 年）<div style="margin-top:8px;color:var(--dim);font-size:13px">目前綜合 ${tp.o}｜高出${LV[S.lv].n}門檻 ${tp.gap} 點｜單張新約最長 8 年</div>`,[
      {t:`短約｜${tp.short.y} 年`,main:true,s:desc(tp.short),f:()=>sign(tp.short)},
      tp.medium?{t:`中約｜${tp.medium.y} 年`,s:desc(tp.medium),f:()=>sign(tp.medium)}:unavailable('中約',tp.mediumReason),
      tp.long?{t:`長約｜${tp.long.y} 年`,s:desc(tp.long),f:()=>sign(tp.long)}:unavailable('長約',tp.longReason),
      {t:'婉拒延長，打完現有合約',warn:true,s:'維持目前合約，不立即離隊',f:()=>{card('info','婉拒延長','你婉拒了母隊的提前延長，選擇打完現有合約再說。');crossOffers(o);}}
    ]);
  };show();
}
/* ---------- FA 自由球員 ---------- */
export function faFlow(o){
  transitionFlow('合約到期，取得自由球員資格',`你與 ${S.teamName()} 的合約已經結束，可以重新選擇下一個發展環境。`);
}
export function marketRetirementText(){
  const love=S.love||{},kidCount=Math.max(0,love.kids||0);
  const hasFamily=love.st==='married'&&love.partner&&kidCount>0;
  const family=hasFamily?`你想了想${love.partner}與${kidCount===1?'孩子':'孩子們'}，不想錯過孩子的成長。`:'';
  return `回想從小到大的棒球生涯，在紅土上拚搏，身體早已累積大大小小的傷。回過身來看看自己的家人，有多久沒有跟他們好好吃頓飯了？${family}是該多花一點時間，陪伴自己的家人了。你將沒簽字的合約書推回，決定脫下球衣、高掛球鞋，走向下一段精彩的人生。`;
}
export function retireFromMarket(back){
  choose('確認引退',[
    {t:'確定結束球員生涯',warn:true,s:'確認後進入生涯結算',f:()=>daibaFarewell(()=>endGame(marketRetirementText()))},
    {t:'← 返回合約市場',main:true,s:'繼續尋找合約',f:back}
  ]);
}
export function homecomingAfterRejectedOffer(o){
  const homeLv=o>=LV.CPBL1.min?'CPBL1':'CPBL2';
  const homeTeam=S.lastCpblTeam||capTeam('CPBL')||pick(CPBL_TEAMS);
  const annual=calcContractAnnual(homeLv,marketRating(S.lastD||0,homeLv),1);
  choose(`落葉歸根 · 球團評估從${LV[homeLv].n}出發`,[
    {t:`返台加盟 ${homeTeam}（${LV[homeLv].n}）`,main:true,
      s:`綜合 ${o}｜一軍門檻 ${LV.CPBL1.min}｜固定年薪 ${fmtMoney(annual)} × 1 年`,f:()=>{
        signTo('CPBL',homeLv,homeTeam,1,1,annual);
        card('good','落葉歸根',`你婉拒了海外合約，選擇回到 <b class="hl">${homeTeam}</b>，並從 <b class="hl">${LV[homeLv].n}</b>重新出發。`);
        advance(); }},
    {t:'就此引退',warn:true,s:'將再進入一次確認畫面',f:()=>retireFromMarket(()=>homecomingAfterRejectedOffer(o))}
  ]);
}
export function faMarket(o,d,settings){
  const org=S.org, lv=S.lv, offers=[];
  const contactMarkets=[{org,lv}];
  const cold=!!(settings&&settings.cold),oldTeam=(settings&&settings.oldTeam)||S.orgTeam;
  const oldOrg=org,oldLv=lv;
  const mp=contractMarketProfile(d), value=mp.rating;
  const cap=S.pos==='P'?pitcherContractCap():15;
  if(cold){
    const team=pick(teamListOf(org).filter(t=>t!==oldTeam)),mult=+(0.90*mp.aav).toFixed(2);
    const annual=calcContractAnnual(lv,mp.rating,mult);
    offers.push({team,org,lv,yrs:1,mult,annual,bonus:0,cold:true});
  }else{
    let n=value>=3?ri(2,4):value>=1?ri(1,3):value>=-1?(chance(60)?ri(1,2):0):(chance(30)?1:0);
    if(mp.drop){ n=Math.max(0,n-mp.drop); if(!mp.star&&mp.proveIt&&chance(mp.status==='rehab'?60:40))n=0; }
    if(S.traits.cancer)n=Math.max(0,n-1); /* 毒瘤:報價變少 */
    makeOffers(org,n,({CPBL1:200,NPB1:800,MLB:2000})[lv]||100,1,cap,lv,S.orgTeam)
      .forEach(of=>{of.yrs=faYears(value,cap,mp); of.mult=+(0.97+R()*0.08).toFixed(2); of.bonus=Math.round(of.bonus*mp.bonus); offers.push({...of,org});});
  }
  const crossHealthy=mp.status==='healthy'||mp.status==='minor'||(mp.star&&chance(mp.status==='major'?35:20));
  if(crossHealthy&&lv==='CPBL1'&&o>=53){
    const targetLv=o>=51?'NPB1':'NPB2'; contactMarkets.push({org:'NPB',lv:targetLv});
    makeOffers('NPB',cold?ri(1,2):1,1000,2,3,targetLv,null)
      .forEach(of=>{of.bonus=Math.round(of.bonus*mp.bonus);offers.push({...of,org:'NPB',mult:+(0.97+R()*0.08).toFixed(2)});});
  }
  if(crossHealthy&&lv==='NPB1'&&o>=60){
    /* 滿 7 年 → 海外 FA(免入札,直接跳美);未滿則走入札(有年齡把關) */
    const freeAgent=(S.npbYears||0)>=7;
    if(freeAgent || chance(Math.round(50*ageGateUSA(o,60)))){
      contactMarkets.push({org:'MiLB',lv:'MLB'});
      makeOffers('MiLB', freeAgent?ri(1,2):1, 3000, 3,5,'MLB',null)
        .forEach(of=>{ const posting=!freeAgent; of.bonus=posting?0:Math.round(of.bonus*mp.bonus);
          offers.push({...of,org:'MiLB',mult:+(0.97+R()*0.08).toFixed(2),posting}); });
    }
  }
  const noActiveOffers=!offers.length;
  if(noActiveOffers)card('bad','自由市場',`沒有球隊主動開價，但你仍可向聯盟內各隊主動洽談最低保障的一年約。${mp.label?`<br><span class="dn">${mp.label}</span>`:''}`);
  const estL=of=>termEstimate(of.lv,d,of.mult||1,mp,false);
  const cty=og=>({CPBL:'🇹🇼 台灣',NPB:'🇯🇵 日本',MiLB:'🇺🇸 美國',MLB:'🇺🇸 美國'})[og]||'';
  const ctyOrder={CPBL:0,NPB:1,MiLB:2,MLB:2};
  offers.sort((a,b)=>(ctyOrder[a.org]??9)-(ctyOrder[b.org]??9)); /* 依國家排序:台→日→美 */
  const offerOpts=offers.map(of=>of.cold?({
    t:`${cty(of.org)}｜${of.team}（${LV[of.lv].n}）`,
    s:`球團冷處理報價｜固定年薪 ${fmtMoney(of.annual)} × 1 年｜原行情 ×0.90`,
    f:()=>{ signTo(of.org,of.lv,of.team,1,of.mult,of.annual);
      card('info','轉投新東家',`原球團不願意簽你，所以<b class="hl">${of.team}</b>趁虛而入，用較低的代價帶走了你。`);
      advance(); }
  }):({
    t:`${cty(of.org)}｜${of.team}（${LV[of.lv].n}）`,
    s:`${of.posting?'日美入札｜讓渡金依最終合約另計':`簽約金 ${fmtMoney(of.bonus)}`}｜奪冠率 ${teamChampRate(of.team)}%｜長/短：${estL(of)}`,
    f:()=>{ const savedLv=S.lv,formerTeam=S.teamName(); S.lv=of.lv;
      termChoice(o,d,`${of.team} · 選擇合約類型`,(y,m,annual,total)=>{ S.lv=savedLv;
        if(!of.posting){S.salary+=of.bonus;S.cash=(S.cash||0)+of.bonus*10000;}
        const release=of.posting?postingReleaseFee(total):0;
        signTo(of.org,of.lv,of.team,y,m,annual);
        if(of.posting)card('gold','入札成立',`<b class="hl">${of.team}</b>與你簽下固定年薪 <b class="hl">${fmtMoney(annual)}</b> × <b class="hl">${y} 年</b>、保障總額 <b class="hl">${fmtMoney(total)}</b>的合約；另支付 <b class="hl">${fmtMoney(release)}</b>讓渡金給 <b class="hl">${formerTeam}</b>。讓渡金不計入你的生涯收入。`);
        advance(); },
        ()=>{ /* 報價簽約金尚未入帳；拒絕後不重抽市場。 */
          S.lv=savedLv;
          if(org==='CPBL')retireFromMarket(showMarket);
          else homecomingAfterRejectedOffer(o);
        },org==='CPBL'?'拒絕合約，宣布引退':'落葉歸根',org==='CPBL'?'不接受這份合約，直接結束球員生涯':'婉拒這份合約，查看返台層級或選擇引退',of.mult||1,false); }}));
  const activeKeys=new Set(offers.map(of=>`${of.org}|${of.team}`));
  const contactOpts=[];
  contactMarkets.forEach(m=>teamListOf(m.org).forEach(team=>{
    if(activeKeys.has(`${m.org}|${team}`)||(m.org===org&&team===S.orgTeam))return;
    const targetRating=ratingAtLevel(mp.rating,lv,m.lv);
    const mult=+(0.72*mp.aav).toFixed(2),annual=calcContractAnnual(m.lv,targetRating,mult);
    contactOpts.push({
      t:`${cty(m.org)}｜${team}（${LV[m.lv].n}）`,
      s:`主動洽談｜最低保障 ${fmtMoney(annual)} × 1 年｜無簽約金`,
      f:()=>choose(`${team} · 主動洽談`,[
        {t:'接受最低保障一年約',main:true,s:`固定年薪 ${fmtMoney(annual)} × 1 年｜無簽約金`,f:()=>{
          signTo(m.org,m.lv,team,1,mult,annual);
          card('info','主動洽談成功',`你主動聯絡 <b class="hl">${team}</b>，接受最低保障的固定年薪 <b class="hl">${fmtMoney(annual)}</b>一年約。`); advance();}},
        {t:'返回自由市場',f:()=>showMarket()}
      ])
    });
  }));
  const finalOpt=cold
    ?{t:'就此引退',warn:true,s:'將再進入一次確認畫面',f:()=>retireFromMarket(showMarket)}
    :{t:`回原隊（${oldTeam}）1 年約`,s:`固定年薪 ${fmtMoney(calcContractAnnual(oldLv,mp.rating,+(0.90*mp.aav).toFixed(2)))} × 1 年｜合約總額 ${fmtMoney(calcContractAnnual(oldLv,mp.rating,+(0.90*mp.aav).toFixed(2)))}`,
      f:()=>{ const annual=calcContractAnnual(oldLv,mp.rating,+(0.90*mp.aav).toFixed(2));signTo(oldOrg,oldLv,oldTeam,1,.9,annual);card('info','回歸',`重回 <b class="hl">${oldTeam}</b>，固定年薪 <b class="hl">${fmtMoney(S.ct.annual)}</b>。`); advance(); }};
  function showMarket(){
    choose(`${cold?'球團冷處理後的':'自由市場'}球隊一覽（依國家分列）<div style="margin-top:8px;color:var(--dim);font-size:13px">目前年薪：<b class="hl">${fmtMoney(contractAnnual())}</b>｜${noActiveOffers?'沒有主動報價；可向各隊洽談':'正式報價在前，其餘球隊可主動洽談'}${mp.label?`｜<span class="dn">${mp.label}</span>`:''}</div>`,[...offerOpts,...contactOpts,finalOpt]);
  }
  showMarket();
}
export function ageGateUSA(o,minReq){ /* 旅美/日職跳大聯盟:年齡越大越難,28 歲後幾乎關窗 */
  const age=S.age;
  if(age<=22)return 1.0;
  if(age<=24)return 0.75;
  if(age<=26)return 0.5;
  if(age<=27)return 0.3;
  if(age<=28)return 0.15;
  /* 28 歲以後:只有能力遠超門檻(+5)的怪物即戰力還有微弱機會 */
  return o>=minReq+5 ? 0.08 : 0;
}
export function ageGateJP(){ /* 旅日:窗口寬,31 歲(衰退前)都還有機會 */
  const age=S.age;
  if(age<=26)return 1.0;
  if(age<=28)return 0.7;
  if(age<=30)return 0.45;
  if(age<=31)return 0.25;
  return 0; /* 32 歲起(進入衰退)關窗 */
}
export function rollCpblCrossOffers(o,d,rollJP,rollUSA){
  /* 先獨立完成兩國判定，再組合畫面；日職抽中不再阻斷旅美判定。 */
  const jp=o>=53&&d>=1&&!!rollJP();
  const usa=o>=57&&d>=2&&!!rollUSA();
  return {jp,usa};
}
export function crossOffers(o){
  const fin=()=>advance();
  const mp=contractMarketProfile(S.lastD||0);
  if((mp.status==='major'||mp.status==='rehab')&&(!mp.star||!chance(mp.status==='major'?35:20))){ fin(); return; }
  const priceBid=(of,lv)=>{ const target=contractMarketProfile(S.lastD||0,lv);
    of.bonus=Math.round(of.bonus*target.bonus); of.annual=calcContractAnnual(lv,target.rating,+(target.aav*(0.97+R()*0.08)).toFixed(2)); return of; };
  if(S.lv==='CPBL1'){
    const jpP=Math.round(35*ageGateJP()),usaP=Math.round(30*ageGateUSA(o,57));
    const hits=rollCpblCrossOffers(o,S.lastD||0,
      ()=>jpP>0&&chance(jpP),
      ()=>usaP>0&&chance(usaP));
    const opts=[],both=hits.jp&&hits.usa;
    if(hits.jp){
      const jl=o>=51?'NPB1':'NPB2';
      makeOffers('NPB',2,1200,2,3,jl,null).map(of=>priceBid(of,jl)).forEach(of=>opts.push({
        t:(both?'🇯🇵 ':'')+of.team+`（${LV[jl].n}）`,s:`簽約金 ${fmtMoney(of.bonus)}｜固定年薪 ${fmtMoney(of.annual)} × ${of.yrs} 年｜總額 ${fmtMoney(of.annual*of.yrs)}`,
        f:()=>{S.salary+=of.bonus;S.cash=(S.cash||0)+of.bonus*10000;signTo('NPB',jl,of.team,of.yrs,1,of.annual);fin();}}));
    }
    if(hits.usa){
      const ml=o>=60?'MLB':'A3';
      makeOffers('MiLB',2,2000,2,4,ml,null).map(of=>priceBid(of,ml)).forEach(of=>opts.push({
        t:(both?'🇺🇸 ':'')+of.team+`（${LV[ml].n}）`,s:`簽約金 ${fmtMoney(of.bonus)}｜固定年薪 ${fmtMoney(of.annual)} × ${of.yrs} 年｜總額 ${fmtMoney(of.annual*of.yrs)}`,
        f:()=>{S.salary+=of.bonus;S.cash=(S.cash||0)+of.bonus*10000;signTo('MiLB',ml,of.team,of.yrs,1,of.annual);fin();}}));
    }
    if(opts.length){
      const title=both?'日、美球團同時開出旅外合約':hits.jp?'日職球團開出旅外合約':'大聯盟球探遞出合約';
      transitionFlow(title,'你已符合制度性跨國轉銜資格；可以續留台灣，也可以重新選擇日本、美國或引退。'); return;
    }
  }
  if(S.lv==='NPB1'&&o>=60&&(S.lastD||0)>=2&&chance(Math.round(30*ageGateUSA(o,60)))){
    transitionFlow('取得日美入札资格','球团同意启动入札程序，因此本季可以选择续留日本、挑战美国、转往台湾或引退。'); return; }
  fin();
}
