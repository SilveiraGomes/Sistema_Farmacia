# Modulo Documentos

## Objetivo

Adicionar uma Central de Documentos ao sistema Farmacia ESAYOS para consultar, imprimir, exportar, converter e anular documentos comerciais e operacionais.

O modulo deve incluir todos os documentos ligados ao ciclo de venda e atendimento:

- Facturas
- Recibos
- Proformas ou orcamentos
- Notas de credito
- Notas de debito
- Guias de entrega ou movimentacao
- Documentos anulados

A primeira entrega deve priorizar uma tela unica de consulta e operacao, com fluxo claro para anulacao de venda e impressao de segunda via de factura.

## Decisoes Aprovadas

- Usar a abordagem "Central de Documentos".
- A tela sera uma lista unica com filtros por tipo, estado, cliente, numero e periodo.
- Acoes ficam por linha e em painel de detalhes.
- Incluir todos os tipos principais de documentos desde o desenho inicial.
- Anulacao nao apaga documento nem venda; altera estado e registra historico.
- Segunda via deve estar disponivel para documentos emitidos.
- Proformas podem ser convertidas em factura quando aplicavel.

## Abordagem Escolhida

Criar um modulo `Documentos` como central operacional.

O usuario entra em uma tela unica, pesquisa qualquer documento e executa acoes autorizadas. Essa abordagem reduz atrito no balcao, porque o utilizador nao precisa saber previamente se esta procurando uma factura, recibo, proforma ou nota. Os tipos continuam visiveis por filtro e coluna, mas a experiencia principal e uma pesquisa consolidada.

Para documentos mais complexos, abrir um painel de detalhes com itens, totais, cliente, relacoes com venda, historico e acoes. Isso mantem a tabela densa e rapida sem perder rastreabilidade.

## Navegacao e Permissoes

Adicionar `documentos` ao menu lateral antes de Configuracoes e Usuarios.

Novas permissoes:

- `documentos.ver`
- `documentos.imprimir`
- `documentos.anular`
- `documentos.exportar`
- `documentos.converter`

Perfil Administrador recebe todas as permissoes. Perfis de gestao recebem permissao de anulacao; na estrutura atual isso inclui o Gestor de Stock e pode incluir futuros perfis gerenciais. Perfil Farmaceutico deve receber `documentos.ver`, `documentos.imprimir` e `documentos.exportar`, sem permissao de anulacao. Perfil Caixa, ou Vendedor se esse perfil for criado depois, deve receber `documentos.ver` e `documentos.imprimir`, tambem sem permissao de anulacao. Permissao de conversao fica inicialmente restrita ao Administrador e aos perfis de gestao.

## Tela Principal

A tela `Documentos` deve conter:

- Metricas no topo:
  - Documentos emitidos
  - Facturas anuladas
  - Proformas pendentes
  - Total documentado no periodo
- Filtros:
  - Tipo de documento
  - Estado
  - Periodo
  - Cliente
  - Numero do documento
- Tabela:
  - Numero
  - Tipo
  - Cliente
  - Data
  - Total
  - Estado
  - Usuario
  - Opcoes

Acoes por documento:

- Ver detalhes
- Imprimir segunda via
- Exportar
- Anular
- Converter, apenas para documentos elegiveis

## Painel de Detalhes

Ao abrir um documento, exibir:

- Cabecalho do documento
- Cliente ou consumidor final
- Itens e quantidades
- Totais
- Forma de pagamento quando existir
- Venda relacionada quando existir
- Documento de origem ou destino quando existir
- Historico de eventos
- Motivo de anulacao, se anulado

O painel deve permitir as mesmas acoes da linha, respeitando permissoes e estado atual.

## Estados de Documento

Estados iniciais:

- `RASCUNHO`
- `EMITIDO`
- `PAGO`
- `PENDENTE`
- `CONVERTIDO`
- `ANULADO`

Nem todos os tipos usam todos os estados. Por exemplo, uma factura pode estar `EMITIDO`, `PAGO` ou `ANULADO`; uma proforma pode estar `PENDENTE`, `CONVERTIDO` ou `ANULADO`.

## Regras de Anulacao

Anular documento deve:

1. Exigir permissao `documentos.anular`.
2. Estar disponivel apenas para Administrador e perfis de gestao; Farmaceutico, Caixa e Vendedor nao podem anular documentos.
3. Pedir confirmacao antes de continuar.
4. Exigir motivo de anulacao.
5. Registrar usuario, data e motivo.
6. Alterar estado para `ANULADO`.
7. Bloquear nova anulacao do mesmo documento.
8. Preservar dados originais para auditoria e segunda via historica.

