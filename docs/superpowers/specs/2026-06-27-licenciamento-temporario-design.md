# Licenciamento temporário — versão 1.0.1

## Objectivo

Adicionar à aplicação KILSYSTEM PHARMACY um sistema híbrido de activação por máquina. A versão 1.0.1 oferecerá demonstração de 30 dias e licenças pagas de 1, 2 ou 3 anos, com validação online periódica e funcionamento offline controlado.

## Planos

- Demonstração: 30 dias de acesso completo, uma única vez por máquina.
- Pago: 1 ano, 2 anos ou 3 anos.
- Uma licença permite apenas uma máquina activa.
- A transferência exige desactivação administrativa da máquina anterior.
- A renovação prolonga a licença existente, preservando cliente, máquina e histórico.

## Arquitectura

### Aplicação Electron

- O processo principal gera uma impressão digital estável da máquina a partir de identificadores do Windows e guarda somente o respectivo hash.
- O utilizador introduz a chave antes do primeiro login.
- O processo principal comunica com a API PHP por HTTPS.
- A licença emitida pelo servidor é assinada digitalmente e guardada localmente de forma protegida.
- A aplicação contém somente a chave pública necessária para verificar a assinatura. A chave privada nunca integra o Setup.
- O estado da licença é disponibilizado ao React por rotas IPC restritas.
- As rotas IPC de escrita verificam também o estado da licença; ocultar ou activar botões no React não é considerado protecção suficiente.

### Servidor PHP/MySQL

- A API será alojada no domínio `kilsystemamgola.com`, em alojamento Hostinger com PHP e MySQL.
- O servidor guarda clientes, licenças, activações e eventos de auditoria.
- O painel administrativo permite emitir, renovar, revogar, bloquear e transferir licenças.
- As chaves de activação são armazenadas como hash e comparadas de forma segura.
- As respostas de licença são assinadas com algoritmo assimétrico suportado de forma fiável pelo PHP do alojamento e pelo Node.js da aplicação.

## Fluxo de activação

1. A aplicação calcula o hash da máquina.
2. O utilizador informa a chave.
3. A aplicação envia chave, hash da máquina, versão e identificador da instalação à API.
4. A API valida plano, estado, período e número de activações.
5. Se a licença ainda não estiver vinculada, o servidor liga-a à máquina.
6. O servidor devolve um documento assinado com licença, plano, máquina, emissão, expiração, última validação e próximo prazo online.
7. A aplicação verifica a assinatura e guarda o documento localmente.
8. Em cada arranque, a aplicação verifica assinatura, máquina, expiração, prazo offline e relógio local.

## Estados

- `unactivated`: somente a tela de activação fica disponível.
- `demo_active`: acesso completo durante 30 dias.
- `paid_active`: acesso completo durante o plano contratado.
- `expiring`: acesso completo com avisos aos 30, 15, 7, 3 e 1 dias.
- `offline_grace`: acesso completo até sete dias desde a última validação online.
- `expired`: modo somente leitura.
- `revoked`: modo somente leitura e exigência de nova licença.
- `machine_mismatch`: activação recusada.
- `clock_tampered`: escrita bloqueada até validação online.

## Modo somente leitura

São permitidos:

- autenticação;
- consultas;
- relatórios;
- exportação;
- impressão;
- backup;
- consulta do estado da licença e renovação.

São bloqueados:

- vendas e anulações;
- movimentos financeiros;
- alterações de stock;
- criação, edição ou remoção de registos;
- configurações;
- gestão de utilizadores e permissões;
- restauração ou reposição destrutiva de dados.

As restrições são aplicadas nas rotas IPC e serviços, além da apresentação visual.

## Revalidação e funcionamento offline

- A aplicação tenta revalidar a licença pelo menos a cada sete dias.
- Falhas temporárias de rede não invalidam imediatamente uma licença assinada ainda dentro do prazo offline.
- Depois de sete dias sem validação, operações de escrita ficam bloqueadas até a ligação ser restabelecida.
- A aplicação guarda a última data confiável observada. Recuos relevantes do relógio provocam o estado `clock_tampered`.
- A expiração contratual tem precedência sobre o período offline.

