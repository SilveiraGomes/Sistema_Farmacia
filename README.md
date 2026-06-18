# Sistema de Gestão de Farmácia (Electron, React, Sequelize, Tailwind CSS)

Este é um sistema de gestão de farmácia desktop desenvolvido com Electron, utilizando React para o frontend, Sequelize como ORM para o banco de dados e Tailwind CSS para estilização. O sistema é projetado para funcionar em rede, com módulos de controle de estoque, financeiro, faturamento (PDV com modo de espera) e relatórios.

## 1. Arquitetura do Sistema

O sistema segue uma arquitetura cliente-servidor, onde as instâncias do Electron atuam como clientes que se conectam a um banco de dados centralizado (MySQL/PostgreSQL) ou utilizam um banco de dados local (SQLite) para operações offline ou em modo standalone.

### 1.1. Stack Tecnológica

| Componente          | Tecnologia                                  | Descrição                                                                                             |
| :------------------ | :------------------------------------------ | :---------------------------------------------------------------------------------------------------- |
| **Framework Desktop** | Electron                                    | Permite construir aplicações desktop multiplataforma usando tecnologias web.                           |
| **Frontend**        | React.js                                    | Biblioteca JavaScript para construção de interfaces de usuário reativas e componentizadas.            |
| **Estilização**     | Tailwind CSS                                | Framework CSS utilitário para construção rápida de designs personalizados.                            |
| **Backend (Main Process)** | Node.js                                     | Executa a lógica de negócio principal, comunicação IPC e interação com o banco de dados.              |
| **Banco de Dados**  | SQLite (local) / MySQL ou PostgreSQL (rede) | SQLite para desenvolvimento e modo offline; MySQL/PostgreSQL para ambiente de produção em rede.       |
| **ORM**             | Sequelize                                   | Mapeamento Objeto-Relacional para abstrair a interação com o banco de dados.                          |
| **Comunicação**     | IPC (Inter-Process Communication)           | Comunicação entre o processo principal (backend) e os processos de renderização (frontend) do Electron. |
| **Relatórios**      | PDFKit / Puppeteer (sugestão)               | Geração de relatórios em PDF.                                                                         |

### 1.2. Estrutura de Módulos

O sistema é composto pelos seguintes módulos principais:

*   **Controle de Estoque:** Gerenciamento completo de produtos, incluindo cadastro, lotes, validades, alertas de estoque baixo e movimentações.
*   **Módulo Financeiro:** Controle de fluxo de caixa, contas a pagar e a receber, e integração com vendas.
*   **Faturamento e Vendas (PDV):** Ponto de Venda com funcionalidades como leitura de código de barras, cálculo de impostos/descontos e o **modo 
"Cliente em Espera" para gerenciar múltiplas vendas simultaneamente.
*   **Relatórios:** Geração de relatórios detalhados de vendas, produtos mais vendidos, inventário e fluxo financeiro.

## 2. Estrutura de Diretórios

```
pharmacy-system/
├── main.js                 # Processo principal do Electron
├── preload.js              # Script de pré-carregamento para segurança
├── index.html              # Página HTML principal do frontend
├── package.json            # Configurações do projeto e dependências
├── tailwind.config.js      # Configuração do Tailwind CSS
├── postcss.config.js       # Configuração do PostCSS
├── src/
│   ├── App.js              # Componente React principal
│   ├── index.js            # Ponto de entrada do React
│   ├── assets/
│   │   ├── tailwind.css    # Diretivas do Tailwind CSS
│   │   └── output.css      # CSS gerado pelo Tailwind
│   ├── backend/
│   │   ├── ipcHandlers.js  # Handlers de comunicação IPC
│   │   └── database.js     # Configuração do banco de dados e modelos Sequelize
│   └── components/
│       ├── Navbar.js       # Componente de navegação
│       ├── Estoque.js      # Módulo de controle de estoque (frontend)
│       ├── Faturamento.js  # Módulo de faturamento/PDV (frontend)
│       ├── Financeiro.js   # Módulo financeiro (frontend)
│       └── Relatorios.js   # Módulo de relatórios (frontend)
└── docs/
    └── database_schema.md  # Documentação do esquema do banco de dados
```

