# Faturacao Credito Fiscal Protegido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce that payment method "credito" is only usable with document type "credito", and protect fiscal software identity fields from administrator edits outside development.

**Architecture:** Apply rules at the UI boundary for clear operator feedback and at the backend boundary for data integrity. Keep PDF/export/printing flows untouched.

**Tech Stack:** React, Electron IPC, Sequelize service layer, Node test runner.

---

### Task 1: Credit Payment Rule

**Files:**
- Modify: `src/components/Vendas.jsx`
- Modify: `src/backend/services/vendaService.js`
- Test: `tests/salesCreditPaymentRule.test.mjs`

- [ ] Write tests proving non-credit documents reject `paymentMethod: "credito"` and credit documents require it.
- [ ] Run `node --test tests\salesCreditPaymentRule.test.mjs` and verify failure before code changes.
- [ ] Add a shared predicate in `Vendas.jsx` so only the credit button is enabled for document type `DOCUMENT_TYPES.CREDIT`, and the credit button is disabled for all other document types.
- [ ] Add backend validation in `createVenda` so invalid IPC payloads cannot bypass the UI.
- [ ] Re-run the focused test and `node --check` on touched files.

### Task 2: Protected Fiscal Fields

**Files:**
- Modify: `src/components/Configuracoes.jsx`
- Modify: `src/backend/services/configurationService.js`
- Test: `tests/protectedFiscalSettings.test.mjs`

- [ ] Write tests proving production blocks changes to `documents.fiscal.validationNumber` and `documents.fiscal.softwareName`.
- [ ] Run `node --test tests\protectedFiscalSettings.test.mjs` and verify failure before code changes.
- [ ] Disable the two inputs in the settings UI unless development override is explicitly enabled.
- [ ] Strip/protect those fields in `updateSection` unless `KILSYSTEM_ALLOW_FISCAL_EDIT=true` or `NODE_ENV=development`.
- [ ] Re-run focused tests and syntax checks.
