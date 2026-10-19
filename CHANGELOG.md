# Alterações — KILSYSTEM PHARMACY

Cada versão publicada tem uma entrada aqui. Novas alterações entram em «Por publicar» e passam para a versão no momento da release (ver [docs/RELEASE.md](docs/RELEASE.md)).

## Por publicar

_(sem alterações)_

## 1.0.5 — 2026-10-19

**Integridade dos dados**
- Verificação da base de dados em cada arranque (integridade e registos órfãos), com alerta no painel de notificações.
- Cada backup guarda a contagem de registos por tabela; o sistema alerta se um backup novo tiver muito menos dados que o anterior.
- Migrações versionadas da base de dados (`src/backend/migrations`), executadas uma única vez e numa transacção.

**Backups**
- Cada backup é verificado logo após ser criado (estado OK, AVISO ou ERRO no histórico, com os dados contados).
- Cópia adicional opcional para outra pasta (pen USB, disco externo, rede ou nuvem).
- O backup automático respeita a hora, frequência, pasta e retenção configuradas; se o computador estava desligado à hora marcada, é feito ao abrir.
- «Criar backup ao encerrar o sistema» passou a funcionar.
- Alertas: falha do backup automático, backup danificado, cópia adicional não feita, sem backups recentes e pouco espaço em disco.

**Diagnóstico**
- Registo diário em ficheiro (`<dados da aplicação>/logs`, últimos 14 dias) com erros do sistema e da interface; botão «Abrir pasta de registos» em Configurações.

**Processo de release**
- O build recusa uma versão já publicada e corre a suite completa antes de montar o instalador.

## 1.0.4 — 2026-10-19

- Corrigida a causa da perda de produtos, categorias, vendas e clientes (reconstrução da base em cada arranque sem protecção); sincronização atómica e só quando a versão muda; arranque de 11–34 s para menos de 1 s.
- Restauro de backups: mantém utilizadores, senhas, PINs e perfis actuais; numa instalação nova o backup é reposto por inteiro; retoma após corte de energia.
- Rotação automática deixa de apagar backups manuais e cópias de segurança.
- Subcategorias repetidas unificadas e impedidas; nomes de subcategoria e categoria voltam a aparecer no Stock.
- Notas de crédito com a série fiscal correcta e sequencial; número previsto da venda segue a série fiscal.
- Ecrã de carregamento, instância única, botão «Fechar» no login e «Voltar ao login» na troca de senha.
