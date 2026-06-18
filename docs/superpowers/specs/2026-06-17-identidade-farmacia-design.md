# Identidade Configuravel da Farmacia

## Objetivo

O sistema deve deixar de estar preso ao nome e ao logotipo da Farmacia ESAYOS. Qualquer farmacia que instalar o sistema deve poder configurar a sua propria identidade visual sem alterar codigo.

## Escopo

- A marca padrao passa a ser generica: `Sistema de Farmacia`.
- O nome da farmacia e o logotipo ficam editaveis em Configuracoes > Dados da Farmacia.
- Login, menu lateral, tela de carregamento e troca de senha usam a mesma fonte de configuracao.
- Quando nao houver logotipo, o sistema mostra um simbolo neutro e as iniciais do nome configurado.
- A configuracao fica persistida localmente, adequada para o executavel instalado em uma maquina.

## Arquitetura

Criar um modulo pequeno de dados para normalizar, guardar, ler e notificar alteracoes da identidade da farmacia via `localStorage`. Criar um componente `BrandMark` reutilizavel para renderizar a identidade nas telas de autenticacao e no menu lateral.

O modal de Dados da Farmacia em Configuracoes passa a salvar o nome e o logotipo usando esse modulo. As demais telas consomem o hook/componente e atualizam automaticamente quando a identidade for alterada.

## Testes

- Testar valores padrao genericos.
- Testar normalizacao de nome, iniciais e logotipo.
- Testar persistencia e notificacao de alteracao.
- Executar build e suite completa apos a integracao visual.

## Fora de Escopo

- Sincronizar a identidade em rede entre computadores.
- Personalizar cores da farmacia.
- Alterar instalador ou nome do executavel neste passo.
