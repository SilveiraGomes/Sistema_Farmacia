# Usuarios, Permissoes e Recuperacao de Senha

## Objetivo

Adicionar autenticacao, gestao real de usuarios, perfis editaveis pelo Admin, recuperacao de senha via Admin e autorizacao por permissao ao sistema Farmacia ESAYOS.

O sistema hoje abre direto no dashboard, mostra um usuario fixo no topo e usa dados mockados em `src/components/Usuarios.jsx`. O backend ja possui o modelo `Usuario` com `senha_hash`, mas ainda nao existe login, sessao, CRUD de usuarios via IPC, reset de senha, perfis, permissoes ou auditoria. Esta etapa transforma o modulo de usuarios em uma base operacional segura para as proximas funcionalidades.

## Decisoes Aprovadas

- Usar perfis editaveis pelo Admin.
- Criar perfis padrao para Administrador, Farmaceutico, Caixa e Gestor de Stock.
- Permissoes serao controladas por modulo e acao.
- O Admin podera editar permissoes dos perfis, mas nao podera remover protecoes essenciais que deixem o sistema sem um administrador funcional.
- Recuperacao de senha sera feita pelo Admin com senha temporaria e troca obrigatoria no proximo login.
- A senha temporaria sera gerada pelo sistema e exibida uma unica vez para o Admin copiar.
- A primeira etapa nao tera envio automatico de email para recuperacao de senha.

## Abordagem Escolhida

Usar perfis padrao editaveis com uma matriz de permissoes.

Cada usuario pertence a um perfil. Cada perfil possui um conjunto de permissoes, por exemplo `usuarios.criar`, `vendas.cancelar`, `estoque.editar` e `financeiro.ver`. O Admin gerencia os perfis pela tela de Permissoes. O frontend usa as permissoes para esconder menus e botoes, enquanto o backend IPC valida permissoes antes de executar operacoes sensiveis.

Esta abordagem equilibra controle e simplicidade. Evita a confusao operacional de permissoes individuais por usuario nesta fase, mas ainda permite adaptar os perfis a realidade da farmacia.

## Arquitetura

### Banco de Dados

Estender `src/backend/database.js` com novas colunas e tabelas:

- `Usuarios`
  - `perfil_id`
  - `deve_trocar_senha`
  - `ultimo_login_em`
  - `falhas_login`
  - `bloqueado_ate`
- `Perfis`
  - `id`
  - `nome`
  - `descricao`
  - `sistema`
  - `ativo`
- `Permissoes`
  - `id`
  - `chave`
  - `modulo`
  - `acao`
  - `descricao`
- `PerfilPermissoes`
  - `perfil_id`
  - `permissao_id`
- `AuditoriaUsuarios`
  - `id`
  - `ator_usuario_id`
  - `usuario_afetado_id`
  - `acao`
  - `detalhes`
  - `data_evento`

As alteracoes devem seguir o padrao atual de sincronizacao por Sequelize com compatibilidade SQLite. Como o projeto ainda nao tem sistema formal de migracoes, a sincronizacao deve incluir funcoes defensivas para colunas essenciais quando necessario, seguindo o estilo atual de `ensureSqliteVendasColumns` e `ensureSqliteFinanceColumns`.

### Backend IPC

Adicionar uma camada de servico para autenticacao, usuarios, perfis e autorizacao. Os handlers IPC devem ser pequenos e delegar regra de negocio para esses servicos.

Na inicializacao do banco, se nao houver nenhum usuario, o sistema deve criar um perfil Administrador com todas as permissoes e um usuario Admin inicial. Esse bootstrap deve ser deterministico o suficiente para desenvolvimento local e seguro o suficiente para obrigar troca de senha no primeiro login.

Operacoes principais:

- `auth.login`
- `auth.logout`
- `auth.currentSession`
- `auth.changeOwnPassword`
- `users.list`
- `users.create`
- `users.update`
- `users.activate`
- `users.deactivate`
- `users.resetPassword`
- `profiles.list`
- `profiles.updatePermissions`

Operacoes sensiveis devem validar permissao no backend antes de tocar no banco. A interface pode esconder a acao, mas a autorizacao real fica no processo principal.

### Frontend

O app deixa de abrir direto no Dashboard. Ao iniciar:

1. Consulta sessao atual.
2. Se nao houver usuario autenticado, exibe Login.
3. Se o usuario tiver `deve_trocar_senha`, exibe troca obrigatoria de senha.
4. Com sessao valida, renderiza a aplicacao atual com menus e acoes filtrados por permissao.

A tela `Usuarios.jsx` deixa de usar `src/data/pharmacyData.mjs` para usuarios. Ela passa a consumir dados reais via IPC e exibe:

