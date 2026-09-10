import {clamp, SEED} from '../core/rng.js?v=offline-0.31.0';
import {CPBL_TEAMS,NPB_CENTRAL_TEAMS,NPB_PACIFIC_TEAMS,MLB_NL_TEAMS,MLB_AL_TEAMS,MLB_DIVISIONS,mlbDivision} from '../data/teams.js?v=offline-0.31.1';

/* 只計國家隊與三個職業頂級聯盟的最終冠軍；半季、央洋聯及國美聯冠軍另列榮譽。 */
const MAJOR_CHAMPIONSHIP=/(世界棒球經典賽冠軍|世界12強賽冠軍|中職年度總冠軍|中職總冠軍|日本一|世界大賽冠軍)$/;
export function majorChampionshipCount(honors){return (honors||[]).filter(h=>MAJOR_CHAMPIONSHIP.test(h)).length;}
export function championshipChance(base,active){return clamp((Number(base)||0)+(active?5:0),0,100);}
export function intlFinishIndex(roll,strength,active){const r=(Number(roll)||0)+(Number(strength)||0);if(r>=96-(active?5:0))return 0;return r>=88?1:r>=79?2:r>=46?3:4;}

function hash01(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967296;}
function adjustedWeight(team,rates,playerTeam,boost,penalty){let w=Math.max(0,Number(rates&&rates[team])||0);if(team===playerTeam)w=Math.max(0,w*(Number(penalty)||1)+(Number(boost)||0));return w;}
function weightedWinner(teams,rates,key,playerTeam,boost=0,penalty=1){
  const list=teams.filter(Boolean),weights=list.map(t=>adjustedWeight(t,rates,playerTeam,boost,penalty)),total=weights.reduce((a,b)=>a+b,0)||1;
  if(!weights.some(w=>w>0))return list[Math.floor(hash01(`${SEED}|empty|${key}`)*list.length)]||null;
  let roll=hash01(`${SEED}|championship|${key}`)*total;
  for(let i=0;i<list.length;i++){roll-=weights[i];if(roll<=0)return list[i];}
  return list[list.length-1];
}
const unique=a=>[...new Set(a.filter(Boolean))];
function ranked(teams,rates,key,forced){
  const list=teams.map(team=>({team,score:Math.log1p(Math.max(0,Number(rates&&rates[team])||0))*2+hash01(`${SEED}|rank|${key}|${team}`)}))
    .sort((a,b)=>b.score-a.score||a.team.localeCompare(b.team)).map(x=>x.team);
  if(forced&&list.includes(forced)){list.splice(list.indexOf(forced),1);list.unshift(forced);}return list;
}
function rankText(list,team){const i=list.indexOf(team);return i<0?'':`第 ${i+1} 名`;}
function mlbLeagueOf(team){return MLB_AL_TEAMS.includes(team)?'美聯':'國聯';}

/* 職業球季團隊成果點。頂級聯盟依季後賽最終進度只取一次；中職半季
   冠軍另加 1 點，但上下半季同隊包辦仍只加一次，避免重複灌點。 */
export function professionalSeasonPoints(bucket,summary,titles=[]){
  const s=String(summary||''),ts=Array.isArray(titles)?titles:[];
  if(bucket==='CPBL'){
    let p=/中職年度總冠軍/.test(s)?5:/台灣大賽亞軍/.test(s)?3:/挑戰賽止步/.test(s)?1:0;
    if(ts.some(t=>/中職[上下]半季冠軍/.test(t)))p+=1;
    return p;
  }
  if(bucket==='NPB')return /日本一/.test(s)?6:/日本大賽亞軍/.test(s)?4:/決勝階段止步/.test(s)?2:/第一階段止步/.test(s)?1:0;
  if(bucket==='MLB')return /世界大賽冠軍/.test(s)?9:/世界大賽亞軍/.test(s)?6:/聯盟冠軍賽止步/.test(s)?5:/分區系列賽止步/.test(s)?4:/外卡系列賽止步/.test(s)?3:1;
  return 0;
}

const MINOR_POINTS={
  CPBL2:{未進入季後賽:0,季軍:1,亞軍:2,冠軍:3},
  NPB2:{未進入季後賽:0,季軍:1,亞軍:2,冠軍:4},
  R:{未進入季後賽:0,季軍:1,亞軍:1,冠軍:2},
  A1:{未進入季後賽:0,季軍:1,亞軍:2,冠軍:3},
  A2:{未進入季後賽:0,季軍:1,亞軍:2,冠軍:4},
  A3:{未進入季後賽:0,季軍:2,亞軍:3,冠軍:5}
};
const MINOR_NAMES={CPBL2:'中職二軍聯賽',NPB2:'日職二軍聯賽',R:'新人聯盟',A1:'1A聯盟',A2:'2A聯盟',A3:'3A聯盟'};

/* 二軍／小聯盟不假裝模擬完整對戰表，只產生玩家所屬球隊的年度最終
   成績。結果由年度、球隊、層級與種子固定；球員高低於層級標準的差距
   再依 F10 個人奪冠影響倍率修正。 */
export function minorSeasonResult(lv,year,team,opts={}){
  if(!MINOR_POINTS[lv])return null;
  const delta=Number(opts.playerDelta)||0,mult=clamp(Number(opts.impactMult??1),0,50),played=clamp(Number(opts.seasonFactor??1),0,1);
  const base=hash01(`${SEED}|minor-result|${year}|${lv}|${team}`)*100;
  const score=clamp(base+delta*.8*mult*played,0,100);
  const finish=score>=84?'冠軍':score>=68?'亞軍':score>=52?'季軍':'未進入季後賽';
  return {bucket:lv,finish,summary:`${MINOR_NAMES[lv]}${finish}`,points:MINOR_POINTS[lv][finish]||0};
}

