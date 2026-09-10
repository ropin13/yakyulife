import {S, blankStat, bucketOf} from '../core/state.js?v=offline-0.31.1';
import {R, ri, SEED} from '../core/rng.js?v=offline-0.31.1';
import {OFFICIAL_URL} from '../config.js?v=offline-0.31.1';
import {LV, LG_N, CPBL_TEAMS, NPB_TEAMS, MLB_TEAMS, teamNick} from '../data/teams.js?v=offline-0.31.1';
import {TIER_TH, FAN, RP_LV_SUF} from '../data/economy.js?v=offline-0.31.1';
import {TRAIT_KEYS} from '../data/traits.js?v=offline-0.31.1';
import {$, card, choose, divider, board, actClear, logTarget} from './dom.js?v=offline-0.31.1';
import {careerTimelineCard, tlNote} from './timeline.js?v=offline-0.31.1';
import {traitNames, traitTagStyle, traitColorRank} from './traits.js?v=offline-0.31.1';
import {roleN, fmtIP, slgOf, baseballERA, baseballWHIP, outsFromIP, ipFromOuts} from '../engine/season.js?v=offline-0.31.1';
import {playerType} from '../engine/ability.js?v=offline-0.31.1';
import {fmtMoney} from '../engine/contract.js?v=offline-0.31.1';
import {capTeam, careerMilestones, honorGroups, posLegendPhrase, primaryPos, statTable, tierOf, yearRanges, honorText} from '../engine/career.js?v=offline-0.31.1';
import {shareImage} from './share-image.js?v=offline-0.31.1';
import {awardFlags,awardStatHighlighted} from './award-highlights.js?v=offline-0.31.1';
/* ================= 結算圖資料建構 =================
   Data builders for shareImage()'s canvas layout (design handoff 2026-08-14).
   All values come from S.*; the in-game settlement cards are untouched. */
/* Baseball tick marks: precomputed points on the left seam (a quadratic from
   (7.6,1.9) over (2.6,12) to (7.6,22.1)); the right seam mirrors them at x=24-x. */
export function rpTagline(){
  const first=S.log.length?S.log[0].y:'?';
  return `${primaryPos()}｜${playerType()}｜${first}–${S.year}｜引退時 ${S.age} 歲`+
    ((S.pos==='P'||S.pos==='TW')&&(S.tjCrises||S.tjCount)?`｜手肘危機×${S.tjCrises||0}／TJ×${S.tjCount}`:'');
}
export function rpFamily(){
  const lv=S.love||{}, exes=Array.isArray(lv.exes)?lv.exes:[], kid=n=>n?`（育${n}）`:'';
  const cur=lv.st==='married'?`老婆 ${lv.partner}${kid(lv.kids)}`
    :lv.st==='dating'?`交往中 ${lv.partner}（${lv.dyrs||0} 年）`
    :lv.st==='divorced'?'離婚':'未婚';
  const ex=exes.length?`｜前妻 ${exes.map(e=>`${e.name}${kid(e.kids)}`).join('、')}`:'';
  const kids=(lv.kids||0)+exes.reduce((t,e)=>t+(e.kids||0),0);
  const list=Array.isArray(lv.childList)?lv.childList:[],boys=list.filter(x=>x.gender==='男').length,girls=list.filter(x=>x.gender==='女').length,unknown=Math.max(0,kids-boys-girls);
  const sex=list.length?`（男 ${boys}、女 ${girls}${unknown?`、舊檔未記錄 ${unknown}`:''}）`:'';
  const major=(lv.contacts||[]).flatMap(c=>(c.history||[]).filter(h=>/dating|married|birth|separation/.test(h.type||'')).map(h=>h.text)).slice(-5);
  return `家庭：${cur}${ex}｜子女共 ${kids} 人${sex}${lv.affairs?`｜外遇 ${lv.affairs} 次（抓 ${lv.caught}）`:''}${major.length?`｜重要紀錄：${major.join('、')}`:''}`;
}
export const RP_F3=v=>v==null?'-':v.toFixed(3).replace(/^0/,'');
export const RP_F2=v=>v==null?'-':v.toFixed(2);
/* v0.10 前的部分存檔會記下國際賽名稱與名次，卻沒有同時寫入 st。
   所有引退報表統一在這裡補成空白成績，避免讀取 undefined.G 中斷整份結算。 */
const safeStat=st=>st&&typeof st==='object'?st:blankStat();
const CUM_ORDER=['CPBL1','CPBL2','NPB1','NPB2','MLB','A3','A2','A1','R','AMA'];
const cumLevel=r=>r?.lv&&LG_N[r.lv]?r.lv:(r?.lv==null&&r?.st?'AMA':null);
const modeStat=(r,mode)=>mode==='P'?(r.st?.twPitch||(S.pos!=='TW'||r.st?.twoWayUsage==='P'?r.st:null))
  :mode==='H'?(r.st?.twBat||(S.pos!=='TW'||r.st?.twoWayUsage==='H'?r.st:null)):r.st;
