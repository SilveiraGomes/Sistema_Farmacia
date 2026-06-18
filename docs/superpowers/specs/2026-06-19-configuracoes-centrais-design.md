# Configurações centrais do sistema

## Objetivo

Transformar Configurações na fonte central e persistente das preferências globais, dos catálogos operacionais e das opções utilizadas pelos formulários. A entrega fecha a configuração funcional antes da criação do executável, eliminando campos decorativos, listas duplicadas e valores mantidos apenas no navegador.

## Decisões aprovadas

- SQLite é a fonte única das configurações globais.
- Todos os utilizadores autorizados leem a mesma configuração.
- Catálogos operacionais permitem adicionar, editar, ordenar e desativar opções.
- Estados técnicos usados pela lógica são apenas consultados.
- Alterações guardadas refletem imediatamente na interface, sem reiniciar.
- Toda alteração registra utilizador, valor anterior, valor novo e data.
- Valores existentes no SQLite, nas listas atuais e no `localStorage` são migrados sem duplicação.
- A página não cria novas janelas modais.
- A interface usa ícones, tooltips e tipografia de peso normal.
- O executável será tratado numa etapa posterior, após esta configuração estar validada.

## Escopo

Inclui:

- Persistência SQLite de configurações e catálogos.
- Serviço backend com leitura, validação, gravação, migração e auditoria.
- Rotas IPC protegidas por permissão.
- Snapshot central carregado após autenticação.
- Atualização imediata dos consumidores React.
- Migração dos valores atualmente mantidos em `localStorage`.
- Migração das listas fixas atualmente declaradas nos componentes.
- Migração de valores distintos já existentes nos registos SQLite.
- Gestão inline de catálogos operacionais.
- Alimentação central dos `selects`.
- Configuração funcional de backup e restauro.
- Testes unitários, integração IPC, interface e empacotamento Electron.

Não inclui:

- Criação do instalador ou executável final.
- Sincronização em nuvem.
- Configurações diferentes por utilizador.
- Exclusão física de opções já utilizadas.
- Edição de estados técnicos.
- Duplicação de categorias, subcategorias, perfis ou tipos de documento em novos catálogos.

## Arquitetura

### Tabela `ConfiguracaoSistema`

Armazena configurações escalares ou estruturadas:

- `id`.
- `chave`, única e estável.
- `grupo`.
- `tipo`: texto, número, booleano, lista ou objeto.
- `valor_json`.
- `versao`, incrementada a cada gravação.
- `atualizado_por_usuario_id`.
- `created_at` e `updated_at`.

As chaves e os tipos são definidos por um registo de esquema no backend. O cliente não pode criar chaves arbitrárias.

### Tabela `OpcaoCatalogo`

Armazena opções reutilizadas por `selects`:

- `id`.
- `catalogo`, chave estável do catálogo.
- `codigo`, identificador estável dentro do catálogo.
- `nome`, texto apresentado ao utilizador.
- `ordem`.
- `ativo`.
- `sistema`, indicando opção técnica protegida.
- `metadados_json`.
- `atualizado_por_usuario_id`.
- `created_at` e `updated_at`.

O par `catalogo + codigo` é único. O código não muda depois de criado. A edição altera nome, ordem, estado e metadados permitidos.

### Tabela `AuditoriaConfiguracao`

Registra:

- `id`.
- `ator_usuario_id`.
- `tipo_alvo`: configuração ou catálogo.
- `alvo_chave`.
- `acao`: criar, atualizar, ordenar, ativar, desativar, migrar, backup ou restaurar.
- `valor_anterior_json`.
- `valor_novo_json`.
- `data_evento`.

### Serviço de configurações

Criar `configurationService` com responsabilidades isoladas:

- `getSnapshot()`.
- `updateSection({ actorUserId, section, values, expectedVersions })`.
- `listCatalog({ catalogKey, includeInactive })`.
- `createCatalogOption({ actorUserId, catalogKey, data })`.
- `updateCatalogOption({ actorUserId, optionId, data, expectedVersion })`.
- `reorderCatalogOptions({ actorUserId, catalogKey, optionIds })`.
- `deactivateCatalogOption({ actorUserId, optionId })`.
- `activateCatalogOption({ actorUserId, optionId })`.
- `importLegacySettings({ actorUserId, data, migrationVersion })`.
- `createBackup({ actorUserId })`.
- `restoreBackup({ actorUserId, filePath })`.

Cada mutação usa uma transação SQLite e grava auditoria na mesma transação.

### Contexto React

Criar `SettingsContext` para:

- Carregar o snapshot depois da autenticação.
- Expor configurações por chave.
- Expor `useCatalog(catalogKey, options)`.
- Atualizar o snapshot depois de cada gravação.
- Preservar a última edição local quando uma gravação falhar.
- Informar carregamento, erro, modo somente leitura e versão.

`SettingsProvider` fica dentro do contexto autenticado e antes dos módulos que consomem configurações.

## Inicialização e migração

### Criação do esquema

`syncDatabaseSchema` cria e repara as três tabelas, índices únicos e relações de utilizador.

### Seed de padrões

