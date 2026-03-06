require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const IS_TURSO = !!process.env.TURSO_DATABASE_URL;
const db = IS_TURSO ? require('./api/db') : require('./database');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

let dbReady = false;
app.use(async (req, res, next) => {
    if (!dbReady) { await db.initDB(); dbReady = true; }
    next();
});

app.get('/api/clients', async (req, res) => {
    try { res.json(await db.getAllClients()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/clients/:id', async (req, res) => {
    try { const c = await db.getClientById(req.params.id); c ? res.json(c) : res.status(404).json({ error: 'Nao encontrado' }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/clients', async (req, res) => {
    try {
        const { name, phone, recurrence } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });
        const ex = await db.getClientByName(name.trim());
        if (ex) return res.status(409).json({ error: 'Ja cadastrado', client: ex });
        res.status(201).json(await db.createClient({ id: generateId(), name: name.trim(), phone: phone || '', recurrence: recurrence || 'mensal', created_at: new Date().toISOString() }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/clients/:id', async (req, res) => {
    try {
        const ex = await db.getClientById(req.params.id);
        if (!ex) return res.status(404).json({ error: 'Nao encontrado' });
        const { name, phone, recurrence } = req.body;
        res.json(await db.updateClient(req.params.id, { name: (name || ex.name).trim(), phone: phone !== undefined ? phone : ex.phone, recurrence: recurrence || ex.recurrence }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/clients/:id', async (req, res) => {
    try { const d = await db.deleteClient(req.params.id); d ? res.json({ message: 'Excluido', client: d }) : res.status(404).json({ error: 'Nao encontrado' }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders', async (req, res) => {
    try {
        let o = await db.getAllOrders();
        const { month, client, search } = req.query;
        if (month) o = o.filter(x => x.date.startsWith(month));
        if (client) o = o.filter(x => x.client_name.toLowerCase() === client.toLowerCase());
        if (search) { const s = search.toLowerCase(); o = o.filter(x => x.client_name.toLowerCase().includes(s) || (x.obs && x.obs.toLowerCase().includes(s))); }
        res.json(o);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/orders', async (req, res) => {
    try {
        const { client_name, date, value, obs, phone, recurrence } = req.body;
        if (!client_name || !client_name.trim()) return res.status(400).json({ error: 'Cliente obrigatorio' });
        if (!date) return res.status(400).json({ error: 'Data obrigatoria' });
        if (value === undefined || isNaN(value)) return res.status(400).json({ error: 'Valor obrigatorio' });
        const ex = await db.getClientByName(client_name.trim());
        if (!ex) await db.createClient({ id: generateId(), name: client_name.trim(), phone: phone || '', recurrence: recurrence || 'mensal', created_at: new Date().toISOString() });
        res.status(201).json(await db.createOrder({ id: generateId(), client_name: client_name.trim(), date, value: parseFloat(value), obs: obs || '', created_at: new Date().toISOString() }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/orders/:id', async (req, res) => {
    try { const d = await db.deleteOrder(req.params.id); d ? res.json({ message: 'Excluido', order: d }) : res.status(404).json({ error: 'Nao encontrado' }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export', async (req, res) => { try { res.json(await db.exportAll()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/import', async (req, res) => {
    try {
        const { clients, orders } = req.body;
        if (!clients || !orders) return res.status(400).json({ error: 'Dados invalidos' });
        await db.importAll({ clients, orders });
        res.json({ message: 'Importado', clients: clients.length, orders: orders.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/stats', async (req, res) => {
    try {
        const [clients, orders] = await Promise.all([db.getAllClients(), db.getAllOrders()]);
        const now = new Date();
        const cm = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        const mo = orders.filter(o => o.date.startsWith(cm));
        const rc = clients.filter(c => c.recurrence !== 'avulso');
        res.json({ totalClients: clients.length, recurringClients: rc.length, monthOrders: mo.length, monthTotal: mo.reduce((s, o) => s + o.value, 0), totalOrders: orders.length, totalRevenue: orders.reduce((s, o) => s + o.value, 0), pendingClients: rc.filter(c => !mo.find(o => o.client_name.toLowerCase() === c.name.toLowerCase())).length, currentMonth: cm });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('  Emporio Pascoto - Servidor rodando em http://localhost:' + PORT);
    console.log('');
});
