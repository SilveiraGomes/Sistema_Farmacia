# Relatórios por período e cabeçalho documental

## Objetivo

Simplificar a central de relatórios para trabalhar somente com uma data inicial e uma data final inclusivas. Os relatórios devem apresentar as operações existentes nesse intervalo, usar uma área de dados compacta semelhante à factura e gerar documentos A4 com cabeçalho configurável, alinhado e sem exibir filtros.

## Escopo

Inclui:

- Remover o relatório `diferenca-entre-datas` do catálogo e da interface.
- Remover o modelo de comparação entre dois intervalos.
- Usar somente `startDate` e `endDate` como controles de data da central de relatórios.
- Aplicar o período inclusivo a todos os relatórios que usam datas.
- Manter títulos explícitos na tela e no documento A4 de cada relatório.
- Limitar o controle de período à largura necessária, sem ocupar toda a largura disponível.
- Remover da barra de relatórios a pesquisa, turno, forma de pagamento, data diária e datas comparadas.
- Remover do documento A4 o bloco de filtros, o bloco comparativo e os cartões de indicadores.
- Reconfigurar o cabeçalho documental a partir de um texto multilinha e de uma área separada para logótipo em Configurações.
- Compartilhar o mesmo cabeçalho configurado entre facturas e relatórios.
- Preservar quebras de linha digitadas no cabeçalho.
- Garantir scroll apenas vertical na central de relatórios.
- Reduzir tipografia, espaçamentos e altura das linhas na área de dados e no A4.

Não inclui:

- Comparação de valores entre dois dias ou dois períodos.
- Novos filtros por turno, pagamento, categoria, estado ou pesquisa.
- Um cabeçalho independente para cada tipo de documento.
- Alteração das fontes de dados dos relatórios.

## Comportamento do período

A central apresenta dois campos:

- `Data inicial` (`startDate`).
- `Data final` (`endDate`).

O intervalo inclui os dois limites. Uma operação pertence ao relatório quando sua data normalizada satisfaz `startDate <= data <= endDate`.

Se as datas forem iguais, o relatório representa um único dia. Se a data inicial for posterior à data final, a aplicação troca os valores antes de gerar o relatório. Campos vazios recuperam o período padrão já usado pela aplicação.

O relatório `diferenca-entre-datas` deixa de existir no catálogo. Os campos `date`, `compareStartDate` e `compareEndDate`, assim como o objeto `comparison`, deixam de participar do fluxo de relatórios.

## Tela de Relatórios

### Estrutura

A tela mantém o catálogo lateral e a área principal. O cabeçalho da área principal contém:

- Grupo do relatório.
- Título do relatório selecionado.
- Descrição curta do período aplicado.
- Ações de visualizar, exportar, salvar PDF e imprimir, conforme permissões.
- Um controle compacto de período com as duas datas e o botão `Aplicar`.

O controle de período usa largura intrínseca ou um limite compacto. Ele não se estende por toda a largura do painel.

Não haverá barra de filtros independente no topo. Pesquisa, turno, pagamento, data diária, datas comparadas e botão de limpar são removidos.

### Área de dados

Cada relatório mostra seu título imediatamente acima dos dados. KPIs e tabelas usam o mesmo caráter documental da factura:

- Fonte menor.
- Espaçamento interno reduzido.
- Linhas mais baixas.
- Valores sem quebras desnecessárias.
- Colunas dimensionadas dentro da largura disponível.
- Texto longo com quebra de linha.

A tela não cria scroll horizontal. O contêiner principal e o catálogo podem rolar apenas no eixo vertical. Tabelas devem ajustar colunas, quebrar textos e reduzir densidade em larguras menores em vez de usar `overflow-x: auto`.

## Configuração do cabeçalho

### Interface

A seção de cabeçalho documental em Configurações substitui os campos empresariais individuais por:

- Um `textarea` chamado `Dados da empresa`.
- Uma área de carregamento e pré-visualização do logótipo.

O `textarea` aceita texto livre e preserva as quebras de linha. O logótipo continua aceitando arquivos de imagem e mostra a pré-visualização antes de salvar.

### Modelo e compatibilidade

As configurações A4 passam a armazenar `documentHeaderText`. O logótipo continua armazenado como `logoDataUrl` no modelo de identidade visual existente para evitar duplicação de imagens.

Ao carregar configurações antigas sem `documentHeaderText`, a aplicação monta o texto inicial com os campos existentes, na ordem:

1. Nome da empresa.
2. Atividade.
3. NIF.
4. Endereço.
5. Cidade.
6. Telefone.
7. E-mail.

