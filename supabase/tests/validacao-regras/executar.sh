#!/usr/bin/env bash
# Valida as regras de negócio do MalhaX direto no banco.
# Cria um banco PostgreSQL descartável, aplica todas as migrations de supabase/migrations
# sobre um "stub" mínimo do Supabase (auth, storage, papéis) e roda os cenários.
# Uso: PGHOST=localhost PGPORT=5432 PGUSER=postgres ./executar.sh
# Nunca aponte para o banco de produção: o script apaga e recria o banco "malhax_validacao".
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
MIG="$DIR/../../migrations"
DB=malhax_validacao
dropdb --if-exists "$DB"; createdb "$DB"
P="psql -d $DB -v ON_ERROR_STOP=1 -q"
$P -f "$DIR/00_supabase_stub.sql"
for m in "$MIG"/*.sql; do $P -f "$m" >/dev/null || { echo "Migration falhou: $m"; exit 1; }; done
$P -f "$DIR/10_harness.sql"; $P -f "$DIR/20_setup.sql" >/dev/null
for f in 30_cenarios.sql 31_execucao.sql 32_reordenacao.sql 33_veiculos.sql 34_faturamento.sql; do psql -d $DB -q -f "$DIR/$f" >/dev/null; done
psql -d $DB -c "select n, case when ok then 'OK' else 'FALHA' end as resultado, area, caso, left(obtido, 90) as obtido from t.results order by n"
psql -d $DB -At -c "select count(*) filter (where ok)||' ok, '||count(*) filter (where not ok)||' falhas de '||count(*) from t.results"
