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

// Otvori sesiju (unesi ime i prvu sumu)
app.post('/api/tables/:id/session', (req, res) => {
  const { guest_name, amount } = req.body;

  const existing = db.prepare(
    'SELECT * FROM sessions WHERE table_id = ? AND closed_at IS NULL'
  ).get(req.params.id);

  if (existing) {
    // Dodaj novu stavku na postojeću sesiju
    db.prepare(
      'INSERT INTO session_items (session_id, amount) VALUES (?, ?)'
    ).run(existing.id, amount);

    db.prepare(
      'UPDATE sessions SET total_amount = total_amount + ? WHERE id = ?'
    ).run(amount, existing.id);

    return res.json({ ok: true, session_id: existing.id });
  }

  // Kreiraj novu sesiju
const result = db.prepare(
  'INSERT INTO sessions (table_id, guest_name, total_amount, waiter_name) VALUES (?, ?, ?, ?)'
).run(req.params.id, guest_name, amount, req.body.waiter_name || 'Konobar 1');

  db.prepare(
    'INSERT INTO session_items (session_id, amount) VALUES (?, ?)'
  ).run(result.lastInsertRowid, amount);

  res.json({ ok: true, session_id: result.lastInsertRowid });
});

// Obrisi jedan iznos
app.delete('/api/session-items/:itemId', (req, res) => {
  const item = db.prepare(
    'SELECT * FROM session_items WHERE id = ?'
  ).get(req.params.itemId);

  if (!item) return res.json({ ok: false });

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