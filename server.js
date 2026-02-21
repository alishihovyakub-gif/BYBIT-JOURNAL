/**
 * Сервер для Railway
 * Раздаёт статические файлы и обрабатывает /api/bybit (логика Bybit встроена)
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BYBIT_BASE = 'https://api.bybit.com';

// CORS для всех запросов
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Парсинг JSON для POST-запросов
app.use(express.json());

// Статические файлы (index.html, style.css, app.js)
app.use(express.static(path.join(__dirname)));

// === Логика Bybit API (из api/bybit.js) ===
function signRequest(apiKey, apiSecret, timestamp, queryString = '') {
  const recvWindow = '5000';
  const signStr = timestamp + apiKey + recvWindow + queryString;
  return crypto.createHmac('sha256', apiSecret).update(signStr).digest('hex');
}

function formatDuration(ms) {
  if (ms < 60000) return Math.round(ms / 1000) + ' сек';
  if (ms < 3600000) return Math.round(ms / 60000) + ' мин';
  if (ms < 86400000) return Math.round(ms / 3600000) + ' ч';
  return Math.round(ms / 86400000) + ' дн';
}

function matchExecutionsToTrades(executions) {
  const trades = [];
  const queues = {};
  const sorted = [...executions].sort((a, b) => parseFloat(a.execTime) - parseFloat(b.execTime));

  for (const e of sorted) {
    const symbol = e.symbol.replace('USDT', '').replace('USDC', '');
    const side = e.side;
    const qty = parseFloat(e.execQty);
    const price = parseFloat(e.execPrice);
    const fee = parseFloat(e.execFee || 0);
    const time = parseInt(e.execTime, 10);

    if (!queues[symbol]) queues[symbol] = [];

    if (side === 'Buy') {
      queues[symbol].push({ price, qty, time, fee });
    } else {
      let remaining = qty;
      let totalCost = 0;
      let totalBuyFee = 0;
      let matchedQty = 0;
      let entryTime = time;

      while (remaining > 0 && queues[symbol].length > 0) {
        const buy = queues[symbol][0];
        const matchQty = Math.min(remaining, buy.qty);
        if (matchedQty === 0) entryTime = buy.time;
        totalCost += buy.price * matchQty;
        totalBuyFee += buy.qty > 0 ? (buy.fee / buy.qty) * matchQty : 0;
        buy.qty -= matchQty;
        remaining -= matchQty;
        matchedQty += matchQty;
        if (buy.qty <= 0) queues[symbol].shift();
      }

      if (matchedQty === 0) continue;

      const exitValue = price * matchedQty;
      const pnlUsdt = exitValue - totalCost - totalBuyFee - (fee * matchedQty / qty);
      const pnlPercent = totalCost > 0 ? ((exitValue - totalCost) / totalCost) * 100 : 0;
      const durationMs = Math.max(0, time - entryTime);

      trades.push({
        id: e.execId || `${symbol}-${time}`,
        token: symbol,
        quantity: matchedQty,
        entryPrice: totalCost / matchedQty,
        exitPrice: price,
        sumUsdt: exitValue.toFixed(2),
        commission: (totalBuyFee + (fee * matchedQty / qty)).toFixed(4),
        pnlUsdt,
        pnlPercent,
        entryDate: new Date(entryTime).toISOString().slice(0, 19).replace('T', ' '),
        exitDate: new Date(time).toISOString().slice(0, 19).replace('T', ' '),
        duration: formatDuration(durationMs),
      });
    }
  }

  return trades.reverse();
}

async function fetchAllExecutions(apiKey, apiSecret) {
  const all = [];
  let cursor = '';
  const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;

  do {
    const params = new URLSearchParams({ category: 'spot', limit: '100' });
    if (!cursor) params.set('startTime', String(twoYearsAgo));
    if (cursor) params.set('cursor', cursor);

    const timestamp = Date.now().toString();
    const queryString = params.toString();
    const signature = signRequest(apiKey, apiSecret, timestamp, queryString);

    const res = await fetch(`${BYBIT_BASE}/v5/execution/list?${queryString}`, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': '5000',
      },
    });

    const data = await res.json();
    if (data.retCode !== 0) throw new Error(data.retMsg || 'Ошибка Bybit API');

    const list = data.result?.list || [];
    all.push(...list);
    cursor = data.result?.nextPageCursor || '';
  } while (cursor);

  return all;
}

// API Bybit
app.post('/api/bybit', async (req, res) => {
  try {
    const { apiKey, apiSecret } = req.body || {};
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Укажите apiKey и apiSecret' });
    }

    const executions = await fetchAllExecutions(apiKey.trim(), apiSecret.trim());
    const trades = matchExecutionsToTrades(executions);
    return res.status(200).json({ trades });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
