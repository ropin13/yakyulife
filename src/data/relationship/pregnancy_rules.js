export const PREGNANCY_RULES={
 baseByAge:[
  {max:22,pct:65},{max:27,pct:75},{max:32,pct:65},{max:36,pct:50},{max:40,pct:30},{max:99,pct:10}
 ],
 parityPenalty:[0,0,10,20,30],
 maxChildren:4
};
export function pregnancyChance(age,parity){
 const row=PREGNANCY_RULES.baseByAge.find(x=>age<=x.max)||PREGNANCY_RULES.baseByAge.at(-1);
 return Math.max(5,row.pct-(PREGNANCY_RULES.parityPenalty[parity]??30));
}
