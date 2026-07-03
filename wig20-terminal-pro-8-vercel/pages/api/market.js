const SYMBOLS=[
 ["PKN","PKN.WA","Orlen"],["KGH","KGH.WA","KGHM"],["PEO","PEO.WA","Bank Pekao"],["PZU","PZU.WA","PZU"],
 ["CDR","CDR.WA","CD Projekt"],["DNP","DNP.WA","Dino Polska"],["MBK","MBK.WA","mBank"],["LPP","LPP.WA","LPP"],
 ["PKO","PKO.WA","PKO BP"],["ALE","ALE.WA","Allegro"],["ALR","ALR.WA","Alior"],["BDX","BDX.WA","Budimex"],
 ["KRU","KRU.WA","Kruk"],["TPE","TPE.WA","Tauron"],["PGE","PGE.WA","PGE"],["SPL","SPL.WA","Santander BP"],
 ["OPL","OPL.WA","Orange Polska"],["PCO","PCO.WA","Pepco"],["KTY","KTY.WA","Grupa Kęty"],["ZAB","ZAB.WA","Żabka"]
];

export default async function handler(req,res){
 try{
  const rows=[]; let provider="yahoo-finance-vercel";
  for(const s of SYMBOLS){
   try{
    const h=await yahoo(s[1]);
    if(h.length>80) rows.push(analyze(s,h,false)); else throw new Error("empty");
   }catch(e){
    rows.push(analyze(s,demoCandles(s[0]),true));
    provider="mixed-yahoo-demo-fallback";
   }
  }
  res.status(200).json({ok:true,provider,rows,time:Date.now()});
 }catch(e){
  res.status(500).json({ok:false,error:String(e.message||e)});
 }
}

