require('dotenv').config();

const app = require('./api/index');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║  📦 Empório Pascoto - Gestão de Pedidos         ║');
    console.log('  ║  ✅ Servidor rodando!                           ║');
    console.log(`  ║  🌐 http://localhost:${PORT}                        ║`);
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
});
