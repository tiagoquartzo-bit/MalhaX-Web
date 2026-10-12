# Segurança, permissões e privacidade

## Organizações e papéis

- `organizations` identifica a empresa; `organization_members` vincula uma conta à organização; `organization_member_roles` guarda papéis com escopo de tenant.
- Activia é a organização inicial. No MVP, cada usuário pode pertencer a uma única organização para evitar ambiguidade na seleção de papéis.
- `admin`: configura a organização e papéis; acesso altamente restrito e auditado.
- `manager`/`dispatcher`: cadastra recursos, cria pedidos e viagens, atribui e acompanha operação.
- `support`: acompanha operação e comprovantes; pode convidar motoristas pela Edge Function autorizada e gerenciar status de motoristas pela RPC `set_driver_status`, sempre com justificativa auditada.
- `driver`: consulta o próprio perfil e viagens atribuídas; insere eventos, posições e comprovantes apenas nelas.
- Aplicar menor privilégio no backend e RLS em toda tabela exposta. Esconder um botão na interface não é controle de acesso. Nunca confiar em `driver_id`, papel, valor financeiro ou status enviado pelo cliente sem validar a autorização no servidor.

## Dados e arquivos

- Buckets privados separados para documentos cadastrais e comprovantes. URLs assinadas curtas, emitidas após autorização.
- Validar MIME real, tamanho, extensão e limites de quantidade; nomes de arquivo aleatórios.
- Contas entram por convite: suporte/admin cadastra o e-mail e papel, o destinatário confirma pelo link e define a própria senha. Cadastro público permanece desativado.
- Usar convite de uso único com expiração; não enviar senha por e-mail. Para produção, configurar SMTP transacional próprio e validar o fluxo de retorno antes de liberar convites.
- Segredos apenas em variáveis do ambiente de execução; `service_role` nunca vai para web ou Android.
- Não incluir telefone, nome, endereço ou outros dados pessoais no QR/código do volume.
- Ligações entre organização, motorista, veículo, pedido e parada devem ser validadas no banco, além da autorização da interface.

## Localização

Solicitar permissão contextual no Android. Coletar localização ao executar uma parada e, se habilitado para acompanhamento, somente enquanto houver viagem ativa. Guardar latitude, longitude, precisão em metros, horário capturado no dispositivo e recebido no servidor. Indicar precisão ruim/ausente, permitir nova tentativa e registrar exceção com justificativa conforme política operacional. Definir retenção e acesso por função antes da produção.

## Auditoria e ciclo de vida

Registrar ator, ação, entidade, instante do servidor e motivo para mudanças críticas (cadastro, ativação/suspensão, atribuição, valores, status e acesso administrativo a evidências). Suspender ou inativar motoristas preservando histórico; alterações exigem justificativa e auditoria, e não são permitidas enquanto houver viagem ativa. Evitar exclusão em cascata de dados operacionais. Definir processo de correção, retenção e atendimento a solicitações de titulares antes do lançamento.



