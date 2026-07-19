# Revisão da interface em português e UTF-8

## Objectivo

Uniformizar todos os textos visíveis da aplicação em português de Angola, corrigindo palavras sem acentuação, caracteres UTF-8 corrompidos e termos ingleses desnecessários. A revisão abrange a navegação, a área operacional, as configurações e as restantes telas da interface.

## Convenções linguísticas

- Usar português de Angola e conservar formas correntes no produto, como “factura”, “actual” e “acções”.
- Substituir “Dashboard” por “Painel”.
- Aplicar acentuação correcta em títulos, botões, mensagens, campos, estados e textos auxiliares.
- Traduzir termos ingleses apresentados ao utilizador, incluindo “Expense”, “Revenue” e “Loss”, para “Despesa”, “Receita” e “Perda”.
- Usar “Crédito” e “Nota de crédito” nos nomes visíveis dos tipos de documento.

## Limites técnicos

- Alterar somente conteúdo apresentado ao utilizador e valores predefinidos que dão origem a nomes visíveis.
- Preservar identificadores internos, rotas, permissões, códigos de catálogo, nomes de propriedades, contratos IPC e valores persistidos usados pela lógica.
- Manter os ficheiros de código-fonte em UTF-8.
- Não introduzir uma camada de internacionalização; a aplicação continuará a ter português como idioma único.

## Implementação

1. Criar testes de fonte que descrevam os rótulos principais esperados e rejeitem sequências típicas de texto corrompido.
2. Corrigir os rótulos do menu e os títulos associados às telas.
3. Rever todos os componentes visíveis, com prioridade para Operação, Configurações, Painel e formulários.
4. Introduzir nomes de apresentação explícitos nos catálogos técnicos cujos códigos estão em inglês ou sem acentos, sem mudar os respectivos códigos.
5. Corrigir mensagens visíveis produzidas por serviços quando chegarem directamente à interface.

## Validação

- Executar primeiro os novos testes e confirmar que falham com os textos actuais.
- Aplicar as correcções mínimas e confirmar que os novos testes passam.
- Executar toda a suíte de testes.
- Gerar a compilação de produção.
- Inspeccionar no navegador o menu, a tela de Operação, as secções de Configurações e uma amostra das restantes telas.

## Critérios de aceitação

- Os pontos assinalados nas capturas apresentam: “Operação”, “farmácia”, “Operações”, “Acções”, “Diferença”, “Despesa”, “Receita”, “Perda”, “Crédito” e “Nota de crédito”.
- Não existem sequências `Ã`, `Â` ou `�` nos textos visíveis mantidos no código-fonte.
- Não permanecem termos ingleses visíveis quando existe equivalente funcional em português.
- As chaves e os códigos internos mantêm compatibilidade com os dados e serviços existentes.
- Os testes e a compilação terminam sem erros.