Linhas vazias são descartadas na migração. Depois de editado, o texto é salvo com as quebras de linha intactas. A normalização não converte todas as sequências de espaço em um único espaço e não remove quebras internas.

`InvoiceA4` e `ReportA4` recebem o mesmo texto e logótipo. Ambos renderizam o texto com `white-space: pre-line` ou regra equivalente.

## Documento A4 do relatório

O A4 usa três zonas:

1. Cabeçalho documental.
2. Título e dados do relatório.
3. Rodapé de impressão.

O cabeçalho alinha o logótipo e o texto configurado à esquerda. À direita ficam a palavra `Relatório`, o título do relatório e o período `Data inicial — Data final`.

O título do relatório aparece novamente antes da tabela para identificar claramente a área de dados, inclusive quando o documento tiver várias páginas.

Não aparecem no A4:

- Bloco de filtros.
- Cartões de KPIs.
- Bloco de comparação.
- Controles da interface.

Os dados são apresentados diretamente em tabela compacta, com cabeçalho repetível em novas páginas, fonte reduzida, linhas alternadas discretas e quebras de texto controladas. O rodapé mantém utilizador, data de impressão e regime fiscal quando disponível.

## Componentes e fluxo de dados

### `Relatorios.jsx`

- Mantém apenas `startDate` e `endDate` no estado dos filtros visíveis.
- Normaliza a ordem das datas ao aplicar o período.
- Passa o período normalizado para `buildReportData`.
- Renderiza o título de cada relatório e a descrição do intervalo.
- Remove toda a UI de comparação e filtros adicionais.

### `reports.mjs`

- Remove `diferenca-entre-datas` de `REPORT_CATALOG`.
- Remove o construtor de comparação e metadados associados.
- Mantém a filtragem inclusiva por `startDate` e `endDate`.
- Normaliza datas ISO com hora para a chave local `AAAA-MM-DD` antes de comparar.

### Configurações documentais

- `invoiceSettings.mjs` normaliza e persiste `documentHeaderText` preservando linhas.
- `Configuracoes.jsx` edita o texto e o logótipo.
- `InvoiceA4` e `ReportA4` consomem o mesmo cabeçalho.

## Tratamento de erros

- Data inicial posterior à final: trocar os limites.
- Uma ou ambas as datas vazias: recuperar o período padrão.
- Cabeçalho multilinha vazio: usar o cabeçalho padrão montado a partir das configurações padrão.
- Logótipo inválido: ignorar a imagem e manter o texto do cabeçalho.
- Relatório sem operações no período: mostrar o título, a mensagem de estado vazio e manter o A4 válido.
- Texto empresarial muito longo: quebrar linhas dentro da coluna do cabeçalho sem invadir a caixa de identificação do relatório.

## Testes

### Motor de relatórios

- O catálogo não contém `diferenca-entre-datas`.
- Operações nos dois limites do intervalo são incluídas.
- Operações fora do intervalo são excluídas.
- Datas ISO com hora são filtradas pelo dia correto.
- Datas invertidas são normalizadas antes da geração.

### Configurações

- `documentHeaderText` preserva quebras de linha.
- Configurações antigas geram automaticamente o texto multilinha equivalente.
- Texto vazio usa o valor padrão.
- O logótipo válido continua persistido e compartilhado.

### Interface e impressão

- A tela contém somente os dois campos de data visíveis.
- O relatório de diferença não aparece no catálogo.
- Cada relatório apresenta título na tela e no A4.
- `ReportA4` não renderiza filtros, comparação ou cartões de KPI.
- O CSS impede scroll horizontal e permite scroll vertical.
- A tabela e o cabeçalho permanecem dentro da largura A4.
- A factura e o relatório usam o mesmo texto multilinha e logótipo.

## Critérios de aceitação

- O utilizador escolhe uma data inicial e uma data final e recebe as operações do intervalo inclusivo.
- Não existe item de menu `Diferença entre datas`.
- Nenhum filtro além das duas datas aparece na central.
- O controle de período não ocupa toda a largura.
- Cada relatório tem título na tela e no documento.
- A página usa somente scroll vertical.
- A área de dados é compacta e semelhante à factura.
- O relatório impresso não mostra filtros, KPIs ou comparação.
- O cabeçalho impresso reflete o texto multilinha e o logótipo definidos em Configurações.
- Facturas e relatórios usam o mesmo cabeçalho documental.
- Configurações antigas continuam a produzir um cabeçalho válido.
- Os testes automatizados, a compilação do CSS e a compilação da aplicação passam.
