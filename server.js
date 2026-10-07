// KarDoors — сервер сайта и приёма заказов (без внешних зависимостей, Node 18+)
const http = require('http');
const fs = require('fs');
const path = require('path');

// --- загрузка .env ---
try {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const CHAT_ID = process.env.CHAT_ID || '';
const PUBLIC = path.join(__dirname, 'public');
const ORDERS_FILE = path.join(__dirname, 'orders.jsonl');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const clip = (s, n) => String(s ?? '').trim().slice(0, n);

// простое ограничение: 5 заказов в 10 минут с одного IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 5;
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function sendTelegram(text) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error('Telegram: ' + (data.description || r.status));
}

async function handleOrder(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (limited(ip)) return json(res, 429, { ok: false, error: 'Слишком много заявок. Попробуйте позже или позвоните нам.' });

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 30000) return json(res, 413, { ok: false, error: 'Слишком большой запрос' });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return json(res, 400, { ok: false, error: 'Неверный формат' }); }

  if (body.website) return json(res, 200, { ok: true }); // honeypot для ботов

  const name = clip(body.name, 80);
  const phone = clip(body.phone, 30);
  const address = clip(body.address, 200);
  const comment = clip(body.comment, 500);
  const digits = phone.replace(/\D/g, '');
  const items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];

  if (!name) return json(res, 400, { ok: false, error: 'Укажите имя' });
  if (digits.length < 9 || digits.length > 15) return json(res, 400, { ok: false, error: 'Укажите корректный номер телефона' });
  if (!items.length) return json(res, 400, { ok: false, error: 'Корзина пуста' });

  const clean = items.map((i) => ({
    model: clip(i.model, 40),
    size: clip(i.size, 20),
    side: clip(i.side, 20),
    material: clip(i.material, 40),
    qty: Math.min(Math.max(parseInt(i.qty, 10) || 1, 1), 999),
  }));

  const id = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  const lines = clean.map(
    (i, n) => `${n + 1}. <b>${esc(i.model)}</b> — ${esc(i.size)} м, ${esc(i.side)}, ${esc(i.material)} — <b>${i.qty} шт.</b>`
  );
  const total = clean.reduce((s, i) => s + i.qty, 0);
  const text =
    `🚪 <b>Новый заказ KarDoors #${id}</b>\n\n` +
    `👤 ${esc(name)}\n📞 ${esc(phone)}\n` +
    (address ? `📍 ${esc(address)}\n` : '') +
    (comment ? `💬 ${esc(comment)}\n` : '') +
    `\n${lines.join('\n')}\n\nВсего дверей: <b>${total}</b>`;

  // резервная копия — заказ не потеряется, даже если Telegram недоступен
  fs.appendFile(ORDERS_FILE, JSON.stringify({ id, at: new Date().toISOString(), name, phone, address, comment, items: clean }) + '\n', () => {});

  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('BOT_TOKEN/CHAT_ID не заданы — заказ сохранён только в orders.jsonl');
    console.log(text.replace(/<[^>]+>/g, ''));
    return json(res, 500, { ok: false, error: 'Приём заказов ещё настраивается. Позвоните нам: +998 91 389 79 87' });
  }
  try {
    await sendTelegram(text);
    json(res, 200, { ok: true, id });
  } catch (e) {
    console.error(e.message);
    json(res, 502, { ok: false, error: 'Не удалось отправить заявку. Позвоните нам: +998 91 389 79 87' });
  }
}

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Не найдено'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
    });
    res.end(data);
  });
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/order') return handleOrder(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, () => console.log(`KarDoors: http://localhost:${PORT}`));