O backend mantém um registo tipado de padrões. O seed é idempotente: cria somente chaves e opções ausentes e nunca sobrescreve valores personalizados.

### Valores SQLite existentes

Na primeira migração, o backend lê valores distintos dos campos existentes, incluindo formas de pagamento, turnos, categorias financeiras, motivos de perda, unidades e localizações. Valores normalizados iguais são consolidados numa única opção.

### Listas fixas atuais

As listas declaradas em componentes são convertidas em seeds. Depois da migração, os componentes deixam de conter cópias editáveis dessas listas.

### `localStorage`

O backend não acessa `localStorage`. Depois de obter um snapshot que indica migração pendente, o frontend lê a identidade visual e as configurações A4 antigas, envia uma importação única e recarrega o snapshot.

O backend aceita a importação somente quando a versão correspondente ainda não foi concluída. Valores já guardados no SQLite têm prioridade. Depois da confirmação, os consumidores deixam de ler essas chaves do `localStorage`; os valores antigos podem permanecer armazenados, mas não participam mais do funcionamento do sistema.

## Secções da página

### Empresa e documentos

- Nome e identidade da farmácia.
- NIF, endereço e contactos.
- Logótipo.
- Cabeçalho documental multilinha.
- Moeda padrão e formato monetário.
- Regime fiscal.
- Número de validação AGT.
- Nome do software.
- Séries, prefixos e próximo número por tipo de documento.
- Exibição de QR code.
- Total por extenso.
- Contas bancárias.

### Vendas

- Formas de pagamento.
- Forma de pagamento padrão.
- Imposto padrão.
- Limite de desconto.
- Regra de arredondamento.
- Designação do consumidor final.

### Operação

- Turnos operacionais.
- Ordem de apresentação dos turnos.
- Estados operacionais técnicos, apenas para consulta.

### Stock

- Limite padrão de stock baixo.
- Dias para alerta de validade.
- Unidades de medida.
- Localizações.
- Leitura das categorias e subcategorias oficiais do stock.

Categorias e subcategorias não são copiadas para `OpcaoCatalogo`. Os formulários continuam a consultar as tabelas `Categoria` e `Subcategoria`.

### Financeiro

- Categorias de despesas.
- Categorias de receitas.
- Motivos de perdas.
- Consulta dos tipos e estados técnicos.
- Reutilização dos turnos e formas de pagamento globais.

### Clientes, utilizadores e documentos

- Estados de clientes, protegidos.
- Perfis vindos do serviço de perfis.
- Tipos e estados de documento vindos do módulo de documentos, protegidos.
- Resumo somente leitura para provar a origem de cada `select`.

### Alertas e backup

- Ativação dos alertas do Dashboard.
- Mensagem padrão.
- Frequência do backup: manual, diário ou semanal.
- Pasta de destino escolhida por diálogo nativo do Electron.
- Quantidade de backups a reter.
- Ação para criar backup imediato.
- Lista dos backups encontrados na pasta configurada.
- Ação de restauro com validação e confirmação compartilhada.

O restauro cria primeiro um backup de segurança, valida o arquivo selecionado, substitui a base e reinicia a aplicação. É a única operação desta entrega que exige reinício.

## Catálogos

### Editáveis

- `payment_methods`.
- `operation_shifts`.
- `expense_categories`.
- `revenue_categories`.
- `loss_reasons`.
- `stock_units`.
- `stock_locations`.

### Técnicos protegidos

- `client_statuses`.
- `document_types`.
- `document_statuses`.
- `financial_entry_types`.
- `financial_statuses`.
- `operation_statuses`.

### Fontes oficiais externas ao catálogo

- Categorias e subcategorias: tabelas de stock.
- Perfis: serviço de perfis.
- Produtos, clientes e fornecedores: tabelas próprias.
- Utilizadores: serviço de utilizadores.

## Alimentação dos `selects`

`useCatalog(catalogKey, options)` recebe:

- `includeInactive`, padrão `false`.
- `includeEmpty`, padrão `false`.
- `emptyLabel`.
- `sort`, usando a ordem do catálogo por padrão.

Formulários de criação mostram somente opções ativas. Consultas e detalhes históricos podem incluir inativas. Um registo antigo preserva o código original e resolve o nome atual ou o último nome conhecido.

Consumidores obrigatórios:

- Vendas: formas de pagamento.
- Operação: turnos.
- Financeiro: turnos, categorias e motivos de perda.
- Stock: unidades, localizações, categorias e subcategorias oficiais.
- Clientes: estados técnicos.
- Documentos: tipos e estados técnicos.
- Utilizadores: perfis oficiais.

## Regras de negócio

- Não desativar a única forma de pagamento ativa.
- Não desativar uma opção definida como padrão até escolher outra.
- Não desativar um turno atualmente aberto.
- Não alterar ou desativar opções técnicas.
- Não apagar opções utilizadas.
- Não reutilizar um código desativado para outro significado.
- Nome é obrigatório e único por normalização dentro do catálogo.
- Ordem contém todos os itens ativos uma única vez.
- Valores numéricos respeitam limites definidos no esquema.
- A versão esperada precisa coincidir com a versão persistida.

