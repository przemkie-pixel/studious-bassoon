export default async function handler(req,res){
 try{
  const q = req.query.q || "GPW WIG20";
  const rssUrl = "https://news.google.com/rss/search?q=" + encodeURIComponent(q + " akcje giełda GPW") + "&hl=pl&gl=PL&ceid=PL:pl";
  const r = await fetch(rssUrl, {headers: {"user-agent":"Mozilla/5.0 WIG20TerminalPRO"}});
  const txt = await r.text();
  const items = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,20).map(m=>{
    const b = m[1];
    const title = clean(xml((b.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)||b.match(/<title>(.*?)<\/title>/)||[])[1]||""));
    const link = clean(xml((b.match(/<link>(.*?)<\/link>/)||[])[1]||""));
    const pubDate = clean(xml((b.match(/<pubDate>(.*?)<\/pubDate>/)||[])[1]||""));
    return {title, link, pubDate, sentiment:sentiment(title)};
  });
  res.status(200).json({ok:true,q,items});
 }catch(e){
  res.status(500).json({ok:false,error:String(e.message||e),items:[]});
 }
}
function clean(s){return String(s||"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim()}
function xml(s){return String(s||"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">")}
function sentiment(text){const t=String(text||"").toLowerCase();const pos=["wzrost","zysk","rekord","umowa","dywidenda","poprawa","kupuj","odbicie","mocny","awans"];const neg=["spadek","strata","kara","ryzyko","sprzedaj","obniżka","pozew","problem","dług","słaby"];let s=0;for(const w of pos)if(t.includes(w))s++;for(const w of neg)if(t.includes(w))s--;return s>0?"positive":s<0?"negative":"neutral"}
