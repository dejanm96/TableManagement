const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'kafic.db'));

// Kreiraj tabele ako ne postoje
db.exec(`
  CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pos_x REAL DEFAULT 0,
    pos_y REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL,
    guest_name TEXT NOT NULL,
    total_amount REAL DEFAULT 0,
    opened_at TEXT DEFAULT (datetime('now')),
    closed_at TEXT,
    FOREIGN KEY (table_id) REFERENCES tables(id)
  );

  CREATE TABLE IF NOT EXISTS session_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    added_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS waiters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

  CREATE TABLE IF NOT EXISTS daily_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    total_revenue REAL DEFAULT 0,
    generated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS drinks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sort_order INTEGER NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_item_id INTEGER NOT NULL,
    drink_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    added_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_item_id) REFERENCES session_items(id),
    FOREIGN KEY (drink_id) REFERENCES drinks(id)
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drink_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    quantity REAL NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (drink_id) REFERENCES drinks(id)
  );
`);

// Migracija: waiter_name kolona nedostaje u starijim bazama
const sessionCols = db.prepare('PRAGMA table_info(sessions)').all().map(c => c.name);
if (!sessionCols.includes('waiter_name')) {
  db.exec("ALTER TABLE sessions ADD COLUMN waiter_name TEXT DEFAULT 'Konobar 1'");
}

// Migracija: stanje zaliha (servings_per_unit = koliko porcija/čašica ima jedna jedinica sa stanja,
// npr. flaša žestokog pića ili vina na čašu; za limenke/flašice koje se prodaju cijele ostaje 1)
const drinkCols = db.prepare('PRAGMA table_info(drinks)').all().map(c => c.name);
if (!drinkCols.includes('servings_per_unit')) {
  db.exec('ALTER TABLE drinks ADD COLUMN servings_per_unit REAL DEFAULT 1');
}
if (!drinkCols.includes('current_stock')) {
  db.exec('ALTER TABLE drinks ADD COLUMN current_stock REAL DEFAULT 0');
}

// Seed pića (samo jednom, prati redoslijed i cijene sa fizičkog spiska šanka)
const DRINK_SEED = [
  ['SOK LIMENKA', 'Bezalkoholna', 3.00],
  ['VITAMINKA', 'Bezalkoholna', 3.00],
  ['SOK FL. EXOTIC', 'Bezalkoholna', 2.50],
  ['ORANGINA', 'Bezalkoholna', 3.50],
  ['KISELA', 'Bezalkoholna', 2.00],
  ['CEDEVITA', 'Bezalkoholna', 2.50],
  ['VODA OBIČNA', 'Bezalkoholna', 2.00],
  ['ŠPECI FLAŠICA', 'Bezalkoholna', 3.00],
  ['VINO 1L', 'Vino', 20.00],
  ['VINO FLAŠICA', 'Vino', 6.50],
  ['MALVAZIJA', 'Vino', 27.00],
  ['JEGER', 'Žestoka pića', 3.00],
  ['GORKI LIST', 'Žestoka pića', 2.50],
  ['ŠTOK', 'Žestoka pića', 2.50],
  ['DŽIN', 'Žestoka pića', 3.00],
  ['RAKIJA', 'Žestoka pića', 2.50],
  ['TEKILA', 'Žestoka pića', 3.00],
  ['BIJELA VODKA', 'Žestoka pića', 3.00],
  ['CRVENA VODKA', 'Žestoka pića', 3.00],
  ['MARTINI', 'Žestoka pića', 3.50],
  ['CHIVAS', 'Žestoka pića', 6.00],
  ['BALLANTINES', 'Žestoka pića', 3.50],
  ['JACK DANIELS', 'Žestoka pića', 5.00],
  ['JOHNNIE WALK.', 'Žestoka pića', 3.50],
  ['VLAHOV', 'Žestoka pića', 2.50],
  ['PELINKOVAC', 'Žestoka pića', 2.50],
  ['VINJAK', 'Žestoka pića', 2.50],
  ['KONJAK', 'Žestoka pića', 2.50],
  ['PELINOVA', 'Žestoka pića', 4.50],
  ['JAMESON', 'Žestoka pića', 5.00],
  ['RED BULL', 'Energetska pića', 3.50],
  ['JELEN', 'Pivo', 2.50],
  ['STELLA', 'Pivo', 3.50],
  ['MADRI', 'Pivo', 3.00],
  ['BAVARIA', 'Pivo', 3.50],
  ['STAROPRAMEN', 'Pivo', 3.00],
  ['BEKS/NIKŠIĆKO', 'Pivo', 3.00],
  ['SOMERSBY', 'Pivo', 3.50],
  ['CORONA', 'Pivo', 6.00],
  ['ENERGY FAST', 'Energetska pića', 3.50],
  ['HYDRA LIMENKA', 'Energetska pića', 3.00],
  ['KAFA', 'Kafa i topli napici', 2.50],
  ['NESS', 'Kafa i topli napici', 2.50],
  ['NESS UKUSI', 'Kafa i topli napici', 2.50],
  ['ČAJ', 'Kafa i topli napici', 2.00],
  ['TOPLA ČOK.', 'Kafa i topli napici', 3.00],
  ['LIMUNADA', 'Bezalkoholna', 3.00],
  ['C. NARANDŽA/MIX', 'Bezalkoholna', 4.00],
  ['TROPICO KOKTEL', 'Kokteli', 8.00],
  ['WHITE LADY', 'Kokteli', 8.00],
  ['MOHITO', 'Kokteli', 8.00],
  ['BLUE LAGOON', 'Kokteli', 8.00],
  ['PINA COLADA', 'Kokteli', 8.00],
  ['OKF SPARKLING', 'Kokteli', 3.50],
  ['TEQ.SUNRISE', 'Kokteli', 3.50],
  ['COSMOPOL.', 'Kokteli', 3.50],
];

const drinkCount = db.prepare('SELECT COUNT(*) as c FROM drinks').get().c;
if (drinkCount === 0) {
  const insertDrink = db.prepare(
    'INSERT INTO drinks (sort_order, name, category, price) VALUES (?, ?, ?, ?)'
  );
  const insertMany = db.transaction((rows) => {
    rows.forEach((row, i) => insertDrink.run(i + 1, row[0], row[1], row[2]));
  });
  insertMany(DRINK_SEED);
}

module.exports = db;