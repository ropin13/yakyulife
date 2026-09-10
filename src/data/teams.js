/* ---------- 球隊與聯盟資料 ---------- */
import TEAM_DATA from '../../database/teams.json' with {type:'json'};
import {customDataset} from './datasets.js?v=offline-0.31.1';

let activeData=TEAM_DATA;
export let TEAM_COLOR=activeData.teamColors;
export let CPBL_TEAMS=activeData.leagues.CPBL;
export let NPB_TEAMS=activeData.leagues.NPB;
export let MLB_TEAMS=activeData.leagues.MLB;
/* 職業聯盟分區採明確名單，不依陣列位置推測，避免同隊取得互斥聯盟冠軍。 */
export let NPB_CENTRAL_TEAMS=activeData.subleagues.NPB_CENTRAL;
export let NPB_PACIFIC_TEAMS=activeData.subleagues.NPB_PACIFIC;
export let MLB_NL_TEAMS=activeData.subleagues.MLB_NL;
export let MLB_AL_TEAMS=activeData.subleagues.MLB_AL;
export let MLB_DIVISIONS=activeData.mlbDivisions;
export let TEAM_NAME_MIGRATION=activeData.nameMigrations;
export function validateTeamsDataset(data){
  const arrays=['CPBL','NPB','MLB'];
  if(!data||typeof data!=='object'||!data.teamColors||!data.leagues||!data.subleagues||!data.mlbDivisions||!data.nameMigrations||!data.nicknames)throw new Error('缺少球隊資料欄位');
  if(!arrays.every(k=>Array.isArray(data.leagues[k])&&data.leagues[k].length>1))throw new Error('聯盟球隊清單格式不完整');
  if(!['NPB_CENTRAL','NPB_PACIFIC','MLB_NL','MLB_AL'].every(k=>Array.isArray(data.subleagues[k])))throw new Error('分區球隊清單格式不完整');
}
export function loadTeamsDatabase(){
  const data=customDataset('teams',validateTeamsDataset)||TEAM_DATA;
  activeData=data;TEAM_COLOR=data.teamColors;CPBL_TEAMS=data.leagues.CPBL;NPB_TEAMS=data.leagues.NPB;MLB_TEAMS=data.leagues.MLB;
  NPB_CENTRAL_TEAMS=data.subleagues.NPB_CENTRAL;NPB_PACIFIC_TEAMS=data.subleagues.NPB_PACIFIC;MLB_NL_TEAMS=data.subleagues.MLB_NL;MLB_AL_TEAMS=data.subleagues.MLB_AL;MLB_DIVISIONS=data.mlbDivisions;TEAM_NAME_MIGRATION=data.nameMigrations;
  return {ok:true,custom:data!==TEAM_DATA};
}
export const canonicalTeamName=team=>TEAM_NAME_MIGRATION[team]||team;
export function mlbDivision(team){return Object.keys(MLB_DIVISIONS).find(k=>MLB_DIVISIONS[k].includes(canonicalTeamName(team)))||'';}
export function teamSubleague(team){
  const t=canonicalTeamName(team);
  if(NPB_CENTRAL_TEAMS.includes(t))return 'NPB_CENTRAL';
  if(NPB_PACIFIC_TEAMS.includes(t))return 'NPB_PACIFIC';
  if(MLB_NL_TEAMS.includes(t))return 'MLB_NL';
  if(MLB_AL_TEAMS.includes(t))return 'MLB_AL';
  return CPBL_TEAMS.includes(t)?'CPBL':null;
}
/* par=該層級平均水準, min=最低限度(低於→降級/戰力外), g=球季場次 */
/* rot = 先發輪值人數。先發一季的輪次 = g / rot，這才是決定先發場次與局數的量，
   不是球季場次本身。日職是六人輪值，所以球季比中職長 19%、輪次卻幾乎相同
   (143/6 = 23.8 vs 120/5 = 24.0)；大聯盟五人輪值 162 場 = 32.4 輪，比中職多 35%。
   舊版的先發場次公式沒有這一項，導致三個聯盟的先發都投 25~30 場、約 150 局，
   但獎項門檻、TJ 負荷、薪資工作量四處都假設局數會隨聯盟放大——矛盾就出在這裡。 */
