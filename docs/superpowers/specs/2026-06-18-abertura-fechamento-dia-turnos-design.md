# Abertura e Fechamento de Dia e Turnos

## Objetivo

Criar um controlo operacional persistido em SQLite para abertura e fechamento do dia e dos turnos da farmacia. Sem um dia aberto e um turno aberto, o sistema nao deve permitir operacoes de venda, lancamentos financeiros manuais, despesas, perdas ou outras operacoes que movimentem caixa/financeiro.

## Decisoes Aprovadas

- O estado operacional sera persistido em SQLite.
- Deve existir apenas um dia operacional aberto por vez para toda a farmacia.
- Deve existir apenas um turno operacional aberto por vez para toda a farmacia.
- O fluxo principal e: abrir dia, abrir turno, executar operacoes, fechar turno e fechar dia.
- O dia nao pode ser fechado enquanto houver turno aberto.
- Um turno nao pode ser aberto sem dia aberto.
- Operacoes criticas ficam bloqueadas quando nao houver dia e turno abertos.

## Arquitetura

O recurso sera implementado como modulo operacional centralizado, com modelos no SQLite, servico de dominio no backend, rotas IPC protegidas por permissao e componentes React para operar e consultar o estado atual.

O front-end consulta o estado operacional atual e usa essa informacao para bloquear ou liberar acoes. O backend deve validar as mesmas regras nas rotas do modulo operacional para manter consistencia e preparar o sistema para persistir vendas/financeiro no backend em etapas futuras.

## Modelo de Dados

### DiaOperacional

Campos:

- `id`
- `data_operacional`, formato de data do dia controlado.
- `status`, com valores `Aberto` ou `Fechado`.
- `saldo_inicial`, valor informado ao abrir o dia.
- `saldo_final_informado`, valor contado no fechamento.
- `total_vendas`, total calculado para o dia.
- `total_despesas`, total calculado para o dia.
- `total_perdas`, total calculado para o dia.
- `diferenca_caixa`, diferenca entre saldo esperado e saldo informado.
- `observacao_abertura`
- `observacao_fechamento`
- `aberto_por_usuario_id`
- `fechado_por_usuario_id`
- `aberto_em`
- `fechado_em`
- timestamps padrao do Sequelize.

Regras:

- So pode existir um `DiaOperacional` com status `Aberto`.
- Nao pode abrir dia se ja existir outro dia aberto.
- Nao pode fechar dia se nao existir dia aberto.
- Nao pode fechar dia se existir turno aberto.

### TurnoOperacional

Campos:

- `id`
- `dia_operacional_id`
- `nome`, com valores como `Manha`, `Tarde`, `Noite` ou outro texto configuravel depois.
- `status`, com valores `Aberto` ou `Fechado`.
- `saldo_inicial`, valor informado ao abrir o turno.
- `saldo_final_informado`, valor contado no fechamento.
- `total_vendas`, total calculado para o turno.
- `total_despesas`, total calculado para o turno.
- `total_perdas`, total calculado para o turno.
- `diferenca_caixa`
- `observacao_abertura`
- `observacao_fechamento`
- `aberto_por_usuario_id`
- `fechado_por_usuario_id`
- `aberto_em`
- `fechado_em`
- timestamps padrao do Sequelize.

Regras:

- So pode existir um `TurnoOperacional` com status `Aberto`.
- Nao pode abrir turno sem dia aberto.
- Nao pode abrir turno se ja existir turno aberto.
- Nao pode fechar turno se nao existir turno aberto.
- O turno pertence ao dia operacional aberto.

## Servico de Dominio

Criar `operationService` no backend com funcoes:

- `getOperationalState()`: retorna dia aberto, turno aberto, flags de bloqueio e mensagens para UI.
- `openDay({ actorUserId, data })`: abre o dia com saldo inicial e observacao opcional.
- `closeDay({ actorUserId, data })`: fecha o dia com saldo final informado e observacao opcional.
- `openShift({ actorUserId, data })`: abre turno dentro do dia aberto.
- `closeShift({ actorUserId, data })`: fecha turno aberto.
- `assertOperationalSessionOpen()`: valida que existem dia e turno abertos para operacoes criticas.

Totais calculados inicialmente podem usar os dados persistidos que existirem no SQLite e, enquanto vendas/financeiro ainda tiverem partes locais no front-end, devem aceitar totais zero ou calculo parcial. A tela deve continuar clara sobre o estado aberto/fechado mesmo quando os totais ainda forem demonstrativos.