function addCareerStat(t,s,isP){
  t.yr++;
  const keys=isP?['G','W','L','SV','HLD','SO','ER']:['G','PA','AB','H','HR','RBI','SB','BB','DEF'];
  keys.forEach(k=>t[k]+=Number(s[k]||0));
  if(isP){t.BB+=Number(s.BB||0);t.H+=Number(s.H||0);t.IP=ipFromOuts(outsFromIP(t.IP)+outsFromIP(s.IP));}
}
export function rpCumData(mode=null){ /* 依實際層級分開累計；不再把二軍與各級小聯盟混成一列。 */
  const isP=mode==='P'||(!mode&&S.pos==='P'), source={};
  (S.log||[]).filter(r=>r&&r.st).forEach(r=>{
    const st=modeStat(r,mode),b=cumLevel(r); if(!st||!b)return;
    const t=source[b]||(source[b]=blankStat()); addCareerStat(t,st,isP);
  });
  const order=CUM_ORDER.filter(b=>source[b]&&source[b].yr>0);
  const hd=isP?['Yrs','G','IP','W','L','SV','HLD','SO','BB','ERA','WHIP']
             :['Yrs','G','PA','AVG','OBP','SLG','OPS','H','HR','RBI','SB','DEF'];
  const rows=order.map(b=>{ const st=source[b];
    if(isP){
      const era=baseballERA(st), whip=baseballWHIP(st);
      return {b,label:LG_N[b],txt:[st.yr,st.G,fmtIP(st.IP),st.W,st.L,st.SV||0,st.HLD||0,st.SO,st.BB||0,RP_F2(era),RP_F2(whip)],
              num:[st.yr,st.G,st.IP,st.W,st.L,st.SV||0,st.HLD||0,st.SO,st.BB||0,era,whip]};
    }
    const obp=st.PA>0?(st.H+st.BB)/st.PA:null, slg=st.AB>0?slgOf(st):null,
          avg=st.AB>0?st.H/st.AB:null, ops=(obp!=null&&slg!=null)?obp+slg:null;
    return {b,label:LG_N[b],txt:[st.yr,st.G,st.PA,RP_F3(avg),RP_F3(obp),RP_F3(slg),RP_F3(ops),st.H,st.HR,st.RBI,st.SB,(st.DEF>0?'+':'')+(st.DEF||0)],
            num:[st.yr,st.G,st.PA,avg,obp,slg,ops,st.H,st.HR,st.RBI,st.SB,st.DEF||0]};
  });
  rows.forEach(r=>r.best=hd.map(()=>false));
  return {hd,rows};
}
export function rpIntlData(mode=null){
  const isP=mode==='P'||(!mode&&S.pos==='P'), il=(S.intlLog||[]).filter(r=>r&&typeof r==='object'),pickSt=r=>safeStat(mode==='P'?(r.st?.twPitch||(S.pos!=='TW'||r.usage==='P'?r.st:null)):mode==='H'?(r.st?.twBat||(S.pos!=='TW'||r.usage==='H'?r.st:null)):r.st),sum=il.reduce((a,r)=>{const s=pickSt(r),old=outsFromIP(a.IP);Object.keys(a).forEach(k=>{if(k!=='IP')a[k]+=Number(s[k]||0);});a.IP=ipFromOuts(old+outsFromIP(s.IP));return a;},blankStat()),IS=mode?sum:safeStat(S.intlStat);
  if(isP){
    return {hd:['G','IP','W','SV','SO','ERA'],
      rows:il.filter(r=>pickSt(r).G>0).map(r=>{ const st=pickSt(r); return {year:r.year,name:r.name,rank:r.rank,
        txt:[st.G,fmtIP(st.IP),st.W,st.SV||0,st.SO,RP_F2(baseballERA(st))]}; }),
      tot:[IS.G,fmtIP(IS.IP),IS.W,IS.SV||0,IS.SO,RP_F2(baseballERA(IS))]};
  }
  return {hd:['G','PA','AVG','H','HR','RBI'],
    rows:il.filter(r=>pickSt(r).G>0).map(r=>{ const st=pickSt(r); return {year:r.year,name:r.name,rank:r.rank,
      txt:[st.G,st.PA,RP_F3(st.AB>0?st.H/st.AB:null),st.H,st.HR,st.RBI]}; }),
    tot:[IS.G,IS.PA,RP_F3(IS.AB>0?IS.H/IS.AB:null),IS.H,IS.HR,IS.RBI]};
}
export function rpHonorItems(){ /* [[text,accent?],...] per item; ×N gets the accent color */
  return careerMilestones().map(t=>[[t,0]])
    .concat(honorGroups().map(g=>{ const ranges=yearRanges(g.yrs), n=g.yrs.length, parts=[[g.awd,0]];
      if(n>1)parts.push([` ×${n}`,1]);
      if(ranges.length)parts.push([` (${ranges.join('、')})`,0]);
      return parts; }));
}
export function rpOrgOf(r){ /* org team + league + level label for one pro-log row */
  let tm=r.tm||'', lvl='';
  for(const s of RP_LV_SUF){ if(tm.endsWith(s)){ lvl=s; tm=tm.slice(0,-s.length); break; } }
  const lg=CPBL_TEAMS.includes(tm)?'CPBL':NPB_TEAMS.includes(tm)?'NPB':MLB_TEAMS.includes(tm)?'MLB'
    :(r.lv&&LV[r.lv]?(LV[r.lv].top||(LV[r.lv].org==='MiLB'?'MLB':LV[r.lv].org)):'CPBL');
  if(!lvl)lvl=lg==='MLB'?'大聯盟':'一軍';
  return {team:tm,lg,lvl,minor:lvl!=='一軍'&&lvl!=='大聯盟'};
}
export function rpProData(proLogs,mode=null){ /* team segments: a new block whenever the org changes */
  const isP=mode==='P'||(!mode&&S.pos==='P');
  const hd=isP?['G','IP','W-L','SV','HLD','SO','BB','ERA','WHIP']
             :['G','PA','AVG','OBP','SLG','OPS','H','HR','RBI','SB','DEF'];
  const blocks=[]; let cur=null;
  proLogs.forEach(r=>{ const raw=mode==='P'?(r.st?.twPitch||(r.st?.twoWayUsage==='P'?r.st:null)):mode==='H'?(r.st?.twBat||(r.st?.twoWayUsage==='H'?r.st:null)):r.st;if(!raw)return;const o=rpOrgOf(r);
    if(!cur||cur.team!==o.team||cur.lg!==o.lg){ cur={team:o.team,lg:o.lg,rows:[]}; blocks.push(cur); }
    const s=raw||blankStat(); let txt,era=null,ops=null;
    if(isP){ era=baseballERA(s);
      txt=[s.G,fmtIP(s.IP),`${s.W}-${s.L}`,s.SV||0,s.HLD||0,s.SO,s.BB||0,RP_F2(era),RP_F2(baseballWHIP(s))];
    } else { const obp=s.PA>0?(s.H+s.BB)/s.PA:null, slg=s.AB>0?slgOf(s):null;
      ops=(obp!=null&&slg!=null)?obp+slg:null;
      txt=[s.G,s.PA,RP_F3(s.AB>0?s.H/s.AB:null),RP_F3(obp),RP_F3(slg),RP_F3(ops),s.H,s.HR,s.RBI,s.SB,(s.DEF>0?'+':'')+(s.DEF||0)];
    }
    /* level cell carries the season's role: fielding position for batters (一軍·CF),
       SP/MR/CL for pitchers (一軍·先發). r.p is already the position actually played,
       so a forced-DH season reads as DH here exactly as it does in the in-game table. */
    const dp=isP?(r.role?roleN(r.role):''):(r.p||'');
    cur.rows.push({y:r.y,age:r.age,lvl:o.lvl+(dp?'·'+dp:''),minor:o.minor,teamSeason:r.teamSeason||'',
      inj:!!r.inj,txt,sv:s.SV||0,era,hr:s.HR||0,ops});
  });
  /* 只依該年度實際獎項標黃；不再以生涯最高值著色。 */
  const all=blocks.flatMap(b=>b.rows);
  all.forEach(r=>{r.best=awardFlags(S.honors,r.y,isP,hd.map(k=>k==='W-L'?'W':k));});
  return {hd,blocks};
}
export const POST_CAREER_ENDINGS={
  coach:{title:'還在同一片草皮上',body:`球具掛上牆的那天，你以為告別就此完成。<br><br>隔年春訓，你卻換了一件寫著自己名字、卻沒有背號意義的球衣，重新走進熟悉的休息區。手套換成了記事本，揮棒換成了一句句在耳邊的提醒。<br><br>你會在深夜看完三十球的慢動作重播，只為了告訴某個菜鳥：「你的前腳，早了0.2秒。」<br><br>有人說教練是站在光後面的人。但當你看著那個曾經笨拙的孩子，在滿場歡聲中繞過本壘，你忽然明白——<br><br>你從來沒有離開過球場，只是換了一種方式，繼續打球。`},
  scout:{title:'在無人的看台上',body:`你的辦公室，是一張又一張空蕩蕩的鐵椅。<br><br>高中球場、乙組聯賽、鄉下的紅土球場。你帶著測速槍與一本翻爛的筆記本，跑遍那些沒有轉播、沒有掌聲的角落。<br><br>大多數時候，你什麼也沒找到。但偶爾，在某個午後的第七局，會有一顆球從陌生少年的手中飛出，讓你在筆記本上重重畫下一個圈。<br><br>沒有人會記得球探的名字。若干年後，當那個少年站上一軍投手丘，鏡頭只會拍到他。<br><br>但你會坐在電視機前，安靜地笑一下。<br><br>有些人負責發光，有些人負責——在天亮以前，先看見光。`},
  grassroots:{title:'紅土上的第一步',body:`你回到了故鄉的小學。<br><br>球隊只有十四個人，手套是別人捐的，午餐要靠家長輪流準備。你教他們的第一件事，不是揮棒，是把球具排整齊。<br><br>這裡不會有選秀，不會有合約，不會有滿場的加油聲。有的只是每天放學後那兩個小時，和一整片被夕陽曬得溫熱的紅土。<br><br>有些孩子會走得很遠，有些孩子明年就不打了。你都送到路口為止。<br><br>多年後，某個穿著職業球衣的年輕人，在採訪中被問到誰影響他最深。<br><br>他想了想，說出了一個沒有人聽過的名字。<br><br>那是你，還有那片，永遠等著下一批孩子的紅土。`}
};
export const SECOND_CAREER_ENDINGS=[
  `你加入了乙組業餘棒球隊。平日上班、週末穿上球衣，去年在協會盃敲出再見安打的影片被瘋傳，底下最熱門的留言是：「這揮棒不像業餘的。」——因為本來就不是。你比誰都清楚，愛棒球不一定要靠它吃飯。`,
  `你考到了不動產營業員執照。帶看時爬六樓透天面不改色，客戶都說你氣場不一樣——十六歲就在幾千人面前投球的人，還會怕開價嗎？三年後你成了店裡的銷售王，名片頭銜下面偷偷印了一行小字：「前職業棒球選手」。`,
  `你跟著舅舅去做板模。工地的日子曬得比春訓還黑，但你的核心力量和不服輸讓老師傅都點頭。五年後你自己出來帶班，薪水不比二軍差，而且——你笑著說——這裡沒有人會把你下放。`,
  `你穿上襯衫走進辦公室，同事只知道你「以前有在打球」。直到公司壘球隊比賽那天，你一棒把球送出圍牆，全場安靜三秒。後來每年比賽，對手公司都會先問一句：「那個人今年還在嗎？」`,
  `你頂下一間早餐店，招牌取名「滿壘」。店裡掛著你高中的球衣，蛋餅煎得跟你的守備一樣扎實。附近的少棒隊員放學都來報到，因為老闆會一邊煎蘿蔔糕一邊講解怎麼看投手的放球點——加蛋不加價。`,
  `你回到母校當教練，月薪不高，但你把自己沒走完的路畫成地圖交給學弟。第七年，你帶的投手在選秀會上被第一輪指名，電視轉播帶到你的時候，你哭得比他還慘。`,
  `你創了業，做棒球訓練科技——用手機慢動作幫素人抓揮棒軌跡。第一年差點倒閉，第三年被運動中心整批採購。募資簡報的第一頁只有一句話：「我沒能站上去的舞台，我想讓更多人站上去。」`,
  `你考上了消防員。體能測驗全項第一，教官問你以前練什麼的，你說棒球。第一次出勤救人那晚，你突然明白：肩膀不能再投一百五，但還能扛著人走出火場——這雙手還是有用的。`
];
export function usesSecondCareerEnding(age){ return Number(age)<25; }
export function postCareerEndingKeys(tiers){
  const proStar=!!tiers.NPB||!!tiers.MLB||!!(tiers.CPBL&&tiers.CPBL.i<=1);
  return proStar?['coach','scout']:['coach','scout','grassroots'];
}
export function postCareerEnding(tiers,roll){
  const keys=postCareerEndingKeys(tiers),r=roll===undefined?R():roll;
  return POST_CAREER_ENDINGS[keys[Math.min(keys.length-1,Math.floor(Math.max(0,r)*keys.length))]];
}
export function retireScene(tiers){
  /* tiers: {CPBL:{i,sc},NPB:...,MLB:...} 有出賽才有 */
  /* 生涯代表聯盟＝出賽最久的頂級聯盟;分級取生涯最佳(i 最小) */
  let lg=bucketOf(S.lv), bestI=4;
  const order=['MLB','NPB','CPBL'];
  order.forEach(b=>{ if(tiers[b]&&tiers[b].i<bestI){ bestI=tiers[b].i; } });
  /* 代表聯盟:在最佳分級的聯盟中,取出賽年資最多者 */
  let repYr=-1;
  order.forEach(b=>{ if(tiers[b]&&tiers[b].i===bestI){ const yy=S.stats[b]?S.stats[b].yr:0; if(yy>repYr){repYr=yy;lg=b;} } });
  const t=tiers[lg], i=t?t.i:4, yr=S.year;
  let txt='';
  if(lg==='CPBL'){
    if(i===0)txt=`引退戰選在<b class="hl">臺北大巨蛋</b>。四萬人把巨蛋塞得水洩不通，外野看板掛滿你生涯每一年的照片。九局下最後一個打席結束，全場燈光暗下，只剩一道追光打在你身上——隊友哭成一團，對手全員列隊脫帽，天團在二壘後方唱起你的應援曲改編的慢版。你繞場一周，把手套輕輕放在本壘板上。轉播單位說，這是中職史上收視最高的一場例行賽。`;
    else if(i===1)txt=`球團為你舉辦了引退儀式。主場滿場，大螢幕播放生涯回顧影片，從高中木棒聯賽夢碎到${S.pos==='P'?'職棒初登板':'職棒初安打'}，一幕一幕。老隊友從各地回來替你獻花，總教練在致詞時哽咽到說不下去。最後你脫下球帽向四個方向的看板深深鞠躬，應援團的鼓聲直到你走進休息室都沒有停。`;
    else if(i===2)txt=`${S.pos==='P'?'球季最後一個主場日，球團安排你先發登板。投完第一局後被換下場，全場觀眾起立鼓掌，隊友在休息室門口排成兩排跟你擊掌。沒有煙火，沒有演唱會，但看台上有人拉起手寫布條：「謝謝你投出的每一顆全力的球」。':'球季最後一個主場日，球團安排你先發打第一棒。第一個打席結束後被換下場，全場觀眾起立鼓掌，隊友在休息室門口排成兩排跟你擊掌。沒有煙火，沒有演唱會，但看台上有人拉起手寫布條：「謝謝你的每一次全力奔跑」。'}`;
    else txt=`你在球團官網的一則新聞稿裡宣布引退。發文的那個晚上，還是有幾十個老球迷湧進你的社群留言：「辛苦了」。職業棒球就是這樣——不是每個人都有儀式，但每個認真打過球的人，都有人記得。`;
  }else if(lg==='NPB'){
    if(i<=1)txt=`球團為你安排了<b class="hl">引退試合</b>。最後一個守備半局結束，你被單獨留在場上，兩軍球員沿著邊線列隊。花束贈呈、監督擁抱、隊友把你高高拋起——三次、四次、五次的<b class="hl">胴上げ</b>。你抱著花束繞場一周，看台上的日本球迷舉著用中文寫的「謝謝」毛巾。引退記者會上你說：「能在這裡打球，是我人生最驕傲的事。」隔天所有體育報頭版都是你被拋在空中的那張照片。`;
    else if(i===2)txt=`最終戰賽後，球團在場邊為你舉行了簡短的引退セレモニー：花束、紀念框裱的球衣、與監督的合影。廣播念出你的生涯成績時，客場球迷也起立鼓掌。記者會上有記者用不太標準的中文問你「還會回來嗎」，你笑著點頭。`;
    else txt=`你透過球團發表引退聲明。整理置物櫃的那天，翻譯陪你走完最後一段球員通道，警衛伯伯跟你深深鞠了一躬。異鄉打拚的日子結束了，行李箱裡裝著幾件捨不得丟的練習衫。`;
  }else if(lg==='MLB'){
    if(i<=1)txt=`主場最終戰，你最後一個打席前，全場觀眾起立鼓掌長達三分鐘，主審退到一旁靜靜等待。打席結束，你被換下場，隊友全部走出休息室與你擁抱，大螢幕播放致敬影片——<b class="hl">Curtain Call</b>，你走出休息室向全場揮帽致意兩次。賽後記者會擠滿各國媒體，台灣的轉播單位做了整夜特別節目。`;
    else if(i===2)txt=`球隊在你生涯最後一個系列賽前於場邊舉行了簡單儀式：致贈裱框球衣與紀念浮雕，隊友列隊擊掌。當地報紙寫道：「他不是超級巨星，但他是每個總教練都想要的那種球員。」`;
    else txt=`你在社群媒體上發了一張空蕩球場的照片，配文只有一句英文：「Thank you, baseball.」按讚數在台灣時間的深夜默默破了十萬。`;
  }else{
    txt=`沒有鎂光燈。你把釘鞋擦乾淨放進袋子，跟隊友一一擁抱，走出球場時回頭看了記分板最後一眼。二軍球場的夕陽跟十年前一樣好看。`;
  }
  card('gold','引退之日',txt);
  if(S.traits.mrteam){
    const mrTitle=(teamNick(S.mrTeamName||'')||'球隊')+'先生・背號退休';
    card('gold','引退兩年後・'+mrTitle,`引退兩年後，你重新穿上了球衣，踏上了熟悉的主場。當你往投手丘一步步走去，觀眾的歡呼聲幾乎讓整個球場震動。當你踏上了投手板，你接過了主持人手中的球與手套，就像你做過幾萬次的那樣，把球往昔日的隊友手套裡扔去，雖然已經沒有了球速，但你聽到球進手套的聲音，卻是無比清脆。<br><br>你的背號 <b class="hl">#${S.jersey}</b> 被掛在了牆壁上，你曾經用表現守護著這座球場，而現在你是這座球場上永遠不可或缺的榮耀。`);
  }
  /* 名人堂票選(可多聯盟並存) */
  const hofs=[], firstBallotLeagues=[];
  const HOF_CFG={CPBL:{n:'中華職棒名人堂',wait:5,total:132,lg:'中職'},NPB:{n:'日本野球殿堂',wait:5,total:326,lg:'日職'},MLB:{n:'美國棒球名人堂',wait:5,total:389,lg:'大聯盟'}};
  ['CPBL','NPB','MLB'].forEach(b=>{ const t=tiers[b]; if(!t)return;
    const cfg=HOF_CFG[b];
    if(t.i===0){
      /* 第一年當選門檻:評價分明顯超標(1.15×名人堂門檻)才 first-ballot,否則需等 N 年 */
      const th=TIER_TH[b][0];
      const fbMult={CPBL:1.12,NPB:1.12,MLB:1.2}[b]||1.2; /* 大聯盟最嚴,中職日職放寬 */
      const firstNow = t.sc>=th*fbMult;
      const ballotYr = firstNow?1:ri(2,6);
      if(firstNow)firstBallotLeagues.push(cfg.lg);
      /* 得票率是離散量：先決定「票數」，再由票數反算顯示的百分比，兩者永遠一致。
         舊版方向相反——先算連續的 pct、再四捨五入成票數，於是畫面上會出現 131 票
         卻標 99.1%（131/132 實為 99.2%）；而且 99.1% 這個上限在三個聯盟都不對應
         任何一個整數票數（中職 131 票=99.24%、132 票=100%），本身就是憑空的數字。
         下限改用無條件進位，確保票數真的跨過 75% 門檻（舊版日職 245/326=75.15%
         是靠四捨五入擦邊算過）；上限為「總票數 −1」，即差一票的傳奇，不開放滿票。 */
      const rawPct=75+ (t.sc-th)/th*40 + R()*6 - (ballotYr-1)*4;
      const minVotes=Math.ceil(cfg.total*0.75), maxVotes=cfg.total-1;
      const votes=Math.max(minVotes,Math.min(maxVotes,Math.round(cfg.total*rawPct/100)));
      const pctTxt=(votes/cfg.total*100).toFixed(1);
      if(!S.hofInfo)S.hofInfo=[]; S.hofInfo.push({lg:cfg.lg,yr:ballotYr,pct:pctTxt}); /* 供結算圖 */
      const cap=capTeam(b), phr=posLegendPhrase(b);
      const oneShort=votes===maxVotes?'<b class="hl">全聯盟只有一張票沒有投給你。</b>':'';
      hofs.push(`引退 <b class="hl">${cfg.wait}</b> 年後（${yr+cfg.wait} 年）進入候選，於<b class="hl">第 ${ballotYr} 年投票</b>以 <b class="hl">${votes}</b>／${cfg.total} 票（得票率 ${pctTxt}%）榮登<b class="hl">${cfg.n}</b>——你以 <b class="hl">${cap||'—'}</b> 的代表球員身分${phr}留名。${ballotYr===1?'<b class="hl">一票入魂，首輪即殿堂。</b>':''}${oneShort}名匾上的隊徽，是 ${cap||'—'}。`);
    }else if(t.i===1){
      /* 落選同樣以票數為準：門檻票數減 1 就是「最接近的一次」的上限。 */
      const gateVotes=Math.ceil(cfg.total*0.75);
      const bestVotes=Math.max(1,Math.min(gateVotes-1,Math.round(cfg.total*(55+R()*17)/100)));
      const tries=ri(3,9);
      hofs.push(`你連續 ${tries} 年入圍${cfg.n}票選，最高曾獲得 <b>${bestVotes}</b>／${cfg.total} 票（${(bestVotes/cfg.total*100).toFixed(1)}%），可惜始終未能跨過 75% 門檻（需 ${gateVotes} 票）。`);
    } });
  if(firstBallotLeagues.length){
    const old=Array.isArray(S.legendLeagues)?S.legendLeagues:[];
    S.legendLeagues=[...new Set([...old,...firstBallotLeagues])];
    S.legendLeague=S.legendLeagues[0]||''; /* 舊顯示欄位相容 */
    S.traits.legend=true;
  }
  if(hofs.length)card('gold','名人堂票選',hofs.join('<br><br>'));
  firstBallotLeagues.forEach(lg=>card('gold','隱藏屬性解鎖：'+lg+'歷史級球星',
    `第一年投票就披上名人堂金袍——你不只是進了殿堂，你<b class="hl">定義了一個時代</b>。這個名字，會被寫進${lg}的歷史課本。`));
}
export function endGame(reason){
  S.done=true; actClear();
  /* 引退前可能剛結清剩餘合約；所有款項入帳後再刷新記分板，與結算共用同一個 S.salary。 */
  board(2);
  divider('生涯終幕');
  card('info','引退',reason);
  tlNote(5,'引退'); careerTimelineCard();
  /* 個別舊存檔若有缺漏，不能讓中段報表錯誤阻斷最重要的結算圖、下載與重玩入口。 */
  let evals=[],picks=[];
  try{
  /* 各聯盟數據與評價 */
  let tables='',best=99; const tiersByLg={};
  ['MLB','NPB','CPBL','MINOR'].forEach(b=>{ if(S.stats[b]){
    if(b!=='MINOR'){ const t=tierOf(b); tiersByLg[b]=t; evals.push(`<span class="tag">${t.name}</span>（評價分 ${t.sc}）`); best=Math.min(best,t.i); } } });
  if(best===99)best=4;
  retireScene(tiersByLg);
  /* 成就門檻:中職名人堂 或 站上日職/大聯盟 */
  const reachedTop = (tiersByLg.CPBL&&tiersByLg.CPBL.i===0) || !!S.stats.NPB || !!S.stats.MLB;
  if(reachedTop){
    /* 小學校之光:T3 弱旅出身 */
    if(!S.traits.smallschool && S.hsTier===3){ S.traits.smallschool=true;
      card('gold','隱藏特性：小學校之光',`當年那所沒沒無聞的小學校，走出了一個站上頂級舞台的男人。你證明了：出身，從來不是天花板。`); }
    /* 努力仔:初始潛力總和偏低(投手≤237/野手≤469) */
    const grindTh = S.pos==='P'?237:469;
    if(!S.traits.grinder && (S.potSum0||999)<=grindTh){ S.traits.grinder=true;
      card('gold','隱藏特性：努力仔',`天賦平庸的球員千千萬萬，能走到這裡的卻寥寥無幾。你不是天選之人，你是把汗水熬成天賦的那種人。`); }
  }
  /* 逐年成績年表 (分為業餘與職業) */
  if(S.log.length){
    const amaLogs = S.log.filter(r => !r.st);
    const proLogs = S.log.filter(r => r.st);
    if(amaLogs.length > 0){
      const amaRows = amaLogs.map(r=>`<tr><td style="white-space:nowrap">${r.y}</td><td style="white-space:nowrap">${r.age}</td><td style="text-align:left;white-space:nowrap">${r.tm}</td><td style="text-align:left;font-size:11px;${r.inj?'color:var(--bad);font-weight:700;':''}">${r.line}</td></tr>`).join('');
      card('','生涯年表（業餘成績）',`<table class="fin"><tr><th>年度</th><th>齡</th><th style="text-align:left">球隊</th><th style="text-align:left">成績</th></tr>${amaRows}</table>`);
    }
    if(proLogs.length > 0){
      const renderProTable=(mode,label)=>{const isP = mode==='P';
      const td=(r,k,text)=>{const champ=awardStatHighlighted(S.honors,r.y,isP,k),style=champ?'color:#ffd34d;font-weight:800;':'';return `<td style="${style}">${text}</td>`;};
      const head = isP
        ? `<tr><th>年</th><th>齡</th><th style="text-align:left">球隊</th><th>G</th><th>IP</th><th>W</th><th>L</th><th>SV</th><th>HLD</th><th>SO</th><th>BB</th><th>ERA</th><th>WHIP</th></tr>`
        : `<tr><th>年</th><th>齡</th><th style="text-align:left">球隊</th><th>G</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>H</th><th>HR</th><th>RBI</th><th>SB</th><th>DEF</th></tr>`;
      const rows = proLogs.map(r => {
        const cS = r.inj ? 'color:var(--bad);font-weight:700;' : '';
        const s = mode==='P'?(r.st?.twPitch||(S.pos!=='TW'||r.st?.twoWayUsage==='P'?r.st:null)):(r.st?.twBat||(S.pos!=='TW'||r.st?.twoWayUsage==='H'?r.st:null));if(!s)return '';
        if(isP){
          const era = s.IP>0 ? baseballERA(s).toFixed(2) : '-';
          const whip = s.IP>0 ? baseballWHIP(s).toFixed(2) : '-';
          return `<tr style="${cS}"><td>${r.y}</td><td>${r.age}</td><td style="text-align:left;white-space:nowrap">${r.tm}${r.teamSeason?`<br><small>${r.teamSeason}</small>`:''}</td>${td(r,'G',s.G)}${td(r,'IP',fmtIP(s.IP))}${td(r,'W',s.W)}<td>${s.L}</td>${td(r,'SV',s.SV||0)}${td(r,'HLD',s.HLD||0)}${td(r,'SO',s.SO)}<td>${s.BB||0}</td>${td(r,'ERA',era)}${td(r,'WHIP',whip)}</tr>`;
        } else {
          const obpN = s.PA>0 ? (s.H+s.BB)/s.PA : 0;
          const slgN = slgOf(s);
          const avg = s.AB>0 ? (s.H/s.AB).toFixed(3).replace(/^0/,'') : '-';
          const obp = s.PA>0 ? obpN.toFixed(3).replace(/^0/,'') : '-';
          const slg = s.AB>0 ? slgN.toFixed(3).replace(/^0/,'') : '-';
          const ops = s.AB>0 ? (obpN+slgN).toFixed(3).replace(/^0/,'') : '-';
          return `<tr style="${cS}"><td>${r.y}</td><td>${r.age}</td><td style="text-align:left;white-space:nowrap">${r.tm}${r.p?"·"+r.p:""}${r.teamSeason?`<br><small>${r.teamSeason}</small>`:''}</td>${td(r,'G',s.G)}${td(r,'PA',s.PA)}${td(r,'AVG',avg)}${td(r,'OBP',obp)}${td(r,'SLG',slg)}${td(r,'OPS',ops)}${td(r,'H',s.H)}${td(r,'HR',s.HR)}${td(r,'RBI',s.RBI)}${td(r,'SB',s.SB)}${td(r,'DEF',(s.DEF>0?'+':'')+(s.DEF||0))}</tr>`;
        }
      }).join('');return rows?`<h4 style="margin:12px 0 4px">${label}</h4><div class="stat-table-wrap"><table class="fin career-stat-table ${isP?'pitcher':'batter'}">${head}${rows}</table></div>`:'';};
      const html=S.pos==='TW'?renderProTable('P','職業逐年投手成績')+renderProTable('H','職業逐年打者成績'):renderProTable(S.pos==='P'?'P':'H','職業逐年成績');
      card('','生涯年表（職業成績）',html);
    }
  }
  let intlTable='';
  if(S.intlCount>0){
    const intlPart=(mode,label)=>{const d=rpIntlData(mode);if(!d.rows.length)return '';
      const head=['年度','賽事','結果',...d.hd];
      const rows=d.rows.map(r=>`<tr><td>${r.year||'—'}</td><td class="event-cell">${r.name||'國際賽'}</td><td>${r.rank||'—'}</td>${r.txt.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('');
      return `<h4 style="margin:12px 0 4px">${label}</h4><div class="stat-table-wrap"><table class="fin intl-stat-table"><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows}<tr class="total-row"><th colspan="3">國際賽通算</th>${d.tot.map(x=>`<td>${x}</td>`).join('')}</tr></tbody></table></div>`;};
    intlTable=S.pos==='TW'?intlPart('P',`國際賽投手逐屆成績（中華隊 ${S.intlCount} 屆）`)+intlPart('H',`國際賽打者逐屆成績（中華隊 ${S.intlCount} 屆）`):intlPart(S.pos==='P'?'P':'H',`國際賽逐屆成績（中華隊 ${S.intlCount} 屆）`);
  }
  const cumPart=(mode,label)=>{const d=rpCumData(mode);if(!d.rows.length)return '';
    return `<h4 style="margin:12px 0 4px">${label}</h4><div class="stat-table-wrap"><table class="fin career-cum-table"><thead><tr><th>League</th>${d.hd.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${d.rows.map(r=>`<tr><td>${r.label}</td>${r.txt.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;};
  tables=S.pos==='TW'?cumPart('P','投手累積')+cumPart('H','打者累積'):cumPart(S.pos==='P'?'P':'H','');
  card('','生涯累積數據',(tables||'<p>（無職業層級出賽紀錄）</p>')+intlTable);
  if(evals.length)card('gold','生涯評價',evals.join('<br>'));
  /* 結算排序：名人堂 → 通算／各聯盟里程碑 → 國家隊 → MLB → NPB → CPBL → 業餘。 */
  const settlementItems=careerMilestones().concat(honorGroups().map(honorText));
  const honorsHTML=settlementItems.length?settlementItems.map(x=>'· '+x).join('<br>'):'（生涯未獲得任何獎項或里程碑）';
  card(settlementItems.length?'gold':'','獎項、大賽與里程碑',honorsHTML);
  /* 特質與薪資 */
  const tr=[];
  [...TRAIT_KEYS.pos,...TRAIT_KEYS.neg].filter(k=>S.traits[k]).sort((a,b)=>traitColorRank(a)-traitColorRank(b))
    .forEach(k=>{ traitNames(k).forEach(name=>tr.push(`<span class="tag" style="${traitTagStyle(k)}">${name}</span>`)); });
  (S.removed||[]).forEach(lbl=>tr.push(`<span class="tag" style="text-decoration:line-through;opacity:.4;color:#8a8a8a;border-color:#4a4a4a">${lbl}</span>`));
  const lv=S.love||{}, exes=Array.isArray(lv.exes)?lv.exes:[];
  const cur=lv.st==='married'?`老婆 ${lv.partner}（${lv.kids}）`:lv.st==='dating'?`交往中 ${lv.partner}（${lv.dyrs||0} 年）`:lv.st==='divorced'?'離婚':'未婚';
  const exStr=exes.length?`｜前妻 ${exes.map(e=>`${e.name}（${e.kids||0}）`).join('、')}`:'';
  const totKids=(lv.kids||0)+exes.reduce((t,e)=>t+(e.kids||0),0);
  card('','生涯檔案',`隱藏素質：${tr.join(' ')||'（無）'}<br>家庭：${cur}${exStr}｜子女共 ${totKids} 人${lv.affairs?`｜外遇 ${lv.affairs}(${lv.caught})`:''}<br>國際賽出賽：${S.intlCount} 次｜生涯大傷：${S.bigInj} 次${S.pos==='P'?`｜手肘危機：${S.tjCrises||0} 次｜Tommy John 手術：${S.tjCount} 次`:''}<br>生涯總薪資：<b class="hl" style="font-size:18px">${fmtMoney(Math.round(S.salary))}</b> 台幣`);
  /* 球迷留言 */
  const pool=(FAN[best]||FAN[4]||[]).filter(p=>S.pos!=='P'||!p.includes('代打人生'));
  while(picks.length<3&&pool.length)picks.push(pool.splice(Math.floor(R()*pool.length),1)[0]);
  /* 盤子留言:低聯盟明星以上,旅外到更高聯盟卻淪替補/邊緣 */
  { const LGR={CPBL:0,NPB:1,MLB:2}, CTY={CPBL:'台灣',NPB:'日本',MLB:'美國'};
    ['CPBL','NPB','MLB'].forEach(low=>{ ['CPBL','NPB','MLB'].forEach(high=>{
      if(LGR[high]>LGR[low] && tiersByLg[low] && tiersByLg[high] && tiersByLg[low].i<=1 && tiersByLg[high].i>=3){
        picks.push(`在${CTY[low]}是${LG_N[low]}的招牌，到了${CTY[high]}的${LG_N[high]}卻完全打不出來——「這人是誰？」當地球迷一臉問號，簽他的球團真是盤子`);
      }
    }); });
  }
  if(S.traits.glass)picks.push('如果沒有那些傷，他的生涯會是什麼樣子……不敢想');
  if(S.traits.iron)picks.push('鐵人謝幕。那個連續出賽紀錄，大概很久都不會被打破了');
  if(S.traits.genius&&best<=1)picks.push('高中就被叫做天才的男人，真的把天賦兌現了');
  if(S.honors.some(h=>h.includes('經典賽冠軍')))picks.push('經典賽奪冠那一夜，全台灣都沒睡。謝謝你');
  if(S.love.caught)picks.push('球技沒話說，私生活就……唉，不說了');
  if(S.traits.scum)picks.push('引退串裡不准提那些事，今天只談棒球。……好啦還是很氣');
  if(S.traits.franchise)picks.push(S.franchiseActive?'一隊一人，退休號碼準備掛上去了。謝謝你留下來':'他曾經是一座城市不能被取代的神主牌，那段歲月沒有人會忘記');
  if(S.traits.legend)picks.push('這輩子能看到你打球，是我們這代球迷的福氣。歷史級的');
  if(S.traits.intlace)picks.push('穿上國家隊球衣的那個男人，永遠的國家英雄');
  if(S.traits.taiwan)picks.push('六度披上國家隊戰袍，從不推辭。他比劃胸口的那一幕，我手機桌布放到現在');
  if(S.traits.disc)picks.push('自律到可怕，凌晨四點的球場都認得他');
  if(S.traits.favorite)picks.push('不躁進也不畏縮，歷任教練的先發名單上永遠有他的名字');
  if(S.traits.cancer)picks.push('球是打得好啦，但那個態度……更衣室少了他反而清靜');
  if(S.traits.thief)picks.push('當年拒絕下放又打不出來，薪水小倫這名號是自己掙來的');
  if(S.traits.mrteam)picks.push('十五年只為一隊，'+(teamNick(S.mrTeamName||'')||'')+'先生這個稱號，他當之無愧');
  if(S.traits.confidante)picks.push('場上叱吒風雲，感情路上卻總是差一步，唉');
  if(S.traits.smallschool)picks.push('從那種小學校打到職業，這故事夠拍一部電影了');
  if(S.traits.grinder)picks.push('沒什麼天分卻拼到這種成就，這種球員最讓人尊敬');
  if(S.traits.goldcloth)picks.push('我愛中信兄弟，不離不棄');
  if(S.traits.phoenix)picks.push('從手術台爬回來還能拿獎，這種心臟是鈦合金做的吧');
  if(S.traits.onetool&&S.toolRole)picks.push(`那招${S.toolRole}真的無解，關鍵時刻換他上場就對了`);
  if(S.traits.clutch)picks.push('大場面先生，越關鍵的時刻越信任他');
  if(S.traits.championmaker)picks.push('他走到哪裡就贏到哪裡，優勝請負人真的不是叫假的');
  if(S.love.st==='married'&&S.love.kids>=2)picks.push('引退後好好陪家人吧，孩子們等你很久了');
  card('info','球迷看板・引退串',picks.map(p=>'「'+p.replace(/{n}/g,S.name)+'」').join('<br>'));
  if(usesSecondCareerEnding(S.age)){
    const second=SECOND_CAREER_ENDINGS[Math.floor(R()*SECOND_CAREER_ENDINGS.length)];
    card('gold','第二人生',second.replace(/{n}/g,S.name)+`<br><br><span class="sub">離開球場的人生，也是人生。${S.name}，辛苦了。</span>`);
  }else{
    const ending=postCareerEnding(tiersByLg);
    card('gold','退役後・〈'+ending.title+'〉',ending.body);
  }
  }catch(err){
    console.error('Retirement settlement rendering failed:',err);
    card('bad','部分生涯資料無法顯示',`舊存檔有一項結算資料缺漏，但下載結算圖與重新開始功能仍可使用。<br><span class="sub">${String(err&&err.message||err)}</span>`);
  }
  /* 一鍵分享 */
  const sh=document.createElement('div'); sh.className='card'; sh.id='career-share';
  sh.innerHTML=`<div class="title">分享這段生涯</div>
    <div class="row2" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn main" id="sh-img" style="flex:1">📸 產生結算圖</button>
      <button class="btn" id="sh-url" style="flex:1">🔗 複製重播連結</button>
    </div><div id="sh-out" style="margin-top:8px"></div>`;
  /* 放在當前「生涯終幕」年度容器內，避免直接掛到 #log 後被折疊年度區塊遮住。 */
  logTarget().appendChild(sh);
  sh.querySelector('#sh-img').onclick=()=>{try{shareImage(evals,picks,sh.querySelector('#sh-out'));}catch(err){
    console.error('Retirement image failed:',err);
    sh.querySelector('#sh-out').innerHTML='<div class="dn">結算圖產生失敗：'+String(err&&err.message||err)+'</div>';
  }};
  sh.querySelector('#sh-url').onclick=e=>{
    const url=OFFICIAL_URL+'?seed='+SEED;
    const okmsg=()=>{e.target.textContent='✅ 已複製';setTimeout(()=>e.target.textContent='🔗 複製重播連結',1600);};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(okmsg,()=>prompt('手動複製連結：',url));
    else prompt('手動複製連結：',url);
  };
  choose('',[
    {t:'📸 查看結算圖與下載',s:'前往生涯結算最下方',f:()=>sh.scrollIntoView({behavior:'smooth',block:'center'})},
    {t:'⚾ 開啟新的人生（新種子）',main:true,f:()=>{location.href=location.pathname;}},
    {t:'用同一個種子重來',s:'seed: '+SEED,f:()=>{location.href=location.pathname+'?seed='+SEED;}}]);
  /* 結算完成後停在分享／下載區；舊版會再次捲回「生涯終幕」標題，造成玩家誤以為
     後半段結算與下載介面沒有產生。 */
  setTimeout(()=>{try{sh.scrollIntoView({behavior:'auto',block:'center'});}catch(e){}},250);
}
