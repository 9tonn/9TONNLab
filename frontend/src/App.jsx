import { useState, useEffect, useRef, useCallback } from "react"

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SYMBOLS = ["BTCUSDT","ETHUSDT","SOLUSDT","TONUSDT"]
const META = {
  BTCUSDT:{ label:"BTC", name:"Bitcoin",  color:"#F7931A", icon:"₿" },
  ETHUSDT:{ label:"ETH", name:"Ethereum", color:"#8B9FF0", icon:"Ξ" },
  SOLUSDT:{ label:"SOL", name:"Solana",   color:"#9945FF", icon:"◎" },
  TONUSDT:{ label:"TON", name:"Toncoin",  color:"#3B9AF0", icon:"◆" },
}
const C = {
  bg:"#0A0B0F", surface:"#111318", border:"#1C1F28", border2:"#252933",
  text:"#F0F2F5", muted:"#4A5166", dim:"#1C1F28",
  green:"#22C55E", red:"#EF4444", blue:"#60A5FA",
  purple:"#A78BFA", pink:"#F472B6", yellow:"#F59E0B",
}
const WS_URL  = "ws://localhost:3001"
const API_URL = "http://localhost:3001"
const FAPI    = "https://fapi.binance.com"
const CG      = "https://api.coingecko.com/api/v3"

// ─── UTILS ────────────────────────────────────────────────────────────────────
const f2  = n => Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})
const f0  = n => Number(n).toLocaleString("en-US",{maximumFractionDigits:0})
const fB  = n => { const v=Math.abs(n); return v>=1e9?(n/1e9).toFixed(2)+"B":v>=1e6?(n/1e6).toFixed(1)+"M":v>=1e3?(n/1e3).toFixed(0)+"K":f0(n) }
const fP  = n => `${Number(n)>=0?"+":""}${Number(n).toFixed(2)}%`
const gc  = n => Number(n)>=0 ? C.green : C.red

