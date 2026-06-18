# Farmacia ESAYOS UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Farmacia ESAYOS screens from the PDF reference with a left sidebar menu, rename Faturamento to Vendas, add matching operational screens, and extend the database model for categories and subcategories.

**Architecture:** Keep the current React/Vite/Electron structure. Add a shared pharmacy data module for dashboard, sales, stock, finance, client, reports, configuration, and user screens; use focused React components for each screen and a sidebar/topbar layout in `App.jsx`. Extend Sequelize models in `src/backend/database.js` without introducing migrations yet.

**Tech Stack:** React 19, Vite, Tailwind CSS classes plus local CSS, Electron IPC, Sequelize, SQLite, Node test runner.

---

### Task 1: Shared Data And Tests

**Files:**
- Create: `src/data/pharmacyData.mjs`
- Create: `tests/pharmacyData.test.mjs`
- Modify: `package.json`

- [ ] Write tests for currency formatting, dashboard totals, stock summary, and sales totals.
- [ ] Run `npm test` and confirm it fails because the data module does not exist.
- [ ] Implement `src/data/pharmacyData.mjs` with mock data and helpers.
- [ ] Run `npm test` and confirm it passes.

### Task 2: Layout And Navigation

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Navbar.jsx`
- Modify: `src/assets/tailwind.css`

- [ ] Replace the top navbar with a fixed left sidebar and app topbar.
- [ ] Add views for dashboard, vendas, estoque, financeiro, clientes, relatorios, configuracoes, and usuarios.
- [ ] Match the green/gray visual system from the PDF.

### Task 3: Rebuilt Screens

**Files:**
- Create: `src/components/Dashboard.jsx`
- Create: `src/components/Vendas.jsx`
- Create: `src/components/Clientes.jsx`
- Create: `src/components/Configuracoes.jsx`
- Create: `src/components/Usuarios.jsx`
- Modify: `src/components/Estoque.jsx`
- Modify: `src/components/Financeiro.jsx`
- Modify: `src/components/Relatorios.jsx`
- Remove from imports only: `src/components/Faturamento.jsx`

- [ ] Build dashboard cards, chart bars, best-sellers, and invoice table.
- [ ] Build Vendas as POS with categories, product grid, invoice detail panel, held invoices, and checkout summary.
- [ ] Build Estoque with category cards, toolbar, product table, and modals for product/category/subcategory/filter.
- [ ] Build the remaining operational screens using the same table/card pattern.

### Task 4: Database Model Extension

**Files:**
- Modify: `src/backend/database.js`
- Modify: `docs/database_schema.md`

- [ ] Add Categoria and Subcategoria models.
- [ ] Link Produto to Categoria/Subcategoria while keeping legacy string fields for compatibility.
- [ ] Add sales fields needed by the UI: invoice number and payment summary.
- [ ] Update schema documentation.

### Task 5: Verification

**Files:**
- No code files.

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Report any remaining gaps honestly.
