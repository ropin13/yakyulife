/* 球隊年資與神主牌的純判斷，集中在這裡避免顯示、交易與結算各自解讀。 */
export function isMrTeamEligible(totalSeasons,topSeasons){
  const total=Math.max(0,Number(totalSeasons)||0),top=Math.max(0,Number(topSeasons)||0);
  return total>=15&&top*3>=total*2;
}

export function hasActiveFranchise(state){
  return !!(state&&state.traits&&state.traits.franchise&&state.franchiseActive);
}
