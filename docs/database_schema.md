# Esquema do Banco de Dados do Sistema de Gestão de Farmácia

Este documento detalha o esquema proposto para o banco de dados do sistema de gestão de farmácia, projetado para ser compatível com SQLite (para uso local/standalone) e MySQL/PostgreSQL (para uso em rede).

## 1. Tabelas Principais

### 1.1. `Produtos`
Armazena informações sobre os produtos farmacêuticos.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único do produto.              |
| `nome`            | VARCHAR(255)      | NOT NULL          | Nome comercial do produto.                   |
| `descricao`       | TEXT              |                   | Descrição detalhada do produto.              |
| `codigo_barras`   | VARCHAR(50)       | UNIQUE, NOT NULL  | Código de barras EAN/UPC.                    |
| `preco_venda`     | DECIMAL(10, 2)    | NOT NULL          | Preço de venda unitário.                     |
| `preco_custo`     | DECIMAL(10, 2)    |                   | Preço de custo unitário.                     |
| `fabricante`      | VARCHAR(255)      |                   | Nome do fabricante.                          |
| `categoria`       | VARCHAR(100)      |                   | Categoria do produto (e.g., Medicamento, Higiene). |
| `categoria_id`    | INTEGER           | FOREIGN KEY (`Categorias.id`) | Categoria normalizada do produto.            |
| `subcategoria_id` | INTEGER           | FOREIGN KEY (`Subcategorias.id`) | Subcategoria normalizada do produto.         |
| `unidade_medida`  | VARCHAR(50)       | DEFAULT 'Unidade' | Unidade usada no estoque e na venda.          |
| `estoque_minimo`  | INTEGER           | DEFAULT 0         | Quantidade mínima para alertas de estoque.   |
| `receita_obrigatoria` | BOOLEAN         | DEFAULT FALSE     | Indica se o produto exige receita médica.    |
| `data_cadastro`   | DATETIME          | DEFAULT CURRENT_TIMESTAMP | Data de registro do produto.                 |

### 1.1.1. `Categorias`
Armazena as categorias usadas no cadastro e filtro de produtos.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único da categoria.            |
| `nome`            | VARCHAR(255)      | UNIQUE, NOT NULL  | Nome exibido nas telas de estoque e vendas.  |
| `codigo`          | VARCHAR(50)       | UNIQUE            | Código interno opcional.                     |
| `descricao`       | TEXT              |                   | Descrição da categoria.                      |
| `ativo`           | BOOLEAN           | DEFAULT TRUE      | Indica se a categoria está ativa.            |
| `data_cadastro`   | DATETIME          | DEFAULT CURRENT_TIMESTAMP | Data de cadastro.                            |

### 1.1.2. `Subcategorias`
Armazena subgrupos vinculados a uma categoria.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único da subcategoria.         |
| `categoria_id`    | INTEGER           | NOT NULL, FOREIGN KEY (`Categorias.id`) | Categoria principal.                         |
| `nome`            | VARCHAR(255)      | NOT NULL          | Nome da subcategoria.                        |
| `codigo`          | VARCHAR(50)       |                   | Código interno opcional.                     |
| `descricao`       | TEXT              |                   | Descrição da subcategoria.                   |
| `ativo`           | BOOLEAN           | DEFAULT TRUE      | Indica se a subcategoria está ativa.         |
| `data_cadastro`   | DATETIME          | DEFAULT CURRENT_TIMESTAMP | Data de cadastro.                            |

### 1.2. `Estoque`
Gerencia o inventário de produtos, incluindo lotes e validades.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único do registro de estoque.  |
| `produto_id`      | INTEGER           | NOT NULL, FOREIGN KEY (`Produtos.id`) | Referência ao produto.                       |
| `lote`            | VARCHAR(50)       | NOT NULL          | Número do lote do produto.                   |
| `quantidade`      | INTEGER           | NOT NULL          | Quantidade disponível em estoque.            |
| `data_validade`   | DATE              | NOT NULL          | Data de validade do lote.                    |
| `data_entrada`    | DATETIME          | DEFAULT CURRENT_TIMESTAMP | Data de entrada do lote no estoque.          |
| `localizacao`     | VARCHAR(100)      |                   | Localização física no estoque.               |

