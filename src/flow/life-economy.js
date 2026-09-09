import {S} from '../core/state.js?v=offline-0.31.0';
import {R,ri,chance,clamp} from '../core/rng.js?v=offline-0.31.0';
import {ABL,POS_AB,ABILITY_MAX,POTENTIAL_MAX} from '../data/abilities.js?v=offline-0.31.0';
import {choose,card,board} from '../ui/dom.js?v=offline-0.31.0';

const money=v=>Math.round(v).toLocaleString('zh-TW')+' 元';
const JOBS={
  MS:[['專心練球',0,0,0,0,'訓練不受影響'],['幫忙家務領零用錢',3000,6000,0,0,'幾乎無影響'],['家中店面幫忙',6000,12000,0,0.05,'特訓費用 +5%'],['假日球場撿球／整理',8000,15000,0,0.05,'增加棒球人脈'],['協助少棒隊練習',6000,12000,0,0,'有機會獲得能力點'],['寒暑假短期幫工',12000,20000,.1,.1,'10% 少一顆訓練骰']],
  HS:[['不打工，專心訓練',0,0,0,0,'訓練不受影響'],['偶爾假日打工',15000,30000,.1,0,'10% 少一顆訓練骰'],['寒暑假集中打工',30000,60000,0,.1,'特訓費用 +10%'],['固定兼職',60000,100000,1,.1,'固定少一顆骰'],['家庭經濟困難模式',90000,150000,1,.2,'少一顆骰、受傷率 +5%']],
  U:[['不打工，專心訓練',0,0,0,0,'訓練不受影響'],['校內工讀',40000,70000,0,0,'幾乎無影響'],['球場工讀',50000,80000,0,0.05,'增加棒球人脈'],['少棒教練',60000,100000,0,0.05,'可能獲得能力點'],['家教',80000,140000,0,0,'收入高、需兼顧學業'],['餐廳兼職',70000,120000,1,.1,'少一顆骰'],['全力打工',120000,200000,2,.2,'少兩顆骰、球季表現下降']],
  AMA:[['企業隊本職',0,0,0,0,'年薪於季末另行結算'],['兼任少棒教練',40000,80000,0,.05,'增加教練經驗'],['假日球場工作',30000,60000,0,.05,'額外收入']],
  PRO:[['專心球季',0,0,0,0,'不安排額外工作'],['商業活動',50000,200000,0,.1,'特訓費用 +10%'],['休賽季教球',30000,100000,0,.05,'額外收入']]
};

export function yearWorkChoice(next){
  S.yearWorkIncome=0;S.yearWorkExpense=0;S.workDicePenalty=0;S.workTrainMarkup=0;S.workSeasonPenalty=0;
  if(S.stage==='ES'){if(chance(45)){const v=ri(300,1800);S.cash+=v;S.yearWorkIncome+=v;card('good','零用錢與小獎勵',`幫忙家務與球隊整理器材，存下 <b class="hl">${money(v)}</b>。`);}next();return;}
  const rows=JOBS[S.stage]||JOBS.PRO;
  const workMult=S.pos==='TW'?clamp(Number(S.twoWayWorkIncomeMult??1.5),0,10):1;
  choose(`${S.year} 年度生活安排｜可用現金 ${money(S.cash||0)}${S.pos==='TW'?`｜二刀流收入 ${workMult} 倍`:''}`,rows.map(([name,lo,hi,dice,markup,note])=>{const slo=Math.round(lo*workMult),shi=Math.round(hi*workMult);return {t:name,main:lo===0,s:`${slo===shi?money(slo):money(slo)+'～'+money(shi)}｜${note}`,f:()=>{
    const income=shi>slo?ri(slo,shi):slo;S.cash=(S.cash||0)+income;S.yearWorkIncome=income;S.workPlan=name;S.workDicePenalty=Number(dice)||0;S.workTrainMarkup=Number(markup)||0;
    if(name.includes('困難')||name.includes('全力打工')){if(S.stage!=='ES'&&S.stage!=='MS')S.tmpInj=(S.tmpInj||0)+5;S.workSeasonPenalty=.05;S.seasonFactor=Math.min(S.seasonFactor??1,.95);}
    if(name.includes('少棒')&&chance(35)){S.pool=(S.pool||0)+1;}
    card('info','年度安排',`${name}：預計收入 <b class="hl">${money(income)}</b>。${dice?`普通訓練骰代價：${dice<1?'10% 機率':'固定'}少 ${Math.ceil(dice)} 顆。`:''}`);next();
  }};}));
}

