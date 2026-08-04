const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// ─── STOLOVI ────────────────────────────────────────────

// Dohvati sve stolove sa aktivnim sesijama
app.get('/api/tables', (req, res) => {
  const tables = db.prepare('SELECT * FROM tables ORDER BY id').all();
  
  const result = tables.map(table => {
    const session = db.prepare(
      'SELECT * FROM sessions WHERE table_id = ? AND closed_at IS NULL'
    ).get(table.id);
    
    if (session) {
      const items = db.prepare(
        'SELECT * FROM session_items WHERE session_id = ? ORDER BY added_at'
      ).all(session.id);
      return { ...table, session: { ...session, items } };
    }
    
    return { ...table, session: null };
  });
  
  res.json(result);
});

// Dodaj novi sto
app.post('/api/tables', (req, res) => {
  const { name, pos_x, pos_y } = req.body;
  const result = db.prepare(
    'INSERT INTO tables (name, pos_x, pos_y) VALUES (?, ?, ?)'
  ).run(name, pos_x || 0, pos_y || 0);
  res.json({ id: result.lastInsertRowid, name, pos_x, pos_y });
});

// Ukloni sto
app.delete('/api/tables/:id', (req, res) => {
  db.prepare('DELETE FROM tables WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Ažuriraj poziciju stola
app.patch('/api/tables/:id/position', (req, res) => {
  const { pos_x, pos_y } = req.body;
  db.prepare(
    'UPDATE tables SET pos_x = ?, pos_y = ? WHERE id = ?'
  ).run(pos_x, pos_y, req.params.id);
  res.json({ ok: true });
});

// Preimenuj sto
app.patch('/api/tables/:id/rename', (req, res) => {
  const { name } = req.body;
  db.prepare('UPDATE tables SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ ok: true });
});

// ─── SESIJE (aktivni stolovi) ────────────────────────────

// Dohvati aktivnu sesiju za sto
app.get('/api/tables/:id/session', (req, res) => {
  const session = db.prepare(
    'SELECT * FROM sessions WHERE table_id = ? AND closed_at IS NULL'
  ).get(req.params.id);

  if (!session) return res.json(null);

  const items = db.prepare(
    'SELECT * FROM session_items WHERE session_id = ? ORDER BY added_at'
  ).all(session.id);

  res.json({ ...session, items });
});

// Otvori sesiju (unesi ime i prvu sumu, ili listu pića)
app.post('/api/tables/:id/session', (req, res) => {
  const { guest_name, items } = req.body;
  let { amount } = req.body;

  // Ako stižu pića umjesto ručnog iznosa, izračunaj iznos iz cjenovnika
  let resolvedItems = null;
  if (items && items.length > 0) {
    const drinkIds = items.map(i => i.drink_id);
    const placeholders = drinkIds.map(() => '?').join(',');
    const drinks = db.prepare(
      `SELECT * FROM drinks WHERE id IN (${placeholders})`
    ).all(...drinkIds);
    const drinkMap = new Map(drinks.map(d => [d.id, d]));

    resolvedItems = items
      .filter(i => drinkMap.has(i.drink_id) && i.quantity > 0)
      .map(i => ({ ...i, price: drinkMap.get(i.drink_id).price }));

    amount = resolvedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  if (!amount || amount <= 0) return res.json({ ok: false, message: 'Nema iznosa' });

  const existing = db.prepare(
    'SELECT * FROM sessions WHERE table_id = ? AND closed_at IS NULL'
  ).get(req.params.id);

  let sessionId;

  if (existing) {
    sessionId = existing.id;
    db.prepare(
      'UPDATE sessions SET total_amount = total_amount + ? WHERE id = ?'
    ).run(amount, sessionId);
  } else {
    const result = db.prepare(
      'INSERT INTO sessions (table_id, guest_name, total_amount, waiter_name) VALUES (?, ?, ?, ?)'
    ).run(req.params.id, guest_name, amount, req.body.waiter_name || 'Konobar 1');
    sessionId = result.lastInsertRowid;
  }

  const itemResult = db.prepare(
    'INSERT INTO session_items (session_id, amount) VALUES (?, ?)'
  ).run(sessionId, amount);

  if (resolvedItems) {
    const insertOrderItem = db.prepare(
      'INSERT INTO order_items (session_item_id, drink_id, quantity) VALUES (?, ?, ?)'
    );
    resolvedItems.forEach(i => insertOrderItem.run(itemResult.lastInsertRowid, i.drink_id, i.quantity));
  }

  res.json({ ok: true, session_id: sessionId });
});

// Obrisi jedan iznos
app.delete('/api/session-items/:itemId', (req, res) => {
  const item = db.prepare(
    'SELECT * FROM session_items WHERE id = ?'
  ).get(req.params.itemId);

  if (!item) return res.json({ ok: false });

  db.prepare('DELETE FROM order_items WHERE session_item_id = ?').run(req.params.itemId);
  db.prepare('DELETE FROM session_items WHERE id = ?').run(req.params.itemId);

  db.prepare(
    'UPDATE sessions SET total_amount = total_amount - ? WHERE id = ?'
  ).run(item.amount, item.session_id);

  res.json({ ok: true });
});

// Resetuj sto (plaćeno)
app.post('/api/tables/:id/close', (req, res) => {
  const session = db.prepare(
    'SELECT * FROM sessions WHERE table_id = ? AND closed_at IS NULL'
  ).get(req.params.id);

  if (!session) return res.json({ ok: false, message: 'Nema aktivne sesije' });

  // Zatvori sesiju
  db.prepare(
    "UPDATE sessions SET closed_at = datetime('now') WHERE id = ?"
  ).run(session.id);

  // Dodaj na dnevni izvještaj
  const today = new Date().toISOString().split('T')[0];
  const report = db.prepare(
    'SELECT * FROM daily_reports WHERE date = ?'
  ).get(today);

  if (report) {
    db.prepare(
      'UPDATE daily_reports SET total_revenue = total_revenue + ? WHERE date = ?'
    ).run(session.total_amount, today);
  } else {
    db.prepare(
      'INSERT INTO daily_reports (date, total_revenue) VALUES (?, ?)'
    ).run(today, session.total_amount);
  }

  res.json({ ok: true, amount: session.total_amount });
});

// ─── KONOBARI ────────────────────────────────────────────

// Provjeri PIN konobara
app.post('/api/waiters/login', (req, res) => {
  const { pin } = req.body;
  const waiter = db.prepare('SELECT * FROM waiters WHERE pin = ?').get(pin);
  if (!waiter) return res.json({ ok: false });
  res.json({ ok: true, id: waiter.id, name: waiter.name });
});

// Dohvati sve konobara
app.get('/api/waiters', (req, res) => {
  const waiters = db.prepare('SELECT id, name FROM waiters ORDER BY name').all();
  res.json(waiters);
});

// Dodaj konobara
app.post('/api/waiters', (req, res) => {
  const { name, pin } = req.body;
  try {
    const result = db.prepare('INSERT INTO waiters (name, pin) VALUES (?, ?)').run(name, pin);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) {
    res.json({ ok: false, message: 'PIN već postoji!' });
  }
});

// Obrisi konobara
app.delete('/api/waiters/:id', (req, res) => {
  db.prepare('DELETE FROM waiters WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── PIĆA ────────────────────────────────────────────────

// Cjenovnik (sva pića, po redoslijedu sa spiska šanka)
app.get('/api/drinks', (req, res) => {
  const drinks = db.prepare('SELECT * FROM drinks ORDER BY sort_order').all();
  res.json(drinks);
});

// Izmijeni cijenu pića
app.patch('/api/drinks/:id', (req, res) => {
  const { price } = req.body;
  db.prepare('UPDATE drinks SET price = ? WHERE id = ?').run(price, req.params.id);
  res.json({ ok: true });
});

// Potrošnja pića za jedan dan (sabrano po piću, po redoslijedu sa spiska šanka)
app.get('/api/reports/:date/drinks', (req, res) => {
  const rows = db.prepare(`
    SELECT d.id, d.sort_order, d.name, d.category, d.price,
      COALESCE(SUM(oi.quantity), 0) as quantity
    FROM drinks d
    LEFT JOIN order_items oi
      ON oi.drink_id = d.id
      AND date(oi.added_at, '+2 hours') = ?
    GROUP BY d.id
    ORDER BY d.sort_order
  `).all(req.params.date);
  res.json(rows);
});

// ─── STATISTIKA ──────────────────────────────────────────

// Dnevni izvještaj
app.get('/api/reports', (req, res) => {
  const reports = db.prepare(
    'SELECT * FROM daily_reports ORDER BY date DESC LIMIT 30'
  ).all();
  res.json(reports);
});

// Detalji za jedan dan
app.get('/api/reports/:date', (req, res) => {
  const sessions = db.prepare(`
    SELECT s.*, t.name as table_name,
    strftime('%H:%M', datetime(s.opened_at, '+2 hours')) as opened_time,
    strftime('%H:%M', datetime(s.closed_at, '+2 hours')) as closed_time
    FROM sessions s
    JOIN tables t ON s.table_id = t.id
    WHERE date(s.closed_at, '+2 hours') = ?
    ORDER BY s.closed_at DESC
  `).all(req.params.date);
  res.json(sessions);
});

// Dohvati PIN
app.get('/api/pin', (req, res) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('pin');
  res.json({ pin: row ? row.value : '1234' });
});

// Promijeni PIN
app.post('/api/pin', (req, res) => {
  const { pin } = req.body;
  const existing = db.prepare('SELECT * FROM settings WHERE key = ?').get('pin');
  if (existing) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(pin, 'pin');
  } else {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('pin', pin);
  }
  res.json({ ok: true });
});

// ─── START ───────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Server radi na http://localhost:${PORT}`);
});