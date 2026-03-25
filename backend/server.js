import express from "express"
import { WebSocketServer } from "ws"
import WebSocket from "ws"
import { createServer } from "http"
import cors from "cors"
import "dotenv/config"

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(cors({ origin: "*" }))
app.use(express.json())

const state = { prices: {}, clients: new Set() }
const SYMBOLS = ["btcusdt","ethusdt","solusdt","tonusdt"]

function connectBinance() {
  const streams = SYMBOLS.map(s => `${s}@ticker`).join("/")
  const binance = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`)
  binance.on("open", () => console.log("✅ Binance подключён"))
  binance.on("message", (raw) => {
    const msg = JSON.parse(raw)
    if (!msg.data) return
    const d = msg.data
    state.prices[d.s] = { symbol:d.s, price:d.c, change:d.P, high:d.h, low:d.l, volume:d.q, funding:d.r||"0", time:Date.now() }
    broadcast({ type:"price", data:state.prices[d.s] })
  })
  binance.on("close", () => setTimeout(connectBinance, 3000))
  binance.on("error", (err) => console.error("Binance error:", err.message))
}

function broadcast(msg) {
  const str = JSON.stringify(msg)
  state.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(str) })
}

wss.on("connection", (ws) => {
  state.clients.add(ws)
  ws.send(JSON.stringify({ type:"snapshot", data:state.prices }))
  ws.on("close", () => state.clients.delete(ws))
})

app.get("/health", (req, res) => res.json({ status:"ok", clients:state.clients.size, symbols:Object.keys(state.prices).length }))

app.post("/ai/chat", async (req, res) => {
  console.log("AI request received")
  const { messages, context } = req.body
  const key = process.env.ANTHROPIC_API_KEY
  console.log("API key exists:", !!key)
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: `Ты трейдинг-ассистент. Данные: ${context||""}. Отвечай кратко по-русски.`,
        messages
      })
    })
    const data = await r.json()
    console.log("Anthropic response:", JSON.stringify(data).slice(0,200))
    res.json({ text: data.content?.[0]?.text || "Нет ответа" })
  } catch(e) {
    console.error("AI ERROR:", e.message)
    res.status(500).json({ error: e.message })
  }
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => { console.log(`🚀 Сервер: http://localhost:${PORT}`); connectBinance() })