/* 同一種子、年度與聯盟永遠得到同一組結果。最終冠軍必定出自前一階段晉級隊伍。 */
export function seasonChampionshipResult(bucket,year,rates,playerTeam,opts={}){
  const y=Number(year)||0,boost=opts.championmaker?5:0,penalty=opts.tradeRefuse?0.75:1;
  if(bucket==='CPBL'){
    const first=weightedWinner(CPBL_TEAMS,rates,`${y}|CPBL|first`,playerTeam,boost,penalty);
    const second=weightedWinner(CPBL_TEAMS,rates,`${y}|CPBL|second`,playerTeam,boost,penalty);
    const wildcard=weightedWinner(CPBL_TEAMS.filter(t=>t!==first&&t!==second),rates,`${y}|CPBL|wildcard`,playerTeam,boost,penalty);
    const final=weightedWinner(unique([first,second,wildcard]),rates,`${y}|CPBL|final`,playerTeam,boost,penalty);
    const firstRank=ranked(CPBL_TEAMS,rates,`${y}|CPBL|first-rank`,first),secondRank=ranked(CPBL_TEAMS,rates,`${y}|CPBL|second-rank`,second);
    return {bucket,first,second,final,firstRank,secondRank,titlesFor(team){const a=[];if(team===first)a.push('中職上半季冠軍');if(team===second)a.push('中職下半季冠軍');if(team===final)a.push('中職年度總冠軍');return a;},summaryFor(team){let post='未進入季後賽';if(team===final)post='中職年度總冠軍';else if(team===wildcard)post='挑戰賽止步';else if(team===first||team===second)post='台灣大賽亞軍';return `上半季${rankText(firstRank,team)}｜下半季${rankText(secondRank,team)}｜${post}`;},finalTitle:'中職年度總冠軍'};
  }
  if(bucket==='NPB'){
    const central=weightedWinner(NPB_CENTRAL_TEAMS,rates,`${y}|NPB|central`,playerTeam,boost,penalty);
    const pacific=weightedWinner(NPB_PACIFIC_TEAMS,rates,`${y}|NPB|pacific`,playerTeam,boost,penalty);
    const final=weightedWinner([central,pacific],rates,`${y}|NPB|final`,playerTeam,boost,penalty);
    const league=NPB_CENTRAL_TEAMS.includes(playerTeam)?'央聯':'洋聯',teams=league==='央聯'?NPB_CENTRAL_TEAMS:NPB_PACIFIC_TEAMS,lgChamp=league==='央聯'?central:pacific;
    const lgRank=ranked(teams,rates,`${y}|NPB|${league}|rank`,lgChamp);
    return {bucket,central,pacific,final,leagueRank:lgRank,titlesFor(team){const a=[];if(team===central)a.push('日職央聯冠軍');if(team===pacific)a.push('日職洋聯冠軍');if(team===final)a.push('日本一');return a;},summaryFor(team){const i=lgRank.indexOf(team),r=i<0?'':`${league}第 ${i+1} 名`;let post=i<0||i>2?'未進入季後賽':hash01(`${SEED}|NPB|stage|${y}|${team}`)<.48?'高潮系列賽第一階段止步':'高潮系列賽決勝階段止步';if(team===lgChamp)post=team===final?'日本一':'日本大賽亞軍';return `${r}｜${post}`;},finalTitle:'日本一'};
  }
  if(bucket==='MLB'){
    const nl=weightedWinner(MLB_NL_TEAMS,rates,`${y}|MLB|nl`,playerTeam,boost,penalty);
    const al=weightedWinner(MLB_AL_TEAMS,rates,`${y}|MLB|al`,playerTeam,boost,penalty);
    const final=weightedWinner([nl,al],rates,`${y}|MLB|final`,playerTeam,boost,penalty);
    const div=mlbDivision(playerTeam),divTeams=MLB_DIVISIONS[div]||[],lg=mlbLeagueOf(playerTeam),lgChamp=lg==='美聯'?al:nl;
    const divRank=ranked(divTeams,rates,`${y}|MLB|${div}|rank`,divTeams.includes(lgChamp)?lgChamp:null);
    const lgTeams=lg==='美聯'?MLB_AL_TEAMS:MLB_NL_TEAMS;
    const divisionLeaders=Object.entries(MLB_DIVISIONS).filter(([k])=>k.startsWith(lg)).map(([k,ts])=>ranked(ts,rates,`${y}|MLB|${k}|rank`,ts.includes(lgChamp)?lgChamp:null)[0]);
    const wild=ranked(lgTeams.filter(t=>!divisionLeaders.includes(t)),rates,`${y}|MLB|${lg}|wild`,null).slice(0,3),qual=unique([...divisionLeaders,...wild,lgChamp]);
    return {bucket,nl,al,final,divisionRank:divRank,titlesFor(team){const a=[];if(team===nl)a.push('大聯盟國聯冠軍');if(team===al)a.push('大聯盟美聯冠軍');if(team===final)a.push('世界大賽冠軍');return a;},summaryFor(team){const r=`${div}${rankText(divRank,team)}`;let post='未進入季後賽';if(qual.includes(team)){const z=hash01(`${SEED}|MLB|stage|${y}|${team}`);post=z<.34?'外卡系列賽止步':z<.70?'分區系列賽止步':'聯盟冠軍賽止步';}if(team===lgChamp)post=team===final?'世界大賽冠軍':'世界大賽亞軍';return `${r}｜${post}`;},finalTitle:'世界大賽冠軍'};
  }
  return {bucket,final:null,titlesFor(){return [];},finalTitle:''};
}