export const LV={
 CPBL2:{n:'中職二軍',par:34,min:30,g:80, rot:5,org:'CPBL'},
 CPBL1:{n:'中職一軍',par:44,min:41,g:120,rot:5,org:'CPBL',top:'CPBL'},
 NPB2:{n:'日職二軍',par:47,min:44,g:100,rot:6,org:'NPB'},
 NPB1:{n:'日職一軍',par:53,min:50,g:143,rot:6,org:'NPB',top:'NPB'},
 R:{n:'新人聯盟',par:34,min:30,g:55, rot:5,org:'MiLB'},
 A1:{n:'1A',par:40,min:36,g:110,rot:5,org:'MiLB'},
 A2:{n:'2A',par:47,min:43,g:120,rot:5,org:'MiLB'},
 A3:{n:'3A',par:53,min:50,g:130,rot:5,org:'MiLB'},
 MLB:{n:'大聯盟',par:59,min:56,g:162,rot:5,org:'MiLB',top:'MLB'},
};
/* 先發輪次相對「中職一軍 24 輪」的倍率，供先發場次公式使用。 */
export function spLoad(lv){ const L=LV[lv]; if(!L)return 1; return ((L.g||120)/(L.rot||5))/24; }
export const PATHS={CPBL:['CPBL2','CPBL1'],NPB:['NPB2','NPB1'],MiLB:['R','A1','A2','A3','MLB']};
export const HS_CUPS=['木棒聯賽','黑豹旗','玉山盃'];
export const U_CUPS=['大專UBL棒球聯賽','全國大專盃','冬季聯盟聯賽'];
export const AMA_CUPS=['成棒甲組春季聯賽','成棒甲組秋季聯賽','冬季聯盟聯賽'];
export const AMA_TEAMS=['合作金庫','台灣電力','安永鮮物','台中台壽霸龍','全越運動'];
export const TW_ES_SCHOOLS=['龜山國小','福林國小','東園國小','卑南國小','紅葉國小','三星國小','關西國小','立人國小','復興國小','中平國小','大仁國小','壽天國小'];
export const JP_ES_SCHOOLS=['東京少棒學園','大阪少棒學園','橫濱少棒學園','仙台少棒學園','札幌少棒學園','福岡少棒學園','名古屋少棒學園','廣島少棒學園','神戶少棒學園','千葉少棒學園','埼玉少棒學園','沖繩少棒學園'];
export const TW_MS_SCHOOLS=['新明國中','卑南國中','三星國中','關西國中','二重國中','青溪國中','七賢國中','橋頭國中','民和國中','馬光國中','鶴聲國中','光春國中'];
export const JP_MS_SCHOOLS=['枚方中學校','世田谷西中學校','取手中學校','江戶川中央中學校','武藏府中中學校','浦和中學校','仙台東部中學校','札幌新琴似中學校','愛知名港中學校','神戶中央中學校','福岡中央中學校','沖繩宜野灣中學校'];
export const TW_HS_SCHOOLS=['平鎮高中','穀保家商','高苑工商','北科附工','普門中學','鶯歌工商','成德高中','西苑高中','南英商工','東石高中','花蓮體中','台東體中'];
export const JP_HS_SCHOOLS=['大阪桐蔭高校','仙台育英高校','智辯和歌山高校','橫濱高校','花卷東高校','早稻田實業高校','履正社高校','明德義塾高校','東海大相模高校','廣陵高校','慶應義塾高校','沖繩尚學高校'];
export const TW_U_SCHOOLS=['文化大學','輔仁大學','國立體大','台灣體大','開南大學','南華大學','嘉義大學','台東大學','台北市立大學','中信金融管理學院','高雄大學','遠東科大'];
export const JP_U_SCHOOLS=['早稻田大學','慶應義塾大學','明治大學','法政大學','立教大學','東京大學','東洋大學','亞細亞大學','駒澤大學','日本體育大學','國學院大學','中央大學'];
export const JP_HS_CUPS=['都道府縣春季大會','夏季甲子園','秋季地區聯賽'];
export const JP_U_CUPS=['全日本大學野球選手權','明治神宮野球大會','地區大學聯盟秋季聯賽'];
export const ES_CUPS=['縣市少棒聯賽','華南金控盃全國少棒錦標賽'];
export const MS_CUPS=['國中棒球聯賽','全國青少棒錦標賽','青少棒選拔賽'];
export const JP_ES_CUPS=['地區少年野球大會','全日本學童軟式野球大會'];
export const JP_MS_CUPS=['全日本少年棒球大會','日本青少棒選手權','地區青少棒秋季大會'];
export function schoolList(stage,country){
  const jp=country==='JP';
  if(stage==='ES')return jp?JP_ES_SCHOOLS:TW_ES_SCHOOLS;
  if(stage==='MS')return jp?JP_MS_SCHOOLS:TW_MS_SCHOOLS;
  if(stage==='HS')return jp?JP_HS_SCHOOLS:TW_HS_SCHOOLS;
  return jp?JP_U_SCHOOLS:TW_U_SCHOOLS;
}
export function schoolTier(name,stage,country){const i=schoolList(stage,country).indexOf(name);return i<0?2:i<4?1:i<8?2:3;}
export const LG_N={CPBL:'中職',NPB:'日職',MLB:'大聯盟',MINOR:'小聯盟／二軍',
  CPBL1:'中職',CPBL2:'中職二軍',NPB1:'日職',NPB2:'日職二軍',
  R:'美職新人聯盟',A1:'美職1A',A2:'美職2A',A3:'美職3A',AMA:'業餘成棒'};
export function teamNick(team){ /* ◯◯先生的◯◯:取隊名代表詞 */
  const name=canonicalTeamName(team);
  return activeData.nicknames[name]||(name||'').slice(-2);
}
