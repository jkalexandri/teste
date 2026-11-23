// "Asaas de mentira" para os testes (decisão #115): responde como a API v3 do Asaas, sem internet.
// O site de teste precisa subir com ASAAS_URL=http://127.0.0.1:4010 para usar este servidor.
// Chaves aceitas: "$aact_hmlg_teste" (Testes) e "$aact_prod_teste" (Produção). Qualquer outra: 401.
// Uso direto: node apps/web/tests/asaas-falso.cjs   (ou require e chame iniciar())
const http = require('http');
const CHAVES = { '$aact_hmlg_teste': 'Conta Teste Sandbox', '$aact_prod_teste': 'Conta Teste Produção' };
const chamadas = [];
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
      responder(404, { errors: [{ description: 'Rota não simulada: ' + req.url }] });
    });
  });
  return new Promise((r) => srv.listen(porta, '127.0.0.1', () => r(srv)));
}
module.exports = { iniciar, chamadas };
if (require.main === module) iniciar().then(() => console.log('Asaas de mentira em http://127.0.0.1:4010'));
