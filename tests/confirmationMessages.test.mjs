import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConfirmationOptions,
  confirmDelete,
  confirmLogout,
  confirmSensitiveAction,
} from '../src/utils/confirmations.mjs';

test('confirmLogout asks before ending the session with a custom action label', async () => {
  const prompts = [];
  const result = await confirmLogout((options) => {
    prompts.push(options);
    return true;
  });

  assert.equal(result, true);
  assert.deepEqual(prompts, [{
    message: 'Deseja realmente sair do sistema?',
    title: 'Confirmar saida',
    confirmLabel: 'Sair do sistema',
    cancelLabel: 'Cancelar',
    tone: 'logout',
  }]);
});

test('confirmDelete uses the shared deletion confirmation text and danger tone', async () => {
  const prompts = [];
  const result = await confirmDelete('o cliente Maria', (options) => {
    prompts.push(options);
    return false;
  });

  assert.equal(result, false);
  assert.deepEqual(prompts, [{
    message: 'Deseja realmente excluir o cliente Maria?',
    title: 'Confirmar exclusao',
    confirmLabel: 'Excluir',
    cancelLabel: 'Cancelar',
    tone: 'danger',
  }]);
});

test('confirmSensitiveAction allows custom non-delete confirmations', async () => {
  const prompts = [];
  const result = await confirmSensitiveAction('Deseja redefinir a senha deste usuario?', (options) => {
    prompts.push(options);
    return true;
  });

  assert.equal(result, true);
  assert.deepEqual(prompts, [{
    message: 'Deseja redefinir a senha deste usuario?',
    title: 'Confirmar acao',
    confirmLabel: 'Confirmar',
    cancelLabel: 'Cancelar',
    tone: 'warning',
  }]);
});

test('buildConfirmationOptions keeps modal copy consistent by action type', () => {
  assert.deepEqual(buildConfirmationOptions({
    message: 'Deseja realmente anular FAT027/26?',
    tone: 'warning',
    title: 'Confirmar anulacao',
    confirmLabel: 'Anular documento',
  }), {
    message: 'Deseja realmente anular FAT027/26?',
    title: 'Confirmar anulacao',
    confirmLabel: 'Anular documento',
    cancelLabel: 'Cancelar',
    tone: 'warning',
  });
});
