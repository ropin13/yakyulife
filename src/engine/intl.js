import {S} from '../core/state.js?v=offline-0.30.0';
import {proPersonalAwardCount,intlAwardTier} from './pro-awards.js?v=offline-0.30.0';
import {R, ri, chance, clamp} from '../core/rng.js?v=offline-0.30.0';
import {LV} from '../data/teams.js?v=offline-0.30.0';
import {card, choose, board} from '../ui/dom.js?v=offline-0.30.0';
import {tlNote} from '../ui/timeline.js?v=offline-0.30.0';
import {isSP, fmtIP, outsFromIP, ipFromOuts, normalizeIP, baseballERA, intlStatTableHTML} from './season.js?v=offline-0.30.0';
import {ovr} from './ability.js?v=offline-0.30.0';
import {intlFinishIndex} from './championship.js?v=offline-0.30.0';
import {checkChampionTrait} from '../flow/events.js?v=offline-0.30.0';
import {internationalEventsFor} from '../data/international.js?v=offline-0.30.0';
function intlUF(key){
  const pct=clamp(Number(S[key])||0,0,100)/100;
  if(pct===0)return 1;
  return 1+(R()*2-1)*pct;
}
function intlWinChance(base){return clamp(base*intlUF('intlPitchWinProbVarPct'),0,100);}
function applyIntlStatVariance(st){
  if(!st)return st;
  if(S.pos==='TW')return st; /* 二刀流的投打子成績已各自在生成時套用。 */
  if(S.pos==='P'){
    const keys=['intlPitchEraVarPct',isSP()?'intlPitchStarterIpgVarPct':'intlPitchReliefIpgVarPct','intlPitchK9VarPct'];
    if(!keys.some(k=>(Number(S[k])||0)>0))return st;
    const oldIP=Math.max(0,normalizeIP(st.IP)),g=Math.max(0,st.G||0);
    if(oldIP>0&&g>0){
      const ipKey=isSP()?'intlPitchStarterIpgVarPct':'intlPitchReliefIpgVarPct';
      const era=baseballERA(st)??0,k9=(st.SO||0)*9/oldIP;
      st.IP=normalizeIP(g*(oldIP/g)*intlUF(ipKey));
      st.ER=Math.max(0,Math.round(era*intlUF('intlPitchEraVarPct')*st.IP/9));
      st.SO=Math.max(0,Math.round(k9*intlUF('intlPitchK9VarPct')*st.IP/9));
    }
  }else{
    const keys=['intlBatAvgVarPct','intlBatHrRateVarPct'];
    if(!keys.some(k=>(Number(S[k])||0)>0))return st;
    const ab=Math.max(0,st.AB||0),oldH=Math.max(0,st.H||0),oldHR=Math.max(0,st.HR||0);
    const avg=ab>0?oldH/ab:0,hrRate=ab>0?oldHR/ab:0;
    const oldRbiBase=oldHR*2.1+oldH*.35,rbiContext=oldRbiBase>0?(st.RBI||0)/oldRbiBase:1;
    st.H=clamp(Math.round(ab*avg*intlUF('intlBatAvgVarPct')),0,ab);
    st.HR=clamp(Math.round(ab*hrRate*intlUF('intlBatHrRateVarPct')),0,st.H);
    st.RBI=Math.max(0,Math.round((st.HR*2.1+st.H*.35)*rbiContext));
  }
  return st;
}
export function intlStatLine(st){
  if(S.pos==='TW'&&st.twPitch&&st.twBat){
    const p=st.twPitch,b=st.twBat,era=baseballERA(p),avg=b.AB>0?(b.H/b.AB).toFixed(3).replace(/^0/,''):'-';
    return `投手：${p.G} 場｜${fmtIP(p.IP)} 局｜${p.SO} 三振｜ERA ${era==null?'-':era.toFixed(2)}；打者：${b.G} 場｜打擊率 ${avg}｜${b.H} 安｜${b.HR} 轟｜${b.RBI} 打點`;
  }
  if(S.pos==='P'||st.twoWayUsage==='P'){
    const era=baseballERA(st);
    return `出賽 ${st.G}｜${fmtIP(st.IP)} 局｜${st.W} 勝｜${st.SV} 救援｜${st.SO} 三振｜ERA ${era==null?'-':era.toFixed(2)}`;
  }
  const avg=st.AB>0?(st.H/st.AB).toFixed(3).replace(/^0/,''):'-';
  return `出賽 ${st.G}｜${st.PA} 打席｜打擊率 ${avg}｜${st.H} 安｜${st.HR} 轟｜${st.RBI} 打點`;
}
export function addIntlStat(st){
  if(S.pos==='TW'&&st.twoWayUsage==='P'){
    const oldOuts=outsFromIP(S.intlStat.IP);['G','W','L','SV','SO','ER'].forEach(k=>S.intlStat[k]=(S.intlStat[k]||0)+(st[k]||0));
    S.intlStat.pitchG=(S.intlStat.pitchG||0)+(st.G||0);S.intlStat.pitchH=(S.intlStat.pitchH||0)+(st.H||0);S.intlStat.pitchBB=(S.intlStat.pitchBB||0)+(st.BB||0);S.intlStat.IP=ipFromOuts(oldOuts+outsFromIP(st.IP));return;
  }
  const oldOuts=outsFromIP(S.intlStat.IP);
  Object.keys(st).forEach(k=>{ if(k!=='IP'&&typeof st[k]==='number')S.intlStat[k]=(S.intlStat[k]||0)+st[k]; });
  if(Object.prototype.hasOwnProperty.call(st,'IP'))S.intlStat.IP=ipFromOuts(oldOuts+outsFromIP(st.IP));
}
/* MVP 先看當屆實績，再用機率代表與其他國家球員競爭；普通成績不會入圍。 */
export function intlMvpRate(st,finish){
  if(finish>1)return 0; /* 賽會 MVP 原則上只從冠亞軍球隊產生 */
  let score=0;
  if(S.pos==='P'||st.twoWayUsage==='P'){
    const era=baseballERA(st)??9;
    score=st.IP+st.SO*1.5+st.W*8+st.SV*6+Math.max(0,3.5-era)*5-Math.max(0,era-3.5)*4;
  }else{
    const avg=st.AB>0?st.H/st.AB:0;
    score=st.H*2+st.HR*8+st.RBI*2+Math.max(0,avg-.250)*100;
  }
  const finalistMult=finish===0?1:.2;
  return Math.round(clamp((score-28)*1.7,0,75)*finalistMult);
}
export function intlFormat(wbc){
  return wbc
    ?{minOvr:55,par:LV.MLB.par,ranks:['冠軍','亞軍','四強止步','八強止步','預賽出局'],games:[7,7,6,5,4]}
    :{minOvr:52,par:LV.NPB1.par,ranks:['冠軍','亞軍','季軍','殿軍','預賽出局'],games:[9,9,9,9,5]};
}
function legacyMaybeIntl(done){
  /* 每年只檢查一次；phaseEnd 另有保底呼叫，避免特殊流程提前跳過球季尾端。 */
  if(S.intlCheckedYear===S.year){done();return;}
  S.intlCheckedYear=S.year;
  const wbc=(S.year-2026)%4===0; let p12=(S.year-2028)%4===0;
  if(S.lv==='MLB')p12=false; /* 大聯盟球員只打經典賽,不打 12 強 */
  const intlFmt=intlFormat(wbc);
  if(S.stage!=='PRO'||(!wbc&&!p12)||ovr()<intlFmt.minOvr||S.seasonFactor<0.5||S.rehab>0||S.skipMid){ done(); return; } /* 經典賽 55+；12 強維持 52+；復健年/報銷年不徵召 */
  const name=wbc?'世界棒球經典賽':'世界12強賽';
  let forced=false,first=false;
  if(S.intlLock===null){ S.intlLock=S.year; forced=true; first=true; }
  else if(S.year-S.intlLock<5) forced=true;
  if(forced){
    card('info','體育部公文',first
      ?`「查 台端符合國家代表隊遴選資格，依規定<b class="hl">強制徵召</b>，並自即日起<b class="hl">列管五年</b>，列管期間各國際賽事皆須配合徵召，不得以任何理由推辭。」——你甚至還沒拆完信封，行李箱已經被球團打包好了。`
      :`列管期間（剩 ${5-(S.year-S.intlLock)} 年），依規定<b class="hl">強制徵召</b>。你沒有選擇。`);
  }
  const opts=[
    {t:forced?'⋯⋯只能報到（強制徵召）':'披上國家隊戰袍',main:true,s:'依成績獲得能力點｜下季受傷機率 +10%',f:()=>{
      /* 國家隊成敗看整體興衰,個人只佔一小部分 */
      const b=clamp(Math.round((ovr()-52)*0.35),0,8);
      const i=intlFinishIndex(R()*100,b,!!S.traits.championmaker);
      const rk=intlFmt.ranks[i], teamGames=intlFmt.games[i], pts=[10,8,6,3,1][i];
      let gpts=pts; if(S.traits.intlace)gpts=Math.max(pts,2);
      S.pool+=gpts; S.injNext=S.traits.intlace?0:10; S.intlCount++;
      /* Team Taiwan(挺台灣):國際賽出賽超過 5 次 */
      if(!S.traits.taiwan&&S.intlCount>5){ S.traits.taiwan=true;
        card('gold','隱藏稱號：Team Taiwan',`永遠把國家榮耀放在比職涯更高的位子，台灣球迷的心中永遠有一幅畫：你在球場上向全場比劃著胸口，那是你心中最榮耀的地方。`); board(1); }
      /* 先產生並保存本屆成績；事件卡與生涯結算共用同一份資料，不在結算時重骰 */
      let intlSt;
      { const a=S.ab, par=intlFmt.par, clutch=S.traits.clutch?1:0;
        if(S.pos==='P'){ const dd=(a.vel+a.ctl+a.brk)/3-par;
          /* 【修正】區分先發與後援，並將局數與出賽場次連動，符合國際賽球數限制 */
          let g, ip;
          if(isSP()){
            g = teamGames>=6?ri(1,2):1; /* 預賽／八強最多一場先發，進四強或 12 強複賽後才可能二度先發 */
            ip = normalizeIP(g * (4.5 + R() * 2.5)); /* 配合球數限制，單場大約吃 4.5~7 局；量化為完整出局數 */
          } else {
            g = clamp(Math.round(teamGames*(0.55+R()*0.25)),1,teamGames); /* 牛棚登板數隨球隊實際賽程增減 */
            ip = normalizeIP(g * (0.8 + R() * 0.8)); /* 每次上場大約拆彈或投 0.8~1.6 局；量化為完整出局數 */
          }
          
          const k9=clamp(7.5+dd*0.12+clutch*.5,4,14);
          const era=clamp(3.6-dd*0.16-clutch*.35,0.8,8);
          intlSt={G:g,IP:ip,SO:Math.round(ip/9*k9),ER:Math.round(era*ip/9),W:i<=2&&chance(intlWinChance(45+clutch*8))?1:0,SV:!isSP()&&chance(30+clutch*6)?1:0};
        } else { const dd=(a.con*0.5+a.pow*0.2+a.eye*0.18+a.spd*0.12)-par-0.5; /* 同步賽季 d 公式(含 pow) */
          const g=teamGames, pa=g*ri(3,4); /* 國家隊球星每場先發，出賽數不得超過該名次的實際賽程 */
          const ab=Math.round(pa*0.86);
          const avg=clamp(0.270+dd*0.006+clutch*.015,0.15,0.5), h=Math.round(ab*avg);
          const hr=Math.round(h*clamp(0.06+Math.max(0,a.pow-par)*0.006+clutch*.01,0.03,0.28));
          intlSt={G:g,PA:pa,AB:ab,H:h,HR:hr,RBI:Math.round((hr*2.1+h*0.35)*(1+clutch*.05))};
        }
      }
      applyIntlStatVariance(intlSt);addIntlStat(intlSt);
      (S.intlLog||(S.intlLog=[])).push({year:S.year,name,rank:rk,teamGames,st:{...intlSt}});
      if(i<=1)S.intlTop4=(S.intlTop4||0)+1; /* 需打進冠亞軍才算 */
      if(!S.traits.intlace&&S.intlCount>=3&&(S.intlTop4||0)>=2){ S.traits.intlace=true;
        card('gold','隱藏屬性解鎖：國際賽之鬼','只要穿上 CT 球衣，你的痛覺就會消失——你是為大場面而生的男人。<b class="hl">國際賽不再增加受傷風險，且每次徵召能力點保底 +2</b>。'); }
      if(i<=2)S.honors.push(`${S.year} ${name}${rk}`);
      if(i===0){ tlNote(3,(wbc?'經典賽':'12強')+'冠軍'); checkChampionTrait(); }
      let ex=''; const mvpRate=intlMvpRate(intlSt,i); if(chance(mvpRate)){S.honors.push(`${S.year} ${name}MVP`);ex='你憑本屆表現被選為<b class="hl">賽會MVP</b>！';}
      card(i<=1?'gold':'info',name,`中華隊最終成績：<b class="hl">${rk}</b>（團隊出賽 ${teamGames} 場）。${ex}<div class="stat-table-title">本屆個人成績</div>${intlStatTableHTML(intlSt)}${S.traits.clutch?'<span class="up">（大心臟：大賽表現加成）</span>':''}<br>獲得能力點 <b class="hl">${gpts}</b> 點。${S.traits.intlace?'國家英雄不知何謂疲憊。':'國際賽的高強度消耗，讓下季受傷風險上升。'}`);
      done(); }},
    ];
  if(!forced)opts.push({t:'以調整為由婉拒',s:'列管期已過，終於能說不',f:done});
  choose(`中華隊徵召 · ${name}`,opts);
}

