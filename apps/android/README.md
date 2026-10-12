# MalhaX Motorista

Aplicativo Android de execução de rotas para motoristas e motoboys.

## Configuração local

1. Inicie o backend na raiz do projeto com `pnpm db:start`.
2. Copie `.env.example` para `.env` dentro de `apps/android`.
3. Para emulador Android, use `http://10.0.2.2:54321` como URL local e a chave pública/anon do comando `pnpm exec supabase status`. Em um celular físico, use o IP local do computador na mesma rede Wi-Fi e permita a conexão no firewall. Nunca use a chave `service_role` no app.
4. Execute `pnpm --filter @activia/android dev` para abrir o Metro. Rastreamento com a tela apagada exige um development build nativo; o Expo Go não executa serviços de localização em segundo plano no Android.

## Fluxo conectado

- Login por e-mail e senha; tokens de sessão ficam em armazenamento seguro do dispositivo.
- Lista apenas viagens e paradas permitidas ao motorista autenticado pelas políticas RLS.
- Aceite de viagem, navegação no Google Maps e execução sequencial das paradas.
- Coletas registram posição e precisão GPS.
- Entregas exigem nome de quem recebeu, foto, coordenadas e precisão antes da conclusão.
- Ocorrência de parada exige motivo; viagens pausadas ficam somente para consulta.
- Em uma viagem ativa, o motorista pode autorizar e iniciar o histórico GPS. O Android exibe uma notificação persistente; o rastreamento pode ser interrompido pelo motorista e termina quando a viagem encerra.
- Pontos que não conseguem ser enviados ficam em uma fila local privada e são sincronizados depois. Só são removidos da fila após confirmação do Supabase; a sincronização é idempotente e vinculada à conta que iniciou o trajeto.

O histórico depende da migration `202610060014_driver_tracking_history.sql` aplicada no Supabase. Se a rede cair, o app guarda os pontos capturados e envia novamente quando voltar a ter conexão. Forçar a parada do app ou desligar o aparelho pode interromper a captura; ao abrir o app novamente, ele tenta retomar o rastreamento da viagem ainda ativa.
