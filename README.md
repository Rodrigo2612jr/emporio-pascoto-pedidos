# 📦 Gestão de Pedidos WhatsApp - Empório Pascoto

Sistema de gestão de pedidos via WhatsApp com controle de recorrência e retenção de clientes.

## 🚀 Como rodar localmente

```bash
npm install
npm start
```

Acesse: **http://localhost:3000**

## 📁 Estrutura

```
├── server.js        # Servidor Express (API REST)
├── database.js      # Módulo SQLite (persistência)
├── public/          # Frontend (HTML/CSS/JS)
│   └── index.html
├── data/            # Banco de dados SQLite (criado automaticamente)
│   └── pedidos.db
└── package.json
```

## 🌐 Deploy (Hospedagem)

### Opção 1 — Railway (recomendado, gratuito)
1. Crie uma conta em [railway.app](https://railway.app)
2. Conecte seu GitHub
3. Faça push deste projeto no GitHub
4. No Railway: **New Project → Deploy from GitHub repo**
5. Railway detecta automaticamente o Node.js e roda `npm start`
6. Pronto! Você recebe uma URL pública tipo `emporio-pascoto.up.railway.app`

### Opção 2 — Render (gratuito)
1. Crie uma conta em [render.com](https://render.com)
2. New → Web Service → conecte o repo GitHub
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Clique em Deploy

### Opção 3 — VPS própria
```bash
# No servidor
git clone <seu-repo>
cd sistema-pedidos
npm install
PORT=80 node server.js
```

## 📋 API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/clients` | Listar clientes |
| POST | `/api/clients` | Cadastrar cliente |
| PUT | `/api/clients/:id` | Atualizar cliente |
| DELETE | `/api/clients/:id` | Excluir cliente + pedidos |
| GET | `/api/orders` | Listar pedidos |
| POST | `/api/orders` | Registrar pedido |
| DELETE | `/api/orders/:id` | Excluir pedido |
| GET | `/api/export` | Exportar tudo (JSON) |
| POST | `/api/import` | Importar dados (JSON) |
| GET | `/api/stats` | Estatísticas do dashboard |
