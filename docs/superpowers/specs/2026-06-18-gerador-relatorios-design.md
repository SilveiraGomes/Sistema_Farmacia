# Gerador de Relatorios

## Objetivo

Atualizar a tela de Relatorios para deixar de ser apenas um resumo estatico e passar a ser uma central capaz de gerar relatorios operacionais, comerciais, financeiros, fiscais e de stock a partir das fontes atuais do frontend.

A primeira versao usa os dados ja disponiveis na aplicacao, como `pharmacyData`, documentos, vendas, financeiro, stock e clientes. O desenho deve deixar a geracao isolada em funcoes puras para permitir troca posterior da origem dos dados para SQLite/backend sem reescrever a interface.

## Escopo

Inclui:

- Catalogo de relatorios por modulo.
- Filtros por periodo, turno, categoria, status, cliente e forma de pagamento, quando aplicavel.
- Pre-visualizacao A4 com cabecalho documental alinhado ao modelo de Factura A4.
- Acoes de imprimir, salvar em PDF via fluxo de impressao e exportar Excel/CSV.
- Tabelas detalhadas, KPIs, totais e subtotais por relatorio.
- Testes para o motor de relatorios e para a presenca das principais acoes na UI.

Nao inclui nesta etapa:

- Leitura direta do SQLite.
- Geracao nativa de PDF binario fora do fluxo de impressao do navegador.
- Arquivos `.xlsx` reais com multiplas abas; a primeira entrega exporta CSV compativel com Excel.
- Agendamento automatico de relatorios.

## Catalogo de Relatorios

### Geral

- Resumo executivo.
- Balanco geral do periodo.
- Movimento diario consolidado.
- Movimento por turno.

### Vendas

- Vendas detalhadas.
- Vendas por produto.
- Produtos mais vendidos.
- Vendas por categoria.
- Vendas por forma de pagamento.
- Vendas por turno.
- Facturas em espera.

### Financeiro

- Demonstrativo financeiro.
- Receitas por origem.
- Despesas pagas e pendentes.
- Lucro bruto e liquido.
- Margem por produto.
- Perdas e baixas de stock.

### Stock

- Stock atual.
- Stock baixo.
- Sem stock.
- Inventario por categoria e localizacao.
- Produtos com validade critica.
- Entradas e baixas quando houver fonte disponivel.

### Clientes

- Clientes ativos.
- Clientes com credito aberto.
- Historico de compras por cliente.
- Novos clientes no periodo.

### Documentos

- Documentos emitidos.
- Facturas, recibos, proformas e notas de credito.
- Documentos anulados.
- Documentos por status.

### Operacao

- Estado do dia operacional.
- Resumo de turnos.
- Aberturas e fechamentos.
- Valores informados no fecho, quando existirem dados no contexto operacional.

## Arquitetura

Criar um modulo puro `src/data/reports.mjs` com:

- `REPORT_CATALOG`: definicao dos relatorios, grupos, filtros suportados, colunas e exportabilidade.
- `buildReportData(reportId, data, filters)`: retorna um view model completo para um relatorio.
- `buildReportExportRows(report)`: retorna linhas tabulares para CSV/Excel.
- `buildReportCsv(report)`: converte linhas para CSV com cabecalhos.
- Helpers de periodo, agrupamento, soma monetaria e ordenacao.

O componente `Relatorios.jsx` passa a usar esse motor e fica responsavel por:

- Mostrar o catalogo.
- Aplicar filtros.
- Renderizar KPIs e tabela do relatorio selecionado.
- Abrir pre-visualizacao A4.
- Chamar imprimir/PDF.
- Baixar CSV compativel com Excel.

Criar `src/components/ReportA4.jsx` para a pre-visualizacao, usando o mesmo DNA visual do `InvoiceA4`:

- Cabecalho com nome da farmacia, NIF, atividade, contacto e logo.
- Caixa do documento com titulo do relatorio, periodo e data de emissao.
- Secao de filtros aplicados.
- KPIs principais.
- Tabela detalhada.
- Rodape com usuario, data de impressao e regime fiscal/configuracao quando disponivel.

## UI/UX

A tela de Relatorios deve ter uma experiencia de central de trabalho:

- Barra superior compacta com periodo, datas, turno e botoes de acao.
- Catalogo lateral ou grade compacta com grupos de relatorios.
- Area principal com titulo do relatorio, descricao curta, KPIs e tabela.
- Acoes claras: gerar, imprimir, PDF e Excel.
- Estados vazios quando nenhum item passa nos filtros.
- Sem textos promocionais ou explicacoes longas dentro da tela.

Os titulos devem seguir o padrao recente do sistema: texto normal, visual limpo e sem excesso de negrito. Valores monetarios devem ficar em linha propria quando necessario para evitar quebras ruins.

## Exportacao

### Impressao

O botao Imprimir abre o modal A4 e chama `window.print()` sobre o escopo preparado.

### PDF

O botao PDF usa o mesmo fluxo de impressao, com `title="Salvar PDF"` e icone, mantendo consistencia com Documentos e Vendas. A geracao de PDF nativo fica para uma etapa posterior.

### Excel

O botao Excel gera um CSV com separador `;`, BOM UTF-8 e colunas do relatorio selecionado. O arquivo deve abrir corretamente no Excel com valores, datas e textos escapados.

## Permissoes

- `relatorios.ver`: permite abrir e gerar relatorios.
- `relatorios.exportar`: permite imprimir, salvar PDF e exportar Excel/CSV.

Se o usuario nao tiver permissao de exportacao, os botoes de PDF, imprimir e Excel nao devem aparecer.

## Tratamento de Erros

- Relatorio desconhecido: voltar para `resumo-executivo`.
- Datas invalidas: usar periodo padrao do mes da data de referencia.
- Filtro sem dados: renderizar tabela vazia com mensagem objetiva.
- Exportacao sem linhas: gerar CSV apenas com cabecalho ou bloquear com aviso na tela.

## Testes

Adicionar testes para:

- Catalogo conter os grupos principais.
- `buildReportData` gerar relatorios de vendas, financeiro, stock, clientes, documentos e operacao.
- Filtros por periodo, turno, status e forma de pagamento.
- `buildReportCsv` escapar separadores, quebras de linha e aspas.
- `Relatorios.jsx` importar o motor, expor botoes de imprimir/PDF/Excel e renderizar `ReportA4`.
- CSS conter classes de pre-visualizacao e impressao de relatorios.

## Criterios de Aceitacao

- A tela permite escolher e gerar relatorios dos modulos principais.
- Cada relatorio mostra KPIs e tabela detalhada.
- O relatorio pode ser pre-visualizado em A4.
- Imprimir e PDF usam o cabecalho documental aprovado anteriormente.
- Excel baixa CSV compativel com Excel.
- Permissao `relatorios.exportar` controla as acoes de saida.
- `npm test`, `npm run build:tailwind` e `npm run build` passam.
