const { createClient } = require('@libsql/client/web');

let _client = null;
let _init = false;

function db() {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

async function init() {
  if (_init) return;
  await db().batch([
    { sql: "CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT DEFAULT '', recurrence TEXT DEFAULT 'mensal', created_at TEXT DEFAULT (datetime('now')))" },
    { sql: "CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, client_name TEXT NOT NULL, date TEXT NOT NULL, value REAL DEFAULT 0, obs TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_oc ON orders(client_name)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_od ON orders(date)" },
  ], 'write');
  _init = true;
}

function toObj(r) {
  return r.rows.map(row => {
    const o = {};
    r.columns.forEach((c, i) => { o[c] = row[i]; });
    return o;
  });
}

async function all(sql, args) {
  return toObj(await db().execute({ sql, args: args || [] }));
}

async function one(sql, args) {
  const rows = await all(sql, args);
  return rows[0] || null;
}

async function run(sql, args) {
  return db().execute({ sql, args: args || [] });
}

function gid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const u = req.url || '/';
  const b = req.body || {};
  const q = req.query || {};

  if (u === '/api' || u === '/api/') {
    return res.json({ status: 'ok', ts: Date.now() });
  }

  try {
    await init();
  } catch (e) {
    return res.status(500).json({ error: 'DB init: ' + e.message });
  }

  try {
    // CLIENTS
    if (u.startsWith('/api/clients')) {
      const id = u.replace(/^\/api\/clients\/?/, '').split(/[/?]/)[0] || null;
      if (req.method === 'GET' && !id) return res.json(await all('SELECT * FROM clients ORDER BY name'));
      if (req.method === 'GET' && id) {
        const c = await one('SELECT * FROM clients WHERE id=?', [id]);
        return c ? res.json(c) : res.status(404).json({ error: 'Not found' });
      }
      if (req.method === 'POST') {
        const { name, phone, recurrence } = b;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });
        const ex = await one('SELECT * FROM clients WHERE LOWER(name)=LOWER(?)', [name.trim()]);
        if (ex) return res.status(409).json({ error: 'Ja cadastrado', client: ex });
        const nid = gid();
        await run('INSERT INTO clients(id,name,phone,recurrence,created_at)VALUES(?,?,?,?,?)', [nid, name.trim(), phone || '', recurrence || 'mensal', new Date().toISOString()]);
        return res.status(201).json(await one('SELECT * FROM clients WHERE id=?', [nid]));
      }
      if (req.method === 'PUT' && id) {
        const ex = await one('SELECT * FROM clients WHERE id=?', [id]);
        if (!ex) return res.status(404).json({ error: 'Not found' });
        const { name, phone, recurrence } = b;
        await run('UPDATE clients SET name=?,phone=?,recurrence=? WHERE id=?', [(name || ex.name).trim(), phone !== undefined ? phone : ex.phone, recurrence || ex.recurrence, id]);
        return res.json(await one('SELECT * FROM clients WHERE id=?', [id]));
      }
      if (req.method === 'DELETE' && id) {
        const c = await one('SELECT * FROM clients WHERE id=?', [id]);
        if (!c) return res.status(404).json({ error: 'Not found' });
        await db().batch([
          { sql: 'DELETE FROM orders WHERE LOWER(client_name)=LOWER(?)', args: [c.name] },
          { sql: 'DELETE FROM clients WHERE id=?', args: [id] },
        ], 'write');
        return res.json({ message: 'Excluido', client: c });
      }
    }

    // ORDERS
    if (u.startsWith('/api/orders')) {
      const id = u.replace(/^\/api\/orders\/?/, '').split(/[/?]/)[0] || null;
      if (req.method === 'GET') {
        let orders = await all('SELECT * FROM orders ORDER BY date DESC');
        if (q.month) orders = orders.filter(o => o.date && o.date.startsWith(q.month));
        if (q.client) orders = orders.filter(o => o.client_name && o.client_name.toLowerCase() === q.client.toLowerCase());
        if (q.search) { const s = q.search.toLowerCase(); orders = orders.filter(o => (o.client_name || '').toLowerCase().includes(s) || (o.obs || '').toLowerCase().includes(s)); }
        return res.json(orders);
      }
      if (req.method === 'POST') {
        const { client_name, date, value, obs, phone, recurrence } = b;
        if (!client_name || !client_name.trim()) return res.status(400).json({ error: 'Cliente obrigatorio' });
        if (!date) return res.status(400).json({ error: 'Data obrigatoria' });
        if (value === undefined || isNaN(value)) return res.status(400).json({ error: 'Valor obrigatorio' });
        const ex = await one('SELECT * FROM clients WHERE LOWER(name)=LOWER(?)', [client_name.trim()]);
        if (!ex) await run('INSERT INTO clients(id,name,phone,recurrence,created_at)VALUES(?,?,?,?,?)', [gid(), client_name.trim(), phone || '', recurrence || 'mensal', new Date().toISOString()]);
        const nid = gid();
        await run('INSERT INTO orders(id,client_name,date,value,obs,created_at)VALUES(?,?,?,?,?,?)', [nid, client_name.trim(), date, parseFloat(value), obs || '', new Date().toISOString()]);
        return res.status(201).json(await one('SELECT * FROM orders WHERE id=?', [nid]));
      }
      if (req.method === 'PUT' && id) {
        const ex = await one('SELECT * FROM orders WHERE id=?', [id]);
        if (!ex) return res.status(404).json({ error: 'Not found' });
        const { date, value, obs } = b;
        await run('UPDATE orders SET date=?,value=?,obs=? WHERE id=?', [date || ex.date, value !== undefined ? parseFloat(value) : ex.value, obs !== undefined ? obs : ex.obs, id]);
        return res.json(await one('SELECT * FROM orders WHERE id=?', [id]));
      }
      if (req.method === 'DELETE' && id) {
        const o = await one('SELECT * FROM orders WHERE id=?', [id]);
        if (!o) return res.status(404).json({ error: 'Not found' });
        await run('DELETE FROM orders WHERE id=?', [id]);
        return res.json({ message: 'Excluido', order: o });
      }
    }

    // STATS
    if (u.startsWith('/api/stats')) {
      const [cls, ords] = await Promise.all([all('SELECT * FROM clients'), all('SELECT * FROM orders')]);
      const now = new Date();
      const cm = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      const mo = ords.filter(o => o.date && o.date.startsWith(cm));
      const rc = cls.filter(c => c.recurrence !== 'avulso');
      return res.json({
        totalClients: cls.length, recurringClients: rc.length,
        monthOrders: mo.length, monthTotal: mo.reduce((s, o) => s + (o.value || 0), 0),
        totalOrders: ords.length, totalRevenue: ords.reduce((s, o) => s + (o.value || 0), 0),
        pendingClients: rc.filter(c => !mo.find(o => (o.client_name || '').toLowerCase() === c.name.toLowerCase())).length,
        currentMonth: cm
      });
    }

    // EXPORT
    if (u.startsWith('/api/export')) {
      const [cls, ords] = await Promise.all([all('SELECT * FROM clients ORDER BY name'), all('SELECT * FROM orders ORDER BY date DESC')]);
      return res.json({ clients: cls, orders: ords, exportDate: new Date().toISOString() });
    }

    // IMPORT
    if (u.startsWith('/api/import') && req.method === 'POST') {
      const { clients, orders } = b;
      if (!clients || !orders) return res.status(400).json({ error: 'Dados invalidos' });
      const st = [{ sql: 'DELETE FROM orders', args: [] }, { sql: 'DELETE FROM clients', args: [] }];
      for (const c of clients) st.push({ sql: 'INSERT INTO clients(id,name,phone,recurrence,created_at)VALUES(?,?,?,?,?)', args: [c.id, c.name, c.phone || '', c.recurrence || 'mensal', c.created_at || new Date().toISOString()] });
      for (const o of orders) st.push({ sql: 'INSERT INTO orders(id,client_name,date,value,obs,created_at)VALUES(?,?,?,?,?,?)', args: [o.id, o.client_name || o.clientName, o.date, o.value, o.obs || '', o.created_at || new Date().toISOString()] });
      await db().batch(st, 'write');
      return res.json({ message: 'Importado', clients: clients.length, orders: orders.length });
    }

    return res.status(404).json({ error: 'Rota nao encontrada' });
  } catch (e) {
    console.error('API Error:', e);
    return res.status(500).json({ error: e.message });
  }
};
