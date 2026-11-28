// Termos de Uso (decisão #88). Página pública: filaproleads.com.br/termos
import type { Metadata } from "next";
import Link from "next/link";
import PaginaLegal, { Secao } from "@/components/legal/PaginaLegal";
import { ATUALIZADO_EM, dadosLegais } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Termos de Uso • FilaPro Leads" };

export default async function TermosPage() {
  const d = await dadosLegais();
  return (
    <PaginaLegal titulo="Termos de Uso" atualizado={ATUALIZADO_EM}>
      <p>
        Estes Termos regulam o uso do <b>FilaPro Leads</b> (filaproleads.com.br), oferecido por <b>{d.responsavel}</b> (CPF/CNPJ {d.documento}),
        com endereço em {d.endereco}. Ao comprar um plano, iniciar o teste grátis ou usar a plataforma, você concorda com estes Termos e com a{" "}
        <Link href="/privacidade">Política de Privacidade</Link>.
      </p>

      <Secao n="1" titulo="O serviço">
        <p>
          O FilaPro Leads é uma ferramenta para organizar leads, enviar mensagens pelo WhatsApp conectado pelo próprio cliente (por QR Code), com
          regras de proteção contra bloqueio (Antibloqueio), e usar inteligência artificial para escrever mensagens, conversar e qualificar leads.
        </p>
      </Secao>

      <Secao n="2" titulo="Conta e acesso">
        <ul>
          <li>As contas são criadas pelo FilaPro Leads após a compra ou o teste grátis; não há cadastro público.</li>
          <li>Você é responsável por manter sua senha em segredo e por tudo o que for feito com o seu acesso.</li>
          <li>No plano Business, o Administrador da Empresa cria os usuários e responde pelo uso que eles fazem.</li>
        </ul>
      </Secao>

      <Secao n="3" titulo="Planos, pagamento e prazo">
        <ul>
          <li>Os planos, preços e limites são os apresentados na página de planos no momento da compra.</li>
          <li>O pagamento é por PIX; o acesso é liberado após a confirmação.</li>
          <li>O acesso vale pelo prazo do plano. Sem renovação, o acesso é encerrado no vencimento.</li>
          <li>O teste grátis é limitado (prazo e quantidade de disparos) e vale uma vez por e-mail.</li>
          <li>Itens adicionais (como WhatsApp extra) vencem junto com o plano e podem ser cobrados de forma proporcional.</li>
        </ul>
      </Secao>

      <Secao n="4" titulo="Uso permitido e proibido">
        <p>Você se compromete a usar a plataforma de forma lícita e respeitosa. É <b>proibido</b>:</p>
        <ul>
          <li>Enviar spam, mensagens enganosas, ofensivas, ilegais ou que violem direitos de terceiros.</li>
          <li>Contatar pessoas sem base legal (por exemplo, listas compradas ou obtidas sem autorização).</li>
          <li>Insistir com quem pediu para não receber mensagens. Pedidos de “SAIR”, “PARAR”, “STOP” ou “CANCELAR” são respeitados automaticamente.</li>
          <li>Tentar burlar limites, invadir, copiar ou revender a plataforma sem autorização.</li>
        </ul>
        <p>
          O cliente é o <b>único responsável</b> pelo conteúdo das mensagens, pelas listas de leads e pela base legal para contatá-los, conforme a LGPD
          e o Código de Defesa do Consumidor.
        </p>
      </Secao>

      <Secao n="5" titulo="WhatsApp">
        <p>
          O WhatsApp é conectado pelo próprio cliente, com o número dele. O FilaPro Leads <b>não é uma ferramenta oficial do WhatsApp</b> nem tem vínculo
          com a Meta. O WhatsApp pode restringir ou bloquear números conforme as regras dele; o Antibloqueio reduz esse risco, mas <b>não o elimina</b>.
          O FilaPro Leads não se responsabiliza por bloqueios, restrições ou perdas decorrentes das regras do WhatsApp.
        </p>
      </Secao>

      <Secao n="6" titulo="Inteligência artificial">
        <p>
          Os textos e qualificações gerados pela IA são sugestões e podem conter erros. O cliente deve revisar o que for enviado em seu nome. O uso
          da IA pode ter limites definidos no plano.
        </p>
      </Secao>

      <Secao n="7" titulo="Disponibilidade">
        <p>
          Buscamos manter o serviço disponível 24 horas, mas podem ocorrer interrupções por manutenção, falhas de fornecedores (hospedagem, WhatsApp,
          provedor de IA) ou de internet. Não garantimos funcionamento ininterrupto.
        </p>
      </Secao>

      <Secao n="8" titulo="Suspensão e encerramento">
        <p>
          Podemos suspender ou encerrar o acesso em caso de violação destes Termos, uso abusivo, risco à plataforma ou a terceiros, ou falta de
          pagamento. O cliente pode deixar de usar a plataforma a qualquer momento; valores de períodos já iniciados não são devolvidos, salvo
          quando a lei exigir.
        </p>
      </Secao>

      <Secao n="9" titulo="Limitação de responsabilidade">
        <p>
          O FilaPro Leads não se responsabiliza por resultados comerciais das campanhas, pelo conteúdo enviado pelos clientes nem por danos indiretos.
          Quando houver responsabilidade, ela fica limitada ao valor pago pelo cliente nos últimos 3 meses, salvo disposição legal em contrário.
        </p>
      </Secao>

      <Secao n="10" titulo="Dados pessoais">
        <p>
          O tratamento de dados segue a <Link href="/privacidade">Política de Privacidade</Link>. Para os dados dos leads, o cliente é o controlador e
          o FilaPro Leads atua como operador.
        </p>
      </Secao>

      <Secao n="11" titulo="Mudanças nestes Termos">
        <p>Podemos atualizar estes Termos. A data da última atualização fica no topo da página; mudanças importantes serão avisadas aos clientes.</p>
      </Secao>

      <Secao n="12" titulo="Lei e foro">
        <p>Estes Termos seguem as leis do Brasil. Fica eleito o foro da comarca de <b>{d.foro}</b>, ressalvados os direitos do consumidor previstos em lei.</p>
      </Secao>

      <Secao n="13" titulo="Contato">
        <p>Dúvidas: <b>{d.emailPrivacidade}</b>.</p>
      </Secao>
    </PaginaLegal>
  );
}