function stageRule(){
  if(S.stage==='MS')return [1000,5,'國中'];if(S.stage==='HS')return [2500,7,'高中'];if(S.stage==='U')return [6000,9,'大學'];if(S.stage==='AMA')return [12000,10,'業餘成棒'];
  const agePts=S.age<30?12:S.age<35?10:S.age<40?8:6;
  if(S.lv==='R'||S.lv==='A1')return [30000,10,S.lv==='R'?'美國新人聯盟':'美國 1A'];
  if(['CPBL2','NPB2','A2','A3'].includes(S.lv))return [30000,Math.max(0,agePts-2),S.lv==='A2'||S.lv==='A3'?`美國 ${S.lv}`:'職業二軍'];
  return [60000,agePts,'職業一軍'];
}
function band(v){if(v<30)return 1;if(v<40)return 1.5;if(v<50)return 2.5;if(v<60)return 4;if(v<70)return 7;if(v<80)return 12;if(v<100)return 20;if(v<120)return 35;if(v<140)return 60;return 100;}
function skillMult(k){return {vel:1.35,ctl:1.10,brk:1.20,sta:.90,con:1.20,pow:1.30,eye:1.10,spd:1,rng:1.10,fld:1,arm:1.05,cat:1.20}[k]||1;}
function pointCost(k,from,points){const [base]=stageRule();let total=0;for(let i=0;i<points;i++)total+=base*band(from+i)*skillMult(k);return Math.round(total*(1+(S.workTrainMarkup||0)));}

