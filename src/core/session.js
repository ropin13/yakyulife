import {rngState,setRngState} from './rng.js?v=offline-0.31.0';

const clone=v=>v==null?v:JSON.parse(JSON.stringify(v,(k,x)=>typeof x==='function'?undefined:x));
export const FLOW_SESSION={yearStartState:null,yearStartRng:0,actions:[],replay:null,ready:null};
export function beginYearCheckpoint(state){if(FLOW_SESSION.replay)return;FLOW_SESSION.yearStartState=clone(state);FLOW_SESSION.yearStartRng=rngState();FLOW_SESSION.actions=[];}
export function recordChoice(index,title,label){if(!FLOW_SESSION.replay)FLOW_SESSION.actions.push({type:'choice',index:Number(index)||0,title:String(title||''),label:String(label||'')});}
export function recordFlowAction(action){if(!FLOW_SESSION.replay)FLOW_SESSION.actions.push(clone(action));}
export function sessionSnapshot(){return {yearStartState:clone(FLOW_SESSION.yearStartState),yearStartRng:FLOW_SESSION.yearStartRng|0,actions:clone(FLOW_SESSION.actions)};}
export function prepareReplay(snapshot){const actions=Array.isArray(snapshot&&snapshot.actions)?clone(snapshot.actions):[];FLOW_SESSION.replay={actions,pos:0};return new Promise(resolve=>{FLOW_SESSION.ready=resolve;});}
export function replayChoice(opts){const rp=FLOW_SESSION.replay;if(!rp)return -1;if(rp.pos>=rp.actions.length){finishReplayIfIdle();return -1;}const a=rp.actions[rp.pos];
  /* schema 2/3 did not have a type field, so an untyped item is an old choice. */
  if(a&&a.type&&a.type!=='choice')return -1;
  rp.pos++;let idx=Number(a.index);if(!(idx>=0&&idx<opts.length)||String(opts[idx].t||'')!==String(a.label||'')){const same=opts.findIndex(o=>String(o.t||'')===String(a.label||''));if(same>=0)idx=same;}return idx>=0&&idx<opts.length?idx:-1;}
export function replayFlowActions(type,apply){const rp=FLOW_SESSION.replay;if(!rp)return false;let used=false;
  while(rp.pos<rp.actions.length&&rp.actions[rp.pos]?.type===type){const a=rp.actions[rp.pos++];used=true;apply(clone(a));}
  if(rp.pos>=rp.actions.length)finishReplayIfIdle();return used;}
export function isReplaying(){return !!FLOW_SESSION.replay;}
export function finishReplayIfIdle(){const rp=FLOW_SESSION.replay;if(!rp||rp.pos<rp.actions.length)return;const done=FLOW_SESSION.ready;FLOW_SESSION.replay=null;FLOW_SESSION.ready=null;if(done)queueMicrotask(done);}
export function restoreReplayRng(v){setRngState(v);}
