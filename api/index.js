const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('../database');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files (works locally; Vercel CDN handles this in production)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ======================== UTILITY ========================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ======================== DB INIT MIDDLEWARE ========================
let dbInitialized = false;
let dbInitPromise = null;

app.use(async (req, res, next) => {
    if (!dbInitialized) {
        if (!dbInitPromise) {
            dbInitPromise = db.initDB()
                .then(() => { dbInitialized = true; })
                .catch(err => {
                    console.error('❌ Falha ao inicializar banco:', err);
                    dbInitPromise = null; // allow retry
                    throw err;
                });
        }
        try {
            await dbInitPromise;
        } catch (err) {
            return res.status(500).json({ error: 'Banco de dados indisponível' });
        }
    }
    next();
});

// ======================== CLIENTS API ========================

app.get('/api/clients', async (req, res) => {
    try {
        res.json(await db.getAllClients());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/clients/:id', async (req, res) => {
    try {
        const client = await db.getClientById(req.params.id);
        if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
        res.json(client);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clients', async (req, res) => {
    try {
        const { name, phone, recurrence } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }

        const existing = await db.getClientByName(name.trim());
        if (existing) {
            return res.status(409).json({ error: 'Cliente já cadastrado', client: existing });
        }

        const client = await db.createClient({
            id: generateId(),
            name: name.trim(),
            phone: phone || '',
            recurrence: recurrence || 'mensal',
            created_at: new Date().toISOString()
        });
        res.status(201).json(client);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/clients/:id', async (req, res) => {
    try {
        const existing = await db.getClientById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });

        const { name, phone, recurrence } = req.body;
        const updated = await db.updateClient(req.params.id, {
            name: (name || existing.name).trim(),
            phone: phone !== undefined ? phone : existing.phone,
            recurrence: recurrence || existing.recurrence
        });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clients/:id', async (req, res) => {
    try {
        const deleted = await db.deleteClient(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Cliente não encontrado' });
        res.json({ message: 'Cliente excluído', client: deleted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================== ORDERS API ========================

app.get('/api/orders', async (req, res) => {
    try {
        let orders = await db.getAllOrders();
        const { month, client, search } = req.query;

        if (month) orders = orders.filter(o => o.date.startsWith(month));
        if (client) orders = orders.filter(o => o.client_name.toLowerCase() === client.toLowerCase());
        if (search) {
            const s = search.toLowerCase();
            orders = orders.filter(o =>
                o.client_name.toLowerCase().includes(s) ||
                (o.obs && o.obs.toLowerCase().includes(s))
            );
        }
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const { client_name, date, value, obs, phone, recurrence } = req.body;

        if (!client_name || !client_name.trim()) {
            return res.status(400).json({ error: 'Nome do cliente é obrigatório' });
        }
        if (!date) {
            return res.status(400).json({ error: 'Data é obrigatória' });
        }
        if (value === undefined || value === null || isNaN(value)) {
            return res.status(400).json({ error: 'Valor é obrigatório' });
        }

        // Auto-register client if not exists
        const existing = await db.getClientByName(client_name.trim());
        if (!existing) {
            await db.createClient({
                id: generateId(),
                name: client_name.trim(),
                phone: phone || '',
                recurrence: recurrence || 'mensal',
                created_at: new Date().toISOString()
            });
        }

        const order = await db.createOrder({
            id: generateId(),
            client_name: client_name.trim(),
            date,
            value: parseFloat(value),
            obs: obs || '',
            created_at: new Date().toISOString()
        });
        res.status(201).json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/orders/:id', async (req, res) => {
    try {
        const deleted = await db.deleteOrder(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Pedido não encontrado' });
        res.json({ message: 'Pedido excluído', order: deleted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================== EXPORT / IMPORT ========================

app.get('/api/export', async (req, res) => {
    try {
        res.json(await db.exportAll());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/import', async (req, res) => {
    try {
        const { clients, orders } = req.body;
        if (!clients || !orders) {
            return res.status(400).json({ error: 'Dados inválidos. Necessário: clients e orders' });
        }
        await db.importAll({ clients, orders });
        res.json({ message: 'Dados importados', clients: clients.length, orders: orders.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================== STATS ========================

app.get('/api/stats', async (req, res) => {
    try {
        const [clients, orders] = await Promise.all([db.getAllClients(), db.getAllOrders()]);
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthOrders = orders.filter(o => o.date.startsWith(currentMonth));
        const monthTotal = monthOrders.reduce((s, o) => s + o.value, 0);
        const recurringClients = clients.filter(c => c.recurrence !== 'avulso');
        const pendingClients = recurringClients.filter(c =>
            !monthOrders.find(o => o.client_name.toLowerCase() === c.name.toLowerCase())
        );

        res.json({
            totalClients: clients.length,
            recurringClients: recurringClients.length,
            monthOrders: monthOrders.length,
            monthTotal,
            totalOrders: orders.length,
            totalRevenue: orders.reduce((s, o) => s + o.value, 0),
            pendingClients: pendingClients.length,
            currentMonth
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = app;