### 1.3. `Vendas`
Registra as transações de venda realizadas.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único da venda.                |
| `numero_factura`  | VARCHAR(50)       | UNIQUE            | Número público da factura.                   |
| `data_venda`      | DATETIME          | DEFAULT CURRENT_TIMESTAMP | Data e hora da venda.                        |
| `subtotal`        | DECIMAL(10, 2)    | DEFAULT 0.00      | Valor antes de desconto e impostos.          |
| `total`           | DECIMAL(10, 2)    | NOT NULL          | Valor total da venda.                        |
| `imposto`         | DECIMAL(10, 2)    | DEFAULT 0.00      | Valor de imposto aplicado.                   |
| `desconto`        | DECIMAL(10, 2)    | DEFAULT 0.00      | Valor total do desconto aplicado.            |
| `forma_pagamento` | VARCHAR(50)       | NOT NULL          | Forma de pagamento (e.g., Dinheiro, Cartão). |
| `valor_pago`      | DECIMAL(10, 2)    | DEFAULT 0.00      | Valor entregue pelo cliente.                 |
| `troco`           | DECIMAL(10, 2)    | DEFAULT 0.00      | Troco calculado para a venda.                |
| `status`          | VARCHAR(50)       | DEFAULT 'Concluída' | Status da venda (e.g., Concluída, Em Espera, Cancelada). |
| `cliente_id`      | INTEGER           | FOREIGN KEY (`Clientes.id`) | Referência ao cliente (opcional).            |
| `usuario_id`      | INTEGER           | NOT NULL, FOREIGN KEY (`Usuarios.id`) | Usuário que realizou a venda.                |

### 1.4. `ItensVenda`
Detalha os produtos incluídos em cada venda.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único do item de venda.        |
| `venda_id`        | INTEGER           | NOT NULL, FOREIGN KEY (`Vendas.id`) | Referência à venda.                          |
| `produto_id`      | INTEGER           | NOT NULL, FOREIGN KEY (`Produtos.id`) | Referência ao produto vendido.               |
| `lote`            | VARCHAR(50)       | NOT NULL          | Lote do produto vendido.                     |
| `quantidade`      | INTEGER           | NOT NULL          | Quantidade do produto no item.               |
| `preco_unitario`  | DECIMAL(10, 2)    | NOT NULL          | Preço unitário do produto no momento da venda. |
| `subtotal`        | DECIMAL(10, 2)    | NOT NULL          | Subtotal do item (quantidade * preco_unitario). |

### 1.5. `TransacoesFinanceiras`
Registra todas as movimentações financeiras (contas a pagar e a receber).

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único da transação.            |
| `tipo`            | VARCHAR(50)       | NOT NULL          | Tipo de transação (e.g., Receita, Despesa).  |
| `descricao`       | TEXT              |                   | Descrição da transação.                      |
| `valor`           | DECIMAL(10, 2)    | NOT NULL          | Valor da transação.                          |
| `data_transacao`  | DATETIME          | DEFAULT CURRENT_TIMESTAMP | Data da transação.                           |
| `data_vencimento` | DATE              |                   | Data de vencimento (para contas a pagar/receber). |
| `status`          | VARCHAR(50)       | DEFAULT 'Pendente' | Status da transação (e.g., Paga, Pendente, Cancelada). |
| `referencia_venda_id` | INTEGER       | FOREIGN KEY (`Vendas.id`) | Referência à venda (se for uma receita de venda). |
| `fornecedor_id`   | INTEGER           | FOREIGN KEY (`Fornecedores.id`) | Referência ao fornecedor (se for uma despesa). |

### 1.6. `Clientes`
Armazena informações dos clientes.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único do cliente.              |
| `nome`            | VARCHAR(255)      | NOT NULL          | Nome completo do cliente.                    |
| `cpf_cnpj`        | VARCHAR(20)       | UNIQUE            | CPF ou CNPJ do cliente.                      |
| `telefone`        | VARCHAR(20)       |                   | Telefone de contato.                         |
| `email`           | VARCHAR(255)      | UNIQUE            | Endereço de e-mail.                          |
| `endereco`        | TEXT              |                   | Endereço completo.                           |
| `data_cadastro`   | DATETIME          | DEFAULT CURRENT_TIMESTAMP | Data de cadastro do cliente.                 |

### 1.7. `Fornecedores`
Armazena informações dos fornecedores.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único do fornecedor.           |
| `nome_fantasia`   | VARCHAR(255)      | NOT NULL          | Nome fantasia do fornecedor.                 |
| `razao_social`    | VARCHAR(255)      |                   | Razão social do fornecedor.                  |
| `cnpj`            | VARCHAR(20)       | UNIQUE, NOT NULL  | CNPJ do fornecedor.                          |
| `telefone`        | VARCHAR(20)       |                   | Telefone de contato.                         |
| `email`           | VARCHAR(255)      | UNIQUE            | Endereço de e-mail.                          |
| `endereco`        | TEXT              |                   | Endereço completo.                           |
| `data_cadastro`   | DATETIME          | DEFAULT CURRENT_TIMESTAMP | Data de cadastro do fornecedor.              |

