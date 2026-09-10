/* Browser-owned replacements for the editable JSON files shipped in database/. */
const PREFIX='yakyu-custom-dataset:';
export const DATASETS={
  teams:{label:'球隊資料',file:'teams.json',url:'database/teams.json'},
  international:{label:'國際賽資料',file:'international-db.json',url:'database/international-db.json'},
  relationship:{label:'感情資料',file:'relationship-db.json',url:'database/relationship-db.json'}
};
const clone=v=>JSON.parse(JSON.stringify(v));
const key=id=>PREFIX+id;

function customRecord(id){
  try{
    const record=JSON.parse(localStorage.getItem(key(id))||'null');
    return record&&record.version===1&&record.data?record:null;
  }catch(_){return null;}
}
export function datasetStatus(id){
  const record=customRecord(id);
  return record?{custom:true,savedAt:record.savedAt||''}:{custom:false,savedAt:''};
}
export function saveCustomDataset(id,data,validate){
  if(!DATASETS[id])throw new Error('未知的資料集');
  validate(data);
  const record={version:1,savedAt:new Date().toISOString(),data:clone(data)};
  localStorage.setItem(key(id),JSON.stringify(record));
  return record;
}
export function clearCustomDataset(id){localStorage.removeItem(key(id));}
export function customDataset(id,validate){
  const record=customRecord(id);
  if(!record)return null;
  try{validate(record.data);return clone(record.data);}catch(_){return null;}
}
export async function loadDataset(id,validate){
  const custom=customDataset(id,validate);
  if(custom)return {data:custom,source:'使用者自訂資料',custom:true};
  const def=DATASETS[id];if(!def)throw new Error('未知的資料集');
  const res=await fetch(`${def.url}?t=${Date.now()}`,{cache:'no-store'});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  const data=await res.json();validate(data);
  return {data,source:def.file,custom:false};
}
export async function downloadDefaultDataset(id){
  const def=DATASETS[id];if(!def)throw new Error('未知的資料集');
  const res=await fetch(`${def.url}?t=${Date.now()}`,{cache:'no-store'});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  const text=await res.text();JSON.parse(text);
  const blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=def.file;a.style.display='none';document.body.appendChild(a);a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},60000);
}
