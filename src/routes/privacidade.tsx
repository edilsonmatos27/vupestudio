import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Privacidade e dados — Vupe Studio" },
      {
        name: "description",
        content:
          "Quais dados o Vupe Studio armazena, com quem compartilha e como solicitar exclusão.",
      },
      { property: "og:title", content: "Privacidade e dados — Vupe Studio" },
      {
        property: "og:description",
        content: "Quais dados o Vupe Studio armazena e como solicitar exclusão.",
      },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link to="/">
          <BrandMark />
        </Link>
        <h1 className="mt-10 text-3xl font-bold">Privacidade e dados</h1>
        <div className="mt-6 space-y-5 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground">
          <h2>O que armazenamos</h2>
          <p>
            Nome, e-mail, avatar opcional, plano escolhido, período de teste, assinatura, faturas,
            saldo e histórico de créditos, projetos, imagens enviadas e geradas, instruções que você
            escreveu e registros de auditoria de ações administrativas. Senhas são gerenciadas pelo
            serviço de autenticação e nunca ficam em texto puro.
          </p>
          <h2>Serviços externos que recebem dados</h2>
          <p>
            <b className="text-foreground">IA de imagens:</b> as imagens e instruções de cada
            operação são enviadas, somente pelo servidor, à integração de IA gerenciada do Lovable,
            que encaminha ao provedor do modelo escolhido (OpenAI ou Google), com política de
            retenção zero para os modelos habilitados.
          </p>
          <p>
            <b className="text-foreground">Pagamentos:</b> o checkout é feito pela Stripe. Não
            capturamos nem armazenamos dados de cartão.
          </p>
          <h2>Retenção e exclusão</h2>
          <p>
            Você pode excluir imagens individuais e projetos a qualquer momento; os arquivos são
            removidos do armazenamento. Registros financeiros (faturas, ledger de créditos e
            auditoria) podem ser mantidos pelo período exigido pela legislação aplicável, sem as
            imagens associadas.
          </p>
          <p>
            Para solicitar a exclusão completa da conta, entre em contato com o administrador do
            Vupe Studio pelo canal de suporte informado na contratação.
          </p>
          <h2>Limites desta declaração</h2>
          <p>
            Este texto descreve o funcionamento técnico atual e não substitui uma avaliação jurídica
            de conformidade (por exemplo, LGPD).
          </p>
        </div>
      </div>
    </div>
  );
}
