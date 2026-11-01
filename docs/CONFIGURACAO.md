# Vupe Studio — configuração, operação e validação

## 1. O que já está funcionando
- Cadastro com plano obrigatório (validado no banco), confirmação de e-mail, login, recuperação de senha, sessão persistente, logout.
- Teste gratuito iniciado uma única vez na confirmação do e-mail, com registro das condições concedidas (duração em minutos/horas/dias, créditos, recursos, modelos; global ou por plano).
- Bloqueio de novas operações no servidor ao fim do teste, mesmo com créditos.
- Créditos com reserva → consumo somente após o arquivo salvo → liberação em falhas; ledger completo; franquia não acumulativa; créditos de teste não migram; ajustes manuais auditados.
- Edição, composição e variações reais (até 3 por operação) pela IA gerenciada do Lovable.
- Logomarca exata por sobreposição determinística.
- Projetos, histórico, exclusão individual, exclusão de projeto com remoção de arquivos.
- Admin: assinantes (bloqueio com motivo), assinaturas, pagamentos, planos (rascunho/ativo/inativo, ordenação, publicação de preço na Stripe), agentes com prompt privado versionado, identidade visual, teste, IA gerenciada, Stripe, reconciliação e auditoria.

## 2. Primeiro admin master (procedimento seguro)
1. Crie sua conta normalmente em `/cadastro` e confirme o e-mail.
2. Peça no chat do Lovable: “promova o e-mail X a admin master”. O agente executa `select public.promote_to_admin('X');` — função que só o servidor pode chamar; nenhum formulário ou API pública concede o papel.
3. A ação fica registrada na auditoria.

## 3. Stripe (sua conta)
1. Administração → Stripe → escolha **Teste**, cole `pk_test_…`, `sk_test_…` (ou chave restrita `rk_test_…`) → **Salvar credenciais** → **Testar conexão**.
2. **Publique o app** (o webhook precisa do endereço publicado).
3. Stripe (modo teste) → Desenvolvedores → Webhooks → adicionar endpoint:
   `https://project--de761328-28cd-472d-a4a9-e2d27dd926a4.lovable.app/api/public/stripe/webhook/test` com os eventos listados na tela. Cole o `whsec_…` em “Segredo do webhook”.
4. Stripe → Configurações → Billing → Customer portal: salve a configuração padrão (necessário para “Gerenciar pagamento e cancelamento”).
5. Planos (admin) → defina preço → **Publicar preço na Stripe** → **Ativar**.
6. Para produção repita com chaves `live` e o endpoint `/webhook/live`, depois “Mudar para produção”.

Regras implementadas: acesso pago só com fatura `paid` re-consultada na Stripe; voltar à URL de sucesso não libera nada; eventos duplicados/fora de ordem são idempotentes; upgrade imediato com cobrança proporcional (`pending_if_incomplete`: só aplica se pago) e concessão apenas da diferença de créditos; downgrade no ciclo seguinte; estorno total ou disputa revogam o período pago restante e expiram créditos de assinatura não reservados (auditado); estorno parcial só é registrado.

## 4. IA gerenciada
- Chamadas apenas no servidor via Lovable AI Gateway (`LOVABLE_API_KEY` gerenciado). Sem campos de chave OpenAI/Google.
- Modelos verificados no catálogo do projeto em 30/10/2026: GPT Image 2.5 Sunburst/Flare, GPT Image 2, Gemini 3 Pro Image, Gemini 3.1 Flash Image, Gemini 3.1 Flash Lite Image. Administração → IA gerenciada permite consultar a disponibilidade atual.
- Custo: cobrado dos créditos do workspace Lovable (Settings → Plans & credits). O preço por imagem depende do modelo/qualidade e não foi medido aqui. Créditos comerciais dos assinantes são independentes desse saldo.

## 5. Variáveis e segredos
| Nome | Origem |
|---|---|
| `LOVABLE_API_KEY` | gerenciado pelo Lovable |
| `VUPE_SECRETS_KEY` | gerado automaticamente; cifra os segredos Stripe |
| Chaves Stripe | inseridas pelo admin na tela (cifradas no banco) |
| `SUPABASE_*` | gerenciados pelo Lovable Cloud |

## 6. Limites conhecidos
- Execução: cada item roda numa requisição do servidor enquanto a página aguarda. Se a aba fechar no meio, a execução pode não terminar; a rotina horária marca o item como “interrompido” e libera a reserva sem cobrança (pode haver custo de IA para o operador).
- Prevenção de múltiplas contas: o teste é único por conta; a mesma pessoa pode criar outra conta com outro e-mail.
- E-mails de autenticação usam o remetente padrão do Lovable Cloud; para domínio próprio configure em More → Emails.
- “Inventar imagem” e “Vetorizar” foram removidos. Operações e arquivos antigos continuam disponíveis no histórico; agentes antigos abrem a bancada Criar imagem.
- Preservação de identidade e de logomarca pela IA não é garantida; use “Aplicar logomarca exata” para reprodução fiel.
- Exclusão de conta é feita pelo administrador (não há botão de autoexclusão).

## 7. Validação executada (30/10/2026, ambiente de desenvolvimento)
| Verificação | Resultado |
|---|---|
| Cadastro com plano obrigatório; sem plano é recusado | aprovada |
| Teste só inicia na confirmação; reconfirmação não renova nem duplica créditos | aprovada (SQL) |
| Login por senha, sessão e navegação autenticada | aprovada (navegador) |
| Expiração bloqueia mesmo com créditos | aprovada (SQL) |
| Reserva/consumo/liberação, retirada acima do saldo, concessão duplicada | aprovada (SQL) |
| Fatura paga concede franquia uma vez; upgrade concede só a diferença | aprovada (SQL) |
| Geração real com GPT Image 2.5 Flare e débito de 1 crédito | aprovada (navegador) |
| Vetorização real com SVG saneado e download | aprovada (navegador + testes) |
| Exclusão de imagem remove o arquivo do armazenamento | aprovada |
| Páginas admin com papel admin; área admin recusada a assinante | aprovada |
| Salvar preço de plano persiste após recarregar | aprovada |
| Stripe: teste de API, webhook, checkout, renovação, cancelamento, upgrade/downgrade, estorno | bloqueada por configuração (aguarda chaves Stripe e publicação) |
| Recuperação de senha por e-mail real, lote de 3 com falha parcial, edição com fotos, composição | não executada |

Testes reexecutáveis: `bunx vitest run` e o script `supabase/tests/business_rules.sql`.
