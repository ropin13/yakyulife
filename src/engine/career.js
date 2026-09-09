import {S} from '../core/state.js?v=offline-0.31.0';
import {clamp} from '../core/rng.js?v=offline-0.31.0';
import {DPN, POSN, POS_ADJ_RUNS, POS_TIER_K, POS_TIER_STR} from '../data/abilities.js?v=offline-0.31.0';
import {LG_N} from '../data/teams.js?v=offline-0.31.0';
import {TIER_TH, LEAGUE_K, MILESTONE_DEF, HOF_TH_K} from '../data/economy.js?v=offline-0.31.0';
import {fmtIP, slgOf, roleName3, baseballERA, baseballWHIP} from './season.js?v=offline-0.31.0';
/* ================= 生涯終章 ================= */
const BUCKET_G={CPBL:120,NPB:143,MLB:162};
/* 守位分：守位難度(POS_ADJ_RUNS 以「每 162 場」計)換算成該聯盟的實際球季長度。
   分母必須用該聯盟的滿季場次，不能寫死 162——守備計分的另一半 defRuns() 用的就是
   gw=games/L.g，兩邊尺度要一致。寫死 162 會讓場次較少的聯盟只拿到部分守位分
   (中職滿勤 18 年只算 13.3 個守位年、日職 15.9 個)，等於把整條守位級距壓縮，
   捕手/游擊的加分與一壘/指定打擊的扣分同時被稀釋。 */
export function positionScore(st,bucket){
  if(!st||!st.DPG)return 0;
  const full=BUCKET_G[bucket]||162;
  let runs=0; Object.entries(st.DPG).forEach(([dp,g])=>{ runs+=(POS_ADJ_RUNS[dp]||0)*(g/full); });
  return runs*6; /* 與 DEF 每 1 defensive run = 6 分使用同一尺度 */
}
/* 後援名人堂校準：300 救援接近候選、400 救援具入選實力、500 救援可挑戰最高門檻。
   里程碑本身依聯盟場次比例縮放(比照其他獎項門檻的作法)，避免場次較少的聯盟
   (中職120場/日職143場)因為天生救援總數就比大聯盟(162場)少，同等地位的終結者
   卻吃不到里程碑加分。 */
export function reliefMilestoneScore(st,bucket){
  const sv=st&&st.SV||0, r=(BUCKET_G[bucket]||162)/162;
  if(sv>=500*r)return 1800;
  if(sv>=400*r)return 1200;
  if(sv>=300*r)return 800;
  if(sv>=200*r)return 350;
  return 0;
}
/* 投手生涯評價的質量校正：純堆數據(局數/勝場/救援等)過去會讓長年低品質後援
   在總分上輾壓真正壓制力強的先發。用生涯 ERA/WHIP 相對聯盟參考值(3.40/1.15，
   對齊「稱職先發」與「王牌先發」的真實分界)算出一個 0.50~1.60 倍的品質係數，
   乘回堆疊分數，讓失分率真正影響評價高低，同時讓各等級先發的級距拉開。 */
export function pitcherQualityFactor(st){
  const era=baseballERA(st), whip=baseballWHIP(st);
  let q=1;
  if(era!=null)q+=clamp((3.40-era)*0.15,-0.40,0.40);
  if(whip!=null)q+=clamp((1.15-whip)*0.30,-0.20,0.20);
  return clamp(q,0.50,1.60);
}
export function pitcherCareerScore(st,bucket){
  const base=st.W*13+(st.SV||0)*8+(st.HLD||0)*3+st.SO*0.9+st.IP*0.35+reliefMilestoneScore(st,bucket);
  return base*pitcherQualityFactor(st);
}
/* 打者生涯評價的質量校正：對齊投手 pitcherQualityFactor 的設計，用生涯打擊率／OPS
   相對聯盟參考值(0.270／0.760)算出 0.50~1.60 倍品質係數，讓打者也有跟投手對稱的
   品質校正，不會因為打者本來沒有品質校正而系統性地比投手更難拿到榮譽級評價。
   末尾 0.67 是配合 LEAGUE_K 重新以「絕對能力值換算生涯總分」實測校準出的尺度，
   讓投手/打者在同一把 TIER_TH 尺上大致對齊(細節見 economy.js 的 LEAGUE_K 說明)。 */