## Interface

A gestão ocorre na página, sem criar novas modais.

### Estrutura

- Navegação por secções incorporada.
- Cabeçalho com estado de sincronização e última atualização.
- Formulário da secção ativa.
- Área inline para gestão de catálogos.
- Resumo da origem dos dados nos catálogos protegidos.

### Linguagem visual

- Ícones nos títulos, grupos e ações.
- Tooltips em ícones, campos complexos e ações de risco.
- Texto normal, evitando excesso de negrito.
- Ícones com `aria-label` e tooltip acessível por teclado.
- Ações compactas e consistentes.
- Estados visíveis: carregando, guardado, alteração pendente, erro e somente leitura.

### Edição de catálogos

- Adicionar opção numa linha incorporada.
- Editar nome na própria linha.
- Ordenar com ações de subir e descer ou controlo acessível equivalente.
- Ativar e desativar com ícone e tooltip.
- Mostrar opções inativas por alternância.
- Usar a confirmação compartilhada em desativação sensível e restauro.

Cada secção tem o próprio botão Guardar. Catálogos persistem por ação. Não há gravação automática enquanto o utilizador digita.

## Permissões e auditoria

- `configuracoes.ver`: carregar snapshot e consultar catálogos.
- `configuracoes.editar`: atualizar secções e gerir catálogos editáveis.
- Backup manual e restauro exigem `configuracoes.editar` nesta entrega.
- Utilizador sem permissão de edição vê campos e ações desativados.
- Toda mutação inclui o utilizador autenticado e gera auditoria.

## Concorrência e atualização imediata

As gravações usam controlo otimista por versão. Se outra sessão alterar a mesma chave ou opção, o backend rejeita a versão antiga. A interface mantém os dados digitados, mostra o conflito e oferece recarregar a secção.

Depois de uma gravação aceita, o frontend incorpora o snapshot devolvido. Todos os componentes consumidores renderizam novamente. Não é necessário reiniciar, exceto após restauro do banco.

## Falhas e recuperação

- Snapshot indisponível: padrões seguros somente para leitura e gravação bloqueada.
- Migração inválida: rollback integral e registo técnico.
- `localStorage` corrompido: ignorar o valor e manter padrão/SQLite.
- Valor de campo inválido: mensagem junto ao campo.
- Falha de gravação: preservar alterações locais.
- Código duplicado: rejeitar com mensagem objetiva.
- Opção inativa em histórico: continuar a resolver o nome.
- Pasta de backup indisponível: manter aplicação operacional e mostrar erro.
- Backup inválido: não substituir a base atual.
- Restauro falhado: restaurar automaticamente o backup de segurança.

## Testes

### Esquema e migração

- Criação das três tabelas e índices.
- Seed idempotente.
- Preservação de valores personalizados em nova sincronização.
- Importação de valores SQLite distintos.
- Consolidação sem duplicação.
- Migração única do `localStorage`.
- Rollback de migração inválida.

### Serviço

- Leitura do snapshot.
- Validação tipada por secção.
- Atualização transacional.
- Auditoria com valores anterior e novo.
- Permissões de leitura e edição.
- Concorrência por versão.
- CRUD, ordenação, ativação e desativação.
- Proteção de opções técnicas.
- Regras de padrão e última opção ativa.
- Compatibilidade histórica.

### Contexto e interface

- Carregamento após autenticação.
- Fallback somente leitura.
- Atualização imediata dos consumidores.
- Preservação de formulário após erro.
- Estado de conflito.
- Ausência de novas modais.
- Ícones e tooltips acessíveis.
- Tipografia sem excesso de negrito.
- Respeito às permissões.

### Consumidores

- Vendas recebe formas de pagamento.
- Operação recebe turnos.
- Financeiro recebe turnos, categorias e motivos.
- Stock recebe unidades, localizações e dados oficiais de categorias.
- Clientes recebe estados protegidos.
- Documentos recebe tipos e estados protegidos.
- Utilizadores continua a receber perfis do serviço oficial.

### Backup

- Escolha e persistência da pasta.
- Criação manual.
- Retenção.
- Validação antes do restauro.
- Backup de segurança anterior ao restauro.
- Recuperação em caso de falha.

### Verificação final

- `npm test`.
- `npm run build:tailwind`.
- `npm run build`.
- Teste do arranque Electron.
- Teste de empacotamento sem gerar ainda o instalador final.

## Critérios de aceitação

- Configurações persistem no SQLite e são globais.
- A página não contém campos decorativos.
- Todos os catálogos editáveis suportam criar, editar, ordenar, ativar e desativar.
- Estados técnicos são visíveis e protegidos.
- Valores existentes são migrados sem duplicação.
- Formulários deixam de manter listas configuráveis próprias.
- Alterações guardadas aparecem imediatamente nos consumidores.
- Registos históricos continuam legíveis com opções inativas.
- Todas as mutações são auditadas.
- A interface não adiciona novas modais.
- Ícones e tooltips ajudam sem excesso de negrito.
- Backup manual, retenção e restauro seguro funcionam.
- Suíte, CSS, build web e teste de empacotamento Electron passam.
