// Política de Privacidade (LGPD — decisão #88). Página pública: filaproleads.com.br/privacidade
import type { Metadata } from "next";
import PaginaLegal, { Secao } from "@/components/legal/PaginaLegal";
import { ATUALIZADO_EM, dadosLegais } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Política de Privacidade • FilaPro Leads" };

export default async function PrivacidadePage() {
  const d = await dadosLegais();
  return (
    <PaginaLegal titulo="Política de Privacidade" atualizado={ATUALIZADO_EM}>
      <p>
        Esta Política explica como o <b>FilaPro Leads</b> (filaproleads.com.br) trata dados pessoais, conforme a Lei Geral de Proteção de Dados
        (Lei nº 13.709/2018 — LGPD). Ao usar a plataforma, você declara que leu e entendeu este documento.
      </p>

      <Secao n="1" titulo="Quem é o responsável">
        <ul>
          <li><b>Responsável (controlador):</b> {d.responsavel} — CPF/CNPJ {d.documento}</li>
          <li><b>Endereço:</b> {d.endereco}</li>
          <li><b>Contato para privacidade:</b> {d.emailPrivacidade}</li>
          <li><b>Encarregado de dados (DPO):</b> {d.encarregadoNome} — {d.encarregadoEmail}</li>
        </ul>
      </Secao>

      <Secao n="2" titulo="Dois papéis diferentes">
        <p>
          <b>Dados dos nossos clientes</b> (quem contrata o FilaPro Leads e seus usuários): nós somos o <b>controlador</b> — decidimos como esses dados são usados.
        </p>
        <p>
          <b>Dados dos leads</b> (os contatos que cada cliente cadastra para enviar mensagens): o <b>cliente é o controlador</b> e o FilaPro Leads é o
          <b> operador</b>, tratando esses dados apenas para executar o serviço, conforme as instruções do cliente. Cabe ao cliente ter base legal (por exemplo,
          consentimento ou relação comercial) para contatar seus leads.
        </p>
      </Secao>

      <Secao n="3" titulo="Quais dados tratamos">
        <ul>
          <li><b>Conta:</b> nome, e-mail, WhatsApp, empresa, plano, datas de acesso e de vencimento.</li>
          <li><b>Acesso e segurança:</b> senha (guardada apenas de forma cifrada, sem possibilidade de leitura), registros de entrada, tentativas de acesso e endereço IP.</li>
          <li><b>Pagamentos:</b> dados do pedido e da confirmação do PIX (não guardamos dados bancários ou de cartão).</li>
          <li><b>Leads:</b> nome, telefone, status, qualificação e as mensagens trocadas pelo WhatsApp conectado pelo cliente.</li>
          <li><b>Conteúdo de treinamento da IA:</b> textos, links, imagens e PDFs que o cliente envia sobre a própria empresa.</li>
          <li><b>Arquivos de campanha:</b> imagens, PDFs, vídeos e áudios anexados pelo cliente.</li>
          <li><b>Conexão do WhatsApp:</b> credenciais da sessão, guardadas cifradas, para manter o WhatsApp do cliente conectado.</li>
        </ul>
      </Secao>

      <Secao n="4" titulo="Para que usamos">
        <ul>
          <li>Prestar o serviço: enviar as campanhas, receber as respostas, conversar e qualificar leads com IA, mostrar relatórios.</li>
          <li>Criar e manter a conta, controlar acesso, prazos, renovações e pagamentos.</li>
          <li>Enviar avisos do sistema por e-mail e WhatsApp (senha temporária, renovação, pedidos, problemas em campanhas).</li>
          <li>Segurança, prevenção de fraude e de uso abusivo (como spam) e cumprimento de obrigações legais.</li>
        </ul>
        <p>Bases legais (art. 7º da LGPD): execução de contrato, cumprimento de obrigação legal, legítimo interesse e, quando necessário, consentimento.</p>
      </Secao>

      <Secao n="5" titulo="Inteligência artificial">
        <p>
          Para gerar mensagens, aprender sobre a empresa do cliente, conversar e qualificar leads, enviamos o conteúdo necessário a um provedor de IA
          (atualmente a Anthropic, criadora do Claude). Pelos termos comerciais da Anthropic, o conteúdo enviado pela API <b>não é usado para treinar os
          modelos</b> dela. Enviamos apenas o necessário para cada tarefa. A IA pode errar: o cliente deve revisar as mensagens antes de enviar.
        </p>
      </Secao>

      <Secao n="6" titulo="Com quem compartilhamos">
        <p>Não vendemos dados pessoais. Compartilhamos somente com fornecedores necessários para o serviço, sob contrato:</p>
        <ul>
          <li>Hospedagem do site e banco de dados (Vercel e provedor de banco de dados).</li>
          <li>Servidor que mantém o WhatsApp conectado e envia as mensagens (Hostinger).</li>
          <li>Envio de e-mails (Resend).</li>
          <li>Inteligência artificial (Anthropic).</li>
          <li>WhatsApp, pelo qual as mensagens trafegam, conforme as regras do próprio WhatsApp.</li>
          <li>Autoridades, quando exigido por lei ou ordem judicial.</li>
        </ul>
        <p>
          Alguns desses fornecedores mantêm servidores fora do Brasil. Nesses casos, a transferência internacional segue o art. 33 da LGPD, com
          fornecedores que adotam garantias adequadas de proteção.
        </p>
      </Secao>

      <Secao n="7" titulo="Por quanto tempo guardamos">
        <ul>
          <li><b>Conversas com leads:</b> até 365 dias.</li>
          <li><b>Leads e campanhas:</b> enquanto a conta estiver ativa ou até o cliente excluir.</li>
          <li><b>Materiais de treinamento da IA:</b> até o cliente usar “Esquecer”.</li>
          <li><b>Dados da conta e de pagamentos:</b> enquanto a conta existir e pelo prazo exigido por lei depois disso.</li>
        </ul>
      </Secao>

      <Secao n="8" titulo="Seus direitos">
        <p>
          Você pode pedir, a qualquer momento: confirmação e acesso aos dados, correção, anonimização, bloqueio ou eliminação, portabilidade, informação
          sobre compartilhamento e revisão de decisões automatizadas (art. 18 da LGPD). Escreva para <b>{d.emailPrivacidade}</b>. Respondemos em até 15 dias.
        </p>
        <p>
          <b>Se você recebeu mensagem de um cliente do FilaPro Leads</b> e não quer mais receber, responda <b>SAIR</b> na própria conversa — o envio é
          bloqueado na hora. Para outros pedidos sobre seus dados, fale com a empresa que enviou a mensagem (ela é a controladora) ou conosco pelo e-mail acima.
        </p>
      </Secao>

      <Secao n="9" titulo="Segurança">
        <p>
          Usamos conexão segura (HTTPS), senhas e credenciais cifradas, separação dos dados de cada cliente, controle de acesso por perfil e bloqueio
          após tentativas erradas de senha. Nenhum sistema é 100% seguro; em caso de incidente relevante, comunicaremos os afetados e a ANPD, como prevê a lei.
        </p>
      </Secao>

      <Secao n="10" titulo="Cookies">
        <p>
          Usamos apenas o cookie essencial de sessão (para manter você conectado até fechar o navegador) e o armazenamento do navegador para preferências,
          como tema claro/escuro e o e-mail em “Lembrar de mim”. Não usamos cookies de publicidade.
        </p>
      </Secao>

      <Secao n="11" titulo="Menores de idade">
        <p>A plataforma é destinada a empresas e profissionais maiores de 18 anos.</p>
      </Secao>

      <Secao n="12" titulo="Mudanças nesta Política">
        <p>Podemos atualizar esta Política. A data da última atualização fica no topo da página; mudanças importantes serão avisadas aos clientes.</p>
      </Secao>

      <Secao n="13" titulo="Contato e reclamações">
        <p>
          Dúvidas: <b>{d.emailPrivacidade}</b>. Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD), em gov.br/anpd.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
