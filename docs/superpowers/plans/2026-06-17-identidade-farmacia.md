# Identidade Configuravel da Farmacia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed Farmacia ESAYOS branding with configurable pharmacy identity used across the app.

**Architecture:** Add a focused branding data module backed by localStorage and a shared `BrandMark` React component. Wire Configuracoes to save the pharmacy name/logo and replace hardcoded branding in Login, Navbar, App loading, and ChangePassword.

**Tech Stack:** React 19, Vite, Node test runner, localStorage.

---

### Task 1: Branding Data Module

**Files:**
- Create: `src/data/branding.mjs`
- Test: `tests/branding.test.mjs`

- [ ] **Step 1: Write failing tests**

Create tests for default generic branding, sanitizing saved data, and custom change notifications.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\branding.test.mjs`
Expected: FAIL because `src/data/branding.mjs` does not exist.

- [ ] **Step 3: Implement module**

Export `DEFAULT_BRANDING`, `normalizeBranding`, `getStoredBranding`, `saveStoredBranding`, `subscribeBrandingChange`, and `getBrandingInitials`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests\branding.test.mjs`
Expected: PASS.

### Task 2: Shared Brand Component

**Files:**
- Create: `src/components/BrandMark.jsx`
- Modify: `src/components/Login.jsx`
- Modify: `src/components/Navbar.jsx`
- Modify: `src/components/ChangePassword.jsx`
- Modify: `src/App.jsx`
- Modify: `src/assets/tailwind.css`

- [ ] **Step 1: Replace duplicated brand markup**

Use `BrandMark` in all fixed brand locations.

- [ ] **Step 2: Style logo, initials, and compact menu behavior**

Keep the existing footprint and prevent text overflow.

### Task 3: Configuracoes Integration

**Files:**
- Modify: `src/components/Configuracoes.jsx`

- [ ] **Step 1: Load saved identity**

Initialize the pharmacy modal from `getStoredBranding()`.

- [ ] **Step 2: Save identity**

Save name and logo through `saveStoredBranding()` when Guardar is clicked.

### Task 4: Verification

**Files:**
- Generated: `src/assets/output.css`

- [ ] **Step 1: Rebuild CSS**

Run: `npm run build:tailwind`

- [ ] **Step 2: Build app**

Run: `npm run build`

- [ ] **Step 3: Run full tests**

Run: `npm test`
