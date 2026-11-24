// "Asaas de mentira" para os testes (decisão #115): responde como a API v3 do Asaas, sem internet.
// O site de teste precisa subir com ASAAS_URL=http://127.0.0.1:4010 para usar este servidor.
// Chaves aceitas: "$aact_hmlg_teste" (Testes) e "$aact_prod_teste" (Produção). Qualquer outra: 401.
// Uso direto: node apps/web/tests/asaas-falso.cjs   (ou require e chame iniciar())
const http = require('http');
const CHAVES = { '$aact_hmlg_teste': 'Conta Teste Sandbox', '$aact_prod_teste': 'Conta Teste Produção' };
const chamadas = [];
// Webhooks cadastrados (como o Asaas guarda)
const webhooks = [];
function iniciar(porta = 4010) {
  const srv = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      chamadas.push({ metodo: req.method, caminho: req.url, corpo: corpo ? JSON.parse(corpo) : null });
      const responder = (status, dados) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(dados)); };
      const conta = CHAVES[req.headers['access_token']];
      if (!conta) return responder(401, { errors: [{ code: 'invalid_access_token', description: 'A chave de API fornecida é inválida' }] });
      if (req.method === 'GET' && req.url.startsWith('/myAccount/commercialInfo')) return responder(200, { companyName: conta, email: 'conta@teste.com' });
      // Webhooks: listar, criar e atualizar
      if (req.method === 'GET' && req.url.startsWith('/webhooks')) return responder(200, { data: webhooks });
      if (req.method === 'POST' && req.url === '/webhooks') {
        const b = JSON.parse(corpo || '{}');
        if (!b.url || !b.authToken || !Array.isArray(b.events) || !b.email) return responder(400, { errors: [{ description: 'Campos obrigatórios do webhook' }] });
        const w = { id: 'wh_' + (webhooks.length + 1), ...b }; webhooks.push(w); return responder(200, w);
      }
      const m = req.url.match(/^\/webhooks\/([^/?]+)/);
      if (req.method === 'PUT' && m) {
        const w = webhooks.find((x) => x.id === m[1]); if (!w) return responder(404, { errors: [{ description: 'Webhook não encontrado' }] });
        Object.assign(w, JSON.parse(corpo || '{}')); return responder(200, w);
      }
      responder(404, { errors: [{ description: 'Rota não simulada: ' + req.url }] });
    });
  });
  return new Promise((r) => srv.listen(porta, '127.0.0.1', () => r(srv)));
}
/** Simula o Asaas mandando um aviso para cada webhook cadastrado (como quando uma cobrança é criada). */
async function avisar(evento = 'PAYMENT_CREATED', dados = {}) {
  const r = [];
  for (const w of webhooks.filter((x) => x.enabled !== false && !x.interrupted)) {
    // Nunca chama o site de verdade: troca o domínio pelo site de teste local
    const local = 'http://localhost:3005' + new URL(w.url).pathname;
    const resp = await fetch(local, { method: 'POST', headers: { 'Content-Type': 'application/json', 'asaas-access-token': w.authToken }, body: JSON.stringify({ event: evento, ...dados }) });
    r.push(resp.status);
  }
  return r;
}
module.exports = { iniciar, chamadas, webhooks, avisar };
if (require.main === module) iniciar().then(() => console.log('Asaas de mentira em http://127.0.0.1:4010'));
