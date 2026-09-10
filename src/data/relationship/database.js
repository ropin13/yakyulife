import {INTERACTION_ACTIONS as FALLBACK_ACTIONS,RELATION_TEXT as FALLBACK_TEXT} from './interaction_actions.js?v=offline-0.31.1';
import {PROBABILITY_EVENTS as FALLBACK_PROBABILITY} from './probability_events.js?v=offline-0.31.1';
import {MANDATORY_EVENTS as FALLBACK_MANDATORY} from './mandatory_events.js?v=offline-0.31.1';
import {RANDOM_EVENTS as FALLBACK_RANDOM} from './random_events.js?v=offline-0.31.1';
import {loadDataset} from '../datasets.js?v=offline-0.31.1';

export const REL_DB={
  actions:{...FALLBACK_ACTIONS},texts:{...FALLBACK_TEXT},
  probability:FALLBACK_PROBABILITY.slice(),mandatory:FALLBACK_MANDATORY.slice(),random:FALLBACK_RANDOM.slice(),
  source:'內建備援資料',loadedAt:0,error:'',rawSheets:null
};

const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const b=v=>v===true||v===1||String(v).toLowerCase()==='true'||String(v)==='是';
const json=(v,d)=>{try{return v?JSON.parse(v):d}catch(_){return d}};
const enabled=r=>r.enabled===undefined||r.enabled===''||b(r.enabled);

function conditionOf(spec){
  spec=spec||{};
  const test=(rule,ctx)=>{
    if(!rule||typeof rule!=='object')return true;
    if(Array.isArray(rule.all)&&!rule.all.every(x=>test(x,ctx)))return false;
    if(Array.isArray(rule.any)&&!rule.any.some(x=>test(x,ctx)))return false;
    if(rule.not&&test(rule.not,ctx))return false;
    if(rule.married!==undefined&&!!ctx.married!==!!rule.married)return false;
    for(const k of ['datingCount','friendCount','highFriendCount','highExCount','exCount','marriageValue']){
      if(rule['min_'+k]!==undefined&&n(ctx[k])<n(rule['min_'+k]))return false;
      if(rule['max_'+k]!==undefined&&n(ctx[k])>n(rule['max_'+k]))return false;
    }
    if(rule.hasDatingCrisis&&!ctx.datingCrisis.length)return false;
    if(rule.hasMarriageCrisis&&!ctx.marriageCrisis.length)return false;
    if(rule.hasPregnancy&&!ctx.pregnancy)return false;
    return true;
  };
  return ctx=>test(spec,ctx);
}

function applyRows(db){
  const fixed=(db['固定互動']||[]).filter(enabled);
  if(fixed.length){
    const actions={},texts={friend:[],dating:[],marriage:[]};
    fixed.forEach(r=>{
      const id=String(r.action_id||'').trim();if(!id)return;
      actions[id]={id,name:r.name||id,gain:[n(r.gain_min),n(r.gain_max)]};
      if(id!=='free')actions[id].cost={MS:[n(r.ms_cost_min),n(r.ms_cost_max)],HS:[n(r.hs_cost_min),n(r.hs_cost_max)],U:[n(r.u_cost_min),n(r.u_cost_max)],PRO:[n(r.pro_cost_min),n(r.pro_cost_max)]};
      else actions[id].cost=[0,0];
      texts.friend.push(r.friend_text||r.name||id);texts.dating.push(r.dating_text||r.name||id);texts.marriage.push(r.marriage_text||r.name||id);
    });
    if(Object.keys(actions).length>=6){REL_DB.actions=actions;REL_DB.texts=texts;}
  }
  const prob=(db['機率觸發']||[]).filter(enabled).map(r=>({id:String(r.id||''),name:r.name||r.id,weight:n(r.weight,1),condition:conditionOf(json(r.condition_json,{})),resolve:r.resolve||r.id})).filter(e=>e.id);
  if(prob.length)REL_DB.probability=prob;
  const mandatory=(db['必然觸發']||[]).filter(enabled).map(r=>({id:String(r.id||''),name:r.name||r.id,priority:n(r.priority),allowTogether:b(r.allow_together),condition:conditionOf(json(r.condition_json,{})),resolve:r.resolve||r.id})).filter(e=>e.id);
  if(mandatory.length)REL_DB.mandatory=mandatory;
  const random=(db['隨機事件']||[]).filter(enabled).map(r=>({id:String(r.id||''),title:r.title||r.id,weight:n(r.weight,1),scope:r.scope||'any',choices:json(r.choices_json,[])})).filter(e=>e.id&&e.choices.length);
  if(random.length)REL_DB.random=random;
}

const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
export function validateRelationshipDatabase(payload){
  if(!payload||!payload.sheets||typeof payload.sheets!=='object')throw new Error('資料格式不完整');
  const required=['固定互動','機率觸發','必然觸發','隨機事件'];
  if(!required.every(name=>Array.isArray(payload.sheets[name])))throw new Error('感情資料表格式不完整');
}
export function relationshipDatabaseSnapshot(){return REL_DB.rawSheets?{sheets:clone(REL_DB.rawSheets),source:REL_DB.source}:null;}
export function applyRelationshipDatabaseSnapshot(snapshot){
  if(!snapshot?.sheets)return false;
  applyRows(snapshot.sheets);REL_DB.rawSheets=clone(snapshot.sheets);REL_DB.source=snapshot.source||'存檔內資料庫';REL_DB.loadedAt=Date.now();REL_DB.error='';return true;
}

export async function loadRelationshipDatabase(){
  try{
    const loaded=await loadDataset('relationship',validateRelationshipDatabase);
    const payload=loaded.data;
    applyRows(payload.sheets);REL_DB.rawSheets=clone(payload.sheets);REL_DB.source=loaded.custom?'使用者自訂資料':(payload.source||'relationship-db.json');REL_DB.loadedAt=Date.now();REL_DB.error='';
    return {ok:true,source:REL_DB.source};
  }catch(err){REL_DB.error=String(err&&err.message||err);return {ok:false,error:REL_DB.error,source:REL_DB.source};}
}
