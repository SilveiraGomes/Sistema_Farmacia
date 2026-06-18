# Modelo Definitivo de Factura A4

## Objetivo

Criar o modelo definitivo de Factura A4 do sistema de farmacia, usando como referencia os exemplos analisados:

- `Factura Proposta ISSFAA BENGO.pdf`
- `Teste Negomil Factura com Contas.pdf`

O modelo deve servir para factura, factura-recibo, proforma, segunda via e documentos anulados, mantendo uma apresentacao fiscal clara, profissional e adequada para impressao em A4.

## Decisoes Aprovadas

- O modelo A4 nao tera marca d'agua.
- O documento deve incluir o referencial:
  `lzoe-Processado por programa validado nº999/AGT/2026-KILSYSTEM`
- O prefixo `lzoe` deve ser gerado automaticamente pelo sistema de forma randomica alfa-numerica.
- O modelo A4 sera implementado primeiro.
- Depois do A4, sera criado um modelo separado para impressora termica de 80 mm.

## Estrutura Visual A4

### Cabecalho

Lado esquerdo:

- Logotipo configurado da farmacia.
- Nome da farmacia.
- NIF.
- Telefone.
- Email.
- Endereco.

Lado direito:

- Tipo de documento: Factura, Factura-Recibo, Proforma, Nota de Credito, 2ª Via.
- Numero do documento.
- Indicacao de via: Original ou 2ª Via.
- Dados do cliente:
  - Nome.
  - NIF/contribuinte.
  - Telefone, quando existir.
  - Endereco, quando existir.
- QR code fiscal ou interno, quando activo nas configuracoes.

### Linha Documental

Depois do cabecalho, o documento deve apresentar uma faixa com os principais metadados:

- Data de emissao.
- Data de vencimento, quando aplicavel.
- Moeda.
- Condicao de pagamento.
- Referencia/requisicao, quando existir.
- Utilizador/operador, quando necessario.

### Tabela de Itens

A tabela deve ser compacta, limpa e preparada para muitos itens:

- Codigo.
- Descricao.
- Lote, opcional para farmacia.
- Validade, opcional para farmacia.
- Quantidade.
- Preco unitario.
- Desconto.
- Imposto/IVA.
- Total.

Para farmacia, lote e validade devem poder aparecer quando existirem, mas o modelo nao deve ficar largo ou quebrado quando esses campos estiverem vazios.

### Resumo Fiscal e Total

Na area inferior:

- Quadro resumo de imposto.
- Subtotal.
- Desconto.
- Imposto.
- Retencao na fonte, quando aplicavel.
- Total liquido.
- Total por extenso.

O total final deve ter destaque visual forte, sem exagerar no tamanho da fonte.

### Coordenadas Bancarias

Quando configuradas, devem aparecer no rodape inferior ou bloco inferior esquerdo:

- Banco.
- Numero da conta.
- IBAN.

O sistema deve permitir mais de uma conta bancaria.

### Rodape Fiscal

O rodape deve incluir:

- Referencial automatico no formato:
  `lzoe-Processado por programa validado nº999/AGT/2026-KILSYSTEM`
- O prefixo alfa-numerico randomico substitui `lzoe`.
- Data e hora de impressao.
- Utilizador que imprimiu.
- Pagina actual e total de paginas.
- Regime fiscal, quando configurado.

## Regras por Tipo de Documento

### Factura

- Sem marca d'agua.
- Mostra numero fiscal definitivo.
- Mostra totais fiscais completos.

### Factura-Recibo

- Igual a factura, mas inclui indicacao de pagamento liquidado.
- Pode mostrar metodo de pagamento.

### Proforma

- Sem marca d'agua.
- Deve indicar claramente `Proforma`.
- Deve conter texto: `Este documento nao serve de Factura`, quando aplicavel.

### Segunda Via

- Sem marca d'agua.
- Deve mostrar `2ª Via` no cabecalho.
- Mantem os mesmos dados do documento original.

### Documento Anulado

- Sem marca d'agua.
- Deve mostrar estado `Anulado` no cabecalho ou junto ao numero.
- Deve manter os dados originais para auditoria.

## Configuracoes Necessarias

Antes de fechar o modulo de Configuracoes, incluir uma area chamada `Modelo de Factura A4` com:

- Dados da farmacia.
- Logotipo.
- Regime fiscal.
- Texto fiscal/rodape.
- Numero AGT/programa validado.
- Nome do software ou marca do sistema.
- Series e numeracao.
- Contas bancarias.
- Activar/desactivar QR code.
- Activar/desactivar lote e validade na factura.
- Activar/desactivar total por extenso.

## Etapa Seguinte

Depois de concluir e validar o modelo A4, criar um segundo modelo para impressora termica 80 mm, optimizado para venda rapida no balcao.

O modelo termico nao deve ser uma simples reducao do A4. Deve ter estrutura propria, mais curta, com:

- Nome da farmacia.
- NIF.
- Numero do documento.
- Data/hora.
- Operador.
- Cliente resumido.
- Lista compacta de itens.
- Totais.
- Metodo de pagamento.
- Referencial fiscal.
- QR code quando couber.
