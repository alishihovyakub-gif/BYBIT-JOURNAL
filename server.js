/**
 * Сервер для Railway
 * Раздаёт статические файлы и обрабатывает /api/bybit
 */

const express = require('express');
const path = require('path');
const bybitHandler = require('./api/bybit');

const app = express();
const PORT = process.env.PORT || 3000;

// Парсинг JSON для POST-запросов
app.use(express.json());

// Статические файлы (index.html, style.css, app.js)
app.use(express.static(path.join(__dirname)));

// API Bybit
app.post('/api/bybit', bybitHandler);

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
