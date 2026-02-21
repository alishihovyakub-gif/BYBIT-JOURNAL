/**
 * Дневник спотовых сделок — синхронизация с Bybit API
 * Сделки загружаются автоматически при нажатии «Загрузить сделки с Bybit»
 */

// === 1. Подключение к Telegram (если открыто внутри Telegram) ===
let tg = null;
if (typeof window.Telegram !== 'undefined' && window.Telegram.WebApp) {
  tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
}

// === 2. URL вашего API (поменяйте после деплоя на Vercel!) ===
// Локально: не работает — нужен деплой
// После деплоя: https://ваш-проект.vercel.app/api/bybit
const API_URL = getApiUrl();

function getApiUrl() {
  // Если открыто как Telegram Mini App или на Vercel — берём текущий хост
  const host = window.location.origin;
  if (host && host !== 'null' && !host.startsWith('file:')) {
    return host + '/api/bybit';
  }
  // Иначе пользователь должен указать в настройках или в коде
  return ''; // Заполните после деплоя: 'https://your-app.vercel.app/api/bybit'
}

// === 3. Расчёт среднего профита и лосса ===
function calcStats(trades) {
  const profitable = trades.filter(t => t.pnlUsdt > 0);
  const losing = trades.filter(t => t.pnlUsdt < 0);
  const avgProfit = profitable.length ? profitable.reduce((s, t) => s + t.pnlUsdt, 0) / profitable.length : 0;
  const avgLoss = losing.length ? losing.reduce((s, t) => s + t.pnlUsdt, 0) / losing.length : 0;
  const totalPnL = trades.reduce((s, t) => s + t.pnlUsdt, 0);
  return { avgProfit, avgLoss, totalPnL };
}

// === 4. Отрисовка таблицы сделок ===
function renderTable(trades) {
  const tbody = document.getElementById('tradesTable');
  const emptyMsg = document.getElementById('emptyMessage');

  tbody.innerHTML = '';

  if (!trades || trades.length === 0) {
    emptyMsg.classList.remove('hidden');
    updateStats([]);
    return;
  }

  emptyMsg.classList.add('hidden');
  trades.forEach(trade => {
    const tr = document.createElement('tr');
    const pnlClass = trade.pnlUsdt >= 0 ? 'profit-cell' : 'loss-cell';
    tr.innerHTML = `
      <td><strong>${trade.token}</strong></td>
      <td>${trade.quantity}</td>
      <td>${trade.entryPrice}</td>
      <td>${trade.exitPrice}</td>
      <td>${trade.sumUsdt}</td>
      <td>${trade.commission}</td>
      <td class="${pnlClass}">${trade.pnlUsdt >= 0 ? '+' : ''}${trade.pnlUsdt.toFixed(2)}</td>
      <td class="${pnlClass}">${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(2)}%</td>
      <td>${trade.duration}</td>
    `;
    tbody.appendChild(tr);
  });

  updateStats(trades);
}

// === 5. Обновить блок статистики ===
function updateStats(trades) {
  const { avgProfit, avgLoss, totalPnL } = calcStats(trades || []);
  document.getElementById('avgProfit').textContent = avgProfit.toFixed(2);
  document.getElementById('avgLoss').textContent = avgLoss.toFixed(2);
  const totalEl = document.getElementById('totalPnL');
  totalEl.textContent = (totalPnL >= 0 ? '+' : '') + totalPnL.toFixed(2);
  totalEl.className = 'stat-value ' + (totalPnL >= 0 ? 'profit-cell' : 'loss-cell');
}

// === 6. Загрузка сделок с Bybit ===
async function loadFromBybit() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const apiSecret = document.getElementById('apiSecret').value.trim();
  const statusEl = document.getElementById('status');
  const btn = document.getElementById('btnLoad');

  if (!apiKey || !apiSecret) {
    statusEl.textContent = 'Введите API Key и API Secret';
    statusEl.className = 'status error';
    return;
  }

  if (!API_URL) {
    statusEl.textContent = 'Ошибка: приложение не задеплоено. Укажите URL API в app.js или задеплойте на Vercel.';
    statusEl.className = 'status error';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Загрузка...';
  statusEl.textContent = '';
  statusEl.className = 'status';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, apiSecret }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Ошибка при загрузке');
    }

    const trades = data.trades || [];
    renderTable(trades);
    statusEl.textContent = `Загружено ${trades.length} сделок`;
    statusEl.className = 'status success';

    if (tg) tg.showAlert(`Загружено ${trades.length} сделок`);
  } catch (err) {
    statusEl.textContent = err.message || 'Ошибка сети';
    statusEl.className = 'status error';
    if (tg) tg.showAlert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '📥 Загрузить сделки с Bybit';
  }
}

// === 7. Запуск ===
document.getElementById('btnLoad').addEventListener('click', loadFromBybit);

// Показать пустую таблицу при загрузке
renderTable([]);