export function hitterQualityFactor(st){
  const ab=st&&st.AB||0, pa=st&&st.PA||0;
  if(!ab||!pa)return 1;
  const avg=st.H/ab, obp=(st.H+(st.BB||0))/pa, slg=slgOf(st), ops=obp+slg;
  let q=1;
  q+=clamp((avg-0.270)*3.0,-0.35,0.35);
  q+=clamp((ops-0.760)*0.6,-0.20,0.20);
  return clamp(q,0.50,1.60);
}
export function hitterCareerScore(st,bucket){
  const base=st.H+st.HR*3+st.SB*0.8+st.RBI*0.5+st.BB*0.3+(st.DEF||0)*6+positionScore(st,bucket);
  return base*hitterQualityFactor(st)*0.67;
}
export function careerScore(st,bucket){
  if(S.pos==='P')return pitcherCareerScore(st,bucket);
  if(S.pos==='TW'){
    const pit={...st,G:st.pitchG||0,H:st.pitchH||0,BB:st.pitchBB||0};
    return hitterCareerScore(st,bucket)+pitcherCareerScore(pit,bucket)*0.5;
  }
  return hitterCareerScore(st,bucket);
}
export function primaryPos(){ /* 生涯主守位:過半→該位;無過半→工具人/搖擺人(年數降序) */
  if(S.pos==='TW')return `二刀流（${roleName3(S.role)}／${DPN[S.dpos||S.twoWayBatPos]||'指定打擊'}）`;
  if(S.pos==='P'){
    const ry=S.roleYears||{}; const tot=Object.values(ry).reduce((a,b)=>a+b,0);
    if(!tot)return roleName3(S.role);
    const es=Object.entries(ry).sort((a,b)=>b[1]-a[1]);
    if(es[0][1]>=tot/2)return roleName3(es[0][0]); /* 有過半 */
    /* 無過半:搖擺人(附主要兩種定位) */
    const list=es.map(e=>({SP:'先發',MR:'中繼',CL:'終結者'}[e[0]]||'')).filter(Boolean);
    return '搖擺人('+list.slice(0,2).join('、')+')';
  }
  const dy=S.dposYears||{}; const total=Object.values(dy).reduce((a,b)=>a+b,0);
  if(!total)return S.dpos?DPN[S.dpos]:POSN[S.pos];
  const entries=Object.entries(dy).sort((a,b)=>b[1]-a[1]);
  if(entries[0][1]>=total/2)return DPN[entries[0][0]]||entries[0][0]; /* 有過半 */
  const noDH=entries.filter(e=>e[0]!=='DH'&&e[0]!=='—').map(e=>DPN[e[0]]||e[0]);
  if(!noDH.length)return DPN['DH'];
  return '工具人('+noDH.join('、')+')';
}
export function capTeam(bucket){ /* 該聯盟效力最久的球隊,作為名人堂帽徽 */
  const tb=(S.teamTally&&S.teamTally[bucket])||{}; let best=null,bn=-1;
  for(const k in tb)if(tb[k]>bn){bn=tb[k];best=k;}
  return best;
}
export function defShare(bucket){ /* 守備貢獻占生涯總價值比重 0~1 */
  const st=S.stats[bucket]; if(!st||S.pos==='P')return 0;
  const off=st.H+st.HR*3+st.SB*0.8+st.RBI*0.5+st.BB*0.3;
  const def=Math.max(0,st.DEF||0)*6;
  return (off+def)>0?def/(off+def):0;
}
export function posLegendPhrase(bucket){ /* 依守備占比與獎項決定守位敘述 */
  const share=defShare(bucket), st=S.stats[bucket];
  const dp=S.dpos||(S.pos==='C'?'C':null);
  const hasGlove=S.honors.some(h=>h.includes('金手套')||h.includes('守備聖經'));
  if(S.pos==='P'||!dp||dp==='DH')return '';
  const posN=DPN[dp]||'';
  if(share>=0.34||(hasGlove&&share>=0.22))return `，以${{SS:'史上最偉大的游擊手之一',CF:'守備範圍撼動聯盟的中外野手',C:'蹲捕藝術的化身',_:'守備傳奇'}[dp]||('頂尖'+posN)}之姿`;
  if(hasGlove&&share>=0.12)return `，一位攻守俱佳的${posN}`;
  return '';
}
export function honorScore(bucket){
  const lg={CPBL:'中職',NPB:'日職',MLB:'大聯盟'}[bucket];
  const champ={CPBL:/中職(?:年度)?總冠軍/,NPB:/日本一/,MLB:/世界大賽冠軍/}[bucket];
  const isAce=h=>h.includes('最佳投手')||h.includes('最佳打者')||h.includes('賽揚')||h.includes('澤村');
  let sc=0,mvp=0,aceN=0,king=0;
  S.honors.forEach(h=>{
    if(champ.test(h)){sc+=90;return;}
    const belongs=h.includes(lg)||(bucket==='NPB'&&h.includes('澤村賞'))||(bucket==='MLB'&&/國聯賽揚獎|美聯賽揚獎/.test(h));
    if(!belongs)return;
    if(isAce(h)){sc+=460;aceN++;return;}
    if(h.includes('年度MVP')){sc+=420;mvp++;}
    else if(h.includes('新人王'))sc+=140;
    else if(h.includes('金手套')){sc+=300;king++;}
    else if(h.includes('守備聖經')){sc+=220;king++;}
    else if(h.includes('救援王')){sc+=280;king++;}
    else if(h.includes('中繼王')){sc+=210;king++;}
    else if(h.includes('王')){sc+=160;king++;}
    else if(h.includes('明星賽'))sc+=(S.pos==='P'?70:40);
  });
  if(S.traits.franchise)sc+=200; /* 神主牌:忠誠加成 */
  return {sc,mvp,aceN,king};
}
/* 生涯守位加權：以各守位的實際出賽數加權平均（詳見 abilities.js 的 POS_TIER_K）。
   用 DPG 而非「主守位」，所以捕手蹲十年再轉一壘的球員會拿到兩者的混合標準，
   不會因為最後幾年移防就整段生涯改用另一把尺。 */
