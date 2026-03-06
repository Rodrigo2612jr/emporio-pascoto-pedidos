// All imports are lazy to diagnose Vercel bundling issues
let _client = null;
let _initialized = false;

function getClient() {
    if (!_client) {
        const { createClient } = require('@libsql/client/web');
        _client = createClient({
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
        });
    }
    return _client;
}

async function initDB() {
    if (_initialized) return;
    await getClient().batch([
        { sql: `CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT DEFAULT '', recurrence TEXT NOT NULL DEFAULT 'mensal', created_at TEXT NOT NULL DEFAULT (datetime('now')))` },
        { sql: `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, client_name TEXT NOT NULL, date TEXT NOT NULL, value REAL NOT NULL DEFAULT 0, obs TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')))` },
        { sql: `CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_name)` },
        { sql: `CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date)` },
        { sql: `CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)` },
    ], 'write');
    _initialized = true;
}

function rowsToObjects(result) {
    return result.rows.map(row => {
        const obj = {};
        result.columns.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
    });
}

async function queryAll(sql, args) {
    return rowsToObjects(await getClient().execute({ sql, args: args || [] }));
}

async function queryOne(sql, args) {
    const rows = await queryAll(sql, args);
    return rows[0] || null;
}

async function execSQL(sql, args) {
    return getClient().execute({ sql, args: args || [] });
}

