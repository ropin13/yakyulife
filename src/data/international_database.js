const DEFAULT_THRESHOLDS={ES:{direct:32,fight:24},MS:{direct:42,fight:34},HS:{direct:48,fight:40},UNI:{direct:52,fight:44},ADULT:{direct:56,fight:48},WBC:{direct:62,fight:54}};
const DB={schedule:new Map(),thresholds:{...DEFAULT_THRESHOLDS},source:'內建備援',loaded:false,rawSheets:null};
const enabled=v=>v!==false&&v!==0&&String(v).toLowerCase()!=='false'&&String(v).trim()!=='0';
const clean=v=>String(v??'').trim();

const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function applyData(data){
    const schedule=new Map();
    for(const row of data.sheets?.['年度賽程']||[]){
      if(!enabled(row.enabled))continue;const year=Number(row.year);if(!Number.isInteger(year))continue;
      schedule.set(year,{elementary:clean(row.elementary),junior:clean(row.junior),high:clean(row.high),university:clean(row.university),adult:clean(row.adult),note:clean(row.note)});
    }
    if(schedule.size<10)throw new Error('年度賽程有效資料不足');
    const thresholds={...DEFAULT_THRESHOLDS};
    for(const row of data.sheets?.['門檻設定']||[]){
      if(!enabled(row.enabled))continue;const key=clean(row.category).toUpperCase(),direct=Number(row.direct),fight=Number(row.fight);
      if(!(key in thresholds)||!Number.isFinite(direct)||!Number.isFinite(fight)||fight>direct)continue;
      thresholds[key]={direct,fight};
    }
    DB.schedule=schedule;DB.thresholds=thresholds;DB.source=data.source||'國際賽事資料庫.xlsx';DB.loaded=true;DB.rawSheets=clone(data.sheets);
    return {ok:true,source:DB.source,years:schedule.size};
}
export function internationalDatabaseSnapshot(){return DB.rawSheets?{sheets:clone(DB.rawSheets),source:DB.source}:null;}
export function applyInternationalDatabaseSnapshot(snapshot){if(!snapshot?.sheets)return false;applyData(snapshot);return true;}

export async function loadInternationalDatabase(){
  try{
    const res=await fetch(`/api/international-db?t=${Date.now()}`,{cache:'no-store'});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();if(data.error)throw new Error(data.error);
    return applyData(data);
  }catch(error){DB.schedule=new Map();DB.thresholds={...DEFAULT_THRESHOLDS};DB.source='內建備援';DB.loaded=false;return {ok:false,error:error?.message||String(error)};}
}

export function internationalDbRow(year){return DB.schedule.get(Number(year))||null;}
export function internationalThreshold(key){return DB.thresholds[key]||DEFAULT_THRESHOLDS[key];}
