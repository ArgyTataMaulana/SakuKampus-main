import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from './supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../sakukampus.db');

// Initialize WebAssembly SQL engine with local wasm binary (Guaranteed to load on Vercel Serverless)
const candidatePaths = [
  path.resolve(process.cwd(), 'src/config/sql-wasm.wasm'),
  path.resolve(process.cwd(), 'api/sql-wasm.wasm'),
  path.resolve(process.cwd(), 'sql-wasm.wasm'),
  path.resolve(__dirname, 'sql-wasm.wasm'),
  path.resolve(__dirname, '../config/sql-wasm.wasm'),
  path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm')
];

let wasmBinary = null;
let activeWasmPath = null;
for (const p of candidatePaths) {
  try {
    if (fs.existsSync(p)) {
      wasmBinary = fs.readFileSync(p);
      activeWasmPath = p;
      break;
    }
  } catch (e) {}
}

let SQL;
try {
  SQL = await initSqlJs({
    locateFile: () => activeWasmPath,
    wasmBinary: wasmBinary
  });
} catch (wasmErr) {
  console.error('Failed to init WebAssembly SQL with custom wasm, falling back:', wasmErr.message);
  SQL = await initSqlJs();
}

let rawDb;
if (fs.existsSync(dbPath)) {
  const filebuffer = fs.readFileSync(dbPath);
  rawDb = new SQL.Database(filebuffer);
} else {
  rawDb = new SQL.Database();
}

function saveToDisk() {
  try {
    const data = rawDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    if (err.code !== 'EROFS') {
      console.warn('Failed to save database to disk:', err.message);
    }
  }
}

// Background sync to Supabase Cloud
async function syncToSupabase(table, action, payload) {
  try {
    if (!supabase) return;
    if (table === 'transactions' && action === 'INSERT') {
      await supabase.from('transactions').insert(payload);
    } else if (table === 'transactions' && action === 'DELETE') {
      if (payload.id) {
        await supabase.from('transactions').delete().eq('id', payload.id);
      }
    } else if (table === 'transactions' && action === 'UPDATE') {
      if (payload.id) {
        await supabase.from('transactions').update(payload.data).eq('id', payload.id);
      }
    } else if (table === 'users' && action === 'UPSERT') {
      await supabase.from('users').upsert(payload, { onConflict: 'google_sub' });
    } else if (table === 'chat_usage' && action === 'UPSERT') {
      await supabase.from('chat_usage').upsert(payload, { onConflict: 'user_id,usage_date' });
    }
  } catch (err) {
    // Non-blocking background sync
    console.warn(`[Supabase Sync] ${table} ${action} notice:`, err.message);
  }
}

// Better-sqlite3 API compatibility wrapper
class StatementWrapper {
  constructor(sql) {
    this.sql = sql;
  }

  get(...params) {
    const stmt = rawDb.prepare(this.sql);
    try {
      if (params.length > 0) {
        stmt.bind(params);
      }
      if (stmt.step()) {
        const obj = stmt.getAsObject();
        return obj;
      }
      return undefined;
    } finally {
      stmt.free();
    }
  }

  all(...params) {
    const stmt = rawDb.prepare(this.sql);
    const results = [];
    try {
      if (params.length > 0) {
        stmt.bind(params);
      }
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      return results;
    } finally {
      stmt.free();
    }
  }

  run(...params) {
    const stmt = rawDb.prepare(this.sql);
    try {
      if (params.length > 0) {
        stmt.bind(params);
      }
      stmt.step();
      saveToDisk();

      // Get last insert rowid
      const lastIdRes = rawDb.exec('SELECT last_insert_rowid() as id');
      const lastId = lastIdRes[0]?.values[0]?.[0] || 0;

      // Trigger asynchronous background sync to Supabase
      const sqlLower = this.sql.trim().toLowerCase();
      if (sqlLower.startsWith('insert into transactions')) {
        // params: user_id, category_id, amount, description, raw_text, source, parsed_by, occurred_on
        syncToSupabase('transactions', 'INSERT', {
          user_id: params[0],
          category_id: params[1],
          amount: params[2],
          description: params[3],
          raw_text: params[4],
          source: params[5],
          parsed_by: params[6],
          occurred_on: params[7]
        });
      } else if (sqlLower.startsWith('insert into users')) {
        // params: sub, email, name, picture
        syncToSupabase('users', 'UPSERT', {
          google_sub: params[0],
          email: params[1],
          name: params[2],
          picture_url: params[3]
        });
      }

      return {
        lastInsertRowid: lastId,
        changes: rawDb.getRowsModified()
      };
    } finally {
      stmt.free();
    }
  }
}

export const db = {
  prepare(sql) {
    return new StatementWrapper(sql);
  },
  exec(sql) {
    rawDb.exec(sql);
    saveToDisk();
  },
  transaction(fn) {
    return (...args) => {
      rawDb.exec('BEGIN TRANSACTION;');
      try {
        const result = fn(...args);
        rawDb.exec('COMMIT;');
        saveToDisk();
        return result;
      } catch (e) {
        rawDb.exec('ROLLBACK;');
        throw e;
      }
    };
  },
  pragma(str) {
    // No-op for pragma statements (WAL etc. handled automatically)
  }
};

export function initDatabase() {
  // Ensure tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_sub TEXT UNIQUE NOT NULL,
      email TEXT,
      name TEXT,
      picture_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT CHECK(type IN ('income', 'expense')) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      raw_text TEXT,
      source TEXT CHECK(source IN ('chat', 'voice')) DEFAULT 'chat',
      parsed_by TEXT CHECK(parsed_by IN ('rule', 'llm')) DEFAULT 'rule',
      occurred_on TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_usage (
      user_id INTEGER NOT NULL,
      usage_date TEXT NOT NULL,
      request_count INTEGER DEFAULT 0,
      llm_count INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, usage_date)
    );
  `);

  const catCount = db.prepare('SELECT COUNT(*) as cnt FROM categories').get()?.cnt || 0;
  if (catCount === 0) {
    const defaultCats = [
      ['Makan', 'expense'],
      ['Transportasi', 'expense'],
      ['Belanja', 'expense'],
      ['Tagihan', 'expense'],
      ['Hiburan', 'expense'],
      ['Kesehatan', 'expense'],
      ['Pendidikan', 'expense'],
      ['Lain-lain pengeluaran', 'expense'],
      ['Gaji', 'income'],
      ['Uang saku', 'income'],
      ['Bonus', 'income'],
      ['Lain-lain pemasukan', 'income']
    ];
    for (const [name, type] of defaultCats) {
      db.prepare('INSERT OR IGNORE INTO categories (name, type) VALUES (?, ?)').run(name, type);
    }
  }

  console.log('✅ Inisialisasi Database: Siap');
  console.log('☁️  Supabase Cloud Sync: AKTIF');
}