async function yahoo(symbol){
 const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&includePrePost=false&events=div%7Csplit`;
 const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0 WIG20TerminalPRO/8","accept":"application/json"}});
 const j=await r.json();
 if(!r.ok||j.chart?.error) throw new Error(j.chart?.error?.description||"Yahoo error");
 const result=j.chart.result?.[0]; if(!result) throw new Error("Yahoo empty");
 const q=result.indicators.quote?.[0], ts=result.timestamp||[], out=[];
 for(let i=0;i<ts.length;i++){
  const open=q.open?.[i], high=q.high?.[i], low=q.low?.[i], close=q.close?.[i], volume=q.volume?.[i]||0;
  if([open,high,low,close].every(Number.isFinite)){
   out.push({time:new Date(ts[i]*1000).toISOString().slice(0,10),open,high,low,close,volume});
  }
 }
 return out;
}
function demoCandles(seedText){let seed=[...seedText].reduce((a,c)=>a+c.charCodeAt(0),0);function rnd(){seed=(seed*9301+49297)%233280;return seed/233280}const out=[];let price=35+rnd()*180,start=new Date();start.setDate(start.getDate()-1900);for(let i=0;i<1700;i++){const d=new Date(start);d.setDate(start.getDate()+i);if(d.getDay()==0||d.getDay()==6)continue;const open=price,drift=.0003+(rnd()-.5)*.028;price=Math.max(2,price*(1+drift));const high=Math.max(open,price)*(1+rnd()*.019),low=Math.min(open,price)*(1-rnd()*.019);out.push({time:d.toISOString().slice(0,10),open,high,low,close:price,volume:Math.round(90000+rnd()*3000000)})}return out}
function avg(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:NaN}function sma(v,n){return v.length>=n?avg(v.slice(-n)):NaN}
function emaArr(v,n){let out=[],k=2/(n+1),e=null;for(let i=0;i<v.length;i++){if(i<n-1){out.push(NaN);continue}if(i===n-1)e=avg(v.slice(0,n));else e=v[i]*k+e*(1-k);out.push(e)}return out}
function rsi(v,n=14){if(v.length<=n)return NaN;let g=0,l=0;for(let i=v.length-n;i<v.length;i++){const d=v[i]-v[i-1];d>=0?g+=d:l-=d}if(l===0)return 100;const rs=g/l;return 100-(100/(1+rs))}
function macd(v){const e12=emaArr(v,12),e26=emaArr(v,26),m=[];for(let i=0;i<v.length;i++){const x=e12[i]-e26[i];if(isFinite(x))m.push(x)}const sig=emaArr(m,9);return{hist:m.at(-1)-sig.at(-1)}}
function atr(h,n=14){if(h.length<=n)return NaN;const tr=[];for(let i=1;i<h.length;i++)tr.push(Math.max(h[i].high-h[i].low,Math.abs(h[i].high-h[i-1].close),Math.abs(h[i].low-h[i-1].close)));return avg(tr.slice(-n))}
function pct(a,b){return isFinite(a)&&isFinite(b)&&b?((a/b)-1)*100:NaN}function ret(v,n){return v.length>n?pct(v.at(-1),v.at(-1-n)):NaN}function clamp(x){return Math.max(0,Math.min(100,Number.isFinite(x)?x:50))}
function pivots(h,last){const recent=h.slice(-100),hi=[...recent].sort((a,b)=>b.high-a.high).map(x=>x.high).filter(x=>x>last),lo=[...recent].sort((a,b)=>a.low-b.low).map(x=>x.low).filter(x=>x<last).reverse();return{res:[...new Set(hi.map(x=>+x.toFixed(2)))].slice(0,3),sup:[...new Set(lo.map(x=>+x.toFixed(2)))].slice(0,3)}}
function signal(last,A,score,mode){if(!isFinite(A)||A<=0)A=last*.025;const m=mode==="short"?.55:mode==="swing"?1.1:2.2;return{direction:score>=45?"WZROSTOWY":"SPADKOWY",confidence:clamp(score),entryLow:last-A*.15,entryHigh:last+A*.15,sl:last-A*m,tp1:last+A*m*1.35,tp2:last+A*m*2.25,tp3:last+A*m*3.4,rr:1.35}}
function analyze(s,h,isFallback){const closes=h.map(x=>x.close),lastBar=h.at(-1),prev=h.at(-2),last=lastBar.close;const ma20=sma(closes,20),ma50=sma(closes,50),ma200=sma(closes,200),R=rsi(closes),M=macd(closes),A=atr(h),day=pct(last,prev.close),change=last-prev.close;const e20=emaArr(closes,20).map((v,i)=>({time:h[i].time,value:v})).filter(x=>isFinite(x.value));const e50=emaArr(closes,50).map((v,i)=>({time:h[i].time,value:v})).filter(x=>isFinite(x.value));const e200=emaArr(closes,200).map((v,i)=>({time:h[i].time,value:v})).filter(x=>isFinite(x.value));const volAvg=avg(h.slice(-30).map(x=>x.volume||0)),volumeScore=clamp(volAvg?((lastBar.volume||0)/volAvg)*50:50);const trendScore=clamp(50+(last>ma20?12:-12)+(ma20>ma50?18:-18)+(ma50>ma200?20:-20));const macdScore=clamp(50+(M.hist||0)*40),rsiScore=clamp(R);const momentumScore=clamp(50+(ret(closes,5)||0)*3+(ret(closes,20)||0)*1.2+(M.hist>0?12:-8));const reversalScore=clamp(50+(R<35?25:0)+(last<ma20?8:-5)+(day>0?8:-4));const riskScore=clamp(80-(A/last*100*7)-(R>75?15:0)+(last>ma200?8:-10));const smartMoneyScore=clamp(50+(volumeScore-50)*.55+(last>ma20?10:-8)+(M.hist>0?8:-8));const breakoutScore=clamp(50+(last>(Math.max(...h.slice(-60).map(x=>x.high))*0.98)?20:-5)+(volumeScore>65?15:0)+(momentumScore-50)*.4);const aiScore=clamp(.18*rsiScore+.20*macdScore+.22*trendScore+.12*volumeScore+.12*momentumScore+.08*smartMoneyScore+.08*breakoutScore);const p=pivots(h,last),r1=ret(closes,252);return{t:s[0],apiSymbol:s[1],name:s[2],isFallback,last,open:lastBar.open,high:lastBar.high,low:lastBar.low,volume:lastBar.volume||0,change,day,atr:A,ma20,ma50,ma200,rsi:R,macdHist:M.hist,macdScore,rsiScore,trendScore,volumeScore,momentumScore,reversalScore,riskScore,smartMoneyScore,breakoutScore,aiScore,resistance:p.res.length?p.res:[last+A,last+2*A,last+3*A],support:p.sup.length?p.sup:[last-A,last-2*A,last-3*A],ema20:e20,ema50:e50,ema200:e200,candles:h,signals:{short:signal(last,A,clamp(aiScore+(day||0)*2),"short"),swing:signal(last,A,clamp(aiScore+ret(closes,5)),"swing"),long:signal(last,A,clamp(aiScore+(r1||0)*.15),"long")}}}
