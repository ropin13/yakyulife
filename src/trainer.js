import {S,setS} from './core/state.js?v=offline-0.30.0';
import {SEED,setSeed,seedInit} from './core/rng.js?v=offline-0.30.0';
import {ABL,ABILITY_MAX,POTENTIAL_MAX} from './data/abilities.js?v=offline-0.30.0';
import {$,board,card,restoreLogTarget} from './ui/dom.js?v=offline-0.30.0';
import {resetTL,renderTimeline,timelineSnapshot,restoreTimeline} from './ui/timeline.js?v=offline-0.30.0';
import {startYear} from './flow/phases.js?v=offline-0.30.0';
import {APP_VER} from './config.js?v=offline-0.30.0';
import {injuryProb,tjCap} from './engine/injury.js?v=offline-0.30.0';
import {ovr} from './engine/ability.js?v=offline-0.30.0';
import {LV} from './data/teams.js?v=offline-0.30.0';
import {teamChampRate,teamChampRates} from './engine/contract.js?v=offline-0.30.0';
import {loadRelationshipDatabase,relationshipDatabaseSnapshot,applyRelationshipDatabaseSnapshot} from './data/relationship/database.js?v=offline-0.30.0';
import {loadInternationalDatabase} from './data/international.js?v=offline-0.30.0';
import {internationalDatabaseSnapshot,applyInternationalDatabaseSnapshot} from './data/international_database.js?v=offline-0.30.0';
import {sessionSnapshot,prepareReplay,restoreReplayRng} from './core/session.js?v=offline-0.30.0';
import {refreshAlloc} from './ui/alloc.js?v=offline-0.30.0';

