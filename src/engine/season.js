import {S, blankStat, bucketOf, nextStep, stageLabel} from '../core/state.js?v=offline-0.30.0';
import {R, ri, chance, clamp, N0} from '../core/rng.js?v=offline-0.30.0';
import {POS_ADJ_RUNS, POS_PT_BAR} from '../data/abilities.js?v=offline-0.30.0';
import {LV,HS_CUPS,U_CUPS,AMA_CUPS,JP_HS_CUPS,JP_U_CUPS,ES_CUPS,MS_CUPS,JP_ES_CUPS,JP_MS_CUPS,spLoad} from '../data/teams.js?v=offline-0.30.0';
import {card, board} from '../ui/dom.js?v=offline-0.30.0';
import {ovr, careerAllStars, toolGap} from './ability.js?v=offline-0.30.0';
import {tjAccrue, tjGamble} from './injury.js?v=offline-0.30.0';
/* temporary scaffold until awards/intl/contract/flow are extracted */
import {demotionAudit} from './contract.js?v=offline-0.30.0';
import {awards} from './awards.js?v=offline-0.30.0';
import {maybeIntl} from './intl.js?v=offline-0.30.0';
import {traitCard, removeTrait} from '../flow/events.js?v=offline-0.30.0';
import {proPersonalAwards} from './pro-awards.js?v=offline-0.30.0';
import {amateurRankIndex} from './amateur-result.js?v=offline-0.30.0';
export function pitcherRole(){ /* 體力 >=52 先發;否則牛棚,牛棚內看表現升終結者 */
  if(S.ab.sta>=52)return 'SP';
  /* 牛棚:讀「上一季」的 d(prevD,因為 lastD 已被 phasePre 清空);頂尖 → 終結者 */
  const pd=(S.prevD!==undefined?S.prevD:(S.lastD||0));
  /* 只有上一季已在相同頂級聯盟投牛棚，該季成績才可用於終結者升降。
     二軍升一軍、跨聯盟或舊存檔缺少 lastLv 時，第一季一律先從中繼開始。 */
  const currentTop=LV[S.lv]&&LV[S.lv].top, previousTop=LV[S.lastLv]&&LV[S.lastLv].top;
  const sameTopLeague=!!currentTop&&previousTop===currentTop;
  const d=(sameTopLeague&&S.role&&S.role!=='SP')?pd:-99;
  if(S.role==='CL')return d>=1?'CL':'MR';   /* 終結者崩盤才降中繼 */
  return d>=3?'CL':'MR';                     /* 中繼打出頂尖成績升終結者 */
}
export function outsFromIP(ip){ /* 模擬用十進位局數統一量化為實際出局數 */
  return Math.max(0,Math.round((Number(ip)||0)*3));
}
export function ipFromOuts(outs){
  return Math.max(0,Math.round(Number(outs)||0))/3;
}
export function normalizeIP(ip){
  return ipFromOuts(outsFromIP(ip));
}
export function baseballERA(st){
  const ip=normalizeIP(st&&st.IP);
  return ip>0?(Number(st&&st.ER)||0)*9/ip:null;
}
export function baseballWHIP(st){
  const ip=normalizeIP(st&&st.IP);
  const h=st&&st.twoWay?st.pitchH:st&&st.H,bb=st&&st.twoWay?st.pitchBB:st&&st.BB;
  return ip>0?((Number(h)||0)+(Number(bb)||0))/ip:null;
}
export function fmtIP(ip){ /* 以出局數顯示棒球局數：1/3 局=.1、2/3 局=.2 */
  const outs=outsFromIP(ip);
  return Math.floor(outs/3)+'.'+(outs%3);
}
export function roleN(r){ return {SP:'先發',MR:'中繼',CL:'終結者'}[r]||'—'; }
export function isSP(){ return S.role==='SP'; } /* 先發引擎判定 */
/* ================= 數據模擬 ================= */
export function scaledSteals(fullSeason,pa,leagueGames){
  return Math.round(Math.max(0,fullSeason||0)*clamp((pa||0)/((leagueGames||1)*4.25),0,1));
}
export function capSteals(st){
  const timesOnBase=Math.max(0,(st.H||0)+(st.BB||0));
  const physicalCap=Math.min(Math.floor((st.PA||0)*0.35),Math.floor(timesOnBase*1.5));
  st.SB=Math.max(0,Math.min(Math.round(st.SB||0),physicalCap));
}
export function simSeason(lv){
  if(S.pos==='TW'){
    const keep={pos:S.pos,role:S.role,dpos:S.dpos};
    const usage=S.stage==='PRO'?(S.contractUsage||'TW'):'TW';
    S.pos='P';if(!S.role)S.role=pitcherRole();const pitch=usage==='H'?null:simSeason(lv);
    S.pos='IF';S.dpos=keep.dpos||S.twoWayBatPos||'DH';S._twoWayBatSim=true;const bat=usage==='P'?null:simSeason(lv);delete S._twoWayBatSim;
    S.pos=keep.pos;S.role=keep.role||pitcherRole();S.dpos=keep.dpos||S.dpos;S.twoWayBatPos=S.dpos;
    if(usage==='P')return {...pitch,usage:'P',twoWayUsage:'P'};
    if(usage==='H')return {...bat,usage:'H',twoWayUsage:'H'};
    const out={...bat,W:pitch.W,L:pitch.L,SV:pitch.SV,HLD:pitch.HLD,IP:pitch.IP,SO:pitch.SO,ER:pitch.ER,pitchBB:pitch.BB,pitchH:pitch.H,
      era:pitch.era,WHIP:pitch.WHIP,d:(Number(pitch.d||0)+Number(bat.d||0))/2,G:Math.max(pitch.G||0,bat.G||0),
      pitchG:pitch.G||0,batG:bat.G||0,twPitch:pitch,twBat:bat,twoWay:true};
    return out;
  }
  if(S.pos==='P'&&!S.role)S.role=pitcherRole();
  const L=LV[lv], par=L.par, a=S.ab, f=S.seasonFactor;
  const st={G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,IP:0,SO:0,ER:0,avg:0,era:0,d:0};
  if(f<=0) return st;
  if(S.pos==='P'){
    const q=(a.vel+a.ctl+a.brk)/3, d=q-par; st.d=d;
    /* 表現係數:投得好給滿局數,投爛減少出賽(比照野手) */
    let perfF=clamp(0.80+d*0.028,0.42,1.12);
    if(S.traits.favorite)perfF=Math.max(perfF,0.85); /* 愛將:教練照樣派你上,低潮年不會被冷凍 */
    if(isSP()){
      /* 先發場次要乘上該層級的輪次倍率(詳見 teams.js 的 rot / spLoad)：
         中職一軍 1.00、日職一軍 0.99(六人輪值)、大聯盟 1.35(五人輪值 162 場)。
         舊版沒有這一項，三個聯盟的先發都投 25~30 場，但獎項門檻、TJ 負荷與薪資
         工作量全都以「局數隨聯盟場次放大」為前提，四個系統對不上。 */
      const gs=Math.round(clamp(20+(a.sta-40)*0.18,10,30)*spLoad(lv)*f*perfF*(0.94+R()*0.08));
      st.G=Math.max(1,gs);
      /* IP/GS:聯盟平均~5.0、優質先發5.2-6.0、工作馬6.1-6.5;由 d 值(綜合實力)決定,控球差略減 */
      const ipg=clamp(5.0+d*0.05+(a.sta-50)*0.012+(a.ctl-par)*0.006+N0(0.12),4.8,6.5);
      st.IP=+(st.G*ipg).toFixed(1);
    }else{
      st.G=Math.max(1,Math.round(clamp(45+(Math.min(a.sta,60)-40)*0.3,25,68)*f*perfF*(0.94+R()*0.08))); /* 高體力後援:出賽數貢獻以 sta60 封頂,不會貼近先發工作量 */
      st.IP=+(st.G*1.05).toFixed(1);
    }
    st.era=clamp(4.32-d*0.17+N0(0.35),1.40,9.90);
    st.ER=Math.round(st.era*st.IP/9);
    const k9=clamp(6.2+(a.vel-par)*0.11+(a.brk-par)*0.06+N0(0.5),3.5,13.5);
    st.SO=Math.round(st.IP/9*k9);
    /* 保送:控球決定(BB/9);被安打:d 值決定;WHIP=(H+BB)/IP */
    const bb9=clamp(4.6-(a.ctl-par)*0.13+N0(0.4),1.2,7.5);
    st.BB=Math.round(st.IP/9*bb9);
    const h9=clamp(9.2-d*0.16+N0(0.5),5.0,13.5);
    st.H=Math.round(st.IP/9*h9);
    st.WHIP=st.IP>0?+(baseballWHIP(st)||0).toFixed(2):0;
    if(isSP()){
      const dec=Math.round(st.G*0.72), wp=clamp(0.50+d*0.014+N0(0.05),0.15,0.85);
      st.W=Math.round(dec*wp); st.L=dec-st.W;
    }else if(S.role==='CL'){
      /* 終結者:救援以出賽數為基礎(轉化率隨表現 d),SV 天生 <= G;每場最多 1 救援 */
      const svRate=clamp(0.55+d*0.02,0.35,0.82);            /* 救援轉化率:35%~82% */
      st.SV=Math.min(st.G, Math.round(st.G*svRate));         /* 不可超過出賽數 */
      st.HLD=Math.min(Math.max(0,st.G-st.SV), Math.round(st.G*0.12)); /* 非救援登板的中繼 */
      const dec=Math.max(1,Math.round(st.G*0.14)); st.W=Math.round(dec*clamp(0.45+d*0.02,0.3,0.7)); st.L=Math.max(0,dec-st.W);
    }else{ /* 中繼:中繼成功 HLD 以出賽數為基礎 */
      const hldRate=clamp(0.45+d*0.02,0.25,0.72);
      st.HLD=Math.min(st.G, Math.round(st.G*hldRate));       /* 不可超過出賽數 */
      st.SV=Math.min(Math.max(0,st.G-st.HLD), chance(25)?ri(1,5):0);
      const dec=Math.max(1,Math.round(st.G*0.14)); st.W=Math.round(dec*clamp(0.5+d*0.015,0.35,0.7)); st.L=Math.max(0,dec-st.W);
    }
    /* 物理約束:每場最多一種結果 → 救援占比<=85%、勝+敗+救援+中繼 總和不可超過出賽數 */
    if(!isSP()){
      st.SV=Math.min(st.SV||0, Math.floor(st.G*0.85));
      st.HLD=Math.min(st.HLD||0, Math.max(0,st.G-st.SV));
      const decCap=Math.max(0,st.G-st.SV-st.HLD);
      if((st.W+st.L)>decCap){ st.W=Math.min(st.W,decCap); st.L=Math.max(0,decCap-st.W); }
    }
  }else{
    const q=a.con*0.5+a.pow*0.2+a.eye*0.18+a.spd*0.12, d=q-par-0.5; st.d=d; /* 加入 pow(長打產能計入實力);-0.5 校準,整體分布與舊版對齊 */
    /* 出賽規模:體力設上限,表現(d)決定實際多寡 */
    /* 體力係數:50+ 接近滿(~0.9-1.0)、45~50 尚可、40 明顯少、35 只剩代打量(~0.35) */
    let staF;const playingSta=S._twoWayBatSim?Math.max(a.sta,clamp(Number(S.twoWayBatMinStamina??50),1,150)):a.sta;
    if(playingSta>=55)staF=1.0; else if(playingSta>=50)staF=0.90+(playingSta-50)*0.02;
    else if(playingSta>=45)staF=0.72+(playingSta-45)*0.036; else if(playingSta>=40)staF=0.52+(playingSta-40)*0.04;
    else if(playingSta>=35)staF=0.35+(playingSta-35)*0.034; else staF=Math.max(0.15,0.35-(35-playingSta)*0.03);
    /* 守位只由季初守位會議決定。低體力會自然減少出賽，不再於季末暗中改判 DH。 */
    /* 表現係數:打得好才有滿打席,爛表現(d<0)出賽再打折
       守備光譜:先發門檻依守位平移(詳見 abilities.js 的 POS_PT_BAR)。捕手/游擊打平聯盟水準
       就守得住先發,一壘/指定打擊打不出來就掉打席。只動出賽率,st.d 不變。 */
    const spotDp=(S.dpos)||(S.pos==='C'?'C':null);
    const posBar=(spotDp&&POS_PT_BAR[spotDp]!=null)?POS_PT_BAR[spotDp]:0;
    const perfF=clamp(0.82+(d+posBar)*0.03,0.45,1.12);
    let useF=clamp(staF*perfF,0.10,1.0);
    if(S.traits.favorite)useF=Math.max(useF,0.85); /* 愛將:出賽率保底(體力偏低或低潮年才會生效,滿額主力無感) */
    st.G=Math.min(L.g, Math.round(L.g*useF*f*(0.90+R()*0.10))); /* 上限=聯盟場次,不可超過;隨機項加寬(原0.95~1.01)—實力遠超聯盟水準時 staF*perfF 常年頂在1.0上限，
       只剩這個隨機項在決定出賽數，範圍太窄(僅約±3%)會讓生涯逐年出賽數/打席看起來年年幾乎一模一樣;加寬到±5%讓表現飽和的球季也有自然的年度落差 */
    st.PA=Math.round(st.G*4.25);
    st._dh=S.dpos==='DH'; /* 只有正式登錄為 DH 的球季才按 DH 結算。 */
    st.BB=Math.round(st.PA*clamp(0.062+(a.eye-par)*0.0034,0.045,0.17));
    st.AB=st.PA-st.BB;
    st.avg=clamp(0.252+d*0.0058+(a.sta-50)*0.0003+(a.spd-par)*0.0006+N0(0.014),0.140,0.380);
    st.H=Math.round(st.AB*st.avg); st.avg=st.AB?st.H/st.AB:0;
    st.HR=Math.round(st.AB*clamp(0.010+(a.pow-par)*0.0022,0.001,0.075)*(0.85+R()*0.3));
    const fullSeasonSB=clamp((a.spd-45)*0.5+(a.spd-par)*1.3+N0(4),0,70);
    st.SB=scaledSteals(fullSeasonSB,st.PA,L.g); /* 盜壘依實際打席機會縮放，不能只打十幾場卻跑出完整球季產量。 */
    st.RBI=Math.round(st.HR*2.1+(st.H-st.HR)*0.30);
    /* DEF 會在所有出賽加成套用完後，依最終實際出賽數統一計算。 */
    st.DEF=0;
  }
  applySeasonForm(st,lv);   /* 低潮年/生涯年:調整率值與產出(不動出賽數) */
  applyAnnualStatVariance(st); /* F10 年度浮動：必須在獎項與年度紀錄之前定案。 */
  if(S.pos!=='P')capSteals(st);
  return st;
}
export function applyAnnualStatVariance(st){
  if(!st||st._annualVarianceApplied)return st;
  st._annualVarianceApplied=true;
  const uf=k=>{
    const pct=clamp(Number(S[k])||0,0,100)/100;
    if(pct===0)return 1;
    return 1+(R()*2-1)*pct;
  };
  if(S.pos==='P'){
    const keys=['seasonPitchEraVarPct',isSP()?'seasonPitchStarterIpgVarPct':'seasonPitchReliefIpgVarPct','seasonPitchK9VarPct','seasonPitchBb9VarPct','seasonPitchH9VarPct','seasonPitchWinProbVarPct'];
    if(!keys.some(k=>(Number(S[k])||0)>0))return st;
    const oldIP=Math.max(0,normalizeIP(st.IP)),g=Math.max(0,st.G||0);
    if(oldIP>0&&g>0){
      const ipKey=isSP()?'seasonPitchStarterIpgVarPct':'seasonPitchReliefIpgVarPct';
      const era=baseballERA(st)??st.era??0,k9=(st.SO||0)*9/oldIP;
      const bb9=(st.BB||0)*9/oldIP,h9=(st.H||0)*9/oldIP;
      st.IP=normalizeIP(g*(oldIP/g)*uf(ipKey));
      st.ER=Math.max(0,Math.round(era*uf('seasonPitchEraVarPct')*st.IP/9));
      st.SO=Math.max(0,Math.round(k9*uf('seasonPitchK9VarPct')*st.IP/9));
      st.BB=Math.max(0,Math.round(bb9*uf('seasonPitchBb9VarPct')*st.IP/9));
      st.H=Math.max(0,Math.round(h9*uf('seasonPitchH9VarPct')*st.IP/9));
    }
    const decisions=Math.max(0,(st.W||0)+(st.L||0));
    if(decisions>0){
      const wp=clamp(((st.W||0)/decisions)*uf('seasonPitchWinProbVarPct'),0,1);
      st.W=Math.round(decisions*wp);st.L=decisions-st.W;
    }
    if(isSP()){
      const cap=Math.max(0,st.G||0),total=(st.W||0)+(st.L||0);
      if(total>cap){const ratio=cap/total;st.W=Math.round(st.W*ratio);st.L=Math.max(0,cap-st.W);}
    }else{
      st.SV=Math.min(st.SV||0,Math.floor((st.G||0)*.85));
      st.HLD=Math.min(st.HLD||0,Math.max(0,(st.G||0)-st.SV));
      const cap=Math.max(0,(st.G||0)-st.SV-st.HLD),total=(st.W||0)+(st.L||0);
      if(total>cap){const ratio=cap/total;st.W=Math.round(st.W*ratio);st.L=Math.max(0,cap-st.W);}
    }
    st.era=st.IP>0?+(baseballERA(st)||0).toFixed(2):0;
    st.WHIP=st.IP>0?+(baseballWHIP(st)||0).toFixed(2):0;
  }else{
    const keys=['seasonBatAvgVarPct','seasonBatHrRateVarPct','seasonBatGamesVarPct','seasonBatSbVarPct'];
    if(!keys.some(k=>(Number(S[k])||0)>0))return st;
    const oldG=Math.max(0,st.G||0),oldPA=Math.max(0,st.PA||0),oldAB=Math.max(0,st.AB||0);
    const avg=oldAB>0?(st.H||0)/oldAB:0,hrRate=oldAB>0?(st.HR||0)/oldAB:0;
    const bbRate=oldPA>0?(st.BB||0)/oldPA:0,sbRate=oldPA>0?(st.SB||0)/oldPA:0;
    st.G=Math.max(0,Math.round(oldG*uf('seasonBatGamesVarPct')));
    st.PA=Math.max(0,Math.round((oldG>0?oldPA/oldG:0)*st.G));
    st.BB=clamp(Math.round(st.PA*bbRate),0,st.PA);st.AB=st.PA-st.BB;
    st.H=clamp(Math.round(st.AB*avg*uf('seasonBatAvgVarPct')),0,st.AB);
    st.HR=clamp(Math.round(st.AB*hrRate*uf('seasonBatHrRateVarPct')),0,st.H);
    st.SB=Math.max(0,Math.round(st.PA*sbRate*uf('seasonBatSbVarPct')));
    st.avg=st.AB?st.H/st.AB:0;
    st.RBI=Math.max(0,Math.round(st.HR*2.1+(st.H-st.HR)*.30));
  }
  return st;
}
/* 賽季狀態:10% 低潮(成績×0.65)、10% 生涯年(成績×1.2,需健康);倍率只作用產出/率值,出賽數 G 不變 */
export function applySeasonForm(st,lv){
  if(S.seasonFactor<=0)return;                 /* 傷缺全季不觸發 */
  st.form=0;                                    /* 0=正常 1=生涯年 -1=低潮 */
  const roll=R();
  const canCareer=S.seasonFactor>=0.9;          /* 生涯年需該季健康 */
  let m=1;
  if(roll<0.10){ st.form=-1; m=0.65; }          /* 低潮:成績打 65 折 */
  else if(canCareer && roll<0.20){ st.form=1; m=1.20; } /* 生涯年:成績 ×1.2 */
  if(m===1)return;
  if(S.pos==='P'){
    /* 投手:三振/勝場隨倍率;被安打與自責分反向(生涯年變少、低潮變多);SV/HLD 依倍率但不超過出賽數 */
    st.SO=Math.round(st.SO*m);
    st.W=Math.round(st.W*m); if(st.L!=null)st.L=Math.max(0,Math.round(st.L/(m||1)));
    st.H=Math.max(0,Math.round(st.H/m)); st.ER=Math.max(0,Math.round(st.ER/m));
    st.era=st.IP>0?+(baseballERA(st)||0).toFixed(2):st.era;
    st.WHIP=st.IP>0?+(baseballWHIP(st)||0).toFixed(2):st.WHIP;
    if(st.SV)st.SV=Math.min(st.G,Math.round(st.SV*m));
    if(st.HLD)st.HLD=Math.min(Math.max(0,st.G-(st.SV||0)),Math.round(st.HLD*m));
    /* 物理約束(倍率後再夾):救援占比<=85%、勝+敗+救援+中繼 <= 出賽數 */
    if(!isSP()){
      st.SV=Math.min(st.SV||0, Math.floor(st.G*0.85));
      st.HLD=Math.min(st.HLD||0, Math.max(0,st.G-st.SV));
      const decCap=Math.max(0,st.G-st.SV-st.HLD);
      if((st.W+st.L)>decCap){ st.W=Math.min(st.W,decCap); st.L=Math.max(0,decCap-st.W); }
    }
  }else{
    /* 打者:安打/全壘打/盜壘/打點隨倍率;打席與出賽數不變(打率連帶變動) */
    st.H=Math.round(st.H*m); st.HR=Math.round(st.HR*m); st.SB=Math.round(st.SB*m);
    if(st.H>st.AB)st.H=st.AB;                   /* 安打不可超過打數 */
    st.avg=st.AB?st.H/st.AB:0;
    st.RBI=Math.round(st.HR*2.1+(st.H-st.HR)*0.30);
  }
  /* d 值(影響評價/獎項/下放)跟著狀態調整 */
  st.d += st.form===1?4:st.form===-1?-4:0;
}
/* 守備分(近似 defensive runs):守位難度權重 × 守備工具相對聯盟基準的幅度 × 出賽比重 */
export function defRuns(lv,overrideDp,games){
  if(S.pos==='P')return 0;
  const L=LV[lv],a=S.ab,par=L.par;
  const dp=overrideDp||S.dpos||(S.pos==='C'?'C':'2B');
  if(dp==='DH')return 0; /* DH 不產生守備分 */
  const posW={SS:1.25,CF:1.20,C:1.15,'2B':1.05,'3B':1.00,RF:0.95,'1B':0.75,LF:0.80}[dp]||1;
  const skill=dp==='C'?(a.fld*0.4+a.arm*0.3+a.cat*0.3)
    :(a.rng*0.45+a.fld*0.40+a.arm*0.15);
  const gw=clamp((games||0)/(L.g||1),0,1);
  return Math.round((skill-par)*posW*0.55*gw);
}
/* 舊年度尚未保存角色時，以數據推定；新年度直接使用 st.role。 */
export function pitcherSalaryRole(st,recordedRole){
  if(['SP','MR','CL'].includes(recordedRole))return recordedRole;
  if(st&&['SP','MR','CL'].includes(st.role))return st.role;
  if(st&&(st.SV||0)>=10&&(st.SV||0)>=(st.HLD||0))return 'CL';
  if(st&&(st.HLD||0)>=10)return 'MR';
  if(st&&(st.G||0)>0&&(st.IP||0)/(st.G||1)>=2.5)return 'SP';
  return S.role||'SP';
}
/* 薪資專用球員價值：野手計打擊、守備與守位；投手計球威、角色與實際工作量。 */
export function seasonSalaryRating(st,lv,recordedRoleOrPos){
  if(!st||!Number.isFinite(st.d))return 0;
  if(Number.isFinite(st.payD))return st.payD;
  if(S.pos==='P'){
    if(!(st.G>0))return st.d; /* 全年復健只交由傷後市場折價，不重複扣工作量。 */
    const role=pitcherSalaryRole(st,recordedRoleOrPos), L=LV[lv]||LV[S.lv];
    let adj=0;
    if(role==='SP')adj=clamp(((st.IP||0)/(L.g||1)-0.75)*2,-1,0.75);
    else if(role==='CL')adj=-2+clamp(((st.SV||0)-25)/20,-0.75,0.75);
    else adj=-4+clamp(((st.HLD||0)-20)/20,-0.75,0.75);
    return +(st.d+adj).toFixed(2);
  }
  const dp=st._dh?'DH':(recordedRoleOrPos||S.dpos||(S.pos==='C'?'C':'DH'));
  const games=Math.max(0,Number(st.G)||0), def=dp==='DH'?0:(Number(st.DEF)||0);
  /* 守位分母用該聯盟滿季場次，不寫死 162：同一行的 def 來自 defRuns()，那邊已經以
     gw=games/L.g 正規化過，兩者必須同尺度。寫死 162 會讓場次較少的聯盟(中職 120 場)
     的守位薪資只算到 74%，捕手/游擊的加價與一壘/指定打擊的減價同時被稀釋。
     與 career.js 的 positionScore() 同一套規則。 */
  const full=((LV[lv]||LV[S.lv]||{}).g)||162;
  const posRuns=(POS_ADJ_RUNS[dp]||0)*(games/full);
  return +(st.d+(def+posRuns)/6).toFixed(2);
}
/* 球季帳面成績評等：0=差 1=普通 2=好 3=壓倒性，另有 −1=樣本不足（無法評價）。
   只讀真實數據，完全不看能力值——升降級判定需要「打出來的」跟「體檢數字漂亮」是兩件事。
   以率值(OPS／ERA／WHIP)為主軸，數量型指標(全壘打、救援+中繼)依聯盟場次等比縮放。
   −1 與 1 必須分開：受傷或打席不足的球季無從論斷成績，呼叫端要改用能力判斷，
   不能當成「普通」處理，否則會出現「打擊率 .358 卻被說帳面成績不夠好」的矛盾訊息。 */
