const path = require('path');
const fs = require('fs');

// ======================== DUAL BACKEND ========================
// Turso (cloud) quando TURSO_DATABASE_URL está definido
// better-sqlite3 (local) como fallback para desenvolvimento
const IS_TURSO = !!process.env.TURSO_DATABASE_URL;

let tursoClient, sqliteDb;

if (IS_TURSO) {
    const { createClient } = require('@libsql/client');
    tursoClient = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });
    console.log('  🌐 Banco: Turso (cloud)');
} else {
    // Dynamic require prevents Vercel from bundling this native module
    const _mod = 'better-sqlite3';
    const Database = require(_mod);
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    sqliteDb = new Database(path.join(dataDir, 'pedidos.db'));
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    console.log('  💾 Banco: SQLite local (data/pedidos.db)');
}

// ======================== UNIFIED ASYNC INTERFACE ========================

async function queryAll(sql, args = []) {
    if (IS_TURSO) {
        const r = await tursoClient.execute({ sql, args });
        return r.rows.map(row => {
            const obj = {};
            r.columns.forEach((col, i) => { obj[col] = row[i]; });
            return obj;
        });
    }
    return sqliteDb.prepare(sql).all(...args);
}

async function queryOne(sql, args = []) {
    if (IS_TURSO) {
        const rows = await queryAll(sql, args);
        return rows[0] || null;
    }
    return sqliteDb.prepare(sql).get(...args) || null;
}

async function run(sql, args = []) {
    if (IS_TURSO) {
        return tursoClient.execute({ sql, args });
    }
    return sqliteDb.prepare(sql).run(...args);
}

async function batchRun(statements) {
    if (IS_TURSO) {
        return tursoClient.batch(
            statements.map(s => ({ sql: s.sql, args: s.args || [] })),
            'write'
        );
    }
    const tx = sqliteDb.transaction(() => {
        for (const s of statements) {
            sqliteDb.prepare(s.sql).run(...(s.args || []));
        }
    });
    return tx();
}

// ======================== INIT ========================

async function initDB() {
    const ddl = [
        `CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT DEFAULT '',
            recurrence TEXT NOT NULL DEFAULT 'mensal',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            client_name TEXT NOT NULL,
            date TEXT NOT NULL,
            value REAL NOT NULL DEFAULT 0,
            obs TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_name)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date)`,
        `CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)`,
    ];

    if (IS_TURSO) {
        await tursoClient.batch(ddl.map(sql => ({ sql })), 'write');
    } else {
        for (const sql of ddl) {
            sqliteDb.exec(sql);
        }
    }
    console.log('  ✅ Tabelas inicializadas');
}

// ======================== CLIENTS ========================

async function getAllClients() {
    return queryAll('SELECT * FROM clients ORDER BY name ASC');
}

async function getClientById(id) {
    return queryOne('SELECT * FROM clients WHERE id = ?', [id]);
}

async function getClientByName(name) {
    return queryOne('SELECT * FROM clients WHERE LOWER(name) = LOWER(?)', [name]);
}

async function createClient({ id, name, phone, recurrence, created_at }) {
    await run(
        'INSERT INTO clients (id, name, phone, recurrence, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, name, phone || '', recurrence || 'mensal', created_at || new Date().toISOString()]
    );
    return getClientById(id);
}

async function updateClient(id, { name, phone, recurrence }) {
    await run(
        'UPDATE clients SET name = ?, phone = ?, recurrence = ? WHERE id = ?',
        [name, phone || '', recurrence || 'mensal', id]
    );
    return getClientById(id);
}

async function deleteClient(id) {
    const client = await getClientById(id);
    if (client) {
        await batchRun([
            { sql: 'DELETE FROM orders WHERE LOWER(client_name) = LOWER(?)', args: [client.name] },
            { sql: 'DELETE FROM clients WHERE id = ?', args: [id] },
        ]);
    }
    return client;
}

// ======================== ORDERS ========================

async function getAllOrders() {
    return queryAll('SELECT * FROM orders ORDER BY date DESC');
}

async function getOrderById(id) {
    return queryOne('SELECT * FROM orders WHERE id = ?', [id]);
}

async function createOrder({ id, client_name, date, value, obs, created_at }) {
    await run(
        'INSERT INTO orders (id, client_name, date, value, obs, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, client_name, date, value, obs || '', created_at || new Date().toISOString()]
    );
    return getOrderById(id);
}

async function deleteOrder(id) {
    const order = await getOrderById(id);
    if (order) {
        await run('DELETE FROM orders WHERE id = ?', [id]);
    }
    return order;
}

// ======================== EXPORT / IMPORT ========================

async function exportAll() {
    const [clients, orders] = await Promise.all([getAllClients(), getAllOrders()]);
    return { clients, orders, exportDate: new Date().toISOString() };
}

async function importAll({ clients, orders }) {
    const statements = [
        { sql: 'DELETE FROM orders', args: [] },
        { sql: 'DELETE FROM clients', args: [] },
    ];

    for (const c of clients) {
        statements.push({
            sql: 'INSERT INTO clients (id, name, phone, recurrence, created_at) VALUES (?, ?, ?, ?, ?)',
            args: [c.id, c.name, c.phone || '', c.recurrence || 'mensal', c.created_at || c.createdAt || new Date().toISOString()]
        });
    }

    for (const o of orders) {
        statements.push({
            sql: 'INSERT INTO orders (id, client_name, date, value, obs, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            args: [o.id, o.client_name || o.clientName, o.date, o.value, o.obs || '', o.created_at || o.createdAt || new Date().toISOString()]
        });
    }

    await batchRun(statements);
}

// Graceful shutdown (local SQLite only)
if (!IS_TURSO && sqliteDb) {
    process.on('exit', () => sqliteDb.close());
}

module.exports = {
    initDB,
    getAllClients, getClientById, getClientByName, createClient, updateClient, deleteClient,
    getAllOrders, getOrderById, createOrder, deleteOrder,
    exportAll, importAll,
};
