/* ================= RNG（種子化） ================= */
export let SEED = new URLSearchParams(location.search).get('seed') || Math.random().toString(36).slice(2,10);
export function setSeed(v){ SEED = v; }
let _s = 0;
export function seedInit(str){ _s = 1779033703; for(let i=0;i<str.length;i++){ _s = Math.imul(_s ^ str.charCodeAt(i), 3432918353); _s = _s<<13 | _s>>>19; } }
export function rngState(){ return _s|0; }
export function setRngState(v){ _s=Number(v)|0; }
export function R(){ _s|=0; _s = _s + 0x6D2B79F5 |0; let t = Math.imul(_s ^ _s>>>15, 1|_s); t = t + Math.imul(t ^ t>>>7, 61|t) ^ t; return ((t ^ t>>>14)>>>0)/4294967296; }
export const ri=(a,b)=>a+Math.floor(R()*(b-a+1));
export const pick=a=>a[Math.floor(R()*a.length)];
export const chance=p=>R()*100<p;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const N0=(sd)=> (R()+R()+R()+R()-2)/2*sd*2; /* 近似常態 */
