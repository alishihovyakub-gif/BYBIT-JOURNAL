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

// === 2. URL вашего API ===
const STORAGE_API_URL = 'bybit_api_base_url';

function getApiUrl() {
  const host = window.location.origin;
  if (host && host !== 'null' && !host.startsWith('file:')) {
    return host + '/api/bybit';
  }
  const saved = localStorage.getItem(STORAGE_API_URL) || document.getElementById('apiBaseUrl')?.value?.trim();
  if (saved) {
    return saved.replace(/\/$/, '') + '/api/bybit';
  }
  return '';
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

  const apiUrl = getApiUrl();
  if (!apiUrl) {
    statusEl.textContent = 'Укажите URL приложения выше (например: https://ваш-проект.up.railway.app)';
    statusEl.className = 'status error';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Загрузка...';
  statusEl.textContent = '';
  statusEl.className = 'status';

  try {
    const savedUrl = document.getElementById('apiBaseUrl')?.value?.trim();
    if (savedUrl) localStorage.setItem(STORAGE_API_URL, savedUrl);
    const res = await fetch(getApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, apiSecret }),
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        res.ok
          ? 'Сервер вернул неверный ответ'
          : `Сервер вернул ошибку ${res.status}. Проверьте, что приложение задеплоено и API работает.`
      );
    }

    if (!res.ok) {
      throw new Error(data.error || `Ошибка сервера ${res.status}`);
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

// Восстановить сохранённый URL при загрузке
const savedBase = localStorage.getItem(STORAGE_API_URL);
if (savedBase) document.getElementById('apiBaseUrl').value = savedBase;

// Показать пустую таблицу при загрузке
renderTable([]);