export function seasonGrade(st,lv){
  if(!st)return -1;
  const g=(LV[lv]||{}).g||130, r=g/130;
  if(S.pos==='P'){
    const era=baseballERA(st), whip=baseballWHIP(st);
    if(era==null||(st.IP||0)<g*0.22)return -1;
    const bulk=isSP()?((st.IP||0)>=g*0.5):(((st.SV||0)+(st.HLD||0))>=15*r);
    if(era<=2.80&&bulk)return 3;
    if(era<=3.50||(whip!=null&&whip<=1.15&&era<=3.75))return 2;
    if(era<=4.35)return 1;
    return 0;
  }
  const pa=st.PA||0;
  if(pa<g*2.0)return -1;
  const obp=(st.H+(st.BB||0))/pa, ops=obp+slgOf(st);
  /* 門檻對齊本作的 OPS 尺度，不是現實棒球的：這裡「聯盟平均」的 OPS 約 .64，
     .750 已是主力等級、.850 是聯盟頂尖。用現實的 .700/.800/.900 會讓小聯盟
     (升級門檻只比該級 par 高 2~3 點)的球員有六成以上被評為「差」，卡住升級。 */
  if(ops>=0.850||(ops>=0.800&&(st.HR||0)>=20*r))return 3;
  if(ops>=0.750)return 2;
  if(ops>=0.650)return 1;
  return 0;
}
export function currentSalaryRating(fallback){
  if(Number.isFinite(S.lastPayD))return S.lastPayD;
  if(S.lastSt)return seasonSalaryRating(S.lastSt,S.lastLv||S.lv,S.pos==='P'?S.role:S.dpos);
  return Number.isFinite(fallback)?fallback:0;
}
/* 所有球季狀態與特質加成結束後，再做一次聯盟場次與棒球物理限制的統一校正。 */
export function normalizeBatterStats(st,lv){
  const maxG=LV[lv].g||0;
  st.G=clamp(Math.round(st.G||0),0,maxG);
  const maxPA=Math.round(st.G*4.75);
  st.PA=clamp(Math.round(st.PA||0),0,maxPA);
  st.BB=clamp(Math.round(st.BB||0),0,st.PA);
  st.AB=clamp(Math.round(st.AB||0),0,Math.max(0,st.PA-st.BB));
  st.H=clamp(Math.round(st.H||0),0,st.AB);
  st.HR=clamp(Math.round(st.HR||0),0,st.H);
  st.RBI=Math.max(0,Math.round(st.RBI||0));
  capSteals(st);
  st.avg=st.AB>0?st.H/st.AB:0;
}
export function normalizePitchingStats(st,lv){
  const maxG=LV[lv].g||0;
  st.G=clamp(Math.round(st.G||0),0,maxG);
  st.IP=normalizeIP(clamp(Number(st.IP)||0,0,st.G*9));
  ['H','BB','SO','ER','W','L','SV','HLD'].forEach(k=>st[k]=Math.max(0,Math.round(st[k]||0)));
  if(isSP()){
    st.SV=0; st.HLD=0;
    const decCap=st.G;
    if(st.W+st.L>decCap){
      const ratio=decCap/(st.W+st.L||1);
      st.W=Math.floor(st.W*ratio); st.L=Math.min(decCap-st.W,Math.floor(st.L*ratio));
    }
  }else{
    st.SV=Math.min(st.SV,Math.floor(st.G*0.85));
    st.HLD=Math.min(st.HLD,Math.max(0,st.G-st.SV));
    const decCap=Math.max(0,st.G-st.SV-st.HLD);
    if(st.W+st.L>decCap){
      const ratio=decCap/(st.W+st.L||1);
      st.W=Math.floor(st.W*ratio); st.L=Math.min(decCap-st.W,Math.floor(st.L*ratio));
    }
  }
  st.era=st.IP>0?+(baseballERA(st)||0).toFixed(2):0;
  st.WHIP=st.IP>0?+(baseballWHIP(st)||0).toFixed(2):0;
}
export function accStat(bucket,st){
  if(!S.stats[bucket]) S.stats[bucket]=blankStat();
  const t=S.stats[bucket]; t.yr++;
  if(bucket!=='MINOR'&&S.orgTeam){ const tb=S.teamTally[bucket]||(S.teamTally[bucket]={});
    tb[S.orgTeam]=(tb[S.orgTeam]||0)+1; }
  if(S.pos!=='P'){ const dp=(st&&st._dh)?'DH':(S.dpos||'—');
    S.dposYears[dp]=(S.dposYears[dp]||0)+1;
    if(!t.DPG)t.DPG={}; t.DPG[dp]=(t.DPG[dp]||0)+(st.G||0); }
  if((S.pos==='P'||S.pos==='TW')&&S.role){ S.roleYears[S.role]=(S.roleYears[S.role]||0)+1; }
  if(S.pos==='TW'&&st.twoWayUsage==='P'){
    t.pitchG=(t.pitchG||0)+(st.G||0);t.pitchH=(t.pitchH||0)+(st.H||0);t.pitchBB=(t.pitchBB||0)+(st.BB||0);t.twoWayYears=(t.twoWayYears||0)+1;
    ['G','W','L','SV','HLD','SO','ER'].forEach(k=>t[k]+=(st[k]||0));t.IP=ipFromOuts(outsFromIP(t.IP)+outsFromIP(st.IP));return;
  }
  if(S.pos==='TW'&&st.twoWayUsage==='H'){t.batG=(t.batG||0)+(st.G||0);t.twoWayYears=(t.twoWayYears||0)+1;}
  ['G','PA','AB','H','HR','RBI','SB','BB','W','L','SV','HLD','SO','ER'].forEach(k=>t[k]+=(st[k]||0));
  if(st.twoWay){
    t.twoWayYears=(t.twoWayYears||0)+1;
    t.pitchG=(t.pitchG||0)+(st.pitchG||0);t.batG=(t.batG||0)+(st.batG||0);
    t.pitchH=(t.pitchH||0)+(st.pitchH||0);t.pitchBB=(t.pitchBB||0)+(st.pitchBB||0);
  }
  t.DEF+=(st.DEF||0);
  t.IP=ipFromOuts(outsFromIP(t.IP)+outsFromIP(st.IP));
}
export function statLine(st){
  if(st.twoWay||(S.pos==='TW'&&!st.twoWayUsage)){
    const p=st.twPitch||st,b=st.twBat||st;
    const pit=`投球：出賽 ${p.G||st.pitchG||0}｜局數 ${fmtIP(p.IP||st.IP)}｜${p.W||st.W||0}勝${p.L||st.L||0}敗｜${p.SV||st.SV||0}救援｜${p.HLD||st.HLD||0}中繼｜三振 ${p.SO||st.SO||0}｜保送 ${p.BB??st.pitchBB??0}｜ERA ${Number(p.era??st.era??0).toFixed(2)}｜WHIP ${Number(p.WHIP??st.WHIP??0).toFixed(2)}`;
    const obp=(b.PA||0)>0?((b.H||0)+(b.BB||0))/(b.PA||1):0,slg=slgOf(b),avg=Number(b.avg??st.avg??0);
    const hit=`打擊：出賽 ${b.G||st.batG||0}｜打席 ${b.PA||st.PA||0}｜打擊率 ${avg.toFixed(3).replace(/^0/,'')}｜上壘率 ${obp.toFixed(3).replace(/^0/,'')}｜長打率 ${slg.toFixed(3).replace(/^0/,'')}｜OPS ${(obp+slg).toFixed(3).replace(/^0/,'')}｜安打 ${b.H||st.H||0}｜全壘打 ${b.HR||st.HR||0}｜打點 ${b.RBI||st.RBI||0}｜保送 ${b.BB||st.BB||0}｜盜壘 ${b.SB||st.SB||0}｜守備 ${(b.DEF||st.DEF||0)>0?'+':''}${b.DEF||st.DEF||0}`;
    return `${pit}<br>${hit}`;
  }
  if(S.pos==='P'||st.twoWayUsage==='P'){ const role=roleN(S.role); const relief=(S.role==='CL'&&st.SV)?`｜${st.SV}救援`:(S.role==='MR'&&st.HLD)?`｜${st.HLD}中繼`:''; return `出賽 ${st.G}｜局數 ${fmtIP(st.IP)}｜${st.W}勝${st.L}敗${relief}｜三振 ${st.SO}｜保送 ${st.BB||0}｜ERA ${Number(st.era||0).toFixed(2)}｜WHIP ${(st.WHIP||0).toFixed(2)}`; }
  const obpN=st.PA>0?(st.H+st.BB)/st.PA:0;
  const slgN=slgOf(st);
  const obp=st.PA>0?obpN.toFixed(3).replace(/^0/,''):'-';
  const slg=st.AB>0?slgN.toFixed(3).replace(/^0/,''):'-';
  const ops=st.AB>0?(obpN+slgN).toFixed(3).replace(/^0/,''):'-';
  return `出賽 ${st.G}｜打席 ${st.PA}｜打擊率 ${st.avg.toFixed(3).replace(/^0/,'')}｜上壘率 ${obp}｜長打率 ${slg}｜OPS ${ops}｜安打 ${st.H}｜全壘打 ${st.HR}｜打點 ${st.RBI}｜保送 ${st.BB}｜盜壘 ${st.SB}${st.DEF!==undefined?`｜守備 ${st.DEF>0?'+':''}${st.DEF}`:''}`;
}
const statF3=v=>v==null?'-':Number(v).toFixed(3).replace(/^0/,'');
const statF2=v=>v==null?'-':Number(v).toFixed(2);
const annualStatStyle=()=>`--annual-stat-font-size:${clamp(Number(S.annualStatFontSize)||13,9,15)}px`;
function oneSeasonTable(st,isP){
  if(isP){
    const hd=['G','IP','W','L','SV','HLD','SO','BB','ERA','WHIP'];
    const v=[st.G||0,fmtIP(st.IP||0),st.W||0,st.L||0,st.SV||0,st.HLD||0,st.SO||0,st.BB||0,statF2(baseballERA(st)),statF2(baseballWHIP(st))];
    return `<div class="stat-table-wrap annual-stat-wrap" style="${annualStatStyle()}"><table class="fin season-stat-table pitcher"><thead><tr>${hd.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody><tr>${v.map(x=>`<td>${x}</td>`).join('')}</tr></tbody></table></div>`;
  }
  const obp=st.PA>0?(st.H+(st.BB||0))/st.PA:null,slg=st.AB>0?slgOf(st):null;
  const hd=['G','PA','AVG','OBP','SLG','OPS','H','HR','RBI','SB','DEF'];
  const v=[st.G||0,st.PA||0,statF3(st.AB>0?st.H/st.AB:null),statF3(obp),statF3(slg),statF3(obp!=null&&slg!=null?obp+slg:null),st.H||0,st.HR||0,st.RBI||0,st.SB||0,(st.DEF>0?'+':'')+(st.DEF||0)];
  return `<div class="stat-table-wrap annual-stat-wrap" style="${annualStatStyle()}"><table class="fin season-stat-table batter"><thead><tr>${hd.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody><tr>${v.map(x=>`<td>${x}</td>`).join('')}</tr></tbody></table></div>`;
}
export function statTableHTML(st){
  if(st.twoWay||(S.pos==='TW'&&!st.twoWayUsage)){
    return `<div class="stat-table-title">投手</div>${oneSeasonTable(st.twPitch||st,true)}<div class="stat-table-title">打者</div>${oneSeasonTable(st.twBat||st,false)}`;
  }
  return oneSeasonTable(st,S.pos==='P'||st.twoWayUsage==='P');
}
/* 國際賽沿用原版精簡欄位，不套用職業季賽的完整統計欄位。 */
function oneIntlTable(st,isP){
  if(isP){
    const hd=['G','IP','W','SV','SO','ERA'];
    const v=[st.G||0,fmtIP(st.IP||0),st.W||0,st.SV||0,st.SO||0,statF2(baseballERA(st))];
    return `<div class="stat-table-wrap intl-compact-wrap annual-stat-wrap" style="${annualStatStyle()}"><table class="fin intl-compact-table pitcher"><thead><tr>${hd.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody><tr>${v.map(x=>`<td>${x}</td>`).join('')}</tr></tbody></table></div>`;
  }
  const hd=['G','PA','AVG','H','HR','RBI'];
  const v=[st.G||0,st.PA||0,statF3(st.AB>0?st.H/st.AB:null),st.H||0,st.HR||0,st.RBI||0];
  return `<div class="stat-table-wrap intl-compact-wrap annual-stat-wrap" style="${annualStatStyle()}"><table class="fin intl-compact-table batter"><thead><tr>${hd.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody><tr>${v.map(x=>`<td>${x}</td>`).join('')}</tr></tbody></table></div>`;
}
export function intlStatTableHTML(st){
  if(st.twoWay||(S.pos==='TW'&&!st.twoWayUsage)){
    return `<div class="stat-table-title">投手</div>${oneIntlTable(st.twPitch||st,true)}<div class="stat-table-title">打者</div>${oneIntlTable(st.twBat||st,false)}`;
  }
  return oneIntlTable(st,S.pos==='P'||st.twoWayUsage==='P');
}
/* 長打率估算:無二三壘數據,依全壘打比例與力量推估壘打數 */
export function slgOf(st){
  if(!st.AB)return 0;
  const hr=st.HR, nonHR=Math.max(0,st.H-hr);
  /* 非全壘打安打中,約 22% 二壘打、3% 三壘打——取整數支數,壘打數必為整數,小樣本 SLG 才不會出現 .320 這種不可能的值 */
  const doubles=Math.round(nonHR*0.22), triples=Math.round(nonHR*0.03);
  const singles=Math.max(0,nonHR-doubles-triples);
  const tb=singles + doubles*2 + triples*3 + hr*4;
  return tb/st.AB;
}
export function amateurSeason(){
  if(S.seasonFactor===0){ card('bad','','整季只能在場邊看著隊友比賽。');
    S.log.push({y:S.year,age:S.age,tm:S.team||stageLabel(),line:'傷缺全季', inj:true}); nextStep(); return; }
  const jp=S.schoolCountry==='JP';
  let cups=S.stage==='ES'?(jp?JP_ES_CUPS:ES_CUPS):S.stage==='MS'?(jp?JP_MS_CUPS:MS_CUPS):S.stage==='HS'?(jp?JP_HS_CUPS:HS_CUPS):S.stage==='U'?(jp?JP_U_CUPS:U_CUPS):AMA_CUPS;
  if(S.stage==='ES'&&S.stageYr<=3)cups=cups.slice(0,1);
  const thr={ES:[34,29,24,19,14],MS:[44,39,34,29,24],HS:[52,46,40,34,28],U:[60,54,48,42,36]}[S.stage]||[60,54,48,42,36];
  let gain=0,lines=[],plain=[],bestRank=99;
  const eventForm=S.pendStat||0;
  const tB=({1:6,2:0,3:-6})[S.schoolTier||S.hsTier||2];
  cups.forEach(c=>{ const pw=ovr()+tB+eventForm+ri(-8,8);
    /* 學生／業餘大會倍率只調整各級大會的競爭力，不碰國際賽或職業球季。
       以最低晉級門檻為中心縮放，1.00 時與舊版判定完全相同。 */
    const i=amateurRankIndex(pw,thr,S.amateurTournamentMult??1);
    const rk=['冠軍','亞軍','四強','八強','十六強','預賽出局'][i];
    bestRank=Math.min(bestRank,i+1);
    const pts=[5,4,3,2,1,0][i]+Math.floor(ovr()/22);
    gain+=pts; lines.push(`${c}：<b class="hl">${rk}</b>（+${pts} 點）`); plain.push(`${c}${rk}`);
    if(S.stage==='U'&&rk==='冠軍'&&!S.traits.academy){ S.traits.academy=true;
      card('gold','隱藏屬性解鎖：學院派','大學殿堂的科學化訓練與防護打下扎實基礎——<b class="hl">25 歲前受傷率 −5%、季初擲骰期望值提升</b>。'); }
    if(i===0){
      S.honors.push(`${S.year} ${c}冠軍`);
      if(S.stage==='HS')S.hsChampions=(S.hsChampions||0)+1;
    } });
  if(S.stage==='HS'&&(S.hsChampions||0)>3&&!S.traits.miraclegen){
    traitCard('miraclegen','奇蹟世代','沒有人知道這所學校的這群少年，會在棒球界中掀起什麼樣的風暴');
  }
  S.pendStat=0;
  S.currentAmateurBestRank=bestRank;
  S.pool+=gain;
  S.log.push({y:S.year,age:S.age,tm:S.team||stageLabel(),line:plain.join('、'), inj:false});
  card('','年度大賽',lines.join('<br>')+`<div class="statline">獲得能力點 ${gain} 點，季末統一分配。能力越高，大賽收穫越多。</div>`);
  maybeIntl(()=>nextStep());
}
export function proSeason(){
 const seasonLv=S.lv,st=simSeason(seasonLv); S.lastSt=st; S.lastD=st.d; S.lastLv=seasonLv;
  if(S.pendStat!==0&&S.seasonFactor>0){
    /* 【修正】狀態火燙的加成，必須依照該季實際出賽的比例（seasonFactor）進行打折 */
    const p = S.pendStat * S.seasonFactor;
    if(p>0&&S.pos==='P'){
      /* 狀態火燙=教練重用:後援先加出賽(不超過場次上限),再加內容;物理約束重夾 */
      if(!isSP()){ const reliefCap=Math.min(68,LV[seasonLv].g); const addG=Math.min(Math.max(0,reliefCap-st.G),Math.round(p*1.2)); st.G+=addG; st.IP=+(st.IP+addG*1.05).toFixed(1); }
      st.SO+=Math.round(p*8); st.IP=+(st.IP+p*4).toFixed(1);
      if(isSP())st.W+=Math.round(p*0.4); else st.SV+=Math.round(p*0.6);
      st.era=st.IP>0?clamp(st.era-p*0.05,1.40,9.90):st.era; st.ER=Math.round(st.era*st.IP/9);
      if(!isSP()){ /* 救援/勝敗不可超過出賽數(物理約束) */
        st.SV=Math.min(st.SV||0,Math.floor(st.G*0.85));
        st.HLD=Math.min(st.HLD||0,Math.max(0,st.G-st.SV));
        const decCap=Math.max(0,st.G-st.SV-st.HLD);
        if((st.W+st.L)>decCap){ st.W=Math.min(st.W,decCap); st.L=Math.max(0,decCap-st.W); }
      } }
    else if(p>0){ const Lg=LV[S.lv];
      /* 狀態火燙=教練重用:先轉為上場機會(G/PA 連動,不超過聯盟場次),打擊內容同步升溫 */
      const addG=Math.min(Math.max(0,(Lg.g||120)-st.G), Math.round(p*1.5));
      const addPA=Math.round(addG*4.25), addAB=Math.round(addPA*0.9);
      st.G+=addG; st.PA+=addPA; st.AB+=addAB;
      let addH=Math.round(addAB*0.55)+Math.round(p*1.5); /* 新打席打得火燙+原打席手感提升 */
      addH=Math.max(0,Math.min(addH, st.AB-st.H));        /* 安打不可超過打數 */
      const addHR=Math.min(addH, Math.round(p*1.2));
      st.H+=addH; st.HR+=addHR; st.RBI+=Math.round(addHR*2.1+(addH-addHR)*0.3);
      st.avg=st.AB?st.H/st.AB:0; }
    else if(S.pos==='P'){
      const q=Math.abs(p);
      st.SO=Math.max(0,st.SO-Math.round(q*6));
      st.W=Math.max(0,st.W-Math.round(q*.3));
      if(!isSP())st.SV=Math.max(0,(st.SV||0)-Math.round(q*.4));
      st.era=st.IP>0?clamp(st.era+q*.08,1.40,9.90):st.era;
      st.ER=Math.round(st.era*st.IP/9);
    } else {
      const q=Math.abs(p), loseH=Math.min(st.H,Math.round(q*2));
      st.H-=loseH;
      st.HR=Math.min(st.H,Math.max(0,st.HR-Math.round(q*.5)));
      st.RBI=Math.max(0,st.RBI-Math.round(q*1.2));
      st.avg=st.AB?st.H/st.AB:0;
    }
  }
  S.pendStat=0;
  /* 投法對成績的加成/折損 */
  if((S.pos==='P'||S.pos==='TW')&&S.seasonFactor>0){ const em={'全力投':1,'普通投':0,'養生球':-1}[S.effort]||0;
    if(em!==0){ st.d+=em; st.era=clamp(st.era-em*0.25,1.40,9.90); st.ER=Math.round(st.era*st.IP/9);
      st.SO=Math.round(st.SO*(1+em*0.06)); } }
  if(S.traits.onetool&&S.seasonFactor>0){ /* 工具人:那項工具讓他「多爭取」到代打/代跑/代守上場(加成,非砍半) */
    const boost=1.25; /* 工具帶來的額外上場機會 */
    ['G','PA','AB'].forEach(k=>{ if(typeof st[k]==='number')st[k]=Math.round(st[k]*boost); });
    /* 累積型數據隨打席等比微調 */
    ['H','HR','RBI','SB','BB'].forEach(k=>{ if(typeof st[k]==='number')st[k]=Math.round(st[k]*boost); });
    st.avg=st.AB>0?st.H/st.AB:0; capSteals(st); }
  if(S.pos==='P')normalizePitchingStats(st,seasonLv);
  else if(S.pos==='TW'){
    /* 二刀流的兩條成績已在各自引擎完成物理校正；合併後只同步衍生率值。 */
    const p=st.twPitch||st,b=st.twBat||st;
    st.era=p.IP>0?+(baseballERA(p)||0).toFixed(2):0;
    st.WHIP=p.IP>0?+(baseballWHIP(p)||0).toFixed(2):0;
    st.avg=b.AB>0?b.H/b.AB:0;
    st.DEF=b.DEF||0;
  } else{
    normalizeBatterStats(st,seasonLv);
    st.DEF=defRuns(seasonLv,st._dh?'DH':null,st.G);
  }
  S.lastD=st.d;
  if(S.pos==='P'||S.pos==='TW')st.role=S.role;
  if(S.pos==='TW'){
    const pPay=seasonSalaryRating(st.twPitch||st,seasonLv,S.role),bPay=seasonSalaryRating(st.twBat||st,seasonLv,S.dpos);
    st.payD=(pPay+bPay)/2;
  }else st.payD=seasonSalaryRating(st,seasonLv,S.pos==='P'?S.role:S.dpos);
  S.lastPayD=st.payD;
  const bucket=bucketOf(S.lv); accStat(bucket,st);
  /* The position actually played this season, not the registered one: a forced-DH year
     (the dhThisYear branch above) already counts as DH for defensive runs, dposYears,
     salary rating and award eligibility, so every display reads it from here too. */
  const seasonDp=st._dh?'DH':(S.dpos||'');
  if(S.seasonFactor===0){ card('bad','球季數據','（傷缺，本季無出賽紀錄）'); }
  else card('','球季數據',`<span class="tag">${S.teamName()}${seasonDp?'｜'+seasonDp:''}</span>${statTableHTML(st)}`);
  /* 低潮年 / 生涯年 敘述卡 */
  if(st.form===-1){
    card('bad','巨大的低潮',`身體狀況很好，但是成績一直打不出來，遇到了巨大的低潮。孤獨、無助，就像是溺水一樣，只能隨意抓取孤木。`);
  }else if(st.form===1){
    if(S.pos==='P') card('gold','生涯年','縫線掠過指尖的感覺無與倫比，而你投出去的球像是有了生命，用一個無人能想像得到的角度，閃過了打者的球棒，並穩穩投進捕手的手套。');
    else card('gold','生涯年','投來的每顆球看起來都像籃球一樣大，你看得到縫線、球的轉動，就和駭客任務的子彈一樣慢了下來，而你每一顆擊中甜蜜點的球，都往全壘打牆奔去。');
  }
  const isInj = S.seasonFactor <= 0.45; /* 判斷是否為大傷報廢年 */
  S.log.push({y:S.year,age:S.age,tm:S.teamName(),lv:seasonLv,p:seasonDp,role:(S.pos==='P'||S.pos==='TW')?S.role:null,line:S.seasonFactor===0?'傷缺全季':statLine(st), inj: isInj, st: st});
  /* 鐵人累計 */
  const healthy=S.seasonFactor>=0.95&&((S.pos==='P'||S.pos==='TW')?(isSP()?st.IP>=120:(st.pitchG||st.G)>=42):st.G>=LV[S.lv].g*0.8);
  if(healthy){ S.ironStreak++;
    if(S.ironStreak>=5&&!S.traits.iron){
      /* 鐵人與玻璃人互為對立體質，不可並存：本來是玻璃人的話直接被鐵人覆蓋過去。 */
      const wasGlass=!!S.traits.glass;
      if(wasGlass)removeTrait('glass','玻璃人');
      S.traits.iron=true;
      S.removed=(S.removed||[]).filter(x=>x!=='鐵人'); /* 曾被玻璃人蓋掉又練回來:清掉刪除線紀錄 */
      if(wasGlass)
        card('gold','隱藏素質覆蓋：玻璃人 → 鐵人','多年來的傷病，讓你逐漸了解與自己傷痕累累的身體相處，出賽愈來愈多，你發現到那些說你是玻璃人的觀眾逐漸閉嘴，你現在是強化玻璃，大家改叫你鐵人。<br><b class="hl">玻璃人解除</b>，未來每季受傷機率<b class="hl">不高於 10%</b>。');
      else
        card('gold','隱藏素質解鎖：鐵人','連續五年全勤級出賽！你就像是八點檔，無論哪一年打開電視，都能看到你在球場奮戰，球迷們甚至開始懷疑你是機器人，未來每季受傷機率<b class="hl">不高於 10%</b>。');
      board(1); } }
  else if(S.seasonFactor<0.95)S.ironStreak=0;
  /* 只會這個:先看夠不夠格當主力,夠格絕不判工具人;不夠格才看有無突出工具 */
  if(S.pos!=='P'){ const tg=toolGap();
    /* 主力判定:還原健康狀態下的預估出賽數,傷病缺陣不影響評估
       (出賽數公式含 seasonFactor,除回即得健康時的預估;表現係數仍保留) */
    const projG = S.seasonFactor > 0 ? (st.G / S.seasonFactor) : 0;
    const isRegular = projG >= LV[S.lv].g * 0.60;
    if(!S.traits.onetool && !isRegular && tg.gap>=22 && tg.val>=58 && careerAllStars()<4){ S.traits.onetool=true;
      const wasBefore=S.removed.includes('只會這個');
      S.removed=S.removed.filter(x=>x!=='只會這個'); /* 重新觸發:清掉刪除線記錄 */
      const role=tg.role;
      S.toolRole=role;
      if(wasBefore||S.age>=33)
        traitCard('onetool','只會這個',`歲月帶走了你的其他工具，只剩<b class="hl">${role}</b>那一項本領還在。教練把你當成板凳上的秘密武器——關鍵時刻，你仍然可靠。`,'bad');
      else
        traitCard('onetool','只會這個',`你只有一項武器強得誇張，其餘全是破洞。教練不敢讓你先發，只在關鍵時刻派你上去做一件事——你成了球隊的<b class="hl">${role}</b>。出賽數銳減，但那一項本領無人能及。`,'bad'); }
    else if(S.traits.onetool && (tg.gap<18 || isRegular)){ /* 補起來 或 實力打回主力 → 解除 */
      removeTrait('onetool','只會這個'); S.toolRole=null;
      card('good','不再是工具人','教練終於敢把你放進先發打線——你證明了自己不只是板凳上的一招鮮。<b class="hl">「只會這個」解除</b>，你是個完整的球員了。'); board(1); } }
  const awardStart=S.honors.length;
  awards(bucket,st);
  const seasonPersonalAwards=proPersonalAwards(S.honors.slice(awardStart),S.year);
  const awardPoints=Math.floor(seasonPersonalAwards.length*Math.max(0,Number(S.proAwardPointMult??1)));
  if(awardPoints>0){S.pool+=awardPoints;card('gold','職業球季獎項加點',`本季 ${seasonPersonalAwards.length} 項個人獎項 × ${Number(S.proAwardPointMult??1)} 倍，獲得 <b class="hl">${awardPoints} 點</b>季末能力點。`);}
  if((S.pos==='P'||S.pos==='TW')&&S.seasonFactor>0)tjAccrue(st,seasonLv);
  tjGamble(()=>demotionAudit(()=>maybeIntl(()=>nextStep())));
}
export function roleName3(r){ return {SP:'先發投手',MR:'中繼投手',CL:'終結者'}[r]||'投手'; }
