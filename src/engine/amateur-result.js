/**
 * Scale a student's/amateur team's competitive strength around the weakest
 * qualifying threshold.  At 1.00 this is deliberately an identity function,
 * so old balance and seeded results remain byte-for-byte compatible.
 */
export function scaledAmateurPower(power, thresholds, multiplier=1){
  const p=Number(power)||0;
  const floor=Array.isArray(thresholds)&&thresholds.length?Number(thresholds[thresholds.length-1])||0:0;
  const mult=Math.max(0,Math.min(100,Number.isFinite(Number(multiplier))?Number(multiplier):1));
  return floor+(p-floor)*mult;
}

export function amateurRankIndex(power, thresholds, multiplier=1){
  const adjusted=scaledAmateurPower(power,thresholds,multiplier);
  const i=thresholds.findIndex(v=>adjusted>=v);
  return i<0?thresholds.length:i;
}
