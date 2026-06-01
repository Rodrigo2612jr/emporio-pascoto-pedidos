# 🌿 Empório Pascoto — Gestão de Pedidos

Sistema profissional de gestão de pedidos via WhatsApp, com controle de recorrência,
retenção de clientes e acompanhamento de status de pedido.

> Stack: **Frontend** estático (HTML/CSS/JS puro, sem build) · **Backend** serverless na **Vercel** · **Banco** **Turso** (libSQL).

---

## ✨ Funcionalidades

- **Dashboard** com faturamento do mês, a receber, gráfico de faturamento (6 meses), top clientes e quebra por status.
- **Pedidos** com filtros avançados: mês, cliente, faixa de valor, status, busca e ordenação. Colunas ordenáveis, paginação e status editável inline (Pendente / Entregue / Pago).
- **Clientes**: base com total gasto, nº de pedidos, último pedido, status de recorrência, histórico em timeline.
- **Recorrência**: quem já pediu e quem está pendente no mês de referência.
- **Retenção**: clientes que passaram do prazo, classificados por urgência (crítico/alto/médio) e faturamento em risco.
- **Mensagem WhatsApp** personalizável com variáveis (`{nome}`, `{telefone}`, `{recorrencia}`, `{ultimo_pedido}`).
- **Backup**: exportar/importar JSON e exportar pedidos em **CSV** (abre no Excel).

---

## 📁 Estrutura

```
├── api/index.js      # Função serverless (API REST) — Vercel
├── public/index.html # Frontend completo (1 arquivo)
├── vercel.json       # Rewrites + config da função
├── .env.example      # Variáveis (Turso) para produção
└── package.json
```

## 📋 API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/clients` | Listar clientes |
| POST | `/api/clients` | Cadastrar cliente |
| PUT | `/api/clients/:id` | Atualizar cliente |
| DELETE | `/api/clients/:id` | Excluir cliente + pedidos |
| GET | `/api/orders` | Listar pedidos (filtros: `month`, `client`, `search`) |
| POST | `/api/orders` | Registrar pedido (aceita `status`) |
| PUT | `/api/orders/:id` | Atualizar pedido (data, valor, obs, `status`) |
| DELETE | `/api/orders/:id` | Excluir pedido |
| GET | `/api/stats` | Estatísticas (inclui quebra por status e ticket médio) |
| GET | `/api/export` | Exportar tudo (JSON) |
| POST | `/api/import` | Importar dados (JSON) |

> **Status do pedido**: `pendente` · `entregue` · `pago`. A coluna é criada automaticamente
> (migração idempotente) — bancos antigos passam a ter `status='pendente'` por padrão.

---

## 🌐 Deploy (Vercel + Turso)

1. Crie um banco gratuito em [turso.tech](https://turso.tech) e copie a **URL** e o **Token**.
2. Na Vercel: **Settings → Environment Variables**, configure:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
3. Faça o deploy (push no GitHub conectado à Vercel). As tabelas são criadas sozinhas no primeiro acesso.

## 💾 Backup recomendado

Use **⚙️ Dados → Exportar backup (JSON)** com frequência. Para importar, use o mesmo menu —
a importação **substitui** todos os dados atuais (confirma antes).