function gid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();

    const url = req.url || '/';
    const body = req.body || {};

    // Health check - NO database needed
    if (url === '/api' || url === '/api/' || url.startsWith('/api/health')) {
        return res.status(200).json({
            status: 'ok',
            hasUrl: !!process.env.TURSO_DATABASE_URL,
            hasToken: !!process.env.TURSO_AUTH_TOKEN,
            node: process.version
        });
    }

    try {
        await initDB();
    } catch (err) {
        return res.status(500).json({ error: 'DB init failed: ' + err.message });
    }

    try {
        // ======= CLIENTS =======
        if (url.startsWith('/api/clients')) {
            const id = url.replace(/^\/api\/clients\/?/, '').split(/[/?]/)[0] || null;

            if (req.method === 'GET' && !id) {
                return res.json(await queryAll('SELECT * FROM clients ORDER BY name ASC'));
            }
            if (req.method === 'GET' && id) {
                const c = await queryOne('SELECT * FROM clients WHERE id = ?', [id]);
                return c ? res.json(c) : res.status(404).json({ error: 'Nao encontrado' });
            }
            if (req.method === 'POST') {
                const { name, phone, recurrence } = body;
                if (!name || !name.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });
                const ex = await queryOne('SELECT * FROM clients WHERE LOWER(name) = LOWER(?)', [name.trim()]);
                if (ex) return res.status(409).json({ error: 'Ja cadastrado', client: ex });
                const nid = gid();
                await execSQL('INSERT INTO clients (id, name, phone, recurrence, created_at) VALUES (?, ?, ?, ?, ?)',
                    [nid, name.trim(), phone || '', recurrence || 'mensal', new Date().toISOString()]);
                return res.status(201).json(await queryOne('SELECT * FROM clients WHERE id = ?', [nid]));
            }
            if (req.method === 'PUT' && id) {
                const ex = await queryOne('SELECT * FROM clients WHERE id = ?', [id]);
                if (!ex) return res.status(404).json({ error: 'Nao encontrado' });
                const { name, phone, recurrence } = body;
                await execSQL('UPDATE clients SET name = ?, phone = ?, recurrence = ? WHERE id = ?',
                    [(name || ex.name).trim(), phone !== undefined ? phone : ex.phone, recurrence || ex.recurrence, id]);
                return res.json(await queryOne('SELECT * FROM clients WHERE id = ?', [id]));
            }
            if (req.method === 'DELETE' && id) {
                const c = await queryOne('SELECT * FROM clients WHERE id = ?', [id]);
                if (!c) return res.status(404).json({ error: 'Nao encontrado' });
                await getClient().batch([
                    { sql: 'DELETE FROM orders WHERE LOWER(client_name) = LOWER(?)', args: [c.name] },
                    { sql: 'DELETE FROM clients WHERE id = ?', args: [id] },
                ], 'write');
                return res.json({ message: 'Excluido', client: c });
            }
        }

        // ======= ORDERS =======
        if (url.startsWith('/api/orders')) {
            const id = url.replace(/^\/api\/orders\/?/, '').split(/[/?]/)[0] || null;

            if (req.method === 'GET') {
                let orders = await queryAll('SELECT * FROM orders ORDER BY date DESC');
                const q = req.query || {};
                if (q.month) orders = orders.filter(o => o.date && o.date.startsWith(q.month));
                if (q.client) orders = orders.filter(o => o.client_name && o.client_name.toLowerCase() === q.client.toLowerCase());
                if (q.search) { const s = q.search.toLowerCase(); orders = orders.filter(o => (o.client_name && o.client_name.toLowerCase().includes(s)) || (o.obs && o.obs.toLowerCase().includes(s))); }
                return res.json(orders);
            }
            if (req.method === 'POST') {
                const { client_name, date, value, obs, phone, recurrence } = body;
                if (!client_name || !client_name.trim()) return res.status(400).json({ error: 'Cliente obrigatorio' });
                if (!date) return res.status(400).json({ error: 'Data obrigatoria' });
                if (value === undefined || isNaN(value)) return res.status(400).json({ error: 'Valor obrigatorio' });
                const ex = await queryOne('SELECT * FROM clients WHERE LOWER(name) = LOWER(?)', [client_name.trim()]);
                if (!ex) {
                    await execSQL('INSERT INTO clients (id, name, phone, recurrence, created_at) VALUES (?, ?, ?, ?, ?)',
                        [gid(), client_name.trim(), phone || '', recurrence || 'mensal', new Date().toISOString()]);
                }
                const nid = gid();
                await execSQL('INSERT INTO orders (id, client_name, date, value, obs, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [nid, client_name.trim(), date, parseFloat(value), obs || '', new Date().toISOString()]);
                return res.status(201).json(await queryOne('SELECT * FROM orders WHERE id = ?', [nid]));
            }
            if (req.method === 'DELETE' && id) {
                const o = await queryOne('SELECT * FROM orders WHERE id = ?', [id]);
                if (!o) return res.status(404).json({ error: 'Nao encontrado' });
                await execSQL('DELETE FROM orders WHERE id = ?', [id]);
                return res.json({ message: 'Excluido', order: o });
            }
        }

        // ======= STATS =======
        if (url.startsWith('/api/stats')) {
            const [clients, orders] = await Promise.all([queryAll('SELECT * FROM clients'), queryAll('SELECT * FROM orders')]);
            const now = new Date();
            const cm = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
            const mo = orders.filter(o => o.date && o.date.startsWith(cm));
            const rc = clients.filter(c => c.recurrence !== 'avulso');
            return res.json({
                totalClients: clients.length, recurringClients: rc.length,
                monthOrders: mo.length, monthTotal: mo.reduce((s, o) => s + (o.value || 0), 0),
                totalOrders: orders.length, totalRevenue: orders.reduce((s, o) => s + (o.value || 0), 0),
                pendingClients: rc.filter(c => !mo.find(o => o.client_name && o.client_name.toLowerCase() === c.name.toLowerCase())).length,
                currentMonth: cm
            });
        }

        // ======= EXPORT =======
        if (url.startsWith('/api/export')) {
            const [clients, orders] = await Promise.all([
                queryAll('SELECT * FROM clients ORDER BY name ASC'),
                queryAll('SELECT * FROM orders ORDER BY date DESC')
            ]);
            return res.json({ clients, orders, exportDate: new Date().toISOString() });
        }

        // ======= IMPORT =======
        if (url.startsWith('/api/import') && req.method === 'POST') {
            const { clients, orders } = body;
            if (!clients || !orders) return res.status(400).json({ error: 'Dados invalidos' });
            const stmts = [{ sql: 'DELETE FROM orders', args: [] }, { sql: 'DELETE FROM clients', args: [] }];
            for (const c of clients) {
                stmts.push({ sql: 'INSERT INTO clients (id, name, phone, recurrence, created_at) VALUES (?, ?, ?, ?, ?)',
                    args: [c.id, c.name, c.phone || '', c.recurrence || 'mensal', c.created_at || c.createdAt || new Date().toISOString()] });
            }
            for (const o of orders) {
                stmts.push({ sql: 'INSERT INTO orders (id, client_name, date, value, obs, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    args: [o.id, o.client_name || o.clientName, o.date, o.value, o.obs || '', o.created_at || o.createdAt || new Date().toISOString()] });
            }
            await getClient().batch(stmts, 'write');
            return res.json({ message: 'Importado', clients: clients.length, orders: orders.length });
        }

        return res.status(404).json({ error: 'Rota nao encontrada' });

    } catch (err) {
        console.error('API Error:', err);
        return res.status(500).json({ error: err.message });
    }
};
