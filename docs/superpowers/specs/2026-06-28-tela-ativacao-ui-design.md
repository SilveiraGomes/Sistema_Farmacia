# Tela de ativação — UI e UX

## Objetivo

Transformar a tela de ativação numa entrada profissional e coerente com a identidade visual do KILSYSTEM PHARMACY, corrigindo a ausência dos estilos e acrescentando uma saída segura da aplicação.

## Direção visual

A tela terá um fundo verde institucional dividido visualmente em duas áreas:

- uma mensagem lateral curta sobre segurança e gestão da farmácia;
- um cartão branco focado na ativação.

O cartão usará cantos arredondados, sombra discreta, espaçamento amplo e hierarquia tipográfica clara. A única ação visualmente dominante será **Ativar licença**. O botão **Sair** ficará no canto superior direito do cartão, com tratamento secundário.

## Conteúdo e hierarquia

O cartão apresentará, nesta ordem:

1. marca KILSYSTEM PHARMACY e botão **Sair**;
2. identificação da versão e título **Ative esta instalação**;
3. explicação curta;
4. estado da ligação;
5. campo formatado da chave;
6. botão **Ativar licença**;
7. mensagem de erro ou validação;
8. identificação da máquina;
9. ação **Tentar novamente**.

O texto será apresentado em português com UTF-8 correto.

## Comportamento

- **Ativar licença** mantém o fluxo atual de ativação.
- **Sair** usa a rota IPC existente `window.close` e fecha a aplicação.
- **Tentar novamente** atualiza o estado da licença e da ligação.
- O botão principal permanece desativado sem chave, durante validação ou sem ligação.
- Erros continuam expostos numa região `aria-live`.

## Responsividade e acessibilidade

- Em telas menores, a mensagem lateral desaparece e o cartão ocupa a área central.
- Todos os controlos terão foco de teclado visível.
- Ícones decorativos serão ocultados de leitores de tela.
- O botão **Sair** terá texto e nome acessível explícitos.
- Animações respeitarão `prefers-reduced-motion`.
- Contraste de textos, botões e estados deverá cumprir o padrão visual já usado no sistema.

## Integração de estilos

Os estilos de licenciamento existentes estão em `src/assets/tailwind.css`, mas a entrada React importa `src/assets/output.css`. A implementação deverá garantir que as regras novas estejam presentes na folha realmente carregada, preferencialmente recompilando `output.css` a partir de `tailwind.css` pelo fluxo existente.

## Testes e aceitação

- A tela aparece estilizada ao executar `npm start`.
- O layout permanece legível em desktop e em largura móvel.
- O botão **Sair** chama `window.close`.
- O fluxo de ativação e renovação continua funcional.
- Os textos não apresentam caracteres UTF-8 corrompidos.
- Testes focados e `npm run build` passam.
