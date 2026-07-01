# KILSYSTEM PHARMACY

Sistema de gestão de farmácia desktop para Windows, desenvolvido com Electron, React e SQLite. Inclui licenciamento online com activação por chave e actualizações automáticas.

---

## Funcionalidades

| Módulo | Descrição |
|---|---|
| **Operação (POS)** | Ponto de venda com modo "cliente em espera" para múltiplas vendas simultâneas |
| **Estoque** | Gestão de produtos, lotes, validades e alertas de stock baixo |
| **Vendas** | Histórico, devoluções e relatórios de turno |
| **Financeiro** | Fluxo de caixa, contas a pagar/receber |
| **Clientes** | Cadastro e histórico de compras |
| **Documentos** | Emissão de facturas e recibos |
| **Fornecedores** | Gestão de fornecedores e encomendas |
| **Relatórios** | Vendas, inventário, financeiro — exportação para Excel/Google Sheets |
| **Configurações** | Empresa, aparência, backup automático, integrações |
| **Utilizadores** | Controlo de acesso por perfil e permissões |

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Desktop | Electron 35 |
| Frontend | React 19 + Tailwind CSS v4 |
| Backend | Node.js (processo principal Electron) |
| Base de dados | SQLite via Sequelize |
| Empacotamento | electron-builder (NSIS — Windows x64) |
| Actualizações | electron-updater → GitHub Releases |
| Licenciamento | RSA-3072 (chave pública no cliente, privada no servidor PHP) |

---

## Instalação (utilizador final)

1. Descarregar `KILSYSTEM-PHARMACY-Setup-1.0.1.exe` em [Releases](https://github.com/SilveiraGomes/Sistema_Farmacia/releases/latest)
2. Executar o instalador e seguir os passos
3. Na primeira abertura, introduzir a chave de activação fornecida pelo suporte
4. Futuras actualizações são instaladas automaticamente

**Requisitos:** Windows 10/11 x64 — ligação à Internet para activação e actualizações

---

## Actualizações Automáticas

O sistema verifica automaticamente novas versões ao iniciar. Quando uma actualização é detectada:

- Transfere o instalador em segundo plano
- Apresenta o diálogo **"Reiniciar agora / Mais tarde"** após a conclusão
- Instala sem intervenção manual

As actualizações são publicadas em [GitHub Releases](https://github.com/SilveiraGomes/Sistema_Farmacia/releases).

---

## Licenciamento

Cada instalação é activada com uma chave única emitida pelo painel de administração. A activação vincula a chave ao identificador da máquina (Windows MachineGuid). O servidor de licenciamento corre em `kilsystemangola.com`.

Planos disponíveis: **Demo (30 dias)** e **Anual**.

---

## Desenvolvimento

### Pré-requisitos

- Node.js 20 LTS
- npm 10+
- Windows (o fingerprint de máquina usa APIs Windows)

### Instalar dependências

```bash
npm install
```

### Executar em modo desenvolvimento

```bash
npm run dev       # Vite (frontend)
npm start         # Electron completo
```

### Gerar installer de produção

```bash
npm run dist
```

Gera `release/KILSYSTEM-PHARMACY-Setup-<versão>.exe`.

> **Nota:** `npm run build` inclui automaticamente `build:tailwind` (PostCSS → Tailwind CSS v4). Não é necessário correr `build:tailwind` manualmente antes do `dist`.

### Publicar nova versão

1. Actualizar `"version"` em `package.json`
2. `npm run dist`
3. Criar GitHub Release com tag `vX.Y.Z` (marcar como **Latest**, não Pre-release)
4. Anexar: `KILSYSTEM-PHARMACY-Setup-X.Y.Z.exe`, `.blockmap`, `latest.yml`

---

## Estrutura do Projecto

```
kilsystem-pharmacy/
├── main.js                        # Processo principal Electron
├── preload.js                     # Bridge IPC segura
├── src/
│   ├── App.jsx                    # Componente raiz React
│   ├── assets/
│   │   ├── tailwind.css           # CSS fonte (Tailwind v4)
│   │   └── output.css             # CSS compilado (gerado)
│   ├── backend/
│   │   ├── database.js            # SQLite + Sequelize
│   │   ├── ipcHandlers.js         # Handlers IPC
│   │   ├── licensing/             # licenseService, licenseClient, machineFingerprint
│   │   └── services/              # backup, relatórios, auth, alertas
│   ├── components/                # Componentes React por módulo
│   ├── licensing/                 # LicenseContext, LicenseWriteGuard, licenseUi
│   └── configuration/             # SettingsContext, SettingsProvider
├── resources/
│   ├── license-public.pem         # Chave pública RSA para verificação de licenças
│   └── icon.ico
└── release/                       # Artefactos de build (gerados)
```

---

## Suporte

**KIL SYSTEM SERVICE, LDA**
kilsystemangola@gmail.com | +244 923 909 381