export function paidTrainingFlow(next){
  if(S.stage==='ES'||S.stageYr<1){next();return;}
  document.body.classList.add('focus-actions');
  const finish=()=>{document.body.classList.remove('focus-actions');next();};
  const [base,rawMaxPts,label]=stageRule(),pointMult=clamp(Number(S.twoWayPointsMult??(S.pos==='TW'?1.5:1)),.1,10),maxPts=Math.max(0,Math.round(rawMaxPts*pointMult)),keys=POS_AB[S.pos].filter(k=>k in S.ab);
  if(S.trainingYear!==S.year){S.trainingYear=S.year;S.trainingPointsUsed=0;S.trainingSpent=0;}
  const history=[];
  const undo=()=>{
    const last=history.pop();
    if(!last){card('info','沒有可復原項目','本次年度特訓尚未購買任何能力點。');menu();return;}
    S.ab[last.k]=last.before;S.cash=(S.cash||0)+last.cost;
    S.yearWorkExpense=Math.max(0,(S.yearWorkExpense||0)-last.cost);
    S.trainingSpent=Math.max(0,(S.trainingSpent||0)-last.cost);
    S.trainingPointsUsed=Math.max(0,(S.trainingPointsUsed||0)-1);
    card('info','已復原上一步',`${ABL[last.k]}恢復為 ${last.before}，退回 ${money(last.cost)}。`);board(1);menu();
  };
  const menu=()=>{
    const used=Math.max(0,Number(S.trainingPointsUsed)||0),left=Math.max(0,maxPts-used);
    const opts=keys.map(k=>{const atPot=S.ab[k]>=(S.pot[k]||S.ab[k]),cost=pointCost(k,S.ab[k],1),blocked=left<=0||atPot||cost>(S.cash||0);let why=`下一點 ${money(cost)}`;
      if(atPot)why='已達潛力上限';else if(left<=0)why='本年度點數已用完';else if(cost>(S.cash||0))why+=`｜現金不足（仍可查看其他項目）`;
      return {t:`＋1 ${ABL[k]}　${S.ab[k]}／潛力 ${S.pot[k]}`,warn:blocked,s:why,f:()=>buyPoint(k,cost,left,atPot)};});
    opts.push({t:'↩ 復原上一步',warn:!history.length,s:history.length?`復原最近購買的「${ABL[history[history.length-1].k]}＋1」，並退回 ${money(history[history.length-1].cost)}`:'目前沒有可復原的特訓點數',f:undo});
    if((S.stage==='HS'&&S.stageYr>=3)||['U','AMA','PRO'].includes(S.stage))opts.push({t:'潛力突破特訓',warn:true,s:'每年限一項｜立即扣款｜失敗不扣能力、費用不退',f:breakthroughMenu});
    opts.push({t:'完成年度特訓，繼續行程',main:true,s:`已使用 ${used}/${maxPts} 點｜累計支出 ${money(S.trainingSpent||0)}｜錢包 ${money(S.cash||0)}`,f:()=>{card('gold','年度自費特訓完成',used?`本年度已使用 ${used}/${maxPts} 點，支出 ${money(S.trainingSpent||0)}，剩餘現金 ${money(S.cash||0)}。`:'今年不參加自費特訓。');finish();}});
    choose(`${label}年度自費特訓｜剩餘 ${left}/${maxPts} 點｜基礎 ${rawMaxPts} × ${pointMult}｜錢包 ${money(S.cash||0)}｜每次點擊立即扣款`,opts);
  };
  const buyPoint=(k,cost,left,atPot)=>{if(atPot){card('info','已達潛力上限',`${ABL[k]}目前已達潛力 ${S.pot[k]}。`);menu();return;}if(left<=0){card('info','年度點數已用完',`本年度最多可特訓 ${maxPts} 點。`);menu();return;}if((S.cash||0)<cost){card('bad','現金不足',`${ABL[k]}下一點需要 ${money(cost)}，目前錢包只有 ${money(S.cash||0)}。你仍可改點較便宜的能力，或完成年度特訓繼續遊戲。`);menu();return;}
    const before=S.ab[k];S.cash-=cost;S.yearWorkExpense=(S.yearWorkExpense||0)+cost;S.trainingSpent=(S.trainingSpent||0)+cost;S.trainingPointsUsed=(S.trainingPointsUsed||0)+1;S.ab[k]=clamp(S.ab[k]+1,1,Math.min(ABILITY_MAX,S.pot[k]));history.push({k,cost,before});board(1);menu();};
  function breakthroughMenu(){
    if(S.breakthroughYear===S.year){card('bad','年度限制','本年度已經嘗試過一次潛力突破。');menu();return;}
    const ready=keys.filter(k=>S.ab[k]>=S.pot[k]&&S.pot[k]<POTENTIAL_MAX);if(!ready.length){card('info','尚未達成條件','必須先讓目前能力達到該項潛力上限。');menu();return;}
    const rawTable=S.stage==='HS'?[20,1,2]:S.stage==='U'?[30,1,3]:S.stage==='AMA'?[25,1,2]:S.lv&&/MLB|NPB1|CPBL1/.test(S.lv)?[45,1,4]:[35,1,3];
    /* 擴充版：保留各身分原始差異，但潛力突破成功率一律再加 30 個百分點。 */
    const table=[Math.min(100,rawTable[0]+30),rawTable[1],rawTable[2]];
    choose('選擇本年度唯一的潛力突破項目',ready.map(k=>{const mult=clamp(Number(S.potentialCostMult??.1),0,10),cost=Math.max(1,Math.round(pointCost(k,S.ab[k],1)*mult));return {t:ABL[k],s:`成功率 ${table[0]}%｜費用 ${money(cost)}｜潛力費率 ${mult} 倍｜成功潛力 +${table[1]}～${table[2]}`,f:()=>{if(S.cash<cost){card('bad','現金不足',`需要 ${money(cost)}。`);menu();return;}S.cash-=cost;S.yearWorkExpense=(S.yearWorkExpense||0)+cost;S.breakthroughYear=S.year;if(chance(table[0])){const g=ri(table[1],table[2]);S.pot[k]=clamp(S.pot[k]+g,1,POTENTIAL_MAX);card('gold','突破成功',`${ABL[k]}潛力上限 +${g}，提高至 ${S.pot[k]}。`);}else card('bad','突破失敗','課程費用已支付，但沒有倒扣目前能力，也沒有新增疲勞值。');menu();}};}));
  }
  menu();
}