## 3. Instalação e Configuração

Para configurar e executar o projeto, siga os passos abaixo:

### 3.1. Pré-requisitos

*   Node.js (versão LTS recomendada)
*   npm (gerenciador de pacotes do Node.js)
*   Git (opcional, para clonar o repositório)
*   MySQL ou PostgreSQL (para uso em rede, opcional)

### 3.2. Passos de Instalação

1.  **Clone o repositório (se aplicável) ou crie o diretório do projeto:**
    ```bash
    git clone <URL_DO_REPOSITORIO>
    cd pharmacy-system
    ```
    Ou:
    ```bash
    mkdir pharmacy-system
    cd pharmacy-system
    ```

2.  **Inicialize o projeto Node.js e instale as dependências:**
    ```bash
    npm init -y
    npm install electron --save-dev
    npm install react react-dom sequelize sqlite3
    npm install -D tailwindcss postcss autoprefixer postcss-cli @tailwindcss/postcss
    ```

3.  **Configure o Tailwind CSS:**
    Certifique-se de que `tailwind.config.js` e `postcss.config.js` estão configurados conforme os arquivos gerados. Em seguida, gere o CSS de saída:
    ```bash
    npm run build:tailwind
    ```

### 3.3. Configuração do Banco de Dados

*   **SQLite (Desenvolvimento/Standalone):** O sistema criará automaticamente um arquivo `database.sqlite` no diretório de dados do usuário do Electron. Nenhuma configuração adicional é necessária para o modo de desenvolvimento.

*   **MySQL/PostgreSQL (Produção/Rede):**
    1.  Instale e configure seu servidor MySQL ou PostgreSQL.
    2.  Crie um banco de dados para o sistema de farmácia.
    3.  No arquivo `src/backend/database.js`, atualize a seção `production` da função `connectDB` com as credenciais e configurações do seu banco de dados.
    4.  Defina a variável de ambiente `NODE_ENV` como `production` ao iniciar o aplicativo para usar a configuração de banco de dados em rede.

## 4. Executando o Aplicativo

Para iniciar o aplicativo Electron:

```bash
npm start
```

## 5. Desenvolvimento

### 5.1. Scripts Úteis

*   `npm start`: Inicia o aplicativo Electron.
*   `npm run build:tailwind`: Gera o arquivo CSS do Tailwind (executar após alterações nos arquivos de configuração do Tailwind ou no `tailwind.css`).

### 5.2. Estratégia de Rede

Para o funcionamento em rede, uma instância do banco de dados (MySQL/PostgreSQL) deve estar acessível pelos clientes. A comunicação entre o frontend (processo de renderização) e o backend (processo principal) do Electron é feita via IPC. O processo principal, por sua vez, interage com o banco de dados.

### 5.3. Modo "Cliente em Espera" (Faturamento)

O módulo de Faturamento inclui a funcionalidade de "Cliente em Espera", permitindo que o operador salve uma venda em andamento e inicie uma nova, retomando a venda anterior posteriormente. Isso é gerenciado no estado do frontend (`Faturamento.js`) e pode ser persistido no banco de dados para maior robustez.

## 6. Próximos Passos e Melhorias

*   Implementar a lógica completa de CRUD (Create, Read, Update, Delete) para todos os modelos do banco de dados.
*   Desenvolver as interfaces de usuário completas para cada módulo (Estoque, Financeiro, Faturamento, Relatórios).
*   Integrar a geração de relatórios em PDF (usando PDFKit ou Puppeteer).
*   Adicionar autenticação e controle de acesso de usuários.
*   Implementar validações de formulário e tratamento de erros mais robustos.
*   Otimizar a comunicação IPC para grandes volumes de dados.
*   Configurar o empacotamento do aplicativo para distribuição (usando `electron-builder` ou `electron-packager`).

---

**Autor:** Manus AI
**Data:** 10 de Junho de 2026
