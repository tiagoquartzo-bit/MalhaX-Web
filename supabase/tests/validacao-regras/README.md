# Validação das regras de negócio (banco de dados)

Testes automatizados que aplicam todas as migrations num PostgreSQL descartável e executam
165 cenários com usuários reais de cada papel (gestor, despachante, suporte, financeiro,
motoristas, conta sem papel e gestor de outra empresa), sob RLS, como o app faz.

- `executar.sh` — cria o banco `malhax_validacao`, aplica tudo e mostra o resultado.
- `00_supabase_stub.sql` — esquemas mínimos `auth`/`storage` e papéis do Supabase.
- `10_harness.sql` — funções de teste (`t.check`) que rodam cada comando como o usuário indicado.
- `20_setup.sql` — empresas e usuários de teste.
- `30_cenarios.sql`, `31_execucao.sql`, `32_reordenacao.sql`, `33_veiculos.sql` e `34_faturamento.sql` — cenários.
- `34_faturamento.sql` valida frete e faturas de clientes, regras e ajustes de pagamento e fechamento de pagamentos de motoristas.
- `resultado-2026-10-17.txt` — saída histórica da execução de 17/10/2026 (129 ok, 0 falhas, após as migrations 032 e 033); ainda não inclui os novos 36 cenários.

Qualquer caso marcado como FALHA indica uma regra que deixou de ser garantida pelo banco.
Requer PostgreSQL 15+ e `psql`/`createdb` no PATH (Linux, WSL ou Git Bash).
Não aponte para o Supabase de produção.
