import {S} from '../core/state.js?v=offline-0.31.0';
import {SEED} from '../core/rng.js?v=offline-0.31.0';
import {APP_VER, OFFICIAL_HOST} from '../config.js?v=offline-0.31.0';
import {TEAM_COLOR, LG_N} from '../data/teams.js?v=offline-0.31.0';
import {RP_TICKS} from '../data/economy.js?v=offline-0.31.0';
import {TRAIT_KEYS} from '../data/traits.js?v=offline-0.31.0';
import {teamChip} from './dom.js?v=offline-0.31.0';
import {traitNames, traitColorRank} from './traits.js?v=offline-0.31.0';
import {fmtMoney} from '../engine/contract.js?v=offline-0.31.0';
import {rpTagline, rpFamily, RP_F3, RP_F2, rpCumData, rpIntlData, rpHonorItems, rpOrgOf, rpProData} from './retire.js?v=offline-0.31.0';
/* 結算圖（Canvas 產生 PNG，可長按儲存或自動下載）
   Single-sheet settlement layout from the design handoff, drawn 1:1 at the
   design's 820px width. The layout is rendered twice: a measure pass on a
   throwaway canvas walks the full flow to learn the total height, then the
   real pass paints background, border, content and footer. */
export function shareImage(evals,picks,out){
  const isP=S.pos==='P';
  const tiers=(evals||[]).map(t=>String(t).replace(/<[^>]+>/g,''));
  const hist=S.log.slice(), amaLogs=hist.filter(r=>!r.st), proLogs=hist.filter(r=>r.st);
  const modes=S.pos==='TW'?[['P','投手'],['H','打者']]:[[S.pos==='P'?'P':'H','']];
  const cumSets=modes.map(([m,l])=>({label:l,data:rpCumData(m)})), honors=rpHonorItems();
  const proSets=proLogs.length?modes.map(([m,l])=>({label:l,data:rpProData(proLogs,m)})).filter(x=>x.data.blocks.length):[];
  const intlSets=S.intlCount>0?modes.map(([m,l])=>({label:l,data:rpIntlData(m)})).filter(x=>x.data.rows.length):[];
  const fans=(picks||[]).map(p=>'「'+p.replace(/{n}/g,S.name)+'」');
  const W=820,PADX=36,CW=W-PADX*2,scale=2;
  /* Canvas colors/fonts follow the active theme tokens (read from computed style) */
  const _css=getComputedStyle(document.body), _tk=(n,fb)=>((_css.getPropertyValue(n)||'').trim()||fb);
  const C_BG=_tk('--bg','#081510'), C_EDGE=_tk('--edge','#2b4d3a'), C_DIM=_tk('--dim','#93ab9c'),
        C_ACC=_tk('--accent','#ffc95c'), C_TX=_tk('--text','#ece7d6'), C_GOOD=_tk('--good','#8fd08f'),
        C_BAD=_tk('--bad','#e2695c'), C_INFO=_tk('--info','#7fb3d5'), C_P2=_tk('--panel2','#1a382a'),
        C_PANEL=_tk('--panel','#132920'), C_ROW=_tk('--row','#0d2115'), C_GOLD=_tk('--gold','#ffc95c'),
        C_BTNEDGE=_tk('--btnedge',C_EDGE);
  const F_SANS=_tk('--sans',"'Noto Sans TC',sans-serif"), F_MONO=_tk('--mono',"'IBM Plex Mono',monospace"),
        F_HEAD=_tk('--head',F_SANS);
  const GLOW=_tk('--glow','none')!=='none';
  const glowC=(_tk('--bgfx','none').match(/rgba?\([^)]*\)/)||[])[0]||null;
  const LGC={MLB:C_INFO,NPB:C_BAD,CPBL:C_ACC,MINOR:C_DIM};
  /* 特性(保留 + 刪除線標記；依顏色分類排序，避免同色特性東插一個西插一個) */
  const keepTr=[...TRAIT_KEYS.pos,...TRAIT_KEYS.neg].filter(k=>S.traits[k]).sort((a,b)=>traitColorRank(a)-traitColorRank(b)).flatMap(k=>
    traitNames(k).map(label=>({label,key:k,neg:TRAIT_KEYS.neg.includes(k)})));
  const remTr=(S.removed||[]).map(l=>({label:l,key:'',neg:false,rem:true}));
  function tagColor(o){ /* keep in sync with traitTagStyle() + the .tag defaults */
    if(o.rem)return {bg:'#242424',bd:'#4a4a4a',fg:'#8a8a8a'};
    if(o.key==='legend'||o.key==='taiwan'||o.key==='pitcherTC'||o.key==='hitterTC')return {bg:'#3a2c05',bd:'#ffc95c',fg:'#ffe08a'}; /* 金(歷史級/Team Taiwan/三冠王) */
    if(o.key==='goldcloth')return {bg:'#3a3505',bd:'#e8d43a',fg:'#fff35a'}; /* 黃 */
    if(o.key==='mrteam')return teamChip(TEAM_COLOR[S.mrTeamName]||'#ffc95c');
    if(o.key==='genius')return {bg:'#232733',bd:'#c8d0e0',fg:'#e8eef7'}; /* 銀 */
    if(o.neg)return {bg:'#2a0f0f',bd:'#c0392b',fg:'#ff8b7a'};             /* 紅 */
    return {bg:C_P2,bd:C_EDGE,fg:C_ACC};                                  /* 主題色 */
  }
  function rr(c,x,y,w,h,r){ c.beginPath();
    c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
  function drawBall(c,cx,cy,d){ /* stylized baseball, 24-box geometry scaled to d */
    const k=d/24, X=x=>cx-d/2+x*k, Y=y=>cy-d/2+y*k;
    c.save();
    c.beginPath(); c.arc(cx,cy,d/2-k*.5,0,Math.PI*2);
    c.fillStyle='#faf7ee'; c.fill();
    /* ring rides --text so the white face keeps its outline on light themes too */
    c.save(); c.globalAlpha=.55; c.lineWidth=Math.max(1,1.6*k); c.strokeStyle=C_TX; c.stroke(); c.restore();
    c.lineCap='round'; c.strokeStyle=C_BAD;
    c.lineWidth=1.5*k; c.beginPath();
    c.moveTo(X(7.6),Y(1.9)); c.quadraticCurveTo(X(2.6),Y(12),X(7.6),Y(22.1));
    c.moveTo(X(16.4),Y(1.9)); c.quadraticCurveTo(X(21.4),Y(12),X(16.4),Y(22.1)); c.stroke();
    c.lineWidth=1.1*k; c.beginPath();
    RP_TICKS.forEach(p=>{ c.moveTo(X(p[0]),Y(p[1])); c.lineTo(X(p[2]),Y(p[3]));
      c.moveTo(X(24-p[0]),Y(p[1])); c.lineTo(X(24-p[2]),Y(p[3])); });
    c.stroke(); c.restore(); }
  function wrap(c,t,font,maxW){ c.font=font; const out=[]; let cur='';
    for(const ch of String(t)){ if(c.measureText(cur+ch).width>maxW&&cur){ out.push(cur); cur=ch; } else cur+=ch; }
    if(cur)out.push(cur); return out; }
  function render(c){
    let y=32;
    const ls=v=>{ try{c.letterSpacing=v;}catch(e){} };
    /* All text is anchored on the alphabetic baseline: 'top'/'middle' derive from the
       font bounding box, which Safari and Chrome compute differently, so device renders
       drifted vertically. mid() centers a string on cy using its measured ink box. */
    c.textBaseline='alphabetic'; c.textAlign='left'; c.lineJoin='round';
    const mid=(t,x,cy)=>{ const m=c.measureText(t), a=m.actualBoundingBoxAscent, d=m.actualBoundingBoxDescent;
      c.fillText(t,x,cy+((a!=null?a:8)-(d!=null?d:0))/2); };
    /* ---- 刊頭 lockup (main text, sub and ball share one baseline) ---- */
    const wmBase=y+25;
    c.font='900 32px '+F_HEAD; c.fillStyle=C_TX; ls('1.3px');
    const w1=c.measureText('YaKy').width;
    c.fillText('YaKy',PADX,wmBase);
    drawBall(c,PADX+w1+11.5,wmBase-9,21);
    c.fillText('Life',PADX+w1+23,wmBase);
    const wmW=w1+23+c.measureText('Life').width;
    ls('0px');
    c.font='13px '+F_SANS; c.fillStyle=C_DIM; ls('3.6px');
    c.fillText('棒球人生模擬器',PADX+wmW+12,wmBase); ls('0px');
    /* 引退紀念鋼印章 */
    c.font='700 12px '+F_SANS; ls('3.6px');
    const stT='引退紀念', stW=c.measureText(stT).width+21, stH=27, stX=W-PADX-stW;
    if(GLOW){ c.save(); c.shadowColor=C_ACC; c.shadowBlur=12; }
    c.strokeStyle=C_ACC; c.lineWidth=1.5; rr(c,stX,y,stW,stH,3); c.stroke();
    if(GLOW)c.restore();
    c.fillStyle=C_ACC; mid(stT,stX+13,y+stH/2); ls('0px');
    y+=54;
    /* ---- 球員名＋背號牌 (badge digits sit on the name baseline) ---- */
    const nameBase=y+35;
    c.font='900 44px '+F_HEAD; c.fillStyle=C_ACC;
    const wN=c.measureText(S.name).width;
    c.fillText(S.name,PADX,nameBase);
    c.font='700 31px '+F_MONO;
    const jT='#'+S.jersey, jW=c.measureText(jT).width+18, bCy=nameBase-11;
    c.fillStyle=C_ACC; rr(c,PADX+wN+12,bCy-19,jW,38,5); c.fill();
    c.fillStyle=C_BG; mid(jT,PADX+wN+21,bCy);
    y+=52;
    /* ---- 副標 ---- */
    c.font='15px '+F_SANS; c.fillStyle=C_TX; mid(rpTagline(),PADX,y+11); y+=27;
    /* ---- 特質標籤＋家庭＋總薪資 ---- */
    const salW=210, leftW=CW-salW-20;
    if(keepTr.length||remTr.length){
      let tx=PADX; c.font='700 13px '+F_SANS;
      keepTr.concat(remTr).forEach(o=>{ const col=tagColor(o), w=c.measureText(o.label).width+20;
        if(tx>PADX&&tx+w>PADX+leftW){ tx=PADX; y+=32; }
        c.fillStyle=col.bg; rr(c,tx,y,w,24,3); c.fill();
        c.strokeStyle=col.bd; c.lineWidth=1; rr(c,tx,y,w,24,3); c.stroke();
        c.fillStyle=col.fg; mid(o.label,tx+10,y+12);
        if(o.rem){ c.strokeStyle='#8a8a8a'; c.beginPath(); c.moveTo(tx+6,y+12); c.lineTo(tx+w-6,y+12); c.stroke(); }
        tx+=w+8; });
      y+=34;
    }
    const famLines=wrap(c,rpFamily(),'12.5px '+F_SANS,leftW);
    c.font='12.5px '+F_SANS; c.fillStyle=C_DIM;
    famLines.forEach(l=>{ mid(l,PADX,y+9); y+=19; });
    { /* 生涯總薪資(右下,金額與「台幣」共用基線,與家庭行底對齊) */
      const salBase=y-6;
      c.textAlign='right';
      c.font='12px '+F_SANS; c.fillStyle=C_DIM;
      const uW=c.measureText('台幣').width;
      c.fillText('台幣',W-PADX,salBase);
      c.fillText('生涯總薪資',W-PADX,salBase-30);
      c.font='700 24px '+F_MONO; c.fillStyle=C_ACC;
      if(GLOW){ c.save(); c.shadowColor=C_ACC; c.shadowBlur=10; }
      c.fillText(fmtMoney(Math.round(S.salary)),W-PADX-uW-6,salBase);
      if(GLOW)c.restore();
      c.textAlign='left';
    }
    /* ---- 生涯評價 ---- */
    if(tiers.length){
      y+=18; c.strokeStyle=C_EDGE; c.lineWidth=1;
      c.beginPath(); c.moveTo(PADX,y+.5); c.lineTo(W-PADX,y+.5); c.stroke();
      y+=16;
    }
    const sec=(t,inline)=>{ if(!inline)y+=24;
      drawBall(c,PADX+6,y+6,12);
      c.font='700 12px '+F_SANS; c.fillStyle=C_DIM; ls('3px');
      const tw=c.measureText(t).width;
      mid(t,PADX+20,y+6); ls('0px');
      c.strokeStyle=C_EDGE; c.lineWidth=1; c.beginPath();
      c.moveTo(PADX+20+tw+8,y+6.5); c.lineTo(W-PADX,y+6.5); c.stroke();
      y+=22; };
    if(tiers.length){
      sec('生涯評價',true);
      tiers.forEach(t=>{ drawBall(c,PADX+8.5,y+11,17);
        c.font='700 16px '+F_SANS; c.fillStyle=C_ACC; mid(t,PADX+26,y+11); y+=24; });
    }
    /* ---- 表格繪製共用 ---- */
    function tcols(defs){ const tot=defs.reduce((a,d)=>a+d.w,0); let x=PADX;
      return defs.map(d=>{ const w=d.w/tot*CW, o={t:d.t,a:d.a,zh:d.zh,x,w}; x+=w; return o; }); }
    function thRow(cols){
      cols.forEach(cc=>{ c.font='500 12px '+(cc.zh?F_SANS:F_MONO); c.fillStyle=C_DIM;
        c.textAlign=cc.a==='l'?'left':'right';
        mid(cc.t,cc.a==='l'?cc.x+7:cc.x+cc.w-7,y+9); });
      c.textAlign='left'; y+=22;
      c.strokeStyle=C_EDGE; c.lineWidth=1; c.beginPath(); c.moveTo(PADX,y-.5); c.lineTo(W-PADX,y-.5); c.stroke(); }
    function tdRow(cols,cells,opt){
      opt=opt||{}; const rh=opt.rh||25, fs=opt.fs||12.5;
      if(opt.bg){ c.fillStyle=opt.bg; c.fillRect(PADX,y,CW,rh); }
      if(opt.topline){ c.strokeStyle=C_EDGE; c.lineWidth=1; c.beginPath(); c.moveTo(PADX,y+.5); c.lineTo(W-PADX,y+.5); c.stroke(); }
      if(opt.bar){ c.fillStyle=opt.bar; c.fillRect(PADX,y,3,rh); }
      const cyR=y+rh/2;
      cells.forEach((cell,i)=>{ if(cell==null)return; const cc=cols[i];
        const o=(cell&&typeof cell==='object')?cell:{t:cell};
        if(o.badge!==undefined){ /* 國際賽結果膠囊 badge */
          c.font='700 11.5px '+F_SANS;
          const bw=c.measureText(String(o.t)).width+16, bx=cc.x+7, bh=19, byy=y+(rh-bh)/2;
          let fg=C_DIM, bd=C_BTNEDGE;
          if(o.badge==='gold'){ fg=C_GOLD; bd=C_GOLD;
            c.save(); c.globalAlpha=.12; c.fillStyle=C_GOLD; rr(c,bx,byy,bw,bh,3); c.fill(); c.restore(); }
          else if(o.badge==='silver'){ fg='#e8eef7'; bd='#c8d0e0';
            c.fillStyle='#232733'; rr(c,bx,byy,bw,bh,3); c.fill(); }
          c.strokeStyle=bd; c.lineWidth=1; rr(c,bx,byy,bw,bh,3); c.stroke();
          c.fillStyle=fg; mid(String(o.t),bx+8,cyR); return; }
        c.font=(o.best||o.bold||opt.bold?'700 ':'')+fs+'px '+((cc.zh||o.zh)?F_SANS:F_MONO);
        c.fillStyle=o.best?C_ACC:(o.color||opt.color||C_TX);
        c.textAlign=cc.a==='l'?'left':'right';
        let t=String(o.t); const maxw=cc.w-12;
        while(c.measureText(t).width>maxw&&t.length>1)t=t.slice(0,-1);
        mid(t,cc.a==='l'?cc.x+7:cc.x+cc.w-7,cyR); });
      c.textAlign='left'; y+=rh; }
    /* ---- 生涯累積數據 ---- */
    sec('生涯累積數據');
    let anyCum=false;
    cumSets.forEach(({label,data:cum})=>{if(cum.rows.length){anyCum=true;if(label){c.font='700 13px '+F_SANS;c.fillStyle=C_ACC;mid(label+'累積',PADX+7,y+8);y+=22;}
      const wide={IP:1,ERA:1,WHIP:1,AVG:1,OBP:1,SLG:1,OPS:1};
      const cols=tcols([{t:'League',w:84,a:'l'}].concat(cum.hd.map(t=>({t,w:wide[t]?58:46,a:'r'}))));
      thRow(cols);
      cum.rows.forEach((r,i)=>{ tdRow(cols,
        [{t:r.label||LG_N[r.b],zh:true,bold:true}].concat(r.txt.map((t,j)=>({t,best:r.best[j]}))),
        {bg:i%2?C_ROW:null,bar:LGC[r.b]}); });}});
    if(!anyCum){ c.font='13px '+F_SANS; c.fillStyle=C_DIM; mid('（無職業層級出賽紀錄）',PADX,y+9); y+=22; }
    /* ---- 國際賽逐屆成績 ---- */
    intlSets.forEach(({label,data:intl})=>{
      sec('國際賽'+(label?label:'')+'逐屆成績（中華隊 '+S.intlCount+' 屆）');
      const cols=tcols([{t:'年度',w:56,a:'l'},{t:'賽事',w:140,a:'l',zh:true},{t:'結果',w:96,a:'l',zh:true}]
        .concat(intl.hd.map(t=>({t,w:56,a:'r'}))));
      thRow(cols);
      intl.rows.forEach((r,i)=>{ tdRow(cols,
        [r.year,{t:r.name,zh:true},{t:r.rank,badge:/冠軍/.test(r.rank)?'gold':/亞軍/.test(r.rank)?'silver':''}]
          .concat(r.txt),{bg:i%2?C_ROW:null,rh:28}); });
      tdRow(cols,[{t:'通算',zh:true,bold:true,color:C_GOOD},null,null].concat(intl.tot.map(t=>({t,bold:true}))),
        {bg:C_PANEL,topline:true,rh:28});
    });
    /* ---- 生涯榮譽(雙欄條列,直向優先) ---- */
    sec('生涯榮譽（'+honors.length+' 項）');
    if(honors.length){
      const colW=(CW-28)/2, rows2=Math.ceil(honors.length/2), lh=22, fs=13.5;
      const drawItem=(parts,x,yy)=>{ let cx=x;
        const put=(txt,acc)=>{ c.font=(acc?'700 ':'')+fs+'px '+F_SANS; c.fillStyle=acc?C_ACC:C_GOOD;
          for(const ch of txt){ const w=c.measureText(ch).width;
            if(cx+w>x+colW&&cx>x){ yy+=lh; cx=x+12; }
            c.fillText(ch,cx,yy+16); cx+=w; } };
        parts.forEach((p,i)=>put((i?'':'· ')+p[0],p[1]));
        return yy+lh; };
      let yl=y, yr=y;
      honors.forEach((p,i)=>{ if(i<rows2)yl=drawItem(p,PADX,yl); else yr=drawItem(p,PADX+colW+28,yr); });
      y=Math.max(yl,yr);
    } else { c.font='13px '+F_SANS; c.fillStyle=C_DIM; mid('（生涯未獲得任何獎項或里程碑）',PADX,y+9); y+=22; }
    /* ---- 生涯年表(業餘) ---- */
    if(amaLogs.length){
      sec('生涯年表（業餘成績）');
      const cols=tcols([{t:'年',w:50,a:'l'},{t:'齡',w:38,a:'r'},{t:'球隊',w:110,a:'l',zh:true},{t:'成績',w:550,a:'l',zh:true}]);
      thRow(cols);
      amaLogs.forEach((r,i)=>{ tdRow(cols,
        [r.y,r.age,{t:r.tm,zh:true},{t:r.line,zh:true,color:r.inj?null:C_DIM}],
        {bg:i%2?C_ROW:null,rh:21,fs:12,color:r.inj?C_BAD:null,bold:r.inj}); });
    }
    /* ---- 生涯年表(職業,按球隊分段) ---- */
    proSets.forEach(({label,data:pro})=>{
      sec('生涯年表（職業'+(label?label:'')+'成績）');
      const pFlag=label?label==='投手':isP;
      const defs=pFlag
        ?[{t:'年',w:48,a:'l'},{t:'齡',w:34,a:'r'},{t:'球隊',w:96,a:'l',zh:true},{t:'G',w:40,a:'r'},{t:'IP',w:54,a:'r'},{t:'W-L',w:50,a:'r'},{t:'SV',w:42,a:'r'},{t:'HLD',w:46,a:'r'},{t:'SO',w:44,a:'r'},{t:'BB',w:42,a:'r'},{t:'ERA',w:52,a:'r'},{t:'WHIP',w:54,a:'r'}]
        :[{t:'年',w:48,a:'l'},{t:'齡',w:34,a:'r'},{t:'球隊',w:84,a:'l',zh:true},{t:'G',w:38,a:'r'},{t:'PA',w:44,a:'r'},{t:'AVG',w:50,a:'r'},{t:'OBP',w:50,a:'r'},{t:'SLG',w:50,a:'r'},{t:'OPS',w:50,a:'r'},{t:'H',w:38,a:'r'},{t:'HR',w:38,a:'r'},{t:'RBI',w:42,a:'r'},{t:'SB',w:36,a:'r'},{t:'DEF',w:42,a:'r'}];
      const cols=tcols(defs); thRow(cols);
      pro.blocks.forEach(b=>{
        y+=6; c.font='700 11px '+F_SANS; c.fillStyle=LGC[b.lg]||C_DIM; ls('2.2px');
        mid((LG_N[b.lg]||'')+' · '+b.team,PADX+7,y+6); ls('0px'); y+=19;
        b.rows.forEach((r,i)=>{ tdRow(cols,
          [r.y,r.age,{t:r.lvl,zh:true,color:r.inj?null:(r.minor?C_DIM:null)}]
            .concat(r.txt.map((t,j)=>({t,best:r.best[j]}))),
          {bg:i%2?C_ROW:null,rh:21,fs:12,color:r.inj?C_BAD:null,bold:r.inj}); });
      });
    });
    /* ---- 球迷看板・引退串 ---- */
    if(fans.length){
      sec('球迷看板 · 引退串');
      fans.forEach(t=>{ const lines=wrap(c,t,'13px '+F_SANS,CW-14), top=y;
        c.font='13px '+F_SANS; c.fillStyle=C_TX;
        lines.forEach(l=>{ c.fillText(l,PADX+14,y+15); y+=21; });
        c.fillStyle=C_EDGE; c.fillRect(PADX,top+2,2,y-top-6);
        y+=8; });
    }
    return y;
  }
  /* measure pass on a throwaway canvas, then paint for real */
  const mc=document.createElement('canvas'); mc.width=8; mc.height=8;
  const yEnd=render(mc.getContext('2d'));
  const H=yEnd+26+44;
  const cv=document.createElement('canvas');
  cv.width=W*scale; cv.height=H*scale;
  const c=cv.getContext('2d'); c.scale(scale,scale);
  c.fillStyle=C_BG; c.fillRect(0,0,W,H);
  if(glowC){ /* 頂部 radial 光暈(以主題 --bgfx 的顏色近似橢圓) */
    c.save(); c.translate(W/2,-30); c.scale(1,.35);
    const g=c.createRadialGradient(0,0,0,0,0,W*.72);
    g.addColorStop(0,glowC); g.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=g; c.fillRect(-W/2,0,W,W); c.restore(); }
  c.strokeStyle=C_EDGE; c.lineWidth=1; rr(c,.5,.5,W-1,H-1,10); c.stroke();
  const fy=render(c)+26;
  /* ---- 三欄頁尾 ---- */
  c.strokeStyle=C_EDGE; c.lineWidth=1; c.beginPath(); c.moveTo(PADX,fy+.5); c.lineTo(W-PADX,fy+.5); c.stroke();
  c.font='12px '+F_MONO; c.textBaseline='alphabetic';
  c.fillStyle=C_DIM; c.textAlign='left'; c.fillText('seed: '+SEED,PADX,fy+23.5);
  c.textAlign='right'; c.fillText(APP_VER,W-PADX,fy+23.5);
  c.fillStyle=C_ACC; c.textAlign='center'; c.fillText(OFFICIAL_HOST,W/2,fy+23.5);
  c.textAlign='left';
  const url=cv.toDataURL('image/png');
  const fileName='棒球生涯結算_'+S.name+'.png';
  out.innerHTML=`<img src="${url}" style="width:100%;border-radius:8px" alt="結算圖">
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn main" id="sh-save" style="flex:1">💾 儲存 / 分享圖片</button>
      <button class="btn" id="sh-dl" style="flex:1">下載到裝置</button>
    </div>
    <div class="statline" style="margin-top:6px">若按鈕無效，長按上方圖片也可儲存</div>`;
  /* 下載連結(桌機/備援) */
  out.querySelector('#sh-dl').onclick=()=>{ const a=document.createElement('a'); a.href=url; a.download=fileName;
    document.body.appendChild(a); a.click(); a.remove(); };
  /* 分享:優先 Web Share(可存相簿),不支援則退回下載 */
  out.querySelector('#sh-save').onclick=async ()=>{
    try{
      const blob=await (await fetch(url)).blob();
      const file=new File([blob],fileName,{type:'image/png'});
      if(navigator.canShare&&navigator.canShare({files:[file]})){
        await navigator.share({files:[file],title:'棒球生涯結算',text:S.name+' 的棒球人生'});
        return;
      }
    }catch(e){ if(e&&e.name==='AbortError')return; /* 使用者取消,不用退回 */ }
    /* 不支援 Web Share → 退回下載 */
    const a=document.createElement('a'); a.href=url; a.download=fileName;
    document.body.appendChild(a); a.click(); a.remove();
  };
}
