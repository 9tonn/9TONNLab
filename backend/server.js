import express    from "express"
import { WebSocketServer } from "ws"
import WebSocket  from "ws"
import { createServer } from "http"
import cors       from "cors"
import "dotenv/config"

const app    = express()
const server = createServer(app)   // HTTP сервер
const wss    = new WebSocketServer({ server })  // WS поверх HTTP

app.use(cors())
app.use(express.json())

// ── ХРАНИЛИЩЕ ЦЕН ────────────────────────────────────────
const state = {
  prices:  {},   // последние цены всех монет
  clients: new Set()  // список подключённых юзеров
}

const SYMBOLS = ["btcusdt","ethusdt","solusdt","tonusdt"]

// ── ПОДКЛЮЧЕНИЕ К BINANCE ─────────────────────────────────
function connectBinance() {
  // Собираем один стрим для всех монет сразу
  const streams = SYMBOLS.map(s => `${s}@ticker`).join("/")
  const url = `wss://fstream.binance.com/stream?streams=${streams}`

  console.log("🔌 Подключаемся к Binance...")
  const binance = new WebSocket(url)

  binance.on("open", () => {
    console.log("✅ Binance WebSocket подключён")
  })

  binance.on("message", (raw) => {
    const msg = JSON.parse(raw)
    if (!msg.data) return

    const d = msg.data

    // Сохраняем цену
    state.prices[d.s] = {
      symbol:  d.s,          // "BTCUSDT"
      price:   d.c,          // текущая цена
      change:  d.P,          // % за 24h
      high:    d.h,          // максимум 24h
      low:     d.l,          // минимум 24h
      volume:  d.q,          // объём в USDT
      funding: d.r || "0",   // funding rate
      time:    Date.now()
    }

    // Моментально рассылаем ВСЕМ подключённым клиентам
    broadcast({ type: "price", data: state.prices[d.s] })
  })

  // Если соединение оборвалось — переподключаемся через 3 сек
  binance.on("close", () => {
    console.log("⚠️  Binance отключился, переподключение через 3с...")
    setTimeout(connectBinance, 3000)
  })

  binance.on("error", (err) => {
    console.error("Binance ошибка:", err.message)
  })
}

// ── РАССЫЛКА ВСЕМ КЛИЕНТАМ ───────────────────────────────
function broadcast(msg) {
  const str = JSON.stringify(msg)
  state.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(str)
    }
  })
}

// ── КЛИЕНТЫ (твой фронтенд) ──────────────────────────────
wss.on("connection", (ws) => {
  state.clients.add(ws)
  console.log(`👤 Клиент подключился. Всего: ${state.clients.size}`)

  // Сразу даём текущие цены — не ждать следующего обновления
  ws.send(JSON.stringify({
    type: "snapshot",
    data: state.prices
  }))

  ws.on("close", () => {
    state.clients.delete(ws)
    console.log(`👤 Клиент ушёл. Осталось: ${state.clients.size}`)
  })
})

// ── REST ENDPOINTS ────────────────────────────────────────
// Для тех кто не хочет WebSocket — просто GET запрос
app.get("/prices", (req, res) => {
  res.json(state.prices)
})

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    clients: state.clients.size,
    symbols: Object.keys(state.prices).length
  })
})

// ── AI CHAT ───────────────────────────────────────────────
app.post("/ai/chat", async (req, res) => {
  const { messages, context } = req.body
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: `Ты трейдинг-ассистент Pump&Pray. Данные рынка: ${context}. Отвечай по-русски кратко и конкретно.`,
        messages
      })
    })
    const data = await response.json()
    res.json({ text: data.content?.[0]?.text || "Ошибка" })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── ЗАПУСК ────────────────────────────────────────────────
const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен: http://localhost:${PORT}`)
  connectBinance()  // сразу подключаемся к Binance
})