### 1.8. `Usuarios`
Armazena informações dos usuários do sistema.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único do usuário.              |
| `nome_usuario`    | VARCHAR(50)       | UNIQUE, NOT NULL  | Nome de usuário para login.                  |
| `senha_hash`      | VARCHAR(255)      | NOT NULL          | Hash da senha do usuário.                    |
| `nome_completo`   | VARCHAR(255)      | NOT NULL          | Nome completo do usuário.                    |
| `email`           | VARCHAR(255)      | UNIQUE            | Endereço de e-mail do usuário.               |
| `cargo`           | VARCHAR(100)      |                   | Cargo ou função do usuário.                  |
| `perfil_id`       | INTEGER           | FOREIGN KEY (`Perfis.id`) | Perfil de permissões do usuário.             |
| `ativo`           | BOOLEAN           | DEFAULT TRUE      | Indica se o usuário está ativo.              |
| `deve_trocar_senha` | BOOLEAN         | DEFAULT FALSE     | Obriga troca de senha no próximo login.      |
| `ultimo_login_em` | DATETIME          |                   | Data/hora do último login bem-sucedido.      |
| `falhas_login`    | INTEGER           | DEFAULT 0         | Contador de falhas consecutivas de login.    |
| `bloqueado_ate`   | DATETIME          |                   | Bloqueio temporário por falhas de login.     |
| `data_cadastro`   | DATETIME          | DEFAULT CURRENT_TIMESTAMP | Data de cadastro do usuário.                 |

### 1.9. `Perfis`
Armazena os perfis de acesso atribuídos aos usuários.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único do perfil.               |
| `nome`            | VARCHAR(255)      | UNIQUE, NOT NULL  | Nome do perfil de permissões.                |
| `descricao`       | TEXT              |                   | Descrição operacional do perfil.             |
| `sistema`         | BOOLEAN           | DEFAULT FALSE     | Indica perfil criado pelo sistema.           |
| `ativo`           | BOOLEAN           | DEFAULT TRUE      | Indica se o perfil está ativo.               |

### 1.10. `Permissaos`
Armazena as permissões disponíveis por módulo e ação.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único da permissão.            |
| `chave`           | VARCHAR(255)      | UNIQUE, NOT NULL  | Chave técnica da permissão (`modulo.acao`).  |
| `modulo`          | VARCHAR(255)      | NOT NULL          | Módulo funcional da permissão.               |
| `acao`            | VARCHAR(255)      | NOT NULL          | Ação permitida dentro do módulo.             |
| `descricao`       | TEXT              |                   | Texto exibido para administração do perfil.  |

### 1.11. `PerfilPermissaos`
Relaciona perfis e permissões.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `perfil_id`       | INTEGER           | NOT NULL, FOREIGN KEY (`Perfis.id`) | Perfil vinculado.                            |
| `permissao_id`    | INTEGER           | NOT NULL, FOREIGN KEY (`Permissaos.id`) | Permissão vinculada.                         |

### 1.12. `AuditoriaUsuarios`
Registra eventos de autenticação, segurança e gestão de usuários.

| Campo             | Tipo de Dados     | Restrições        | Descrição                                    |
| :---------------- | :---------------- | :---------------- | :------------------------------------------- |
| `id`              | INTEGER           | PRIMARY KEY, AUTOINCREMENT | Identificador único do evento.               |
| `ator_usuario_id` | INTEGER           | FOREIGN KEY (`Usuarios.id`) | Usuário que executou a ação, quando houver.  |
| `usuario_afetado_id` | INTEGER        | FOREIGN KEY (`Usuarios.id`) | Usuário afetado pela ação, quando houver.    |
| `acao`            | VARCHAR(255)      | NOT NULL          | Código da ação auditada.                     |
| `detalhes`        | TEXT              |                   | Detalhes adicionais em JSON serializado.     |
| `data_evento`     | DATETIME          | DEFAULT CURRENT_TIMESTAMP | Data/hora do evento auditado.                |

## 2. Considerações para Implementação

### 2.1. ORM (Object-Relational Mapping)
Para facilitar a interação com o banco de dados e manter a compatibilidade entre SQLite e MySQL/PostgreSQL, é altamente recomendável o uso de um ORM. Opções populares em Node.js incluem:
- **Sequelize:** Suporta múltiplos dialetos de banco de dados e oferece uma API robusta para modelagem e consultas.
- **TypeORM:** Similar ao Sequelize, com forte suporte a TypeScript e padrões de design modernos.
- **Knex.js:** Um construtor de consultas SQL flexível que pode ser usado com ou sem um ORM completo.

### 2.2. Migrações de Banco de Dados
Para gerenciar as alterações no esquema do banco de dados ao longo do tempo, serão utilizadas ferramentas de migração (integradas ao ORM ou standalone como `knex migrate`).

### 2.3. Conexão em Rede
Para o modo em rede, a aplicação Electron cliente se conectará diretamente ao servidor MySQL/PostgreSQL. É crucial configurar um pool de conexões para gerenciar eficientemente as conexões e garantir a escalabilidade.

---
*Este esquema é um ponto de partida e pode ser expandido conforme a necessidade, adicionando tabelas para auditoria, permissões, configurações, etc.*