- Nome completo
- Nome de usuario
- Email
- Perfil
- Estado
- Ultimo login
- Acoes disponiveis conforme permissao

Adicionar uma tela ou modal de Permissoes para editar a matriz de permissoes por perfil.

## Matriz Inicial de Permissoes

- Dashboard
  - `dashboard.ver`
- Vendas
  - `vendas.ver`
  - `vendas.criar`
  - `vendas.cancelar`
  - `vendas.desconto`
- Estoque
  - `estoque.ver`
  - `estoque.criar`
  - `estoque.editar`
  - `estoque.apagar`
  - `estoque.importar`
- Financeiro
  - `financeiro.ver`
  - `financeiro.criar`
  - `financeiro.editar`
  - `financeiro.apagar`
- Clientes
  - `clientes.ver`
  - `clientes.criar`
  - `clientes.editar`
  - `clientes.apagar`
- Relatorios
  - `relatorios.ver`
  - `relatorios.exportar`
- Configuracoes
  - `configuracoes.ver`
  - `configuracoes.editar`
- Usuarios
  - `usuarios.ver`
  - `usuarios.criar`
  - `usuarios.editar`
  - `usuarios.inativar`
  - `usuarios.resetar_senha`
  - `usuarios.gerir_permissoes`

## Recuperacao de Senha pelo Admin

O fluxo aprovado para esta etapa:

1. Admin abre a tela de Usuarios.
2. Admin escolhe "Redefinir senha" para um usuario.
3. Sistema gera uma senha temporaria e a exibe uma unica vez para o Admin copiar.
4. Sistema grava apenas o hash da nova senha.
5. Sistema marca `deve_trocar_senha = true`.
6. Sistema registra auditoria.
7. No proximo login, o usuario e obrigado a trocar a senha antes de acessar o sistema.

O sistema nao envia email automatico nesta etapa. O Admin comunica a senha temporaria por processo interno da farmacia.

## Regras de Seguranca

- Nunca persistir senha em texto puro.
- Nunca retornar `senha_hash` ao frontend.
- Usar hash com salt via API nativa do Node.
- Bloquear login de usuario inativo.
- Bloquear temporariamente apos varias falhas de login.
- Registrar auditoria para login, falha de login, reset de senha, troca obrigatoria, alteracao de perfil, mudanca de permissoes e ativacao/inativacao.
- Impedir que o ultimo Admin ativo seja inativado.
- Impedir que o perfil Administrador perca `usuarios.gerir_permissoes` e permissoes essenciais de gestao de usuarios.

## Tratamento de Erros

O backend deve retornar mensagens seguras e claras:

- Credenciais invalidas.
- Usuario inativo.
- Usuario temporariamente bloqueado.
- Troca de senha obrigatoria.
- Permissao insuficiente.
- Nome de usuario ou email ja cadastrado.

Erros internos devem ser logados no processo principal e exibidos no frontend como mensagem operacional generica, sem stack trace.

## Testes

Adicionar cobertura com o Node test runner atual:

- Esquema do banco
  - Novas colunas de `Usuarios`.
  - Tabelas `Perfis`, `Permissoes`, `PerfilPermissoes` e `AuditoriaUsuarios`.
  - Seed inicial de perfis e permissoes.
  - Bootstrap do primeiro Admin quando nao houver usuarios.
- Autenticacao
  - Login valido.
  - Senha invalida.
  - Usuario inativo.
  - Bloqueio por falhas.
  - Reset de senha pelo Admin.
  - Troca obrigatoria de senha.
- Autorizacao
  - Usuario com permissao executa acao sensivel.
  - Usuario sem permissao recebe erro.
  - Frontend recebe lista segura de permissoes.
- Verificacao final
  - `npm test`
  - `npm run build`

## Fora de Escopo Nesta Etapa

- Recuperacao por email.
- Permissoes individuais por usuario.
- Integracao com provedor externo de identidade.
- Segundo fator de autenticacao.
- Sistema completo de migracoes versionadas.
- Relatorios detalhados de auditoria para usuario final.

## Criterios de Aceite

- Aplicacao exige login antes de acessar os modulos.
- Instalacao nova cria caminho de primeiro acesso com Admin inicial e troca obrigatoria de senha.
- O usuario logado aparece no topo da aplicacao com dados reais.
- Admin consegue criar, editar, ativar, inativar e resetar senha de usuarios.
- Admin consegue editar permissoes por perfil.
- Menus e acoes respeitam permissoes no frontend.
- IPC bloqueia operacoes sensiveis sem permissao.
- Reset de senha obriga troca no proximo login.
- Dados sensiveis nao sao expostos ao renderer.
- Testes e build passam.