## Modelo de dados MySQL

### `customers`

- Identificação do cliente, NIF, contactos e estado.

### `licenses`

- Identificador, hash da chave, cliente, plano, emissão, expiração, estado e metadados administrativos.

### `activations`

- Licença, hash da máquina, instalação, primeira activação, última validação e estado.
- Restrição de uma activação activa por licença.

### `license_events`

- Licença, tipo de evento, actor, data, endereço IP e detalhes seguros.

## API

- `POST /api/licenses/activate`
- `POST /api/licenses/validate`
- `POST /api/licenses/deactivate`
- `POST /api/licenses/renew-status`

Todas as respostas usam formato JSON consistente, códigos HTTP apropriados e mensagens públicas sem detalhes internos.

## Painel administrativo

- Autenticação forte e sessão segura.
- Perfis administrativos.
- Cadastro de clientes.
- Emissão de licenças Demo, 1 ano, 2 anos e 3 anos.
- Pesquisa e consulta do estado.
- Renovação, revogação e transferência de máquina.
- Histórico de eventos.
- A chave completa é mostrada somente no momento da emissão.

## Interface da aplicação

- Tela de activação anterior ao login.
- Campo de chave com formatação e colagem.
- Estado de ligação e mensagens de erro claras.
- Identificador da máquina para suporte.
- Secção “Licença” em Configurações com plano, estado, máquina e expiração.
- Avisos de proximidade da expiração.
- Faixa persistente quando estiver em modo somente leitura.

## Segurança

- HTTPS obrigatório.
- Assinatura assimétrica do documento de licença.
- Chave privada fora do repositório e fora da aplicação.
- Hash das chaves no MySQL.
- Comparações seguras e limitação de tentativas.
- Segredos do servidor em variáveis de ambiente ou configuração fora da área pública.
- Validação de entrada, consultas preparadas e protecção CSRF no painel.
- Auditoria de emissão, activação, renovação, revogação e transferência.
- Nenhum dado clínico, financeiro ou de vendas é enviado durante a validação da licença.

## Tratamento de erros

- Sem rede: usar licença local válida dentro do prazo offline.
- Chave inválida: não criar activação.
- Chave já vinculada: informar que é necessária transferência.
- Assinatura inválida ou ficheiro alterado: bloquear escrita e exigir validação online.
- Servidor indisponível: apresentar estado temporário sem apagar a licença local.
- Resposta incompatível: rejeitar de forma segura.

## Testes

- Activação Demo e impedimento de nova Demo na mesma máquina.
- Activação dos planos de 1, 2 e 3 anos.
- Vínculo exclusivo por máquina.
- Transferência administrativa.
- Verificação de assinatura válida e adulterada.
- Expiração, revogação e avisos.
- Período offline de sete dias.
- Recuo do relógio.
- Modo somente leitura em todas as rotas de escrita.
- Continuidade de consultas, relatórios, impressão, exportação e backup.
- Indisponibilidade e respostas inválidas da API.
- Migração da versão 1.0.0 para 1.0.1 sem perda do SQLite.

## Entrega

- Actualizar a versão para `1.0.1`.
- Incluir aplicação Electron, API PHP, esquema MySQL e painel administrativo.
- Documentar configuração do domínio, base de dados, chaves criptográficas e rotina de backup.
- Gerar novo instalador NSIS que actualiza a instalação existente e preserva os dados do utilizador.

## Critérios de aceitação

- Uma licença activa somente uma máquina.
- Demo expira exactamente após 30 dias e não reinicia na mesma máquina.
- Planos pagos respeitam o período contratado.
- Licença válida funciona offline por até sete dias.
- Licença expirada ou revogada preserva consultas e bloqueia todas as mutações.
- A aplicação rejeita documentos de licença adulterados.
- O painel administra todo o ciclo de vida com auditoria.
- A actualização para 1.0.1 preserva a base SQLite existente.
