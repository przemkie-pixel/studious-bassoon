export default async function handler(req,res){
 try{
  const symbol = req.query.symbol || "PKN.WA";
  const h = await yahoo(symbol);
  const result = backtest(h);
  res.status(200).json({ok:true,symbol,...result});
 }catch(e){
  res.status(500).json({ok:false,error:String(e.message||e)});
 }
}
async function yahoo(symbol){
 const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&includePrePost=false`;
 const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0 WIG20TerminalPRO/8","accept":"application/json"}});
 const j=await r.json();
 if(!r.ok||j.chart?.error) throw new Error(j.chart?.error?.description||"Yahoo error");
 const result=j.chart.result?.[0], q=result.indicators.quote?.[0], ts=result.timestamp||[], out=[];
 for(let i=0;i<ts.length;i++){
  const open=q.open?.[i], high=q.high?.[i], low=q.low?.[i], close=q.close?.[i], volume=q.volume?.[i]||0;
  if([open,high,low,close].every(Number.isFinite)) out.push({time:new Date(ts[i]*1000).toISOString().slice(0,10),open,high,low,close,volume});
 }
 return out;
}
function avg(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:NaN}function sma(v,n){return v.length>=n?avg(v.slice(-n)):NaN}
function ema(v,n){if(v.length<n)return NaN;let k=2/(n+1),e=avg(v.slice(0,n));for(let i=n;i<v.length;i++)e=v[i]*k+e*(1-k);return e}
function rsi(v,n=14){if(v.length<=n)return NaN;let g=0,l=0;for(let i=v.length-n;i<v.length;i++){const d=v[i]-v[i-1];d>=0?g+=d:l-=d}if(l===0)return 100;const rs=g/l;return 100-(100/(1+rs))}
function clamp(x){return Math.max(0,Math.min(100,Number.isFinite(x)?x:50))}
function score(closes){
 const last=closes.at(-1), ma20=sma(closes,20), ma50=sma(closes,50), ma200=sma(closes,200), R=rsi(closes);
 const e12=ema(closes,12), e26=ema(closes,26), macd=e12-e26;
 return clamp(.35*R + .35*(50+(last>ma20?10:-10)+(ma20>ma50?15:-15)+(ma50>ma200?15:-15)) + .30*(50+(macd||0)*30));
}
function backtest(h){
 const closes=h.map(x=>x.close);
 let inPos=false, entry=0, trades=0, wins=0, equity=1;
 for(let i=220;i<closes.length;i++){
  const s=score(closes.slice(0,i+1));
  const px=closes[i];
  if(!inPos && s>70){inPos=true; entry=px; trades++;}
  if(inPos && (s<48 || i===closes.length-1)){
    const ret=px/entry;
    equity*=ret;
    if(ret>1)wins++;
    inPos=false;
  }
 }
 const buyHoldReturn=(closes.at(-1)/closes[220]-1)*100;
 const strategyReturn=(equity-1)*100;
 return {trades, winRate:trades?wins/trades*100:0, strategyReturn, buyHoldReturn};
}
