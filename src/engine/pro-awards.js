/* 當年度個人獎項。球隊冠軍、國際賽名次、學生大會與生涯里程碑不列入。 */
const PERSONAL=/(年度MVP|年度最佳投手|年度最佳打者|澤村賞|賽揚獎|新人王|明星賽(?:（人氣入選）)?|勝投王|防禦率王|三振王|救援王|中繼王|打擊王|全壘打王|打點王|盜壘王|上壘王|投手三冠王|打擊三冠王|金手套|守備聖經)$/;
export function proPersonalAwards(honors,year){const p=`${year} `;return (honors||[]).filter(x=>typeof x==='string'&&x.startsWith(p)&&PERSONAL.test(x));}
export function proPersonalAwardCount(honors,year){return proPersonalAwards(honors,year).length;}
export function intlAwardTier(lv){if(['CPBL1','NPB1','MLB','A3'].includes(lv))return 1;if(['CPBL2','NPB2','A2','A1','R','AMA'].includes(lv))return .5;return 0;}