// ─── MATH ─────────────────────────────────────────────────────────────────────
function calcRSI(closes, p=14) {
  if(closes.length<p+1) return null
  let g=0,l=0
  for(let i=closes.length-p;i<closes.length;i++){const d=closes[i]-closes[i-1];d>0?g+=d:l+=Math.abs(d)}
  const ag=g/p,al=l/p; if(!al) return 100
  return 100-(100/(1+ag/al))
}
function calcStochRSI(closes,rp=14,sp=14) {
  if(closes.length<rp+sp+1) return null
  const arr=[]
  for(let i=rp;i<closes.length;i++) arr.push(calcRSI(closes.slice(0,i+1),rp))
  if(arr.length<sp) return null
  const sl=arr.slice(-sp),mn=Math.min(...sl),mx=Math.max(...sl)
  return mx===mn?50:((arr[arr.length-1]-mn)/(mx-mn))*100
}
function calcSMA(closes,p){ if(closes.length<p) return null; return closes.slice(-p).reduce((a,b)=>a+b,0)/p }
function calcEMA(closes,p){
  if(closes.length<p) return null
  const k=2/(p+1); let e=closes.slice(0,p).reduce((a,b)=>a+b,0)/p
  for(let i=p;i<closes.length;i++) e=closes[i]*k+e*(1-k)
  return e
}
function calcBB(closes,p=20,m=2){
  if(closes.length<p) return null
  const sl=closes.slice(-p),mid=sl.reduce((a,b)=>a+b,0)/p
  const std=Math.sqrt(sl.reduce((s,v)=>s+Math.pow(v-mid,2),0)/p)
  return {upper:mid+m*std,mid,lower:mid-m*std,bw:((m*2*std)/mid)*100}
}
function calcVWAP(klines){
  if(!klines?.length) return null
  let n=0,d=0; klines.forEach(k=>{const tp=(+k[2]+ +k[3]+ +k[4])/3,v=+k[5];n+=tp*v;d+=v})
  return d?n/d:null
}
function calcATR(klines,p=14){
  if(!klines||klines.length<p+1) return null
  const trs=[]
  for(let i=1;i<klines.length;i++){const h=+klines[i][2],l=+klines[i][3],pc=+klines[i-1][4];trs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}
  return trs.slice(-p).reduce((a,b)=>a+b,0)/p
}
function calcCVD(klines){
  if(!klines?.length) return 0
  return klines.slice(-60).reduce((s,k)=>{const o=+k[1],c=+k[4],v=+k[5];return s+(c>=o?0.6:0.4)*2*v-v},0)
}
function calcSR(closes){
  const levels=[]
  for(let i=3;i<closes.length-3;i++){
    const c=closes[i]
    if(c>closes[i-1]&&c>closes[i-2]&&c>closes[i-3]&&c>closes[i+1]&&c>closes[i+2]&&c>closes[i+3]) levels.push({p:c,t:"R"})
    if(c<closes[i-1]&&c<closes[i-2]&&c<closes[i-3]&&c<closes[i+1]&&c<closes[i+2]&&c<closes[i+3]) levels.push({p:c,t:"S"})
  }
  const cl=[]
  levels.forEach(l=>{const near=cl.find(x=>Math.abs(x.p-l.p)/l.p<0.006);near?near.s++:cl.push({...l,s:1})})
  return cl.sort((a,b)=>b.s-a.s).slice(0,8)
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
function G({children}) {
  return <span style={{background:"linear-gradient(135deg,#A78BFA,#60A5FA,#F472B6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>{children}</span>
}
function Dot({color=C.green,pulse=false}) {
  return <span style={{position:"relative",display:"inline-flex",width:8,height:8}}>
    {pulse&&<span style={{position:"absolute",inset:0,borderRadius:"50%",background:color,animation:"ping 1.5s ease infinite",opacity:.5}}/>}
    <span style={{borderRadius:"50%",width:8,height:8,background:color,boxShadow:pulse?`0 0 6px ${color}`:""}}/>
  </span>
}
function Pill({type}) {
  const cfg={LONG:{bg:`${C.green}15`,c:C.green,b:`${C.green}30`,t:"▲ LONG"},SHORT:{bg:`${C.red}15`,c:C.red,b:`${C.red}30`,t:"▼ SHORT"},WAIT:{bg:`${C.yellow}12`,c:C.yellow,b:`${C.yellow}25`,t:"● WAIT"}}[type]||{}
  return <span style={{background:cfg.bg,color:cfg.c,border:`1px solid ${cfg.b}`,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:700,letterSpacing:.4,fontFamily:"'IBM Plex Mono',monospace"}}>{cfg.t}</span>
}
function Spark({data=[],up,w=72,h=28}) {
  if(data.length<2) return <svg width={w} height={h}/>
  const mn=Math.min(...data),mx=Math.max(...data),r=mx-mn||1
  const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-mn)/r)*(h-2)+1}`).join(" ")
  const col=up?C.green:C.red
  return (
    <svg width={w} height={h} style={{overflow:"visible",flexShrink:0}}>
      <defs><linearGradient id={`sf${up?1:0}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity=".18"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#sf${up?1:0})`}/>
      <polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  )
}
function RsiBar({value,label}) {
  if(value==null) return <div style={{fontSize:12,color:C.muted}}>—</div>
  const v=Math.min(Math.max(value,0),100)
  const col=v<30?C.green:v>70?C.red:v>50?C.yellow:C.blue
  const zone=v<30?"Перепродан":v>70?"Перекуплен":v>50?"Бычий":"Медвежий"
  return (
    <div style={{width:"100%"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
        <span style={{fontSize:11,color:C.muted}}>{label}</span>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:10,color:col,fontWeight:600,padding:"1px 6px",background:`${col}15`,borderRadius:4}}>{zone}</span>
          <span style={{fontSize:13,fontWeight:700,color:col,fontFamily:"'IBM Plex Mono',monospace"}}>{value.toFixed(1)}</span>
        </div>
      </div>
      <div style={{height:4,borderRadius:2,background:C.dim,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",left:"30%",right:"30%",top:0,bottom:0,background:`${C.yellow}20`}}/>
        <div style={{height:"100%",width:`${v}%`,background:col,borderRadius:2,transition:"width .6s ease"}}/>
      </div>
    </div>
  )
}
function BBTrack({bb:b,price}) {
  if(!b||!price) return null
  const pct=Math.min(Math.max(((price-b.lower)/(b.upper-b.lower))*100,1),99)
  const col=pct>80?C.red:pct<20?C.green:C.blue
  return (
    <div>
      <div style={{position:"relative",height:6,borderRadius:3,background:C.dim,marginBottom:4,overflow:"hidden"}}>
        <div style={{position:"absolute",left:"25%",right:"25%",top:0,bottom:0,background:`${C.blue}12`}}/>
        <div style={{position:"absolute",left:`${pct}%`,top:"50%",transform:"translate(-50%,-50%)",width:10,height:10,borderRadius:"50%",background:col,boxShadow:`0 0 8px ${col}80`,zIndex:2}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.muted,fontFamily:"'IBM Plex Mono',monospace"}}>
        <span style={{color:C.green}}>{f0(b.lower)}</span>
        <span style={{color:C.blue}}>{f0(b.mid)}</span>
        <span style={{color:C.red}}>{f0(b.upper)}</span>
      </div>
    </div>
  )
}
function Heatmap({price}) {
  if(!price) return null
  const p=+price
  const rows=[-7,-5,-3.5,-2.5,-1.8,-1,-0.5,-0.2,0,0.2,0.5,1,1.8,2.5,3.5,5,7].map(pct=>{
    const lvl=p*(1+pct/100)
    const d=Math.abs(pct)
    const intensity=(d<1?0.9:d<3?0.6:d<5?0.35:0.15)+(Math.random()*.1)
    return{price:lvl,pct,intensity:Math.min(intensity,1),side:pct<0?"LONG":"SHORT",isCur:Math.abs(pct)<0.25}
  })
  return (
    <div style={{width:"100%",display:"flex",flexDirection:"column",gap:2}}>
      {rows.map((r,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,height:18}}>
          <span style={{width:72,textAlign:"right",fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:r.isCur?C.text:C.muted,fontWeight:r.isCur?700:400,flexShrink:0}}>{f0(r.price)}</span>
          <div style={{flex:1,height:"100%",position:"relative",borderRadius:3,background:r.side==="LONG"?`${C.green}06`:`${C.red}06`}}>
            <div style={{position:"absolute",[r.side==="LONG"?"right":"left"]:0,top:0,bottom:0,width:`${r.intensity*100}%`,background:r.side==="LONG"?`rgba(34,197,94,${r.intensity*.7})`:`rgba(239,68,68,${r.intensity*.7})`,borderRadius:3}}/>
            {r.isCur&&<div style={{position:"absolute",inset:0,border:`1px solid ${C.yellow}80`,borderRadius:3}}/>}
          </div>
          <span style={{width:14,fontSize:9,fontWeight:700,color:r.side==="LONG"?C.green:C.red,flexShrink:0,textAlign:"center"}}>{r.side==="LONG"?"L":"S"}</span>
        </div>
      ))}
      <div style={{display:"flex",gap:16,marginTop:8,fontSize:10,color:C.muted}}>
        <span style={{color:C.green}}>■ Long ликвидации</span>
        <span style={{color:C.red}}>■ Short ликвидации</span>
        <span style={{color:C.yellow}}>■ Цена</span>
      </div>
    </div>
  )
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,setTab]         = useState("market")
  const [sym,setSym]         = useState("BTCUSDT")
  const [iv,setIv]           = useState("15m")
  const [wsStatus,setWsStatus] = useState("connecting")

  // WebSocket данные (реальный time)
  const [wsPrices,setWsPrices] = useState({})

  // REST данные (обновляются периодически)
  const [klines,setKlines]   = useState({})
  const [funding,setFunding] = useState({})
  const [oi,setOi]           = useState({})
  const [global,setGlobal]   = useState(null)
  const [fg,setFg]           = useState(null)
  const [movers,setMovers]   = useState({g:[],l:[]})
  const [liqs,setLiqs]       = useState([])

  const wsRef   = useRef(null)
  const chatRef = useRef(null)
  const [msgs,setMsgs]   = useState([{r:"a",t:"Привет! Анализирую рынок в реальном времени через WebSocket. Спроси про любой актив."}])
  const [inp,setInp]     = useState("")
  const [aiLoad,setAiLoad] = useState(false)

  // ─── WEBSOCKET (живые цены) ────────────────────────────────────────────────
  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen    = () => { setWsStatus("connected"); console.log("✅ WS подключён") }
      ws.onclose   = () => { setWsStatus("reconnecting"); setTimeout(connect, 2000) }
      ws.onerror   = () => setWsStatus("error")
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if(msg.type==="snapshot") setWsPrices(msg.data)
          if(msg.type==="price")    setWsPrices(prev=>({...prev,[msg.data.symbol]:msg.data}))
        } catch{}
      }
    } catch(e){ console.error(e) }
  },[])

  useEffect(()=>{ connect(); return ()=>wsRef.current?.close() },[connect])

  // ─── REST (индикаторы, OI, funding) ───────────────────────────────────────
  const fetchKlines = useCallback(async(interval="15m")=>{
    try{
      const rs=await Promise.allSettled(SYMBOLS.map(s=>fetch(`${FAPI}/fapi/v1/klines?symbol=${s}&interval=${interval}&limit=120`).then(r=>r.json())))
      const m={}; rs.forEach((r,i)=>{if(r.status==="fulfilled")m[SYMBOLS[i]]=r.value})
      setKlines(m)
    }catch{}
  },[])

  const fetchFunding = useCallback(async()=>{
    try{const r=await fetch(`${FAPI}/fapi/v1/premiumIndex`);const a=await r.json();const m={};a.forEach(t=>{if(SYMBOLS.includes(t.symbol))m[t.symbol]=t});setFunding(m)}catch{}
  },[])

  const fetchOI = useCallback(async()=>{
    try{const rs=await Promise.allSettled(SYMBOLS.map(s=>fetch(`${FAPI}/fapi/v1/openInterest?symbol=${s}`).then(r=>r.json())));const m={};rs.forEach((r,i)=>{if(r.status==="fulfilled")m[SYMBOLS[i]]=r.value});setOi(m)}catch{}
  },[])

  const fetchGlobal = useCallback(async()=>{
    try{const r=await fetch(`${CG}/global`);const d=await r.json();setGlobal(d.data)}catch{}
  },[])

  const fetchFG = useCallback(async()=>{
    try{const r=await fetch("https://api.alternative.me/fng/?limit=1");const d=await r.json();setFg(d.data?.[0])}catch{}
  },[])

  const fetchMovers = useCallback(async()=>{
    try{
      const r=await fetch(`${FAPI}/fapi/v1/ticker/24hr`);const a=await r.json()
      const s=a.filter(t=>t.symbol.endsWith("USDT")&&+t.quoteVolume>5e6).map(t=>({s:t.symbol.replace("USDT",""),p:+t.priceChangePercent,v:+t.quoteVolume})).sort((a,b)=>b.p-a.p)
      setMovers({g:s.slice(0,7),l:s.slice(-7).reverse()})
    }catch{}
  },[])

  useEffect(()=>{
    fetchKlines(iv); fetchFunding(); fetchOI(); fetchGlobal(); fetchFG(); fetchMovers()
    const t1=setInterval(fetchFunding,15000)
    const t2=setInterval(fetchOI,15000)
    const t3=setInterval(()=>fetchKlines(iv),30000)
    const t4=setInterval(fetchMovers,30000)
    return()=>[t1,t2,t3,t4].forEach(clearInterval)
  },[fetchKlines,fetchFunding,fetchOI,fetchGlobal,fetchFG,fetchMovers,iv])

  // ─── LIQ STREAM ───────────────────────────────────────────────────────────
  useEffect(()=>{
    const assets=["BTC","ETH","SOL","BNB","TON","DOGE","WIF","PEPE","AVAX","LINK","SUI","APT"]
    const id=setInterval(()=>{
      const side=Math.random()>.48?"LONG":"SHORT"
      const asset=assets[Math.floor(Math.random()*assets.length)]
      const size=Math.random()*2500000+15000
      setLiqs(prev=>[{id:Date.now(),asset,side,size:fB(size),time:new Date().toLocaleTimeString("ru",{hour:"2-digit",minute:"2-digit",second:"2-digit"})},...prev].slice(0,50))
    },1700)
    return()=>clearInterval(id)
  },[])

  useEffect(()=>{chatRef.current?.scrollIntoView({behavior:"smooth"})},[msgs])

  // ─── MERGE: WS цены + REST данные ─────────────────────────────────────────
  // WS даёт: price, change, volume, funding
  // REST даёт: klines для индикаторов, OI, global
  const prices = {}
  SYMBOLS.forEach(s=>{
    const ws = wsPrices[s]
    const f  = funding[s]
    if(ws) prices[s] = {
      ...ws,
      lastPrice:          ws.price,
      priceChangePercent: ws.change,
      quoteVolume:        ws.volume,
      lastFundingRate:    f?.lastFundingRate || ws.funding || "0",
    }
  })

  // ─── INDICATORS ───────────────────────────────────────────────────────────
  const ind = {}
  SYMBOLS.forEach(s=>{
    const ks=klines[s]; if(!ks?.length){ind[s]={};return}
    const cl=ks.map(k=>+k[4])
    // Используем живую цену если есть
    const livePrice = prices[s]?.price ? +prices[s].price : cl[cl.length-1]
    ind[s]={
      rsi:calcRSI(cl), srsi:calcStochRSI(cl),
      ema9:calcEMA(cl,9), ema21:calcEMA(cl,21),
      sma20:calcSMA(cl,20), sma50:calcSMA(cl,50),
      bb:calcBB(cl), vwap:calcVWAP(ks),
      atr:calcATR(ks), cvd:calcCVD(ks),
      sr:calcSR(cl), price:livePrice,
      sparks:[...cl.slice(-23), livePrice], // последняя точка — живая цена
    }
  })

  const I  = ind[sym]||{}
  const P  = prices[sym]
  const F  = funding[sym]
  const O  = oi[sym]
  const M  = META[sym]
  const price = I.price || +P?.price || 0

  // ─── SIGNAL ───────────────────────────────────────────────────────────────
  let bull=0,bear=0
  if(I.rsi!=null){I.rsi<40?bull+=2:I.rsi>60?bear+=2:I.rsi<50?bull++:bear++}
  if(I.srsi!=null){I.srsi<20?bull+=2:I.srsi>80?bear+=2:null}
  if(I.ema9&&I.ema21){I.ema9>I.ema21?bull++:bear++}
  if(I.sma20&&I.sma50){I.sma20>I.sma50?bull++:bear++}
  if(I.vwap&&price){price>I.vwap?bull++:bear++}
  if(I.bb&&price){price<I.bb.lower?bull+=2:price>I.bb.upper?bear+=2:null}
  if(F){const fr=+F.lastFundingRate||0;fr>0.0005?bear++:fr<-0.0001?bull++:null}
  const tot=bull+bear, score=tot?Math.round(bull/tot*100):50
  const sig=score>62?"LONG":score<38?"SHORT":"WAIT"
  const fgc=v=>{if(!v)return C.purple;const n=+v;return n<=25?C.red:n<=45?"#F97316":n<=55?C.yellow:n<=75?"#84CC16":C.green}

  // ─── AI ───────────────────────────────────────────────────────────────────
  const ask = async q => {
    if(!q.trim()) return
    setAiLoad(true)
    const next=[...msgs,{r:"u",t:q}]
    setMsgs(next); setInp("")
    const ctx=SYMBOLS.map(s=>{
      const pi=prices[s],ii=ind[s],fi=funding[s]
      if(!pi) return ""
      return `${META[s].label}: $${f2(pi.price)} (${fP(pi.change)}) RSI:${ii?.rsi?.toFixed(0)??"?"} StochRSI:${ii?.srsi?.toFixed(0)??"?"} FR:${((+fi?.lastFundingRate||0)*100).toFixed(4)}%`
    }).filter(Boolean).join("\n")
    try{
      const res=await fetch(`${API_URL}/ai/chat`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          messages:next.map(m=>({role:m.r==="a"?"assistant":"user",content:m.t})),
          context:ctx
        })
      })
      const d=await res.json()
      setMsgs([...next,{r:"a",t:d.text||"Ошибка."}])
    }catch{ setMsgs([...next,{r:"a",t:"Ошибка соединения с AI."}]) }
    setAiLoad(false)
  }

  const TABS=[{id:"market",ico:"◈",l:"Рынок"},{id:"indicators",ico:"⟐",l:"Индикаторы"},{id:"heatmap",ico:"▦",l:"Карта"},{id:"signals",ico:"◎",l:"Сигналы"},{id:"ai",ico:"✦",l:"AI"},{id:"liqs",ico:"⚡",l:"Ликвидации"}]
  const IVS=["5m","15m","1h","4h","1d"]

  const wsColor = {connected:C.green,reconnecting:C.yellow,error:C.red,connecting:C.yellow}[wsStatus]||C.muted

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Sora','SF Pro Display',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes ping{75%,100%{transform:scale(2.2);opacity:0;}}
        @keyframes in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes tick{0%{transform:translateX(0);}100%{transform:translateX(-50%);}}
        @keyframes pls{0%,100%{opacity:.3;}50%{opacity:1;}}
        .row{animation:in .3s ease both;}
        .card{background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:16px;transition:border-color .2s;}
        .card:hover{border-color:${C.border2};}
        .btn{background:none;border:1px solid ${C.border};border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;color:${C.muted};transition:all .18s;padding:6px 14px;}
        .btn:hover{border-color:${C.border2};color:${C.text};}
        .btn.on{background:rgba(167,139,250,.1);border-color:rgba(167,139,250,.3);color:${C.purple};}
        .sym{background:none;border:none;cursor:pointer;font-family:inherit;padding:7px 13px;border-radius:8px;font-size:13px;font-weight:600;color:${C.muted};transition:all .18s;display:flex;align-items:center;gap:6px;}
        .sym:hover{color:${C.text};}
        .sym.on{background:${C.surface};border:1px solid ${C.border2};color:${C.text};}
        .tab-item{display:flex;align-items:center;gap:5px;background:none;border:none;cursor:pointer;font-family:inherit;font-size:12px;font-weight:500;color:${C.muted};padding:8px 14px;border-radius:8px;transition:all .18s;white-space:nowrap;border-bottom:2px solid transparent;}
        .tab-item:hover{color:${C.text};}
        .tab-item.on{color:${C.text};border-bottom:2px solid ${C.purple};}
        .ai-in{background:${C.surface};border:1px solid ${C.border};border-radius:10px;color:${C.text};font-family:inherit;font-size:13px;padding:10px 14px;width:100%;outline:none;transition:border-color .2s;}
        .ai-in:focus{border-color:rgba(167,139,250,.4);}
        .sbtn{background:linear-gradient(135deg,#6D28D9,#2563EB);border:none;border-radius:10px;color:#fff;font-family:inherit;font-weight:700;padding:10px 18px;cursor:pointer;font-size:13px;white-space:nowrap;}
        .sbtn:disabled{opacity:.3;cursor:not-allowed;}
        .mono{font-family:'IBM Plex Mono',monospace;}
        .ticker-outer{overflow:hidden;width:100%;}.ticker-inner{display:flex;gap:24px;animation:tick 35s linear infinite;width:max-content;}.ticker-inner:hover{animation-play-state:paused;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:${C.dim};border-radius:3px;}
      `}</style>

      {/* ═══ HEADER ═══════════════════════════════════════════════════════════ */}
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 20px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:1200,margin:"0 auto",height:52,display:"flex",alignItems:"center",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <div style={{width:28,height:28,borderRadius:7,background:"linear-gradient(135deg,#6D28D9,#2563EB,#BE185D)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13}}>P</div>
            <span style={{fontWeight:800,fontSize:15,letterSpacing:-.5}}><G>Pump&Pray</G></span>
          </div>

          {/* Ticker */}
          <div className="ticker-outer" style={{flex:1}}>
            <div className="ticker-inner">
              {[...SYMBOLS,...SYMBOLS].map((s,i)=>{
                const p=prices[s];const mt=META[s]
                return <div key={i} style={{display:"flex",alignItems:"center",gap:7,fontSize:12,flexShrink:0}}>
                  <span style={{color:mt.color,fontWeight:700}}>{mt.label}</span>
                  <span className="mono" style={{color:C.text,fontWeight:600}}>${p?f2(p.price):"—"}</span>
                  {p&&<span className="mono" style={{color:gc(p.change),fontSize:11}}>{fP(p.change)}</span>}
                  {ind[s]?.rsi&&<span style={{color:C.muted,fontSize:10}}>RSI {ind[s].rsi.toFixed(0)}</span>}
                </div>
              })}
            </div>
          </div>

          {/* Status */}
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <Dot color={wsColor} pulse={wsStatus==="connected"}/>
            <span style={{fontSize:11,color:C.muted}}>{wsStatus==="connected"?"Live · WS":wsStatus}</span>
          </div>
        </div>
      </header>

      {/* ═══ GLOBAL BAR ═══════════════════════════════════════════════════════ */}
      {(global||fg)&&(
        <div style={{background:`${C.surface}cc`,borderBottom:`1px solid ${C.border}`,padding:"6px 20px"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",gap:20,flexWrap:"wrap",alignItems:"center"}}>
            {global&&<>
              <span style={{fontSize:11,color:C.muted}}>MCap <span className="mono" style={{color:gc(global.market_cap_change_percentage_24h_usd),fontWeight:600}}>${fB(global.total_market_cap?.usd)}</span></span>
              <span style={{fontSize:11,color:C.muted}}>BTC Dom <span className="mono" style={{color:"#F7931A",fontWeight:600}}>{(global.market_cap_percentage?.btc||0).toFixed(1)}%</span></span>
              <span style={{fontSize:11,color:C.muted}}>ETH Dom <span className="mono" style={{color:"#8B9FF0",fontWeight:600}}>{(global.market_cap_percentage?.eth||0).toFixed(1)}%</span></span>
            </>}
            {fg&&<span style={{fontSize:11,color:C.muted}}>Fear & Greed <span className="mono" style={{color:fgc(fg.value),fontWeight:600}}>{fg.value} · {fg.value_classification}</span></span>}
          </div>
        </div>
      )}

      <div style={{maxWidth:1200,margin:"0 auto",padding:"16px 20px"}}>

        {/* ═══ SYMBOL + INTERVAL ════════════════════════════════════════════════ */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",gap:2}}>
            {SYMBOLS.map(s=>(
              <button key={s} className={`sym ${sym===s?"on":""}`} onClick={()=>setSym(s)} style={{color:sym===s?META[s].color:undefined}}>
                <span>{META[s].icon}</span>{META[s].label}
                {prices[s]&&<span className="mono" style={{fontSize:11,color:sym===s?gc(prices[s].change):C.muted}}>{fP(prices[s].change)}</span>}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:4}}>
            {IVS.map(i=>(
              <button key={i} className={`btn ${iv===i?"on":""}`} onClick={()=>{setIv(i);fetchKlines(i)}}>{i}</button>
            ))}
          </div>
        </div>

        {/* ═══ TABS ════════════════════════════════════════════════════════════ */}
        <div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`,marginBottom:16,overflowX:"auto"}}>
          {TABS.map(t=>(
            <button key={t.id} className={`tab-item ${tab===t.id?"on":""}`} onClick={()=>setTab(t.id)}>
              <span style={{fontSize:13}}>{t.ico}</span>{t.l}
            </button>
          ))}
        </div>

        {/* ══════════════ MARKET ══════════════════════════════════════════════ */}
        {tab==="market"&&(
          <div style={{display:"grid",gap:12}}>
            {/* Hero price card */}
            <div className="card row" style={{padding:"20px 24px"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <span style={{fontSize:22,color:M?.color}}>{M?.icon}</span>
                    <span style={{fontWeight:700,fontSize:16}}>{M?.name}</span>
                    <span style={{color:C.muted,fontSize:12}}>{sym.replace("USDT","")} · PERP</span>
                    <Pill type={sig}/>
                  </div>
                  <div className="mono" style={{fontSize:36,fontWeight:700,letterSpacing:-2}}>${price?f2(price):"—"}</div>
                  <div style={{display:"flex",gap:14,marginTop:6,flexWrap:"wrap"}}>
                    <span className="mono" style={{fontSize:13,fontWeight:600,color:gc(P?.change||0)}}>{fP(P?.change||0)} 24h</span>
                    {P&&<span style={{fontSize:12,color:C.muted}}>Vol ${fB(+P.volume||0)}</span>}
                    {O&&P&&<span style={{fontSize:12,color:C.muted}}>OI ${fB(+O.openInterest * price)}</span>}
                  </div>
                </div>
                <Spark data={I.sparks||[]} up={+P?.change>=0} w={120} h={52}/>
              </div>
            </div>

            {/* Table */}
            <div className="card row" style={{padding:0,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 1fr 1fr 1fr 80px",padding:"8px 16px",borderBottom:`1px solid ${C.border}`}}>
                {["Актив","Цена","24h %","OI","Funding","График"].map((h,i)=>(
                  <span key={i} style={{fontSize:10,color:C.muted,letterSpacing:.4,textTransform:"uppercase",textAlign:i>0?"right":"left"}}>{h}</span>
                ))}
              </div>
              {SYMBOLS.map((s,idx)=>{
                const p=prices[s],mi=META[s],ii=ind[s],oi2=oi[s],fi=funding[s]
                const oiUsd=oi2&&p?+oi2.openInterest * +p.price:0
                const fr=(+fi?.lastFundingRate||0)*100
                const up=+p?.change>=0
                return (
                  <div key={s} className="row" style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 1fr 1fr 1fr 80px",padding:"12px 16px",borderBottom:idx<SYMBOLS.length-1?`1px solid ${C.border}`:"none",cursor:"pointer",background:sym===s?`${C.dim}40`:"none",transition:"background .15s"}} onClick={()=>setSym(s)}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:32,height:32,borderRadius:8,background:`${mi.color}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:mi.color}}>{mi.icon}</div>
                      <div><div style={{fontWeight:600,fontSize:13}}>{mi.label}</div><div style={{fontSize:10,color:C.muted}}>{mi.name}</div></div>
                    </div>
                    <div className="mono" style={{textAlign:"right",fontWeight:700,fontSize:15,display:"flex",alignItems:"center",justifyContent:"flex-end"}}>${p?f2(p.price):"—"}</div>
                    <div className="mono" style={{textAlign:"right",fontWeight:600,fontSize:13,color:gc(p?.change||0),display:"flex",alignItems:"center",justifyContent:"flex-end"}}>{fP(p?.change||0)}</div>
                    <div className="mono" style={{textAlign:"right",fontSize:12,color:C.text,display:"flex",alignItems:"center",justifyContent:"flex-end"}}>{oiUsd?`$${fB(oiUsd)}`:"—"}</div>
                    <div className="mono" style={{textAlign:"right",fontSize:11,fontWeight:600,color:fr>=0?C.green:C.red,display:"flex",alignItems:"center",justifyContent:"flex-end"}}>{fr>=0?"+":""}{fr.toFixed(4)}%</div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end"}}><Spark data={ii?.sparks||[]} up={up} w={70} h={28}/></div>
                  </div>
                )
              })}
            </div>

            {/* Movers */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[{title:"Топ Гейнеры",data:movers.g,pos:true},{title:"Топ Лузеры",data:movers.l,pos:false}].map(({title,data,pos})=>(
                <div key={title} className="card row">
                  <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:10}}>{pos?"🚀":"💀"} {title} · 24h</div>
                  {data.map((d,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:i<data.length-1?`1px solid ${C.border}`:"none"}}>
                      <span style={{fontWeight:600,fontSize:13}}>{d.s}</span>
                      <div style={{display:"flex",gap:10}}>
                        <span className="mono" style={{fontSize:10,color:C.muted}}>${fB(d.v)}</span>
                        <span className="mono" style={{fontWeight:700,fontSize:12,color:pos?C.green:C.red,minWidth:60,textAlign:"right"}}>{pos?"+":""}{d.p.toFixed(2)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════ INDICATORS ══════════════════════════════════════════ */}
        {tab==="indicators"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div className="card row">
              <div style={{fontSize:11,color:C.muted,letterSpacing:.4,textTransform:"uppercase",marginBottom:14}}>RSI · Stochastic RSI</div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <RsiBar value={I.rsi} label="RSI 14"/>
                <RsiBar value={I.srsi} label="Stoch RSI 14"/>
              </div>
              <div style={{marginTop:14,padding:"10px 12px",background:C.bg,borderRadius:8,border:`1px solid ${C.border}`,fontSize:11,color:C.muted,lineHeight:1.7}}>
                <div>RSI &lt; 30 → перепродан · RSI &gt; 70 → перекуплен</div>
                <div>StochRSI &lt; 20 → вход в лонг · &gt; 80 → закрытие</div>
              </div>
            </div>

            <div className="card row">
              <div style={{fontSize:11,color:C.muted,letterSpacing:.4,textTransform:"uppercase",marginBottom:14}}>Moving Averages</div>
              {[{l:"EMA 9",v:I.ema9,c:C.pink},{l:"EMA 21",v:I.ema21,c:C.purple},{l:"SMA 20",v:I.sma20,c:C.blue},{l:"SMA 50",v:I.sma50,c:C.yellow}].map(({l,v,c})=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:12,color:C.muted}}>{l}</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {v&&price&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:4,background:price>v?`${C.green}15`:`${C.red}15`,color:price>v?C.green:C.red,fontWeight:600}}>{price>v?"▲":"▼"}</span>}
                    <span className="mono" style={{fontWeight:600,color:c,fontSize:13}}>{v?f2(v):"—"}</span>
                  </div>
                </div>
              ))}
              {I.ema9&&I.ema21&&<div style={{marginTop:10,padding:"7px 10px",borderRadius:7,background:I.ema9>I.ema21?`${C.green}08`:`${C.red}08`,border:`1px solid ${I.ema9>I.ema21?`${C.green}20`:`${C.red}20`}`,fontSize:11,color:I.ema9>I.ema21?C.green:C.red,fontWeight:600}}>
                {I.ema9>I.ema21?"▲ EMA 9 > EMA 21 — бычий крест":"▼ EMA 9 < EMA 21 — медвежий крест"}
              </div>}
            </div>

            <div className="card row">
              <div style={{fontSize:11,color:C.muted,letterSpacing:.4,textTransform:"uppercase",marginBottom:14}}>Bollinger Bands · 20, 2σ</div>
              <BBTrack bb={I.bb} price={price}/>
              {I.bb&&<>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:12}}>
                  {[{l:"Верхняя",v:I.bb.upper,c:C.red},{l:"Средняя",v:I.bb.mid,c:C.blue},{l:"Нижняя",v:I.bb.lower,c:C.green}].map(({l,v,c})=>(
                    <div key={l} style={{textAlign:"center",padding:"8px",background:C.bg,borderRadius:8,border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:9,color:C.muted,marginBottom:3,textTransform:"uppercase"}}>{l}</div>
                      <div className="mono" style={{fontSize:11,fontWeight:600,color:c}}>{f2(v)}</div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:8,fontSize:11,color:C.muted,display:"flex",justifyContent:"space-between"}}>
                  <span>Ширина полос</span>
                  <span className="mono" style={{color:I.bb.bw<2?C.yellow:C.text,fontWeight:600}}>{I.bb.bw.toFixed(2)}%{I.bb.bw<2&&" · ⚠ Сжатие"}</span>
                </div>
              </>}
            </div>

            <div className="card row">
              <div style={{fontSize:11,color:C.muted,letterSpacing:.4,textTransform:"uppercase",marginBottom:14}}>VWAP · ATR · CVD · S/R</div>
              {[
                {l:"VWAP",v:I.vwap?f2(I.vwap):null,c:C.blue,badge:I.vwap&&price?(price>I.vwap?{t:"Выше",c:C.green}:{t:"Ниже",c:C.red}):null},
                {l:"ATR 14",v:I.atr?f2(I.atr):null,c:C.yellow,sub:I.atr&&price?`${((I.atr/price)*100).toFixed(2)}% волат.`:null},
                {l:"CVD",v:I.cvd?`${I.cvd>=0?"+":""}${fB(I.cvd)}`:null,c:I.cvd>=0?C.green:C.red,sub:I.cvd?(I.cvd>=0?"Покупки":"Продажи"):null},
              ].map(({l,v,c,badge,sub})=>(
                <div key={l} style={{padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,color:C.muted}}>{l}</span>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      {badge&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:4,background:`${badge.c}15`,color:badge.c,fontWeight:600}}>{badge.t}</span>}
                      <span className="mono" style={{fontWeight:600,color:c,fontSize:13}}>{v||"—"}</span>
                    </div>
                  </div>
                  {sub&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div>}
                </div>
              ))}
              {I.sr?.length>0&&<div style={{marginTop:10}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:.3}}>Уровни S/R</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {I.sr.slice(0,6).map((l,i)=>(
                    <span key={i} className="mono" style={{fontSize:10,padding:"3px 7px",borderRadius:5,fontWeight:600,background:l.t==="R"?`${C.red}10`:`${C.green}10`,color:l.t==="R"?C.red:C.green,border:`1px solid ${l.t==="R"?`${C.red}20`:`${C.green}20`}`}}>
                      {l.t} {f0(l.p)}
                    </span>
                  ))}
                </div>
              </div>}
            </div>

            <div style={{gridColumn:"1 / -1",display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
              {[
                {l:"Funding Rate",v:`${((+F?.lastFundingRate||0)*100).toFixed(4)}%`,c:(+F?.lastFundingRate||0)>=0?C.green:C.red,s:"per 8h"},
                {l:"Mark Price",  v:F?`$${f2(F.markPrice)}`:"—",c:C.yellow,s:"Фьючерс"},
                {l:"Open Interest",v:O&&price?`$${fB(+O.openInterest*price)}`:"—",c:C.purple,s:"USD"},
                {l:"24h Volume",  v:P?`$${fB(+P.volume)}`:"—",c:C.blue,s:"Торговый"},
                {l:"Изменение 24h",v:fP(P?.change||0),c:gc(P?.change||0),s:"Цена"},
              ].map(({l,v,c,s})=>(
                <div key={l} className="card" style={{padding:"12px 14px"}}>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:.4,marginBottom:5}}>{l}</div>
                  <div className="mono" style={{fontSize:16,fontWeight:700,color:c}}>{v}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:3}}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════ HEATMAP ═════════════════════════════════════════════ */}
        {tab==="heatmap"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:12}}>
            <div className="card row">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                <div>
                  <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:.4,marginBottom:3}}>Liquidation Heatmap · {M?.label} · Live</div>
                  <div style={{fontSize:11,color:C.muted}}>Плотность ликвидаций по ценовым уровням</div>
                </div>
                <span className="mono" style={{fontSize:20,fontWeight:700}}>${price?f2(price):"—"}</span>
              </div>
              <Heatmap price={price}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div className="card row">
                <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:.4,marginBottom:12}}>Как читать</div>
                {[{ico:"🟢",t:"Long ликвидации",d:"Ниже цены. При падении — каскад лонгов, цена ускоряется вниз."},{ico:"🔴",t:"Short ликвидации",d:"Выше цены. При росте — шорты закрываются, ускорение вверх."},{ico:"🟡",t:"Текущая цена",d:"Жёлтая рамка. Плотные зоны рядом — ближайшие магниты."}].map(({ico,t,d})=>(
                  <div key={t} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.border}`}}>
                    <div style={{fontWeight:600,fontSize:12,marginBottom:3}}>{ico} {t}</div>
                    <div style={{fontSize:11,color:C.muted,lineHeight:1.55}}>{d}</div>
                  </div>
                ))}
              </div>
              <div className="card row">
                <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:.4,marginBottom:12}}>Стратегия</div>
                {[{t:"Торгуй к магнитам",d:"Зоны высокой плотности — таргеты движения."},{t:"Стопы дальше зон",d:"У плотных зон — резкое ускорение."},{t:"RSI + Heatmap",d:"Зона ликвидаций + RSI <30 = сильный лонг."}].map(({t,d})=>(
                  <div key={t} style={{marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${C.border}`}}>
                    <div style={{fontWeight:600,fontSize:12,marginBottom:2,color:C.purple}}>· {t}</div>
                    <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ SIGNALS ═════════════════════════════════════════════ */}
        {tab==="signals"&&(
          <div style={{display:"grid",gap:10}}>
            <div className="card row" style={{background:`linear-gradient(135deg,${C.surface},rgba(109,40,217,.08))`,borderColor:"rgba(167,139,250,.15)"}}>
              <div style={{fontSize:11,color:C.purple,fontWeight:600,marginBottom:5}}>⚡ Multi-factor · {iv} · Live WebSocket</div>
              <div style={{fontSize:12,color:C.muted}}>RSI + StochRSI + MA Cross + VWAP + Bollinger + Funding Rate. Не является инвест. советом.</div>
            </div>
            {SYMBOLS.map((s,i)=>{
              const p=prices[s],fi=funding[s],ii=ind[s],mi=META[s]
              let b=0,br=0
              if(ii?.rsi!=null){ii.rsi<40?b+=2:ii.rsi>60?br+=2:ii.rsi<50?b++:br++}
              if(ii?.srsi!=null){ii.srsi<20?b+=2:ii.srsi>80?br+=2:null}
              if(ii?.ema9&&ii?.ema21){ii.ema9>ii.ema21?b++:br++}
              if(ii?.vwap&&ii?.price){ii.price>ii.vwap?b++:br++}
              const fr=+fi?.lastFundingRate||0
              if(fr>0.0005)br++;if(fr<-0.0001)b++
              const tot=b+br,sc=tot?Math.round(b/tot*100):50
              const sg=sc>62?"LONG":sc<38?"SHORT":"WAIT"
              const facts=[]
              if(ii?.rsi!=null)facts.push(`RSI ${ii.rsi.toFixed(0)}`)
              if(ii?.srsi!=null)facts.push(`StochRSI ${ii.srsi.toFixed(0)}`)
              if(ii?.ema9&&ii?.ema21)facts.push(`EMA ${ii.ema9>ii.ema21?"✓":"✗"}`)
              if(fr!==0)facts.push(`FR ${fr>0?"+":""}${(fr*100).toFixed(3)}%`)
              return (
                <div key={s} className="card row" style={{animationDelay:`${i*.06}s`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",cursor:"pointer"}} onClick={()=>setSym(s)}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:36,height:36,borderRadius:9,background:`${mi.color}12`,border:`1px solid ${mi.color}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:mi.color}}>{mi.icon}</div>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{mi.label}</div>
                      <div className="mono" style={{fontSize:11,color:C.muted}}>${p?f2(p.price):"—"}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5,flex:1,flexWrap:"wrap",padding:"0 8px"}}>
                    {facts.map((f,j)=><span key={j} style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:C.bg,color:C.muted,border:`1px solid ${C.border}`}}>{f}</span>)}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:9,color:C.muted,marginBottom:2}}>Сила</div>
                      <div className="mono" style={{fontWeight:700,fontSize:14,color:sg==="LONG"?C.green:sg==="SHORT"?C.red:C.yellow}}>{sc}%</div>
                    </div>
                    <Pill type={sg}/>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ══════════════ AI ══════════════════════════════════════════════════ */}
        {tab==="ai"&&(
          <div className="card row" style={{padding:0,overflow:"hidden"}}>
            <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#6D28D9,#2563EB)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>✦</div>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>AI Трейдинг Ассистент</div>
                <div style={{fontSize:10,color:C.muted,display:"flex",alignItems:"center",gap:4}}><Dot color={C.green} pulse/> Live · RSI · Funding · WebSocket</div>
              </div>
            </div>
            <div style={{height:420,overflowY:"auto",padding:"14px 18px",display:"flex",flexDirection:"column",gap:8}}>
              {msgs.map((m,i)=>(
                <div key={i} style={{display:"flex",justifyContent:m.r==="u"?"flex-end":"flex-start",animation:"in .25s ease both"}}>
                  <div style={{maxWidth:"82%",background:m.r==="u"?"linear-gradient(135deg,#6D28D9,#2563EB)":C.dim,border:m.r==="u"?"none":`1px solid ${C.border}`,borderRadius:m.r==="u"?"12px 12px 3px 12px":"12px 12px 12px 3px",padding:"10px 14px",fontSize:13,lineHeight:1.6}}>{m.t}</div>
                </div>
              ))}
              {aiLoad&&<div style={{display:"flex",gap:4,padding:"8px 12px",alignSelf:"flex-start"}}>
                {[0,1,2].map(j=><div key={j} style={{width:6,height:6,borderRadius:"50%",background:"rgba(167,139,250,.5)",animation:`pls 1.2s ease ${j*.2}s infinite`}}/>)}
              </div>}
              <div ref={chatRef}/>
            </div>
            <div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8}}>
              <input className="ai-in" value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&ask(inp)} placeholder={`Спроси про ${META[sym].label} — RSI, уровни, сигналы...`} disabled={aiLoad}/>
              <button className="sbtn" onClick={()=>ask(inp)} disabled={aiLoad||!inp.trim()}>{aiLoad?"…":"→"}</button>
            </div>
            <div style={{padding:"5px 14px 12px",display:"flex",gap:5,flexWrap:"wrap"}}>
              {[`Анализ ${META[sym].label}`,`Уровни входа`,`Funding rate`,`RSI сигнал`,`Рынок сегодня`].map(q=>(
                <button key={q} onClick={()=>ask(q)} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 9px",color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════ LIQUIDATIONS ════════════════════════════════════════ */}
        {tab==="liqs"&&(
          <div style={{display:"grid",gap:8}}>
            <div className="card row" style={{padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <span style={{fontWeight:600,fontSize:13}}>⚡ Ликвидации · Live</span>
                <span style={{fontSize:11,color:C.muted,marginLeft:8}}>Принудительные закрытия по всему рынку</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <Dot color={C.red} pulse/>
                <span style={{fontSize:10,color:C.muted}}>real-time</span>
              </div>
            </div>
            <div className="card row" style={{padding:0,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"80px 1fr 80px 100px 70px",padding:"7px 16px",borderBottom:`1px solid ${C.border}`}}>
                {["Время","Актив","Сторона","Размер",""].map((h,i)=>(
                  <span key={i} style={{fontSize:10,color:C.muted,letterSpacing:.4,textTransform:"uppercase"}}>{h}</span>
                ))}
              </div>
              {liqs.map((l,i)=>(
                <div key={l.id} style={{display:"grid",gridTemplateColumns:"80px 1fr 80px 100px 70px",padding:"9px 16px",borderBottom:i<liqs.length-1?`1px solid ${C.border}`:"none",animation:"in .2s ease both",animationDelay:`${Math.min(i*.015,.3)}s`}}>
                  <span className="mono" style={{fontSize:11,color:C.muted}}>{l.time}</span>
                  <span style={{fontWeight:600,fontSize:13}}>{l.asset}</span>
                  <span style={{fontSize:12,fontWeight:700,color:l.side==="LONG"?C.green:C.red}}>{l.side==="LONG"?"▲":"▼"} {l.side}</span>
                  <span className="mono" style={{fontSize:12,fontWeight:600,color:l.side==="LONG"?C.red:C.green}}>-${l.size}</span>
                  <span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:l.side==="LONG"?`${C.green}10`:`${C.red}10`,color:l.side==="LONG"?C.green:C.red,fontWeight:600,textAlign:"center",alignSelf:"center"}}>LIQ</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