function recentIntlBonus(name){
  const logs=(S.intlLog||[]).filter(x=>x.name===name),played=logs.length>0,medal=logs.some(x=>/冠軍|亞軍|季軍/.test(x.rank||''));
  return (played?2:0)+(medal?2:0);
}
function makeIntlStat(ev,idx){
  const games=(ev.wbc?[7,7,6,5,4]:ev.youth?[7,7,6,5,4]:[9,9,8,7,5])[idx]||4,a=S.ab,par=ev.wbc?LV.MLB.par:LV.NPB1.par,clutch=S.traits.clutch?1:0;
  if(S.pos==='TW'){
    const usage=S.intlUsage||'TW',keep={pos:S.pos,role:S.role};S.pos='P';const p=usage==='H'?null:makeIntlStat(ev,idx);S.pos='IF';const b=usage==='P'?null:makeIntlStat(ev,idx);S.pos=keep.pos;S.role=keep.role;
    if(usage==='P')return {...p,twoWayUsage:'P'};
    if(usage==='H')return {...b,twoWayUsage:'H'};
    return {...b,W:p.W,L:p.L||0,SV:p.SV,IP:p.IP,SO:p.SO,ER:p.ER,pitchG:p.G,batG:b.G,twPitch:p,twBat:b,twoWay:true,G:Math.max(p.G||0,b.G||0)};
  }
  if(S.pos==='P'){
    const d=(a.vel+a.ctl+a.brk)/3-par,g=isSP()?Math.max(1,Math.round(games/4)):Math.max(1,Math.round(games*.65)),ip=normalizeIP(g*(isSP()?5.2:1.15));
    const era=clamp(3.7-d*.15-clutch*.35,.8,8);
    return applyIntlStatVariance({G:g,IP:ip,SO:Math.round(ip/9*clamp(7.5+d*.12,4,14)),ER:Math.round(era*ip/9),W:idx<=2&&chance(intlWinChance(45))?1:0,SV:!isSP()&&chance(30)?1:0});
  }
  const d=(a.con*.5+a.pow*.2+a.eye*.18+a.spd*.12)-par,pa=games*ri(3,4),ab=Math.round(pa*.86),avg=clamp(.27+d*.006+clutch*.015,.15,.5),h=Math.round(ab*avg),hr=Math.round(h*clamp(.06+Math.max(0,a.pow-par)*.006,.03,.28));
  return applyIntlStatVariance({G:games,PA:pa,AB:ab,H:h,HR:hr,RBI:Math.round(hr*2.1+h*.35)});
}
function playIntl(ev,done){
  if(ev.adultNational&&S.intlLock===null)S.intlLock=S.year;
  const strength=ovr()+recentIntlBonus(ev.name)+(S.traits.clutch?3:0),roll=strength+ri(-18,18);
  const ranks=ev.youth?['冠軍','亞軍','季軍','四強','八強']:ev.wbc?['冠軍','亞軍','四強止步','八強止步','預賽出局']:['冠軍','亞軍','季軍','殿軍','預賽出局'];
  const cut=ev.youth?[58,50,43,36]:[66,58,50,42];let idx=roll>=cut[0]?0:roll>=cut[1]?1:roll>=cut[2]?2:roll>=cut[3]?3:4;
  const general=clamp(Number(S.intlChampionMult??1),0,100),effective=clamp(general*(ev.wbc?clamp(Number(S.wbcChampionMult??1),0,100):1),0,100);
  /* 1 倍完全保留原抽選。低於 1 倍只削減原本的冠軍；高於 1 倍則依原始冠軍率補足晉升機會。 */
  if(effective<1&&idx===0&&!chance(effective*100)){
    const d=R();idx=d<.50?1:d<.80?2:d<.95?3:4;
  }else if(effective>1&&idx!==0){
    let championOffsets=0;for(let off=-18;off<=18;off++)if(strength+off>=cut[0])championOffsets++;
    const base=championOffsets/37,target=clamp(base*effective,0,1),extra=base>=1?0:(target-base)/(1-base);
    if(chance(extra*100))idx=0;
  }
  const rank=ranks[idx],rawPts=[10,8,6,3,1][idx],pts=S.traits.intlace?Math.max(rawPts,2):rawPts,st=makeIntlStat(ev,idx);
  S.pool=(S.pool||0)+pts;S.intlCount=(S.intlCount||0)+1;addIntlStat(st);
  if(ev.adultNational&&!S.traits.intlace)S.injNext=(S.injNext||0)+10;
  (S.intlLog||(S.intlLog=[])).push({year:S.year,name:ev.name,rank,youth:ev.youth,selectionScore:strength,usage:S.pos==='TW'?(S.intlUsage||'TW'):S.pos,st:{...st},teamGames:st.G});
  if(idx<=2)S.honors.push(`${S.year} ${ev.name}${rank}`);
  if(idx===0){tlNote(3,ev.name+'冠軍');checkChampionTrait();}
  card(idx<=1?'gold':'info',ev.name,`你接受徵召並代表中華隊出賽，最終成績：<b class="hl">${rank}</b>。<div class="stat-table-title">本屆個人成績</div>${intlStatTableHTML(st)}獲得能力點 <b class="hl">${pts}</b> 點。${ev.youth?'青少年賽事不增加傷病負擔。':ev.adultNational?'本次為成年國家隊賽事。':'本次為大學國家代表隊賽事。'}`);done();
}
export function maybeIntl(done){
  if(S.intlCheckedYear===S.year){done();return;}
  S.intlCheckedYear=S.year;
  const events=internationalEventsFor(S);if(!events.length){done();return;}
  /* 國際賽遴選屬於完整決策流程：遮蔽特質並從底邊向上排列。 */
  document.body.classList.add('focus-actions');
  const finish=()=>{document.body.classList.remove('focus-actions');done();};
  const selectEvent=ev=>{
    if(ev.pandemic){card('info','全球疫情',`${S.year} 年爆發全球疫情，今年沒有任何國際賽事。`);finish();return;}
    runEvent(ev);
  };
  const runEvent=ev=>{
  const domestic=(S.stage==='PRO'?0:({1:5,2:3,3:2,4:1}[Number(S.currentAmateurBestRank)]||0));
  const score=ovr()+domestic+recentIntlBonus(ev.name),awardCount=proPersonalAwardCount(S.honors,S.year),awardTier=intlAwardTier(S.lv),awardReduction=Math.floor(awardCount*awardTier*Math.max(0,Number(S.intlAwardThresholdReductionMult??1))),direct=Math.max(0,ev.direct-awardReduction),fightGate=Math.max(0,ev.fight-awardReduction),selected=score>=direct;
  const controlled=ev.adultNational&&S.intlLock!==null&&S.year-S.intlLock<5;
  const unavailable=why=>()=>{card('info','徵召資格提示',why);menu();};
  const enterEvent=()=>{if(S.pos!=='TW'){playIntl(ev,finish);return;}const back=()=>menu();choose(`${ev.name}｜選擇本屆出賽身分`,[
    {t:'以投手身分出賽',s:'只產生投手國際賽成績',f:()=>{S.intlUsage='P';playIntl(ev,finish);}},
    {t:'以打者身分出賽',s:'只產生打者國際賽成績',f:()=>{S.intlUsage='H';playIntl(ev,finish);}},
    {t:'以二刀流身分出賽',main:true,s:'同時產生投手與打者完整成績',f:()=>{S.intlUsage='TW';playIntl(ev,finish);}},
    {t:'← 返回徵召選擇',f:back}
  ]);};
  const fight=()=>{
    if(score<fightGate){card('bad','爭取未獲受理',`遴選分數 ${score}，低於爭取門檻 ${fightGate}。`);menu();return;}
    const base=clamp(20+(score-fightGate)*7,5,85),final=clamp(base*clamp(Number(S.intlTryoutMult??1),0,100),0,100);
    if(chance(final)){card('good','爭取成功',`教練團接受你的自薦（原始 ${base.toFixed(1)}%，倍率後 ${final.toFixed(1)}%），你進入正式名單。`);enterEvent();}
    else{card('bad','爭取失敗',`教練團最終沒有把你放進名單（原始 ${base.toFixed(1)}%，倍率後 ${final.toFixed(1)}%）。`);finish();}
  };
  const menu=()=>choose(`國家隊遴選｜${ev.name}<div style="margin-top:8px;color:var(--dim);font-size:13px">遴選分數 ${score}＝綜合 ${ovr()}＋當年大賽 ${domestic}＋既往國際賽 ${recentIntlBonus(ev.name)}｜本年個人獎項 ${awardCount} 項，門檻同步降低 ${awardReduction}｜直接徵召 ${ev.direct}→${direct}｜爭取 ${ev.fight}→${fightGate}</div>`,[
    {t:selected?'同意徵召':'同意徵召（未達門檻，不予徵召）',main:selected,s:selected?'接受國家隊邀請並選擇投手／打者／二刀流身分':'目前未列入正式名單',f:selected?enterEvent:unavailable('你目前未列入正式名單，可改選「爭取加入」。')},
    {t:controlled?'拒絕徵召（列管期間無法拒絕）':'拒絕徵召',warn:true,s:controlled?'成年國家隊五年列管仍有效':'本屆不參賽',f:controlled?unavailable('列管期間若已入選便不能拒絕；列管本身不保證入選。'):finish},
    {t:'爭取加入',s:`達爭取門檻後才可使用；爭取成功率提高倍率 ${clamp(Number(S.intlTryoutMult??1),0,100)} 倍`,f:selected?unavailable('你已經在正式名單中，不需要再次爭取。'):fight}
  ]);
  if(S.seasonFactor<.5||S.rehab>0||S.skipMid){card('bad','健康狀態不符',`${ev.name}仍照常公布名單，但你目前正在傷停或復健，三項決定均無法執行。`);finish();return;}
  menu();
  };
  if(events.length===1){selectEvent(events[0]);return;}
  choose(`本年度國際賽｜只能選擇一項參加<div style="margin-top:8px;color:var(--dim);font-size:13px">符合多項賽事資格時，一旦選定便會放棄同年度其他賽事。</div>`,events.map(ev=>({
    t:ev.name,main:ev.adultNational,s:ev.adultNational?'成年中華隊賽事':'大學國家代表隊賽事',f:()=>selectEvent(ev)
  })));
}