export function posTierK(st,bucket){
  if(S.pos==='P'||!st||!st.DPG)return 1;
  let g=0,acc=0;
  Object.entries(st.DPG).forEach(([dp,games])=>{
    const n=Math.max(0,games||0); if(!n)return;
    g+=n; acc+=(POS_TIER_K[dp]!=null?POS_TIER_K[dp]:1)*n;
  });
  if(!(g>0))return 1;
  /* 聯盟強度縮放(詳見 abilities.js 的 POS_TIER_STR) */
  const s=(POS_TIER_STR[bucket]!=null?POS_TIER_STR[bucket]:1);
  return 1+(acc/g-1)*s;
}
export function tierOf(bucket){
  const st=S.stats[bucket]; if(!st)return null;
  const hs=honorScore(bucket);
  /* 生涯評價折算依「這個聯盟這段生涯的實際角色」判斷，不是看目前角色：
     救援數占推估出賽數四成以上視為終結者型生涯，套用終結者專屬折算值。 */
  const posKey=S.pos!=='P'?'H':((st.SV||0)>=(st.IP||0)/1.05*0.4?'CL':'P');
  /* [Kbase,Khonor]:數據累積分與獎項分分開折算(兩者的聯盟差異性質相反,詳見 economy.js) */
  const k=((LEAGUE_K[bucket]||{})[posKey])||[1,1];
  const sc=careerScore(st,bucket)*k[0]+hs.sc*k[1],th=TIER_TH[bucket];
  /* 五級門檻整條依守位加權平移(不只名人堂)：同一個守位就該從頭到尾用同一把尺。 */
  const pk=posTierK(st,bucket);
  const hk=((HOF_TH_K[bucket]||{})[posKey])||1; /* 名人堂線獨立微調,明星以下不受影響(詳見 economy.js) */
  let i=sc>=th[0]*pk*hk?0:sc>=th[1]*pk?1:sc>=th[2]*pk?2:sc>=th[3]*pk?3:4;
  /* 獎項保底:MVP/最高投手獎至少明星球員;單項王至少每日球員 */
  if(hs.mvp||hs.aceN)i=Math.min(i,1);
  else if(hs.king)i=Math.min(i,2);
  return {i,sc:Math.round(sc),name:LG_N[bucket]+['名人堂','明星球員','每日球員','邊緣球員','一頁過客'][i]};
}
export function statTable(bucket){
  const st=S.stats[bucket]; if(!st)return '';
  let rows;
  if(S.pos==='TW'){
    const pit={...st,G:st.pitchG||0,H:st.pitchH||0,BB:st.pitchBB||0};
    const era=st.IP>0?baseballERA(pit).toFixed(2):'-',whip=st.IP>0?baseballWHIP(pit).toFixed(2):'-';
    const obpN=st.PA>0?(st.H+st.BB)/st.PA:0,slgN=slgOf(st),avg=st.AB>0?(st.H/st.AB).toFixed(3).replace(/^0/,''):'-',obp=st.PA>0?obpN.toFixed(3).replace(/^0/,''):'-',slg=st.AB>0?slgN.toFixed(3).replace(/^0/,''):'-',ops=st.AB>0?(obpN+slgN).toFixed(3).replace(/^0/,''):'-';
    rows=`<tr><th colspan="11">投手生涯</th></tr><tr><th>Yrs</th><th>G</th><th>IP</th><th>W</th><th>L</th><th>SV</th><th>HLD</th><th>SO</th><th>BB</th><th>ERA</th><th>WHIP</th></tr><tr><td>${st.yr}</td><td>${st.pitchG||st.G}</td><td>${fmtIP(st.IP)}</td><td>${st.W}</td><td>${st.L}</td><td>${st.SV||0}</td><td>${st.HLD||0}</td><td>${st.SO}</td><td>${st.pitchBB||0}</td><td>${era}</td><td>${whip}</td></tr><tr><th colspan="11">打者生涯</th></tr><tr><th>Yrs</th><th>G</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>H</th><th>HR</th><th>RBI</th><th>SB</th></tr><tr><td>${st.yr}</td><td>${st.batG||st.G}</td><td>${st.PA}</td><td>${avg}</td><td>${obp}</td><td>${slg}</td><td>${ops}</td><td>${st.H}</td><td>${st.HR}</td><td>${st.RBI}</td><td>${st.SB}</td></tr>`;
  }else if(S.pos==='P'){
    const era=st.IP>0?baseballERA(st).toFixed(2):'-';
    const whip=st.IP>0?baseballWHIP(st).toFixed(2):'-';
    rows=`<tr><th>Yrs</th><th>G</th><th>IP</th><th>W</th><th>L</th><th>SV</th><th>HLD</th><th>SO</th><th>BB</th><th>ERA</th><th>WHIP</th></tr>
    <tr><td>${st.yr}</td><td>${st.G}</td><td>${fmtIP(st.IP)}</td><td>${st.W}</td><td>${st.L}</td><td>${st.SV||0}</td><td>${st.HLD||0}</td><td>${st.SO}</td><td>${st.BB||0}</td><td>${era}</td><td>${whip}</td></tr>`;
  }else{
    const obpN = st.PA>0 ? (st.H+st.BB)/st.PA : 0;
    const slgN = slgOf(st);
    const avg = st.AB>0 ? (st.H/st.AB).toFixed(3).replace(/^0/,'') : '-';
    const obp = st.PA>0 ? obpN.toFixed(3).replace(/^0/,'') : '-';
    const slg = st.AB>0 ? slgN.toFixed(3).replace(/^0/,'') : '-';
    const ops = st.AB>0 ? (obpN+slgN).toFixed(3).replace(/^0/,'') : '-';
    rows=`<tr><th>Yrs</th><th>G</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>H</th><th>HR</th><th>RBI</th><th>SB</th><th>DEF</th></tr>
    <tr><td>${st.yr}</td><td>${st.G}</td><td>${st.PA}</td><td>${avg}</td><td>${obp}</td><td>${slg}</td><td>${ops}</td><td>${st.H}</td><td>${st.HR}</td><td>${st.RBI}</td><td>${st.SB}</td><td>${st.DEF>0?'+':''}${st.DEF||0}</td></tr>`;
  }
  const asN=st.AS||0;
  return `<p style="margin-top:8px"><b>${LG_N[bucket]}</b>${asN?` · 明星賽 ${asN} 度入選`:''}</p><table class="fin">${rows}</table>`;
}
export function milestoneLevel(st,key,unit){ return Math.floor((st&&st[key]||0)/unit)*unit; }
export function milestoneLine(label,st,defs,onlyKeys){
  if(!st)return '';
  const parts=[];
  defs.forEach(([key,unit,suffix])=>{
    if(onlyKeys&&!onlyKeys.has(key))return;
    const value=milestoneLevel(st,key,unit); if(value)parts.push(`${value}${suffix}`);
  });
  return parts.length?`${label} ${parts.join('・')}`:'';
}
export function careerMilestones(){
  const out=[];
  (S.hofInfo||[]).forEach(h=>out.push(`${h.lg}名人堂｜第 ${h.yr} 年入選｜得票率 ${h.pct}%`));
  const leagues=['MLB','NPB','CPBL'];
  const defs=(S.pos==='P'?MILESTONE_DEF.pit:S.pos==='TW'?[...MILESTONE_DEF.pit,...MILESTONE_DEF.bat]:MILESTONE_DEF.bat)
    .filter((d,i,a)=>a.findIndex(x=>x[0]===d[0])===i);
  const played=leagues.filter(b=>{const st=S.stats[b];return st&&((st.yr||0)>0||(st.G||0)>0||(st.PA||0)>0||(st.IP||0)>0);});
  const sum={}; defs.forEach(([key])=>sum[key]=0);
  played.forEach(b=>defs.forEach(([key])=>sum[key]+=S.stats[b][key]||0));
  /* 通算只在兩聯盟以上且加總真的跨過任何單一聯盟的下一級里程碑時，額外列出該項；各聯盟紀錄仍全部保留。 */
  if(played.length>=2){
    const raised=new Set();
    defs.forEach(([key,unit])=>{
      const combined=milestoneLevel(sum,key,unit);
      const best=Math.max(0,...played.map(b=>milestoneLevel(S.stats[b],key,unit)));
      if(combined>best)raised.add(key);
    });
    const total=milestoneLine('通算',sum,defs,raised); if(total)out.push(total);
  }
  leagues.forEach(b=>{const m=milestoneLine(LG_N[b],S.stats[b],defs);if(m)out.push(m);});
  return out;
}
export function honorRank(awd){
  const intl=/經典賽|12強|奧運|亞運|國家隊/.test(awd);
  const league=intl?0:(/大聯盟|世界大賽/.test(awd)?1:(/日職|日本一/.test(awd)?2:(/中職/.test(awd)?3:4)));
  const kind=/總冠軍|世界大賽冠軍|日本一$/.test(awd)?0:/年度MVP/.test(awd)?1:/三冠王/.test(awd)?2:/MVP/.test(awd)?3:
    /最佳投手|最佳打者|賽揚|澤村/.test(awd)?4:/金手套/.test(awd)?5:/守備聖經/.test(awd)?6:/王/.test(awd)?7:/明星賽/.test(awd)?9:8;
  return league*10+kind;
}
export function honorGroups(){
  const map=new Map();
  S.honors.forEach(h=>{ const parts=h.split(' '), yr=parts.length>=2?parts.shift():''; const awd=parts.length?parts.join(' '):h;
    if(!map.has(awd))map.set(awd,[]); map.get(awd).push(yr); });
  return [...map].map(([awd,yrs])=>({awd,yrs})).sort((a,b)=>honorRank(a.awd)-honorRank(b.awd)||a.awd.localeCompare(b.awd,'zh-Hant'));
}
export function yearRanges(yrs){
  const nums=yrs.filter(Boolean).map(Number).sort((a,b)=>a-b); if(!nums.length)return [];
  const res=[]; let st=nums[0],ed=nums[0];
  for(let i=1;i<=nums.length;i++){
    if(i<nums.length&&nums[i]===ed+1)ed=nums[i];
    else{res.push(ed-st>=2?`${st}~${ed}`:ed-st===1?`${st}、${ed}`:`${st}`);if(i<nums.length){st=nums[i];ed=nums[i];}}
  }
  return res;
}
export function honorText(g){
  const ranges=yearRanges(g.yrs), count=g.yrs.length;
  if(!ranges.length)return g.awd;
  return count>1?`${g.awd} ×${count} (${ranges.join('、')})`:`${g.awd} (${ranges[0]})`;
}
