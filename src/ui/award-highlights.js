const MAP_P={W:['勝投王','投手三冠王'],SV:['救援王'],HLD:['中繼王'],SO:['三振王','投手三冠王'],ERA:['防禦率王','投手三冠王']};
const MAP_H={AVG:['打擊王','打擊三冠王'],OBP:['上壘王'],H:['安打王'],HR:['全壘打王','打擊三冠王'],RBI:['打點王','打擊三冠王'],SB:['盜壘王']};
export function yearHonorText(honors,year){const prefix=String(year)+' ';return (honors||[]).filter(h=>String(h).startsWith(prefix)).join('\n');}
export function awardStatHighlighted(honors,year,isPitcher,key){const names=(isPitcher?MAP_P:MAP_H)[key]||[];if(!names.length)return false;const text=yearHonorText(honors,year);return names.some(name=>text.includes(name));}
export function awardFlags(honors,year,isPitcher,keys){return keys.map(key=>awardStatHighlighted(honors,year,isPitcher,key));}
