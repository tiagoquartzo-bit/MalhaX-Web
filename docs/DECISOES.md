# Decisões em aberto para validar

Estas escolhas precisam ser confirmadas com a operação antes do primeiro piloto:

1. Quais documentos e dados são obrigatórios no cadastro e quem aprova?
2. Quais evidências são obrigatórias em coleta e entrega (foto, nome, assinatura, código e GPS)? Qual tolerância de precisão e fluxo de exceção?
3. Pode haver mais de um motorista/veículo por viagem? Como funciona a transferência de custódia?
4. Regras de preço, repasse, ajustes, fechamento e exportação financeira.
5. Operação offline: prazo esperado sem internet, tamanho máximo de fotos e comportamento com GPS negado.
6. Retenção de localização, comprovantes e documentos; política de privacidade e consentimentos.
7. Canais de convite/recuperação e notificações (SMS, WhatsApp ou push), custo e provedor.
8. Regiões, fuso horário, moeda, formato de código e impressão/leitura de etiquetas.
9. Metas de suporte, alertas de atraso e critérios para posição considerada desatualizada.

## Decisões já tomadas

- MalhaX é o nome do sistema. Activia será cadastrada como primeira organização/tenant; a identidade visual própria de cada organização será definida depois.
- Contas serão criadas por convite com e-mail. O destinatário confirma pelo link enviado e define a própria senha; não haverá senha enviada por e-mail nem cadastro público aberto.
- No MVP, o cadastro operacional do motorista exige nome e sobrenome; e-mail é necessário para a conta/convite. Telefone e documentos ficam opcionais.
- Cada usuário pertence a uma organização no MVP, para manter autorização inequívoca. A estrutura guarda organização nas entidades raiz.
- Operação inicial em BRL, timezone `America/Sao_Paulo`, localização ao vivo somente em viagem ativa e motorista histórico desativado em vez de excluído.