const n=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function serializableState(){if(!S)return null;const out={};for(const [k,v] of Object.entries(S))if(typeof v!=='function')out[k]=v;return JSON.parse(JSON.stringify(out));}
function uiSnapshot(){
  const log=$('log'),detail=$('bd-detail'),yearList=detail?.querySelector('.sec-y');
  const logHTML=log?.innerHTML||'',logBlocks=[...(log?.children||[])].map(el=>el.outerHTML);
  return {logHTML,logBlocks,logTextLength:log?.textContent?.length||0,logChildCount:log?.children?.length||0,
    timeline:timelineSnapshot(),scrollX:window.scrollX||0,scrollY:window.scrollY||0,
    timelineListScroll:$('tl-list')?.scrollTop||0,timelineStripScroll:$('tl-strip')?.scrollLeft||0,
    phase:[0,1,2].findIndex(i=>$('lp'+i)?.classList.contains('on')),
    actCollapsed:$('act')?.classList.contains('collapsed')||false,boardDetailOpen:$('board')?.classList.contains('detail-open')||false,
    detailTab:detail?.dataset.tab||'h',detailScroll:detail?.scrollTop||0,detailYearScroll:yearList?.scrollTop||0};
}
function payload(){
  const ui=uiSnapshot(),flow=sessionSnapshot();
  return {format:'YaKyoLife-Offline-Save',saveSchema:5,edition:'F10 Trainer 0.30.0',gameVersion:APP_VER,
    savedAt:new Date().toISOString(),seed:SEED,state:serializableState(),flow,ui,
    integrity:{year:S?.year??null,logChars:ui.logHTML.length,logBlocks:ui.logBlocks.length,timelineRows:ui.timeline.length,
      hasYearCheckpoint:!!flow?.yearStartState},
    databases:{relationship:relationshipDatabaseSnapshot(),international:internationalDatabaseSnapshot()}};
}
function buildExport(){
  const data=payload(),text=JSON.stringify(data,null,2),check=JSON.parse(text);
  if(!check.flow?.yearStartState||!Array.isArray(check.flow?.actions))throw new Error('目前流程尚未建立安全檢查點，請先完成開局或年度切換');
  if(!check.state||!check.ui||!Array.isArray(check.ui.logBlocks)||!Array.isArray(check.ui.timeline))throw new Error('完整快照建立失敗');
  if(check.integrity.logChars!==check.ui.logHTML.length||check.integrity.logBlocks!==check.ui.logBlocks.length)throw new Error('年度對話完整性檢查失敗');
  if((check.ui.logChildCount>0||check.ui.timeline.length>0)&&check.ui.logHTML.length===0)throw new Error('年度對話為空，已取消匯出');
  return {text,bytes:new Blob([text]).size,blocks:check.ui.logBlocks.length,rows:check.ui.timeline.length};
}
function download(name,text){
  const blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();
  /* 某些瀏覽器在大檔尚未完全接手前撤銷 URL，會只留下極小或不完整檔案。 */
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},60000);
  return blob.size;
}
function input(label,key,value,min,max,step=1){return `<label><span>${label}</span><input data-k="${key}" type="number" value="${esc(value)}" min="${min}" max="${max}" step="${step}"></label>`;}
function readout(label,value){return `<label class="tr-read"><span>${label}</span><output>${esc(value)}</output></label>`;}
function select(label,key,value,items){return `<label><span>${label}</span><select data-k="${key}">${items.map(([v,t])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;}
function check(label,key,checked){return `<label class="tr-check"><input data-k="${key}" type="checkbox" ${checked?'checked':''}><span>${label}</span></label>`;}

export function installTrainer({attachTeamName}){
  let page='career';
  const root=document.createElement('div');root.id='f10-trainer';root.hidden=true;
  root.innerHTML=`<div class="tr-panel" role="dialog" aria-modal="true"><header><div><b>F10 生涯修改器</b><small>YaKyoLife 離線擴充版 0.30.0</small></div><button data-a="close">×</button></header><nav class="tr-tabs"><button data-page="career">球員／能力</button><button data-page="health">健康／傷病</button><button data-page="relationships">人物關係</button><button data-page="save">存檔</button></nav><div id="tr-body"></div><footer><span id="tr-msg">修改前建議先匯出 JSON 備份。</span><button data-a="close">關閉</button><button class="primary" data-a="apply">套用修改</button></footer></div>`;
  document.body.appendChild(root);const body=root.querySelector('#tr-body'),msg=root.querySelector('#tr-msg');
  const vf=(label,key)=>input(label,key,clamp(n(S[key],0),0,100),0,100,.1);
  const addEvolutionFields=()=>{if(page!=='career'||body.querySelector('[data-evolution-fields]')||!S)return;const box=document.createElement('section');box.dataset.evolutionFields='1';box.innerHTML=`<h3>潛力變化／能力衰退</h3><p>每項潛力每年各自抽一次整數；臨界年齡（含）以前增加，之後衰退。範圍 0～0 可關閉。能力衰退公式：起始值 ×（1＋經過年數 × 公差倍率），最後四捨五入。</p><div class="tr-grid">${input('潛力臨界年齡','potentialPivotAge',clamp(n(S.potentialPivotAge,30),1,99),1,99)}${input('年度潛力變化下限','potentialYearMin',clamp(n(S.potentialYearMin,0),0,150),0,150)}${input('年度潛力變化上限','potentialYearMax',clamp(n(S.potentialYearMax,2),0,150),0,150)}${input('每年度數據字體大小（px）','annualStatFontSize',clamp(n(S.annualStatFontSize,13),9,15),9,15,.5)}${input('能力開始衰退年齡','declineStartAge',clamp(n(S.declineStartAge,32),1,99),1,99)}${input('第一年衰退值','declineStartValue',clamp(n(S.declineStartValue,2),0,150),0,150,.1)}${input('每年公差倍率','declineStepMult',clamp(n(S.declineStepMult,.5),0,100),0,100,.01)}</div><p>字體設定只影響中央年度訊息中的季賽／國際賽統計表；安全範圍 9～15 px，欄位保持單行且不產生左右捲軸。</p>`;body.appendChild(box);};
  const addBulkFields=()=>{if(page!=='career'||body.querySelector('[data-bulk-fields]')||!S)return;const box=document.createElement('section');box.dataset.bulkFields='1';box.innerHTML=`<h3>一鍵自訂能力</h3><div class="tr-grid">${input('目前能力目標值','bulkAbilityValue',clamp(n(S.bulkAbilityValue,60),1,150),1,150)}${input('潛力目標值','bulkPotentialValue',clamp(n(S.bulkPotentialValue,60),1,150),1,150)}</div><div class="tr-actions"><button data-a="set-abilities">目前能力全部套用</button><button data-a="set-potentials">潛力全部套用</button></div>`;body.appendChild(box);};
  const addTwoWayFields=()=>{if(page!=='career'||body.querySelector('[data-two-way-fields]')||!S)return;const box=document.createElement('section');box.dataset.twoWayFields='1';box.innerHTML=`<h3>二刀流／年度特訓</h3><p>所有倍率都會保存並逐年生效；骰數先完成原版增減再乘倍率、無條件進位且最多 7 顆。季末點數只在進入分配畫面前乘一次。</p><div class="tr-grid">${input('年度特訓點數倍率','twoWayPointsMult',clamp(n(S.twoWayPointsMult,S.pos==='TW'?1.5:1),.1,10),.1,10,.05)}${input('二刀流骰數倍率','twoWayDiceMult',clamp(n(S.twoWayDiceMult,1.5),.1,10),.1,10,.05)}${input('二刀流季末能力點倍率','twoWaySeasonPointMult',clamp(n(S.twoWaySeasonPointMult,1.5),.1,10),.1,10,.05)}${input('二刀流打工收入倍率','twoWayWorkIncomeMult',clamp(n(S.twoWayWorkIncomeMult,1.5),0,10),0,10,.05)}${input('二刀流一般受傷倍率','twoWayInjuryMult',clamp(n(S.twoWayInjuryMult,1),0,10),0,10,.05)}${input('二刀流打者出賽最低體力','twoWayBatMinStamina',clamp(n(S.twoWayBatMinStamina,50),1,150),1,150,1)}${input('二刀流手肘工作量倍率','twoWayWorkloadMult',clamp(n(S.twoWayWorkloadMult,.6),0,3),0,3,.05)}${input('二刀流學生大會影響倍率','twoWayAmateurImpactMult',clamp(n(S.twoWayAmateurImpactMult,1),0,10),0,10,.05)}${input('二刀流國際賽影響倍率','twoWayIntlImpactMult',clamp(n(S.twoWayIntlImpactMult,1),0,10),0,10,.05)}${input('二刀流職業影響倍率','twoWayProImpactMult',clamp(n(S.twoWayProImpactMult,1),0,10),0,10,.05)}${input('二刀流合約門檻降低值','twoWayContractThresholdReduction',clamp(n(S.twoWayContractThresholdReduction,1),0,150),0,150,.1)}</div>`;body.appendChild(box);};
  const addMedicalFields=()=>{if(page!=='health'||body.querySelector('[data-medical-fields]')||!S)return;const box=document.createElement('section');box.dataset.medicalFields='1';box.innerHTML=`<h3>醫療計畫降低比例</h3><p>套用於一般受傷率與新增手肘負荷。</p><div class="tr-grid">${input('一般健康檢查降低（%）','medicalNormalReductionPct',clamp(n(S.medicalNormalReductionPct,0),0,100),0,100,.1)}${input('預防性保養降低（%）','medicalProReductionPct',clamp(n(S.medicalProReductionPct,30),0,100),0,100,.1)}${input('完整醫療計畫降低（%）','medicalFullReductionPct',clamp(n(S.medicalFullReductionPct,60),0,100),0,100,.1)}${input('二刀流醫療降低（%）','medicalTwoWayReductionPct',clamp(n(S.medicalTwoWayReductionPct,80),0,100),0,100,.1)}</div>`;body.appendChild(box);};
  const addAwardFields=()=>{if(page!=='career'||body.querySelector('[data-award-fields]')||!S)return;const box=document.createElement('section');box.dataset.awardFields='1';box.innerHTML=`<h3>獎項／冠軍倍率</h3><p>倍率 1 使用原版機率。下列成績浮動 0% 保留原始結果，並於原版完成上下限計算後套用均勻亂數。</p><div class="tr-grid">${input('最高投手獎倍率','pitcherAwardMult',clamp(n(S.pitcherAwardMult,1),0,100),0,100,.01)}${input('年度 MVP 倍率','mvpAwardMult',clamp(n(S.mvpAwardMult,1),0,100),0,100,.01)}${input('爭取成功率提高倍率','intlTryoutMult',clamp(n(S.intlTryoutMult,1),0,100),0,100,.01)}${input('學生／業餘大會成績倍率','amateurTournamentMult',clamp(n(S.amateurTournamentMult,1),0,100),0,100,.01)}${input('一般國際賽冠軍倍率','intlChampionMult',clamp(n(S.intlChampionMult,1),0,100),0,100,.01)}${input('WBC 額外冠軍倍率','wbcChampionMult',clamp(n(S.wbcChampionMult,1),0,100),0,100,.01)}${input('職業球季獎項點數倍率','proAwardPointMult',clamp(n(S.proAwardPointMult,1),0,100),0,100,.01)}${input('獎項降低國際徵召門檻倍率','intlAwardThresholdReductionMult',clamp(n(S.intlAwardThresholdReductionMult,1),0,100),0,100,.01)}${input('潛力點購買費率','potentialCostMult',clamp(n(S.potentialCostMult,.1),0,10),0,10,.01)}</div><h3>職業季賽均勻浮動（±%）</h3><div class="tr-grid">${vf('打者 AVG','seasonBatAvgVarPct')}${vf('打者 HR 生成率','seasonBatHrRateVarPct')}${vf('打者出賽數 G','seasonBatGamesVarPct')}${vf('打者盜壘 SB','seasonBatSbVarPct')}${vf('投手 ERA','seasonPitchEraVarPct')}${vf('先發 IP/G','seasonPitchStarterIpgVarPct')}${vf('後援 IP/G（中繼／終結者共用）','seasonPitchReliefIpgVarPct')}${vf('投手 K/9','seasonPitchK9VarPct')}${vf('投手 BB/9','seasonPitchBb9VarPct')}${vf('投手 H/9','seasonPitchH9VarPct')}${vf('投手勝率','seasonPitchWinProbVarPct')}</div><h3>國際賽均勻浮動（±%）</h3><div class="tr-grid">${vf('打者 AVG','intlBatAvgVarPct')}${vf('打者 HR 生成率','intlBatHrRateVarPct')}${vf('投手 ERA','intlPitchEraVarPct')}${vf('先發 IP/G','intlPitchStarterIpgVarPct')}${vf('後援 IP/G（中繼／終結者共用）','intlPitchReliefIpgVarPct')}${vf('投手 K/9','intlPitchK9VarPct')}${vf('投手勝率','intlPitchWinProbVarPct')}</div>`;body.appendChild(box);};
  new MutationObserver(()=>queueMicrotask(()=>{addEvolutionFields();addBulkFields();addAwardFields();addTwoWayFields();addMedicalFields();})).observe(body,{childList:true});
  const say=(t,bad=false)=>{msg.textContent=t;msg.classList.toggle('bad',bad);};
  function renderCareer(){
    const abilities=Object.keys(S.ab||{}).map(k=>input(ABL[k]||k,'ab.'+k,S.ab[k],1,ABILITY_MAX)).join('');
    const potentials=Object.keys(S.pot||{}).map(k=>input((ABL[k]||k)+'潛力','pot.'+k,S.pot[k],1,POTENTIAL_MAX)).join('');
    const top=S.stage==='PRO'&&S.lv&&LV[S.lv]&&LV[S.lv].top;
    const delta=top?ovr()-LV[S.lv].par:0,raw=top?(delta>=0?Math.min(5,delta*.5):delta*.8):0;
    const mult=clamp(n(S.champImpactMult,1),0,50),final=raw*mult;
    const champ=top?teamChampRate(S.orgTeam,S.year):0;
    const dm=clamp(n(S.draftIntentMult,3),1,100),cp=Math.round(dm/(5+dm)*10000)/100,np=Math.round(dm/(11+dm)*10000)/100;
    return `<section><h3>球員與生涯</h3><div class="tr-grid"><label><span>姓名</span><input data-k="name" value="${esc(S.name)}" maxlength="10"></label>${input('背號','jersey',S.jersey,0,99)}${input('年齡','age',S.age,12,99)}${input('年份','year',S.year,1900,2200)}${input('生涯總收入（萬）','salary',S.salary,0,999999999,.1)}${input('目前可用現金（元）','cash',S.cash||0,0,999999999999,1)}${input('選秀意向球隊權重','draftIntentMult',dm,1,100,.01)}${readout('意向隊抽中率（中／日）',`${cp}%／${np}%`)}${input('個人爭冠影響倍率','champImpactMult',mult,0,50,.01)}${readout('原版個人影響',top?`${raw>=0?'+':''}${raw.toFixed(2)}%`:'僅頂級聯盟生效')}${readout('倍率後個人影響',top?`${final>=0?'+':''}${final.toFixed(2)}%`:'—')}${readout('目前球隊爭冠率',top?`${champ.toFixed(1)}%`:'—')}${readout('美職組織控制期',S.org==='MiLB'?`剩餘 ${S.orgControlRemaining||0} 年`:'—')}${readout('本年生活安排',S.workPlan||'尚未選擇')}${readout('本年打工收入',(S.yearWorkIncome||0).toLocaleString()+' 元')}${readout('本年特訓／生活支出',(S.yearWorkExpense||0).toLocaleString()+' 元')}${input('可分配點數','pool',S.pool,0,9999)}${input('待結算能力點','pendStat',S.pendStat,-9999,9999)}${input('感情好感度','love.aff',(S.love&&S.love.aff)||0,0,100)}</div><div class="tr-actions"><button data-a="max">能力／潛力全部 150</button></div></section><section><h3>目前能力</h3><div class="tr-grid">${abilities}</div></section><section><h3>潛力上限</h3><div class="tr-grid">${potentials}</div></section>`;
  }
  function renderHealth(){
    const custom=S.injuryRateMode==='custom',bodyType=S.traits.iron?'iron':S.traits.glass?'glass':'normal';
    let html=`<section><h3>健康／傷病</h3><p>「目前受傷機率」是下一次判定真正使用的數值；自訂模式可突破原版最低 3%。</p><div class="tr-grid">${readout('目前受傷機率',injuryProb().toFixed(1)+'%')}${select('受傷率覆寫','injuryRateMode',S.injuryRateMode||'auto',[['auto','自動（原版公式）'],['custom','自訂']])}${input('自訂受傷機率','injuryRateCustom',S.injuryRateCustom||0,0,95,.1)}${check('永不受傷（固定 0%）','neverInjury',custom&&Number(S.injuryRateCustom)===0)}${input('下季受傷修正','injNext',S.injNext||0,-95,95)}${input('當季臨時受傷修正','tmpInj',S.tmpInj||0,-95,95)}${input('本季出賽比例（%）','seasonPercent',Math.round((S.seasonFactor??1)*100),0,100)}${input('復健剩餘年數','rehab',S.rehab||0,0,99)}${input('重大傷病次數','bigInj',S.bigInj||0,0,999)}${input('連續健康球季','ironStreak',S.ironStreak||0,0,999)}${select('體質','constitution',bodyType,[['normal','普通'],['iron','鐵人'],['glass','玻璃']])}${readout('目前傷病狀態',S.marketInjury||'healthy')}</div><div class="tr-actions"><button data-a="heal">一鍵完全康復</button></div></section>`;
    if(S.pos==='P'||S.pos==='TW')html+=`<section><h3>投手手肘</h3><p>「目前歸零」只救急；「鎖定零」會阻止往後累積與新的 TJ 危機。</p><div class="tr-grid">${input('目前手肘負荷','tj',S.tj||0,0,999,.1)}${readout('手肘負荷上限',tjCap())}${input('TJ 手術次數','tjCount',S.tjCount||0,0,99)}${input('手肘危機次數','tjCrises',S.tjCrises||0,0,999)}${select('投球方式','effort',S.effort||'普通投',[['養生球','養生球'],['普通投','普通投'],['全力投','全力投']])}${check('鎖定零（永久停用負荷累積）','tjLockZero',!!S.tjLockZero)}${check('完全修復時清除 TJ 手術紀錄','clearTjRecord',false)}</div><div class="tr-actions"><button data-a="elbow-zero">手肘負荷目前歸零</button><button data-a="elbow-repair">完全修復手肘</button></div></section>`;
    return html;
  }
  function renderSave(){return `<section><h3>完整生涯快照</h3><p>JSON 會保存全部年度對話、時間軸、目前待選流程、訓練分配進度、展開狀態與畫面位置。匯入後從同一個選項繼續；外部資料庫更新只套用於之後尚未產生的流程。</p><div class="tr-actions"><button data-a="export">匯出完整 JSON</button><button data-a="import">匯入完整 JSON</button></div></section><section><h3>年度安全備份</h3><p>只在每年流程剛開始的安全點執行。詢問模式可下載 JSON；自動模式保存在本瀏覽器中，避免瀏覽器阻擋無操作下載。</p><div class="tr-grid">${select('備份模式','backupMode',S.backupMode||'prompt',[['off','關閉'],['prompt','年度開始詢問匯出'],['auto','自動保存在瀏覽器']])}${select('每隔幾年','backupInterval',String(S.backupInterval??1),[['1','每年'],['2','每 2 年'],['3','每 3 年'],['5','每 5 年'],['10','每 10 年']])}${select('保留自動備份數','backupKeep',String(S.backupKeep??3),[['1','1 份'],['3','3 份'],['5','5 份'],['10','10 份']])}</div><div class="tr-actions"><button data-a="load-auto">讀取最近自動備份</button></div></section>`;}
  function renderRelationships(){const list=(S.love&&S.love.contacts)||[];return `<section><h3>多人感情資料庫</h3><p>每位人物的關係值各自保存；婚姻同時只能有一人。</p><div class="tr-grid">${list.length?list.map((c,i)=>input(`${c.name}（${c.identity||'人物'}）`,`contact.${i}`,c.value??c.aff??0,0,100)).join(''):'尚未認識任何人物。'}</div></section>`;}
  function render(){root.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('on',b.dataset.page===page));if(!S){body.innerHTML=`<section><h3>尚未開始生涯</h3><p>可以先開始新生涯，或匯入 JSON。</p><div class="tr-actions"><button data-a="import">匯入完整 JSON</button></div></section>`;return;}body.innerHTML=page==='health'?renderHealth():page==='relationships'?renderRelationships():page==='save'?renderSave():renderCareer();}
  function open(){render();root.hidden=false;say(S?'修改前建議先匯出 JSON 備份。':'尚未開始生涯。');}function close(){root.hidden=true;}
  function apply(){
    if(!S)return say('尚未開始生涯。',true);
    body.querySelectorAll('[data-k]').forEach(el=>{const [group,key]=el.dataset.k.split('.');
      if(group==='contact'&&key!=null){const c=S.love.contacts[Number(key)];if(c)c.value=clamp(Math.round(n(el.value,c.value??c.aff)),0,100);return;}
      if(key){const hi=group==='pot'?POTENTIAL_MAX:group==='love'?100:ABILITY_MAX,lo=group==='love'?0:1;S[group][key]=clamp(Math.round(n(el.value,S[group][key])),lo,hi);return;}
      if(group==='name')S.name=String(el.value).trim().slice(0,10)||S.name;
      else if(group==='seasonPercent')S.seasonFactor=clamp(n(el.value,100),0,100)/100;
      else if(group==='injuryRateMode')S.injuryRateMode=el.value==='custom'?'custom':'auto';
      else if(group==='injuryRateCustom')S.injuryRateCustom=clamp(n(el.value,0),0,95);
      else if(group==='neverInjury'&&el.checked){S.injuryRateMode='custom';S.injuryRateCustom=0;}
      else if(group==='constitution'){S.traits.iron=el.value==='iron';S.traits.glass=el.value==='glass';}
      else if(group==='effort')S.effort=['養生球','普通投','全力投'].includes(el.value)?el.value:'普通投';
      else if(group==='tjLockZero'){S.tjLockZero=el.checked;if(el.checked)S.tj=0;}
      else if(group==='clearTjRecord'){}
      else if(group==='champImpactMult')S.champImpactMult=clamp(n(el.value,1),0,50);
      else if(group==='draftIntentMult')S.draftIntentMult=clamp(n(el.value,3),1,100);
      else if(group==='pitcherAwardMult')S.pitcherAwardMult=clamp(n(el.value,1),0,100);
      else if(group==='mvpAwardMult')S.mvpAwardMult=clamp(n(el.value,1),0,100);
      else if(group==='intlTryoutMult')S.intlTryoutMult=clamp(n(el.value,1),0,100);
      else if(group==='intlChampionMult')S.intlChampionMult=clamp(n(el.value,1),0,100);
      else if(group==='amateurTournamentMult')S.amateurTournamentMult=clamp(n(el.value,1),0,100);
      else if(group==='wbcChampionMult')S.wbcChampionMult=clamp(n(el.value,1),0,100);
      else if(['seasonBatAvgVarPct','seasonBatHrRateVarPct','seasonBatGamesVarPct','seasonBatSbVarPct','seasonPitchEraVarPct','seasonPitchStarterIpgVarPct','seasonPitchReliefIpgVarPct','seasonPitchK9VarPct','seasonPitchBb9VarPct','seasonPitchH9VarPct','seasonPitchWinProbVarPct','intlBatAvgVarPct','intlBatHrRateVarPct','intlPitchEraVarPct','intlPitchStarterIpgVarPct','intlPitchReliefIpgVarPct','intlPitchK9VarPct','intlPitchWinProbVarPct'].includes(group))S[group]=clamp(n(el.value,0),0,100);
      else if(group==='potentialCostMult')S.potentialCostMult=clamp(n(el.value,.1),0,10);
      else if(group==='twoWayPointsMult')S.twoWayPointsMult=clamp(n(el.value,S.pos==='TW'?1.5:1),.1,10);
      else if(['twoWayDiceMult','twoWaySeasonPointMult'].includes(group))S[group]=clamp(n(el.value,1.5),.1,10);
      else if(group==='twoWayWorkIncomeMult')S.twoWayWorkIncomeMult=clamp(n(el.value,1.5),0,10);
      else if(group==='twoWayInjuryMult')S.twoWayInjuryMult=clamp(n(el.value,1),0,10);
      else if(group==='twoWayBatMinStamina')S.twoWayBatMinStamina=clamp(Math.round(n(el.value,50)),1,150);
      else if(group==='twoWayWorkloadMult')S.twoWayWorkloadMult=clamp(n(el.value,.6),0,3);
      else if(['twoWayAmateurImpactMult','twoWayIntlImpactMult','twoWayProImpactMult'].includes(group))S[group]=clamp(n(el.value,1),0,10);
      else if(group==='twoWayContractThresholdReduction')S[group]=clamp(n(el.value,1),0,150);
      else if(['proAwardPointMult','intlAwardThresholdReductionMult'].includes(group))S[group]=clamp(n(el.value,1),0,100);
      else if(['medicalNormalReductionPct','medicalProReductionPct','medicalFullReductionPct','medicalTwoWayReductionPct'].includes(group))S[group]=clamp(n(el.value,0),0,100);
      else if(group==='potentialPivotAge')S.potentialPivotAge=clamp(Math.round(n(el.value,30)),1,99);
      else if(group==='potentialYearMin')S.potentialYearMin=clamp(Math.round(n(el.value,0)),0,150);
      else if(group==='potentialYearMax')S.potentialYearMax=clamp(Math.round(n(el.value,0)),0,150);
      else if(group==='annualStatFontSize')S.annualStatFontSize=clamp(Math.round(n(el.value,13)*2)/2,9,15);
      else if(group==='declineStartAge')S.declineStartAge=clamp(Math.round(n(el.value,32)),1,99);
      else if(group==='declineStartValue')S.declineStartValue=clamp(n(el.value,2),0,150);
      else if(group==='declineStepMult')S.declineStepMult=clamp(n(el.value,.5),0,100);
      else if(group==='bulkAbilityValue')S.bulkAbilityValue=clamp(Math.round(n(el.value,60)),1,150);
      else if(group==='bulkPotentialValue')S.bulkPotentialValue=clamp(Math.round(n(el.value,60)),1,150);
      else if(group==='backupMode')S.backupMode=['off','prompt','auto'].includes(el.value)?el.value:'prompt';
      else if(group==='backupInterval')S.backupInterval=clamp(Math.round(n(el.value,1)),1,10);
      else if(group==='backupKeep')S.backupKeep=clamp(Math.round(n(el.value,3)),1,10);
      else if(['jersey','age','year','cash','injNext','tmpInj','rehab','bigInj','ironStreak','tjCount','tjCrises','pool','pendStat'].includes(group))S[group]=Math.round(n(el.value,S[group]));
      else S[group]=n(el.value,S[group]);
    });
    if(S.potentialYearMin>S.potentialYearMax){const t=S.potentialYearMin;S.potentialYearMin=S.potentialYearMax;S.potentialYearMax=t;}
    document.querySelectorAll('.annual-stat-wrap').forEach(el=>el.style.setProperty('--annual-stat-font-size',`${clamp(n(S.annualStatFontSize,13),9,15)}px`));
    if(S.tjLockZero)S.tj=0;board(0);say('修改已套用。若要保存，請到「存檔」匯出完整 JSON。');render();
  }
  async function loadObject(obj){
    if(!obj||obj.format!=='YaKyoLife-Offline-Save'||!obj.state)throw new Error('不是相容的 YaKyoLife 離線版存檔');
    const [db,intlDb]=await Promise.all([loadRelationshipDatabase(),loadInternationalDatabase()]);
    /* Keep the newly loaded workbooks for future years, but replay the unfinished
       current year against the workbook copies embedded in the save.  This keeps
       the pending screen byte-for-byte stable even after an Excel update. */
    const latestRel=relationshipDatabaseSnapshot(),latestIntl=internationalDatabaseSnapshot();
    /* v0.26 新欄位的舊檔遷移。不可用 truthy 判斷，因為 0 是合法的修改器值。 */
    const migrateState=v=>{if(!v||typeof v!=='object')return v;
      const d={twoWayDiceMult:1.5,twoWaySeasonPointMult:1.5,twoWayWorkIncomeMult:1.5,annualStatFontSize:13,
        twoWayInjuryMult:1,twoWayBatMinStamina:50,twoWayContractThresholdReduction:1,proAwardPointMult:1,intlAwardThresholdReductionMult:1,contractUsage:v.pos==='TW'?'TW':v.pos,intlUsage:null};
      Object.entries(d).forEach(([k,x])=>{if(v[k]===undefined||v[k]===null)v[k]=x;});
      return attachTeamName(v);
    };
    setSeed(String(obj.seed||SEED));seedInit(SEED);$('start').style.display='none';$('board').style.display='';$('act').style.display='';
    const full=Number(obj.saveSchema)>=2&&obj.flow?.yearStartState&&obj.ui;
    if(full){
      applyRelationshipDatabaseSnapshot(obj.databases?.relationship);
      applyInternationalDatabaseSnapshot(obj.databases?.international);
      setS(migrateState(obj.flow.yearStartState));restoreReplayRng(obj.flow.yearStartRng);$('log').innerHTML='';resetTL();renderTimeline();
      const ready=prepareReplay(obj.flow);startYear();await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('無法重建目前待選流程')),5000))]);
      setS(migrateState(obj.state));
      refreshAlloc();
      const savedLog=typeof obj.ui.logHTML==='string'&&obj.ui.logHTML.length?obj.ui.logHTML:
        (Array.isArray(obj.ui.logBlocks)?obj.ui.logBlocks.join(''):'');
      if((obj.ui.logChildCount>0||obj.ui.timeline?.length)&&!savedLog)throw new Error('存檔缺少年度對話內容');
      $('log').innerHTML=savedLog;restoreLogTarget();restoreTimeline(obj.ui.timeline||[]);
      const phase=Number.isInteger(obj.ui.phase)&&obj.ui.phase>=0?obj.ui.phase:0;board(phase);
      $('act').classList.toggle('collapsed',!!obj.ui.actCollapsed);
      $('board').classList.toggle('detail-open',!!obj.ui.boardDetailOpen);
      const detail=$('bd-detail');if(detail){detail.dataset.tab=obj.ui.detailTab||'h';if(obj.ui.boardDetailOpen)board(phase);}
      applyRelationshipDatabaseSnapshot(latestRel);applyInternationalDatabaseSnapshot(latestIntl);
      requestAnimationFrame(()=>{const d=$('bd-detail'),y=d?.querySelector('.sec-y');if(d)d.scrollTop=obj.ui.detailScroll||0;if(y)y.scrollTop=obj.ui.detailYearScroll||0;if($('tl-list'))$('tl-list').scrollTop=obj.ui.timelineListScroll||0;if($('tl-strip'))$('tl-strip').scrollLeft=obj.ui.timelineStripScroll||0;window.scrollTo(obj.ui.scrollX||0,obj.ui.scrollY||0);});
    }else{
      setS(migrateState(obj.state));$('log').innerHTML='';resetTL();renderTimeline();board(0);startYear();
    }
    const ts=$('tl-seed');if(ts)ts.textContent=SEED;close();
    if(!full)card('info','舊版存檔已載入',`這是舊格式，無完整畫面快照，已由 ${S.year} 年季初接續。`);
    if(!db.ok||!intlDb.ok)console.warn('資料庫讀取備援',db.error||'',intlDb.error||'');
  }
  function importFile(){const f=document.createElement('input');f.type='file';f.accept='.json,application/json';f.onchange=async()=>{try{await loadObject(JSON.parse(await f.files[0].text()));}catch(e){say('匯入失敗：'+e.message,true);}};f.click();}
  function autoBackups(){try{return JSON.parse(localStorage.getItem('yakyo-v022-safe-backups')||'[]');}catch{return [];}}
  root.addEventListener('click',async e=>{const p=e.target.closest('[data-page]');if(p){page=p.dataset.page;render();return;}const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
    if(a==='close')close();else if(a==='apply')apply();else if(a==='import')importFile();
    else if(a==='load-auto'){const list=autoBackups();if(!list.length)return say('目前沒有瀏覽器自動備份。',true);try{await loadObject(JSON.parse(list[0].text));}catch(err){say('自動備份讀取失敗：'+err.message,true);}}
    else if(a==='export'){if(!S)return say('沒有可匯出的生涯。',true);try{const out=buildExport();download(`YaKyoLife_${S.name}_${S.year}_完整存檔.json`,out.text);say(`完整 JSON 已匯出（${(out.bytes/1024).toFixed(1)} KB；年度區塊 ${out.blocks}；時間軸 ${out.rows} 年）。`);}catch(err){say('匯出失敗：'+err.message,true);}}
    else if(a==='heal'){S.injNext=0;S.tmpInj=0;S.rehab=0;S.seasonFactor=1;S.marketInjury='healthy';S.skipMid=false;render();say('已完全康復；能力值未變動。按「套用修改」保存。');}
    else if(a==='elbow-zero'){S.tj=0;render();say('目前手肘負荷已歸零；往後仍會重新累積。');}
    else if(a==='elbow-repair'){const clear=!!body.querySelector('[data-k="clearTjRecord"]')?.checked;S.tj=0;S.tjSecondYear=null;S.tjSuccess=0;if(clear){S.tjCount=0;S.tjCrises=0;}render();say(clear?'手肘已完全修復，TJ 手術與危機紀錄已清除。':'手肘已完全修復，TJ 手術與危機紀錄保留。');}
    else if(a==='max'){Object.keys(S.ab||{}).forEach(k=>S.ab[k]=ABILITY_MAX);Object.keys(S.pot||{}).forEach(k=>S.pot[k]=POTENTIAL_MAX);render();say('能力與潛力已全部設為 150，按「套用修改」完成。');}
    else if(a==='set-abilities'){const v=clamp(Math.round(n(body.querySelector('[data-k="bulkAbilityValue"]')?.value,S.bulkAbilityValue||60)),1,150);S.bulkAbilityValue=v;Object.keys(S.ab||{}).forEach(k=>S.ab[k]=v);board(0);render();say(`目前能力已全部設為 ${v}。`);}
    else if(a==='set-potentials'){const v=clamp(Math.round(n(body.querySelector('[data-k="bulkPotentialValue"]')?.value,S.bulkPotentialValue||60)),1,150);S.bulkPotentialValue=v;Object.keys(S.pot||{}).forEach(k=>S.pot[k]=v);board(0);render();say(`潛力已全部設為 ${v}。`);}
  });
  window.addEventListener('yakyo:backup-export',()=>{try{const out=buildExport();download(`YaKyoLife_${S.name}_${S.year}_年度安全備份.json`,out.text);card('good','年度安全備份已匯出',`${S.year} 年安全檢查點已下載（${(out.bytes/1024).toFixed(1)} KB）。`);}catch(err){card('bad','年度安全備份失敗',esc(err.message));}});
  window.addEventListener('yakyo:backup-internal',()=>{try{const out=buildExport(),list=autoBackups(),keep=clamp(Math.round(n(S.backupKeep,3)),1,10);list.unshift({year:S.year,name:S.name,savedAt:new Date().toISOString(),text:out.text});localStorage.setItem('yakyo-v022-safe-backups',JSON.stringify(list.slice(0,keep)));card('good','年度安全備份已建立',`${S.year} 年安全檢查點已保存在本瀏覽器（保留 ${keep} 份）。`);}catch(err){card('bad','年度安全備份失敗',esc(err.message));}});
  root.addEventListener('click',e=>{if(e.target===root)close();});document.addEventListener('keydown',e=>{if(e.key==='F10'){e.preventDefault();root.hidden?open():close();}else if(e.key==='Escape'&&!root.hidden)close();});
  const hint=document.createElement('button');hint.id='trainer-hint';hint.textContent='F10 修改器';hint.onclick=open;document.body.appendChild(hint);
}
