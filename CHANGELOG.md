# Alterações — KILSYSTEM PHARMACY

Cada versão publicada tem uma entrada aqui. Novas alterações entram em «Por publicar» e passam para a versão no momento da release (ver [docs/RELEASE.md](docs/RELEASE.md)).

## Por publicar

_(sem alterações)_

## 1.0.6 — 2026-10-22

**Vendas e facturas**
- Cada documento (venda, conversão de proforma, nota de crédito) é gravado numa única transacção com o número da série: se algo falhar não fica stock abatido nem número consumido. Corrige a perda de stock numa venda com vários produtos em que um não tinha stock.
- A série fiscal salta automaticamente números que já existam (por exemplo, depois de um restauro).
- PDV mais rápido: pesquisa sempre pronta para o leitor de código de barras; Enter adiciona o produto quando há um só resultado; atalhos F2 (pesquisa), F4 (cliente), F8 (em espera) e F9 (pagar com a forma de pagamento padrão).
- Stock visível em cada produto; o carrinho não aceita mais do que o disponível (excepto proformas).
- Pagamento em dinheiro pelo teclado (dígitos, Enter finaliza, Esc volta), botão «Exacto» e notas sugeridas.
- Protecção contra venda duplicada por duplo clique ou Enter repetido.
- Nova definição «Depois de finalizar a venda» (Configurações › Vendas): mostrar o documento, imprimir automaticamente ou continuar para a venda seguinte.

**Perfis e permissões (tudo configurável em Utilizadores › Permissões)**
- O perfil Caixa passa a conseguir vender: o PDV lista produtos e clientes com a permissão de criar vendas.
- Abrir e fechar o dia e o turno faz parte das predefinições de todos os perfis (fecha quem estiver em serviço); editar e importar estoque ficam por omissão com Administrador e Gestor de Stock.
- Nova permissão «Ver preço de custo» (`estoque.custo`): sem ela o custo não é enviado nem pode ser alterado; o Caixa não a tem por omissão.
- Descontos exigem a permissão própria; o lucro do Painel só aparece a quem tem acesso ao Financeiro.
- Botões de Estoque, Clientes, Financeiro e Documentos seguem as permissões do perfil; «Marcar como pago» exige editar Financeiro.
- As instalações existentes recebem estas predefinições numa migração única; os perfis criados pelo administrador não são alterados.

**Painel**
- Novo visual: saudação, estado operacional, cartões de indicadores, gráfico com eixo de valores, ranking em barras verticais e tabela de vendas recentes com acesso a Documentos.
- Ranking dos mais vendidos em slide (top 12, 4 por página, com setas), sem transbordar com muitos produtos.

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
