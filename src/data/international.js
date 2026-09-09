import {loadInternationalDatabase,internationalDbRow,internationalThreshold} from './international_database.js?v=offline-0.31.0';
export {loadInternationalDatabase};

/* 1990～2026：每年只採用討論表中的第一項成人國際賽。
   2027 年起改採固定循環；大學賽自 1991 起固定出現在奇數年。 */
export const HISTORICAL_ADULT_EVENTS={
  1990:'世界盃棒球賽',1991:'亞洲棒球錦標賽',1992:'巴塞隆納奧運棒球賽',1993:'亞洲棒球錦標賽',
  1994:'世界盃棒球賽',1995:'亞洲棒球錦標賽',1996:'亞特蘭大奧運棒球賽',1997:'亞洲棒球錦標賽',
  1998:'世界盃棒球賽',1999:'亞洲棒球錦標賽',2000:'雪梨奧運棒球賽',2001:'世界盃棒球賽',
  2002:'釜山亞運棒球賽',2003:'世界盃棒球賽',2004:'雅典奧運棒球賽',2005:'世界盃棒球賽',
  2006:'世界棒球經典賽',2007:'世界盃棒球賽',2008:'北京奧運棒球賽',2009:'世界棒球經典賽',
  2010:'廣州亞運棒球賽',2011:'世界盃棒球賽',2012:'亞洲棒球錦標賽',2013:'世界棒球經典賽',
  2014:'仁川亞運棒球賽',2015:'世界12強賽',2016:'U-23世界盃棒球賽',2017:'世界棒球經典賽',
  2018:'雅加達亞運棒球賽',2019:'世界12強賽',2021:'東京奧運棒球賽',2022:'U-23世界盃棒球賽',
  2023:'世界棒球經典賽',2024:'世界12強賽',2025:'亞洲棒球錦標賽',2026:'世界棒球經典賽'
};

export function internationalEventsFor(state){
  const out=[],year=Number(state.year),stage=state.stage,grade=Number(state.stageYr),age=Number(state.age);
  const dbRow=internationalDbRow(year);
  const pandemic=dbRow&&Object.values(dbRow).some(v=>v==='全球疫情');
  const anyEligible=(stage==='ES'&&grade>=5)||(stage==='MS'&&grade>=2)||(stage==='HS'&&grade>=2)||stage==='U'||stage==='AMA'||stage==='PRO';
  if(pandemic&&anyEligible)return [{id:`${year}-pandemic`,name:'全球疫情',pandemic:true}];
  const youth={ES:{name:dbRow?dbRow.elementary:'U-12世界盃少棒賽',minGrade:5,...internationalThreshold('ES')},MS:{name:dbRow?dbRow.junior:'U-15世界盃青少棒賽',minGrade:2,...internationalThreshold('MS')},HS:{name:dbRow?dbRow.high:'U-18世界盃青棒賽',minGrade:2,...internationalThreshold('HS')}}[stage];
  if(youth&&youth.name&&grade>=youth.minGrade)out.push({...youth,id:`${year}-${stage}`,youth:true,adultNational:false,format:'youth'});

  /* 世界大學棒球錦標賽：1991 起每個奇數年，大一至大四均可參加。 */
  const universityName=dbRow?dbRow.university:(year>=1991&&year%2===1?'世界大學棒球錦標賽':'');
  if(stage==='U'&&universityName)
    out.push({id:`${year}-university`,name:universityName,...internationalThreshold('UNI'),youth:false,adultNational:false,format:'university'});

  const adultEligible=stage==='PRO'||stage==='AMA'||(stage==='U'&&grade>=3);
  if(!adultEligible)return out;
  if(!dbRow&&year===2020){out.push({id:'2020-pandemic',name:'全球疫情',pandemic:true});return out;}

  let name=dbRow?dbRow.adult:null;
  if(!dbRow&&year>=1990&&year<=2026)name=HISTORICAL_ADULT_EVENTS[year]||null;
  else if(year>2026){
    if((year-2026)%4===0)name='世界棒球經典賽';
    else if((year-2028)%4===0)name='世界12強賽';
  }
  if(!name)return out;
  if(name.startsWith('U-23')&&age>23)return out;
  const wbc=name==='世界棒球經典賽',threshold=internationalThreshold(wbc?'WBC':'ADULT');
  out.push({id:`${year}-adult`,name,...threshold,
    youth:false,adultNational:true,wbc,format:wbc?'wbc':'adult'});
  return out;
}
