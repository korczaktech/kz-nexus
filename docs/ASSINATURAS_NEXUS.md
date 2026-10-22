# Assinaturas do Korczak Nexus — fluxo inicial

## Estado implementado

- Solicitação autenticada de plano pago em `POST /api/v1/subscriptions/requests`.
- Preços calculados exclusivamente no backend; o navegador envia apenas plano e quantidade.
- Estados `pending_confirmation`, `active` e `rejected`.
- Consulta pessoal em `GET /api/v1/subscriptions/me`.
- Lista administrativa em `GET /api/v1/admin/subscription-requests`.
- Aprovação/rejeição exclusiva de gestor/administrador em `PATCH /api/v1/admin/subscription-requests/{request_id}`.
- Para aprovar, é obrigatória uma referência da transação; para rejeitar, é obrigatório registrar o motivo.
- A aprovação manual libera um período de 30 dias. Solicitações pendentes não são consideradas acesso premium.
- O frontend de Planos permite solicitar um plano, definir a quantidade de usuários e revisar solicitações na conta administrativa.

## Segurança e limites atuais

**Este fluxo ainda não processa pagamentos nem confirma transações automaticamente.** A referência digitada pelo administrador é um registro de auditoria, não uma validação bancária automática. O administrador deve verificar o recebimento no banco antes de aprovar.

Não configure o frontend para considerar um comprovante enviado pelo cliente como pagamento confirmado. Não exponha credenciais de pagamento no navegador.

A integração com um provedor recorrente e seus webhooks autenticados é uma etapa separada. Ela só deve ativar uma assinatura depois de validar a assinatura/autenticidade do evento e consultar ou verificar o pagamento no provedor. Estornos, contestações, falhas de cobrança e renovação automática ainda precisam ser integrados ao provedor escolhido.

O campo `premium_access` em `GET /api/v1/subscriptions/me` é uma informação de estado para a aplicação, não substitui verificações de autorização em cada endpoint premium. Antes de lançar benefícios pagos, cada operação de custo/valor premium deve validar o estado da assinatura no backend. O acesso básico necessário ao onboarding deve continuar disponível.

## Próxima etapa

Selecionar um provedor que aceite conta PF, cobrança recorrente automática e API/webhooks disponíveis para essa conta. Implementar o adaptador no backend, validar notificações com segredo/assinatura e fazer conciliação de cobranças, renovações, reembolsos e contestações. Não habilitar produção automática até concluir testes de webhook e de idempotência.
