import { useEffect, useMemo, useRef, useState } from "react";
import { createChart } from "lightweight-charts";
import { Bell, Brain, Calculator, Newspaper, RefreshCw, Search, Zap } from "lucide-react";

const PERIODS = { "1M":22, "3M":66, "6M":132, "1Y":260, "3Y":780, "5Y":1300, "ALL":99999 };

function fmt(n,d=2){ n=Number(n); return Number.isFinite(n)?n.toLocaleString("pl-PL",{minimumFractionDigits:d,maximumFractionDigits:d}):"—"; }
function cls(n){ return Number(n)>=0 ? "up" : "down"; }
function label(score){
  if(score>=82) return ["MOCNE WEJŚCIE","strong"];
  if(score>=66) return ["WEJŚCIE","buy"];
  if(score>=54) return ["OBSERWUJ","watch"];
  if(score>=42) return ["NEUTRAL","neutral"];
  return ["ODPUŚĆ","avoid"];
}

export default function Home(){
  const [data,setData] = useState({rows:[], provider:""});
  const [selected,setSelected] = useState("PKN");
  const [range,setRange] = useState("1Y");
  const [signal,setSignal] = useState("short");
  const [query,setQuery] = useState("");
  const [news,setNews] = useState([]);
  const [alerts,setAlerts] = useState([]);
  const [log,setLog] = useState([]);
  const [portfolio,setPortfolio] = useState([]);
  const [tradeQty,setTradeQty] = useState("10");
  const [tradePrice,setTradePrice] = useState("");
  const [backtest,setBacktest] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");

  const rows = data.rows || [];
  const active = rows.find(r=>r.t===selected) || rows[0];

  async function load(){
    setLoading(true);
    setError("");
    try{
      const res = await fetch("/api/market?ts="+Date.now(), {cache:"no-store"});
      const json = await res.json();
      if(!res.ok || json.error) throw new Error(json.error || "Błąd API");
      setData(json);
      localStorage.setItem("wig8_cache", JSON.stringify({time:Date.now(), data:json}));
      if(json.rows?.length && !json.rows.find(r=>r.t===selected)) setSelected(json.rows[0].t);
    }catch(e){
      const cached = localStorage.getItem("wig8_cache");
      if(cached){
        const c = JSON.parse(cached);
        setData(c.data);
        setError("Pokazuję cache. Błąd świeżych danych: " + e.message);
      } else setError(e.message);
    }finally{
      setLoading(false);
    }
  }

  async function loadNews(row){
    if(!row) return;
    try{
      const res = await fetch("/api/news?q="+encodeURIComponent(row.name+" "+row.t));
      const json = await res.json();
      setNews(json.items || []);
    }catch(e){ setNews([]); }
  }

  async function runBacktest(){
    if(!active) return;
    setBacktest({loading:true});
    try{
      const res = await fetch("/api/backtest?symbol="+encodeURIComponent(active.apiSymbol)+"&name="+encodeURIComponent(active.t));
      const json = await res.json();
      if(!res.ok || json.error) throw new Error(json.error || "Błąd backtestu");
      setBacktest(json);
    }catch(e){
      setBacktest({error:e.message});
    }
  }

  useEffect(()=>{ 
    setPortfolio(JSON.parse(localStorage.getItem("wig8_portfolio")||"[]"));
    setAlerts(JSON.parse(localStorage.getItem("wig8_alerts")||"[]"));
    setLog(JSON.parse(localStorage.getItem("wig8_log")||"[]"));
    load(); 
  },[]);

  useEffect(()=>{ if(active){ loadNews(active); setTradePrice(String(active.last?.toFixed?.(2)||"")); } },[selected, data.time]);

  useEffect(()=>{
    const q=query.trim().toUpperCase();
    if(!q) return;
    const found = rows.find(r=>r.t.includes(q) || r.name.toUpperCase().includes(q));
    if(found) setSelected(found.t);
  },[query]);

  function savePortfolio(next){ setPortfolio(next); localStorage.setItem("wig8_portfolio", JSON.stringify(next)); }
  function saveAlerts(next){ setAlerts(next); localStorage.setItem("wig8_alerts", JSON.stringify(next)); }
  function addLog(msg){
    const item = {time:new Date().toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"}), msg};
    const next = [item,...log].slice(0,30);
    setLog(next);
    localStorage.setItem("wig8_log", JSON.stringify(next));
  }

  function enableNotifications(){
    if(!("Notification" in window)){ alert("Twoja przeglądarka nie obsługuje powiadomień."); return; }
    Notification.requestPermission().then(p=>{
      if(p==="granted"){
        new Notification("WIG20 Terminal PRO", {body:"Powiadomienia włączone"});
        addLog("Powiadomienia włączone");
      }
    });
  }

  function addAlert(type){
    if(!active) return;
    const value = type==="priceAbove" ? +(active.last*1.02).toFixed(2) :
                  type==="priceBelow" ? +(active.last*0.98).toFixed(2) :
                  type==="aiAbove" ? 70 : 66;
    const next = [{id:Date.now(),t:active.t,type,value},...alerts].slice(0,40);
    saveAlerts(next);
    addLog(`Dodano alert ${active.t}: ${type} ${value}`);
  }

  function buy(){
    if(!active) return;
    const qty = Number(tradeQty), price = Number(tradePrice);
    if(!qty || !price) return;
    const next = [{id:Date.now(), t:active.t, name:active.name, qty, price, date:new Date().toISOString().slice(0,10)}, ...portfolio];
    savePortfolio(next);
    addLog(`Dodano do portfolio: ${active.t}, ${qty} szt. po ${price}`);
  }

  const filtered = useMemo(()=>{
    const q=query.trim().toUpperCase();
    if(!q) return rows;
    return rows.filter(r=>r.t.includes(q) || r.name.toUpperCase().includes(q));
  },[rows,query]);

  const scanner = useMemo(()=>({
    ai:[...rows].sort((a,b)=>b.aiScore-a.aiScore).slice(0,10),
    breakout:[...rows].sort((a,b)=>b.breakoutScore-a.breakoutScore).slice(0,10),
    momentum:[...rows].sort((a,b)=>b.momentumScore-a.momentumScore).slice(0,10),
    smart:[...rows].sort((a,b)=>b.smartMoneyScore-a.smartMoneyScore).slice(0,10),
    reversal:[...rows].sort((a,b)=>b.reversalScore-a.reversalScore).slice(0,10),
    risk:[...rows].sort((a,b)=>b.riskScore-a.riskScore).slice(0,10)
  }),[rows]);

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brandIcon">〽</div><div><b>WIG20 Terminal</b><span>PRO 8.0</span></div></div>

      <Panel title="Obserwowane">
        <div className="watchList">
          {filtered.map(r=><button key={r.t} onClick={()=>setSelected(r.t)} className={"watchItem "+(active?.t===r.t?"active":"")}>
            <div><b>{r.t}</b><small>{r.name}</small></div>
            <div className="mono right"><span>{fmt(r.last)}</span><small className={cls(r.day)}>{r.day>=0?"+":""}{fmt(r.day)}%</small></div>
          </button>)}
        </div>
      </Panel>

      <Panel title="AI Scanner">
        <MiniScanner rows={scanner.ai} pick={setSelected}/>
      </Panel>

      <Panel title="Alerty">
        <div className="pad">
          <button className="wide" onClick={enableNotifications}><Bell size={15}/> Włącz powiadomienia</button>
          <button className="wide" onClick={()=>addAlert("signalBuy")}><Zap size={15}/> Alert wejścia dla {active?.t}</button>
        </div>
      </Panel>
    </aside>

    <main className="main">
      <header className="topbar">
        <div className="search"><Search size={18}/><input placeholder="Szukaj spółki / tickera..." value={query} onChange={e=>setQuery(e.target.value)}/></div>
        <select className="mobileSelect" value={selected} onChange={e=>setSelected(e.target.value)}>
          {rows.map(r=><option key={r.t} value={r.t}>{r.t} · {r.name}</option>)}
        </select>
        <div className="topActions"><span className="source"><i/> {data.provider || "backend"}</span><button onClick={load}><RefreshCw size={16}/> Odśwież</button><button onClick={enableNotifications}><Bell size={16}/></button></div>
      </header>

      {error && <div className="error">{error}<br/>Test backendu: <code>/api/market</code></div>}
      {loading && <div className="loading">Ładowanie danych...</div>}

      {active && <>
        <section className="hero">
          <div>
            <div className="symbolRow"><h1>{active.t} {active.name}</h1><span className="tag">{active.apiSymbol}</span></div>
            <p>Vercel API · AI scoring · news sentiment · scanner · portfolio · backtest</p>
            <div><span className="price mono">{fmt(active.last)}</span> PLN <span className={cls(active.day)}>{active.day>=0?"+":""}{fmt(active.change)} ({active.day>=0?"+":""}{fmt(active.day)}%)</span></div>
          </div>
          <div className="metrics">
            <Metric k="Open" v={fmt(active.open)}/>
            <Metric k="High" v={fmt(active.high)}/>
            <Metric k="Low" v={fmt(active.low)}/>
            <Metric k="Volume" v={fmt(active.volume,0)}/>
            <Metric k="ATR" v={fmt(active.atr)}/>
          </div>
        </section>

        <section className="tabs">{Object.keys(PERIODS).map(x=><button key={x} onClick={()=>setRange(x)} className={range===x?"active":""}>{x}</button>)}</section>
        <Chart row={active} range={range}/>

        <section className="dashboard">
          <Panel title="Wskaźniki"><Gauges row={active}/></Panel>
          <Panel title="Skaner pełny"><Scanner scanner={scanner} pick={setSelected}/></Panel>
          <Panel title="Poziomy / Risk"><Levels row={active}/></Panel>
        </section>

        <section className="dashboard second">
          <Panel title="AI komentarz"><AIComment row={active} news={news}/></Panel>
          <Panel title="Newsy"><News items={news}/></Panel>
          <Panel title="Portfolio"><Portfolio active={active} portfolio={portfolio} setPortfolio={savePortfolio} buy={buy} qty={tradeQty} setQty={setTradeQty} price={tradePrice} setPrice={setTradePrice}/></Panel>
        </section>

        <section className="dashboard second">
          <Panel title="Backtest"><Backtest data={backtest} run={runBacktest}/></Panel>
          <Panel title="Alerty"><AlertLog alerts={alerts} setAlerts={saveAlerts}/></Panel>
          <Panel title="Log"><Log log={log}/></Panel>
        </section>
      </>}
    </main>

    <aside className="rightbar">
      {active && <>
        <Panel title="AI Score"><AIScore row={active}/></Panel>
        <Panel title="Sygnały">
          <div className="signalTabs">{[["short","12H"],["swing","Kilka dni"],["long","Lata"]].map(([k,v])=><button key={k} className={signal===k?"active":""} onClick={()=>setSignal(k)}>{v}</button>)}</div>
          <Signal row={active} kind={signal}/>
          <div className="signalButtons"><button onClick={()=>addAlert("priceAbove")}>Cena +2%</button><button onClick={()=>addAlert("priceBelow")}>Cena -2%</button><button onClick={()=>addAlert("aiAbove")}>AI &gt; 70</button></div>
        </Panel>
      </>}
    </aside>
  </div>;
}

function Panel({title,children}){ return <section className="panel"><h2>{title}</h2>{children}</section>; }
function Metric({k,v}){ return <div className="metric"><small>{k}</small><b className="mono">{v}</b></div>; }

function MiniScanner({rows,pick}){
  return <div className="miniScanner">{rows.slice(0,6).map(r=>{const [t,k]=label(r.aiScore);return <button key={r.t} onClick={()=>pick(r.t)}><span>{r.t}</span><b className={k}>{fmt(r.aiScore,0)}</b></button>})}</div>;
}

function Scanner({scanner,pick}){
  const groups = [["AI wejście",scanner.ai,"aiScore"],["Breakout",scanner.breakout,"breakoutScore"],["Momentum",scanner.momentum,"momentumScore"],["Smart Money",scanner.smart,"smartMoneyScore"],["Odbicie",scanner.reversal,"reversalScore"],["Niskie ryzyko",scanner.risk,"riskScore"]];
  return <div className="scannerGrid">{groups.map(([name,rows,key])=><div key={name}><h4>{name}</h4>{rows.slice(0,4).map(r=><button key={r.t} onClick={()=>pick(r.t)}><span>{r.t}</span><b>{fmt(r[key],0)}</b></button>)}</div>)}</div>;
}

function Chart({row,range}){
  const ref = useRef(null);
  useEffect(()=>{
    if(!ref.current || !row?.candles?.length) return;
    ref.current.innerHTML="";
    const chart = createChart(ref.current,{height:540,layout:{background:{color:"#06101b"},textColor:"#91a0b6"},grid:{vertLines:{color:"#122033"},horzLines:{color:"#122033"}},rightPriceScale:{borderColor:"#203048"},timeScale:{borderColor:"#203048"},crosshair:{mode:1}});
    const days = PERIODS[range] || 260;
    const candles = row.candles.slice(-days);
    const times = new Set(candles.map(c=>c.time));
    chart.addCandlestickSeries({upColor:"#20c77a",downColor:"#ff5964",borderUpColor:"#20c77a",borderDownColor:"#ff5964",wickUpColor:"#20c77a",wickDownColor:"#ff5964"}).setData(candles);
    chart.addHistogramSeries({priceFormat:{type:"volume"},priceScaleId:"vol",scaleMargins:{top:.82,bottom:0}}).setData(candles.map(x=>({time:x.time,value:x.volume,color:x.close>=x.open?"rgba(32,199,122,.35)":"rgba(255,89,100,.35)"})));
    chart.addLineSeries({color:"#2997ff",lineWidth:1}).setData(row.ema20.filter(x=>times.has(x.time)));
    chart.addLineSeries({color:"#ff9f1a",lineWidth:1}).setData(row.ema50.filter(x=>times.has(x.time)));
    chart.addLineSeries({color:"#a66cff",lineWidth:1}).setData(row.ema200.filter(x=>times.has(x.time)));
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(()=>chart.applyOptions({width:ref.current.clientWidth}));
    ro.observe(ref.current);
    return ()=>ro.disconnect();
  },[row,range]);
  return <section className="chartShell"><div className="legend"><span>EMA20 <b className="blue">{fmt(row.ma20)}</b></span><span>EMA50 <b className="orange">{fmt(row.ma50)}</b></span><span>EMA200 <b className="purple">{fmt(row.ma200)}</b></span><span>RSI <b>{fmt(row.rsi,1)}</b></span><span>MACD <b className={cls(row.macdHist)}>{fmt(row.macdHist,2)}</b></span></div><div className="chart" ref={ref}/></section>;
}

function Gauges({row}){
  const arr=[["AI",row.aiScore],["RSI",row.rsi],["MACD",row.macdScore],["Trend",row.trendScore],["Momentum",row.momentumScore],["Volume",row.volumeScore],["Smart",row.smartMoneyScore],["Breakout",row.breakoutScore],["Risk",row.riskScore]];
  return <div className="gauges">{arr.map(([n,v])=><div key={n} className="gauge"><div className="circle" style={{"--p":Math.max(0,Math.min(100,v))}}><span>{fmt(v,0)}</span></div><small>{n}</small></div>)}</div>;
}

function Levels({row}){
  const arr=[["OPÓR 1",row.resistance?.[0],"down"],["OPÓR 2",row.resistance?.[1],"down"],["OPÓR 3",row.resistance?.[2],"down"],["WSPARCIE 1",row.support?.[0],"up"],["WSPARCIE 2",row.support?.[1],"up"],["WSPARCIE 3",row.support?.[2],"up"]];
  return <div className="levels">{arr.map(([k,v,c])=><div key={k}><span>{k}</span><b className={c}>{fmt(v)}</b></div>)}</div>;
}

function AIScore({row}){
  const [txt,kind]=label(row.aiScore);
  return <div className="aiBox"><div className="bigCircle" style={{"--p":row.aiScore}}><div><b>{fmt(row.aiScore,0)}</b><small>/100</small><em className={kind}>{txt}</em></div></div>
    <Check ok={row.ma20>row.ma50&&row.ma50>row.ma200} text="Trend EMA wzrostowy"/>
    <Check ok={row.rsi>50} text="RSI powyżej 50"/>
    <Check ok={row.macdHist>0} text="MACD dodatni"/>
    <Check ok={row.last>row.ma20} text="Cena powyżej EMA20"/>
    <Check ok={row.smartMoneyScore>55} text="Smart Money powyżej 55"/>
  </div>;
}
function Check({ok,text}){return <div className="check"><span className={ok?"ok":"bad"}>{ok?"✓":"⚠"}</span>{text}</div>;}

function Signal({row,kind}){
  const s=row.signals?.[kind] || {};
  const arr=[["Kierunek",s.direction],["Pewność",fmt(s.confidence,0)+"%"],["Wejście",`${fmt(s.entryLow)} - ${fmt(s.entryHigh)}`],["Stop Loss",fmt(s.sl)],["TP1",fmt(s.tp1)],["TP2",fmt(s.tp2)],["TP3",fmt(s.tp3)],["R/R","1:"+fmt(s.rr,1)]];
  return <div className="signal">{arr.map(([k,v])=><div key={k} className="line"><span>{k}</span><b>{v}</b></div>)}</div>;
}

function AIComment({row,news}){
  const pos=[],risk=[];
  if(row.last>row.ma20) pos.push("kurs powyżej EMA20"); else risk.push("kurs pod EMA20");
  if(row.ma20>row.ma50) pos.push("EMA20 nad EMA50"); else risk.push("EMA20 pod EMA50");
  if(row.macdHist>0) pos.push("MACD potwierdza momentum"); else risk.push("MACD nie potwierdza siły");
  if(row.rsi>70) risk.push("RSI wysoko — możliwe przegrzanie");
  if(row.rsi<35) pos.push("RSI sugeruje możliwe odbicie");
  const sent = news.reduce((a,n)=>a+(n.sentiment==="positive"?1:n.sentiment==="negative"?-1:0),0);
  return <div className="comment"><p><Brain size={16}/> <b>Wniosek AI:</b> {label(row.aiScore)[0]} dla {row.t}. Score: {fmt(row.aiScore,0)}/100.</p><p><b>Za:</b> {pos.length?pos.join(", "):"brak mocnych potwierdzeń"}.</p><p><b>Ryzyka:</b> {risk.length?risk.join(", "):"umiarkowane"}.</p><p><b>News sentiment:</b> {sent>0?"pozytywny":sent<0?"negatywny":"neutralny"} ({news.length} newsów).</p></div>;
}

function News({items}){
  return <div className="news">{items?.length?items.slice(0,8).map((n,i)=><div className="newsItem" key={i}><a target="_blank" href={n.link}>{n.title}</a><br/><small className={n.sentiment==="positive"?"up":n.sentiment==="negative"?"down":"muted"}>{n.sentiment}</small></div>):<p className="muted">Brak newsów.</p>}</div>;
}

function Portfolio({active,portfolio,setPortfolio,buy,qty,setQty,price,setPrice}){
  const rows = portfolio.map(p=>({ ...p, current: active?.t===p.t ? active.last : p.price }));
  const total = rows.reduce((s,p)=>s+p.qty*p.current,0);
  const cost = rows.reduce((s,p)=>s+p.qty*p.price,0);
  return <div className="portfolio">
    <div className="trade"><input value={qty} onChange={e=>setQty(e.target.value)} placeholder="ilość"/><input value={price} onChange={e=>setPrice(e.target.value)} placeholder="cena"/><button onClick={buy}>Dodaj {active.t}</button></div>
    <div className="line"><span>Wartość</span><b>{fmt(total)}</b></div>
    <div className="line"><span>P/L</span><b className={cls(total-cost)}>{fmt(total-cost)}</b></div>
    {portfolio.slice(0,6).map(p=><div className="line" key={p.id}><span>{p.t} · {p.qty} szt.</span><b>{fmt(p.price)}</b></div>)}
    {portfolio.length ? <button className="danger" onClick={()=>setPortfolio([])}>Wyczyść</button> : <p className="muted">Brak pozycji.</p>}
  </div>;
}

function Backtest({data,run}){
  if(!data) return <div className="pad"><button className="wide" onClick={run}><Calculator size={15}/> Uruchom backtest AI Score &gt; 70</button></div>;
  if(data.loading) return <p className="pad muted">Liczenie backtestu...</p>;
  if(data.error) return <p className="pad muted">{data.error}</p>;
  return <div className="portfolio">
    <button className="wide" onClick={run}>Przelicz</button>
    <div className="line"><span>Transakcje</span><b>{data.trades}</b></div>
    <div className="line"><span>Win rate</span><b>{fmt(data.winRate,1)}%</b></div>
    <div className="line"><span>Zwrot strategii</span><b className={cls(data.strategyReturn)}>{fmt(data.strategyReturn,1)}%</b></div>
    <div className="line"><span>Buy & hold</span><b className={cls(data.buyHoldReturn)}>{fmt(data.buyHoldReturn,1)}%</b></div>
  </div>;
}

function AlertLog({alerts,setAlerts}){
  return <div className="alertList">{alerts.length?alerts.map(a=><div key={a.id}><span>{a.t} · {a.type}</span><b>{a.value}</b><button onClick={()=>setAlerts(alerts.filter(x=>x.id!==a.id))}>×</button></div>):<p className="muted">Brak alertów.</p>}</div>;
}
function Log({log}){ return <div className="log">{log.length?log.map((l,i)=><div key={i}><span>{l.time}</span>{l.msg}</div>):<p className="muted">Brak logów.</p>}</div>; }