## Rotas IPC

Adicionar rotas em `ipcHandlers`:

- `operation.state`
- `operation.openDay`
- `operation.closeDay`
- `operation.openShift`
- `operation.closeShift`

Todas as rotas, exceto leitura de estado se desejado, devem exigir sessao valida, troca de senha concluida e permissao especifica.

## Permissoes

Adicionar ao catalogo:

- `operacao.ver`
- `operacao.abrir_dia`
- `operacao.fechar_dia`
- `operacao.abrir_turno`
- `operacao.fechar_turno`

Distribuicao inicial:

- Administrador: todas as permissoes.
- Farmaceutico: ver operacao, abrir turno, fechar turno.
- Caixa: ver operacao, abrir turno, fechar turno.
- Gestor de Stock: ver operacao.

Fechar dia fica inicialmente restrito ao Administrador. Se a farmacia quiser delegar esse poder depois, pode ser feito pela tela de perfis/permissoes.

## Interface

Adicionar nova view no menu chamada `Operacao` ou `Caixa`. A tela deve mostrar:

- Estado do dia: aberto ou fechado.
- Estado do turno: aberto ou fechado.
- Data operacional.
- Turno atual.
- Usuario responsavel pela abertura.
- Hora de abertura.
- Saldos inicial/final.
- Totais e diferenca no fechamento.

Acoes:

- `Abrir Dia`
- `Abrir Turno`
- `Fechar Turno`
- `Fechar Dia`

Modais:

- Abertura de dia: saldo inicial e observacao opcional.
- Abertura de turno: nome do turno, saldo inicial e observacao opcional.
- Fechamento de turno: saldo contado e observacao opcional.
- Fechamento de dia: saldo contado e observacao opcional.

## Bloqueio de Operacoes

Vendas:

- Produtos podem continuar visiveis.
- Carrinho pode ser preparado, mas finalizar venda e colocar venda em espera devem ficar bloqueados sem dia e turno abertos.
- Mostrar aviso claro no painel de venda quando a operacao estiver bloqueada.

Financeiro:

- Consulta e relatorios podem continuar visiveis.
- Novo lancamento manual, despesas, receitas extras e perdas manuais ficam bloqueados sem dia e turno abertos.
- Mostrar aviso claro na tela financeira quando a operacao estiver bloqueada.

Dashboard:

- Mostrar card de estado operacional.
- Mostrar alerta quando nao houver dia/turno aberto.
- Mostrar turno atual quando estiver aberto.

## Erros e Mensagens

Mensagens seguras para o usuario:

- `Abra o dia operacional antes de iniciar operacoes.`
- `Abra um turno antes de vender ou lancar despesas.`
- `Ja existe um dia operacional aberto.`
- `Ja existe um turno operacional aberto.`
- `Feche o turno aberto antes de fechar o dia.`
- `Nao ha dia operacional aberto.`
- `Nao ha turno operacional aberto.`

Essas mensagens devem ser tratadas como mensagens seguras no IPC para nao virarem erro generico.

## Testes

Testes de schema:

- Criar tabelas de dia e turno operacional.
- Migrar schema sem perder tabelas existentes.
- Garantir associacoes basicas com usuario.

Testes de servico:

- Abre dia quando nao ha dia aberto.
- Rejeita abrir segundo dia.
- Abre turno quando ha dia aberto.
- Rejeita abrir turno sem dia.
- Rejeita abrir segundo turno.
- Rejeita fechar dia com turno aberto.
- Fecha turno e depois permite fechar dia.
- `assertOperationalSessionOpen` rejeita quando falta dia ou turno.

Testes de IPC:

- Rotas de operacao aparecem no route map.
- Rotas protegidas exigem permissao correta.
- Erros operacionais seguros sao serializados.

Testes de componentes:

- Vendas desativa finalizacao quando nao ha turno aberto.
- Financeiro desativa novo lancamento quando nao ha turno aberto.
- Tela de operacao renderiza estado aberto/fechado e acoes disponiveis.

## Fora de Escopo Nesta Etapa

- Multiplos caixas simultaneos.
- Multiplos turnos abertos em paralelo.
- Fechamento fiscal oficial.
- Integracao completa de todas as vendas reais no SQLite.
- Configuracao dinamica de nomes de turnos.
- Exportacao PDF/Excel do fechamento.

Esses pontos podem ser adicionados depois sem quebrar o modelo central de dia e turno operacional.