Quando o documento estiver ligado a uma venda finalizada, a anulacao deve marcar a venda como anulada e registrar o vinculo. A primeira etapa nao precisa reconstruir estoque automaticamente, a menos que o fluxo atual de estoque ja tenha uma base confiavel para isso no momento da implementacao. Se houver reversao de estoque, ela deve ser explicita e auditada.

## Segunda Via e Impressao

Segunda via deve:

- Reutilizar os dados originais do documento.
- Indicar visualmente que e segunda via.
- Bloquear edicao de valores e itens.
- Estar disponivel para documentos emitidos, pagos, convertidos e anulados.
- Respeitar permissao `documentos.imprimir`.

Na primeira versao, imprimir pode usar `window.print()` sobre uma visualizacao preparada para impressao. Exportacao pode gerar um layout HTML/imprimivel ou preparar base para PDF em etapa posterior.

## Conversao de Documentos

Conversao inicial:

- Proforma para factura.

Regras:

- Exigir permissao `documentos.converter`.
- Confirmar a conversao.
- Gerar novo numero de factura.
- Manter referencia ao documento de origem.
- Marcar a proforma como `CONVERTIDO`.
- Impedir conversao duplicada.

Notas de credito e debito entram como tipos visiveis e rastreaveis. A geracao automatica de notas por anulacao pode ser uma evolucao, mas o design deve manter campo de relacionamento para suportar isso.

## Dados e Arquitetura

Adicionar uma camada de dominio para documentos, preferencialmente em `src/data` para a primeira interface mockada e em servicos backend quando a persistencia real for conectada.

Modelo conceitual:

- Documento
  - id
  - numero
  - tipo
  - estado
  - cliente_id
  - cliente_nome
  - usuario_id
  - venda_id
  - documento_origem_id
  - data_emissao
  - total
  - motivo_anulacao
  - anulado_por_usuario_id
  - anulado_em
- DocumentoItem
  - documento_id
  - produto_id
  - descricao
  - quantidade
  - preco_unitario
  - total
- DocumentoEvento
  - documento_id
  - usuario_id
  - acao
  - detalhes
  - data_evento

Enquanto o projeto ainda usa muitos dados em memoria para vendas e estoque, a primeira implementacao pode usar dados estruturados mockados para a tela. As funcoes devem ficar puras e testaveis para facilitar a troca posterior por IPC e banco.

## Integracao com Vendas

O fluxo de Vendas deve continuar focado em vender. Ao finalizar uma venda, a estrutura deve ser capaz de gerar uma factura e recibo relacionados.

Na primeira etapa visual, a Central de Documentos pode consumir dados derivados dos exemplos atuais de `invoices` e do fluxo de vendas. A anulacao real de venda persistida deve ser feita quando o backend de vendas/documentos estiver conectado.

## Tratamento de Erros

Mensagens operacionais:

- Documento nao encontrado.
- Documento ja anulado.
- Documento nao pode ser convertido.
- Permissao insuficiente.
- Informe o motivo da anulacao.
- Nao foi possivel imprimir o documento.

Erros internos nao devem expor stack trace ao renderer.

## Testes

Adicionar cobertura no Node test runner:

- Filtros de documentos por tipo, estado, periodo, cliente e numero.
- Metricas da central.
- Anulacao exige motivo.
- Anulacao muda estado e registra evento.
- Documento anulado nao pode ser anulado novamente.
- Segunda via preserva dados originais.
- Proforma convertida gera factura e bloqueia conversao duplicada.
- Permissoes de documentos existem no catalogo.

Verificacao final:

- `npm test`
- `npm run build`

## Fora de Escopo Nesta Etapa

- Integracao fiscal externa.
- Assinatura digital.
- Envio automatico por email ou WhatsApp.
- PDF nativo robusto.
- Reversao automatica de estoque em anulacao, salvo se a base de estoque ja estiver preparada durante a implementacao.
- Migracao completa para documentos persistidos se a etapa for apenas frontend/mock.

## Criterios de Aceite

- Menu lateral mostra Documentos para usuarios com `documentos.ver`.
- Tela Documentos mostra todos os tipos em uma lista unica.
- Usuario consegue filtrar por tipo, estado, data, cliente e numero.
- Usuario autorizado consegue abrir detalhes.
- Usuario autorizado consegue imprimir segunda via.
- Usuario autorizado consegue exportar.
- Apenas Administrador e perfis de gestao conseguem anular com confirmacao e motivo.
- Documento anulado permanece visivel com estado `ANULADO`.
- Proforma pode ser convertida em factura quando elegivel.
- Acoes respeitam permissoes no frontend.
- Testes e build passam.
