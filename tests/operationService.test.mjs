import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema, getModels } = require('../src/backend/database.js');
const {
  SAFE_OPERATION_ERRORS,
  openDay,
  closeDay,
  openShift,
  closeShift,
  getOperationalState,
  assertOperationalSessionOpen,
} = require('../src/backend/services/operationService.js');

const OPERATION_ERROR_CODE = 'OPERATION_STATE_INVALID';

async function withOperations(run) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-operations-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');
  try {
    await syncDatabaseSchema(db);
    await run();
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

test('openDay creates one open day and rejects a second open day', async () => {
  await withOperations(async () => {
    const day = await openDay({
      actorUserId: 1,
      data: {
        data_operacional: '2026-06-18',
        saldo_inicial: 100.125,
        observacao_abertura: ' abertura ',
      },
    });

    assert.equal(day.status, 'Aberto');
    assert.equal(day.data_operacional, '2026-06-18');
    assert.equal(day.saldo_inicial, 100.13);
    assert.equal(day.observacao_abertura, 'abertura');
    assert.equal(day.aberto_por_usuario_id, 1);
    assert.ok(day.aberto_em);

    await assert.rejects(
      () => openDay({ actorUserId: 2, data: { saldo_inicial: 0 } }),
      (error) => (
        error.code === OPERATION_ERROR_CODE &&
        error.message === 'Ja existe um dia operacional aberto.'
      )
    );
  });
});

test('openDay defaults operational date from local date components', async () => {
  await withOperations(async () => {
    const RealDate = globalThis.Date;

    class FakeDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super('2026-06-17T23:30:00.000Z');
          return;
        }

        super(...args);
      }

      getFullYear() {
        return 2026;
      }

      getMonth() {
        return 5;
      }

      getDate() {
        return 18;
      }

      toISOString() {
        return '2026-06-17T23:30:00.000Z';
      }

      static now() {
        return new RealDate('2026-06-17T23:30:00.000Z').getTime();
      }

      static parse(value) {
        return RealDate.parse(value);
      }

      static UTC(...args) {
        return RealDate.UTC(...args);
      }
    }

    globalThis.Date = FakeDate;
    try {
      const day = await openDay({ actorUserId: 1, data: {} });
      assert.equal(day.data_operacional, '2026-06-18');
    } finally {
      globalThis.Date = RealDate;
    }
  });
});

test('openShift rejects when no open day exists', async () => {
  await withOperations(async () => {
    await assert.rejects(
      () => openShift({ actorUserId: 1, data: { nome: 'Manha' } }),
      (error) => (
        error.code === OPERATION_ERROR_CODE &&
        error.message === 'Nao ha dia operacional aberto.'
      )
    );
  });
});

test('concurrent openDay calls return one success and one operation error', async () => {
  await withOperations(async () => {
    const results = await Promise.allSettled([
      openDay({ actorUserId: 1, data: { data_operacional: '2026-06-18' } }),
      openDay({ actorUserId: 1, data: { data_operacional: '2026-06-18' } }),
    ]);

    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');

    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].reason.code, OPERATION_ERROR_CODE);
    assert.equal(failures[0].reason.message, 'Ja existe um dia operacional aberto.');
  });
});

test('openDay does not translate unrelated database constraints into already-open errors', async () => {
  await withOperations(async () => {
    const { DiaOperacional } = getModels();
    const originalCreate = DiaOperacional.create;
    const foreignKeyError = new Error('SQLITE_CONSTRAINT: FOREIGN KEY constraint failed');
    foreignKeyError.name = 'SequelizeForeignKeyConstraintError';
    foreignKeyError.parent = { code: 'SQLITE_CONSTRAINT', message: foreignKeyError.message };

    DiaOperacional.create = async () => {
      throw foreignKeyError;
    };

    try {
      await assert.rejects(
        () => openDay({ actorUserId: 1, data: {} }),
        (error) => (
          error === foreignKeyError &&
          error.code !== OPERATION_ERROR_CODE &&
          error.message !== 'Ja existe um dia operacional aberto.'
        )
      );
    } finally {
      DiaOperacional.create = originalCreate;
    }
  });
});

test('openShift creates one open shift under the open day and rejects a second open shift', async () => {
  await withOperations(async () => {
    const day = await openDay({ actorUserId: 1, data: { data_operacional: '2026-06-18' } });
    const shift = await openShift({
      actorUserId: 1,
      data: {
        nome: ' Balcao ',
        saldo_inicial: '50.235',
        observacao_abertura: ' inicio ',
      },
    });

    assert.equal(shift.status, 'Aberto');
    assert.equal(shift.dia_operacional_id, day.id);
    assert.equal(shift.nome, 'Balcao');
    assert.equal(shift.saldo_inicial, 50.24);
    assert.equal(shift.observacao_abertura, 'inicio');
    assert.equal(shift.aberto_por_usuario_id, 1);
    assert.ok(shift.aberto_em);

    await assert.rejects(
      () => openShift({ actorUserId: 3, data: { nome: 'Tarde' } }),
      (error) => (
        error.code === OPERATION_ERROR_CODE &&
        error.message === 'Ja existe um turno operacional aberto.'
      )
    );
  });
});

test('concurrent openShift calls return one success and one operation error', async () => {
  await withOperations(async () => {
    await openDay({ actorUserId: 1, data: {} });

    const results = await Promise.allSettled([
      openShift({ actorUserId: 1, data: { nome: 'Manha' } }),
      openShift({ actorUserId: 1, data: { nome: 'Tarde' } }),
    ]);

    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');

    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].reason.code, OPERATION_ERROR_CODE);
    assert.equal(failures[0].reason.message, 'Ja existe um turno operacional aberto.');
  });
});

test('openShift does not translate unrelated database constraints into already-open errors', async () => {
  await withOperations(async () => {
    await openDay({ actorUserId: 1, data: {} });
    const { TurnoOperacional } = getModels();
    const originalCreate = TurnoOperacional.create;
    const foreignKeyError = new Error('SQLITE_CONSTRAINT: FOREIGN KEY constraint failed');
    foreignKeyError.name = 'SequelizeForeignKeyConstraintError';
    foreignKeyError.parent = { code: 'SQLITE_CONSTRAINT', message: foreignKeyError.message };

    TurnoOperacional.create = async () => {
      throw foreignKeyError;
    };

    try {
      await assert.rejects(
        () => openShift({ actorUserId: 1, data: { nome: 'Manha' } }),
        (error) => (
          error === foreignKeyError &&
          error.code !== OPERATION_ERROR_CODE &&
          error.message !== 'Ja existe um turno operacional aberto.'
        )
      );
    } finally {
      TurnoOperacional.create = originalCreate;
    }
  });
});

test('closeDay rejects while a shift is open', async () => {
  await withOperations(async () => {
    await openDay({ actorUserId: 1, data: {} });
    await openShift({ actorUserId: 1, data: { nome: 'Manha' } });

    await assert.rejects(
      () => closeDay({ actorUserId: 1, data: { saldo_final_informado: 200 } }),
      (error) => (
        error.code === OPERATION_ERROR_CODE &&
        error.message === 'Feche o turno aberto antes de fechar o dia.'
      )
    );
  });
});

test('closeShift closes the current open shift and stores closing balance and note', async () => {
  await withOperations(async () => {
    await openDay({ actorUserId: 1, data: {} });
    await openShift({ actorUserId: 1, data: { nome: 'Manha', saldo_inicial: 10 } });

    const shift = await closeShift({
      actorUserId: 1,
      data: {
        saldo_final_informado: '99.999',
        observacao_fechamento: ' fim ',
      },
    });

    assert.equal(shift.status, 'Fechado');
    assert.equal(shift.saldo_final_informado, 100);
    assert.equal(shift.observacao_fechamento, 'fim');
    assert.equal(shift.fechado_por_usuario_id, 1);
    assert.ok(shift.fechado_em);
  });
});

test('closeShift rejects with no-open-shift operation message when day is open', async () => {
  await withOperations(async () => {
    await openDay({ actorUserId: 1, data: {} });

    await assert.rejects(
      () => closeShift({ actorUserId: 1, data: { saldo_final_informado: 0 } }),
      (error) => (
        error.code === OPERATION_ERROR_CODE &&
        error.message === 'Nao ha turno operacional aberto.'
      )
    );
  });
});

test('closeDay succeeds after closing the shift and stores closing balance and note', async () => {
  await withOperations(async () => {
    await openDay({ actorUserId: 1, data: { saldo_inicial: 20 } });
    await openShift({ actorUserId: 1, data: { nome: 'Manha' } });
    await closeShift({ actorUserId: 1, data: { saldo_final_informado: 30 } });

    const day = await closeDay({
      actorUserId: 1,
      data: {
        saldo_final_informado: 40.555,
        observacao_fechamento: ' encerrado ',
      },
    });

    assert.equal(day.status, 'Fechado');
    assert.equal(day.saldo_final_informado, 40.56);
    assert.equal(day.observacao_fechamento, 'encerrado');
    assert.equal(day.fechado_por_usuario_id, 1);
    assert.ok(day.fechado_em);
  });
});

test('concurrent closeDay and openShift leave operation state consistent', async () => {
  await withOperations(async () => {
    await openDay({ actorUserId: 1, data: {} });

    const [closeResult, shiftResult] = await Promise.allSettled([
      closeDay({ actorUserId: 1, data: { saldo_final_informado: 0 } }),
      openShift({ actorUserId: 1, data: { nome: 'Manha' } }),
    ]);

    if (closeResult.status === 'fulfilled') {
      assert.equal(shiftResult.status, 'rejected');
      assert.equal(shiftResult.reason.code, OPERATION_ERROR_CODE);
      assert.equal(shiftResult.reason.message, 'Nao ha dia operacional aberto.');
    } else {
      assert.equal(closeResult.reason.code, OPERATION_ERROR_CODE);
      assert.equal(closeResult.reason.message, 'Feche o turno aberto antes de fechar o dia.');
      assert.equal(shiftResult.status, 'fulfilled');
    }

    const { DiaOperacional, TurnoOperacional } = getModels();
    const openDays = await DiaOperacional.findAll({ where: { status: 'Aberto' } });
    const openShifts = await TurnoOperacional.findAll({ where: { status: 'Aberto' } });

    if (openShifts.length > 0) {
      assert.equal(openDays.length, 1, 'closed day with open shift must not be possible');
    }
  });
});

test('operation mutation queue continues after a rejected mutation', async () => {
  await withOperations(async () => {
    await assert.rejects(
      () => closeDay({ actorUserId: 1, data: { saldo_final_informado: 0 } }),
      (error) => (
        error.code === OPERATION_ERROR_CODE &&
        error.message === 'Nao ha dia operacional aberto.'
      )
    );

    const day = await openDay({ actorUserId: 1, data: {} });

    assert.equal(day.status, 'Aberto');
  });
});

test('getOperationalState blocks operations when no day is open', async () => {
  await withOperations(async () => {
    const state = await getOperationalState();

    assert.equal(state.day, null);
    assert.equal(state.shift, null);
    assert.equal(state.canOperate, false);
    assert.equal(state.message, 'Abra o dia operacional antes de iniciar operacoes.');
  });
});

test('getOperationalState blocks operations when a day is open but no shift is open', async () => {
  await withOperations(async () => {
    await openDay({ actorUserId: 1, data: {} });

    const state = await getOperationalState();

    assert.equal(state.day.status, 'Aberto');
    assert.equal(state.shift, null);
    assert.equal(state.canOperate, false);
    assert.equal(state.message, 'Abra um turno antes de vender ou lancar despesas.');
  });
});

test('getOperationalState allows operations when both day and shift are open', async () => {
  await withOperations(async () => {
    await openDay({ actorUserId: 1, data: {} });
    await openShift({ actorUserId: 1, data: { nome: 'Manha' } });

    const state = await getOperationalState();

    assert.equal(state.day.status, 'Aberto');
    assert.equal(state.shift.status, 'Aberto');
    assert.equal(state.canOperate, true);
    assert.equal(state.message, '');
  });
});

test('assertOperationalSessionOpen throws blocking messages and resolves when session is open', async () => {
  await withOperations(async () => {
    await assert.rejects(
      () => assertOperationalSessionOpen(),
      (error) => (
        error.code === OPERATION_ERROR_CODE &&
        error.message === 'Abra o dia operacional antes de iniciar operacoes.'
      )
    );

    await openDay({ actorUserId: 1, data: {} });
    await assert.rejects(
      () => assertOperationalSessionOpen(),
      (error) => (
        error.code === OPERATION_ERROR_CODE &&
        error.message === 'Abra um turno antes de vender ou lancar despesas.'
      )
    );

    await openShift({ actorUserId: 1, data: { nome: 'Manha' } });
    await assert.doesNotReject(() => assertOperationalSessionOpen());
  });
});

test('operations reject invalid money values with a coded operation error', async () => {
  await withOperations(async () => {
    await assert.rejects(
      () => openDay({ actorUserId: 1, data: { saldo_inicial: -1 } }),
      (error) => (
        error.code === OPERATION_ERROR_CODE &&
        error.message === 'Informe um valor de caixa valido.'
      )
    );
  });
});

test('SAFE_OPERATION_ERRORS includes operation blocking and validation messages', () => {
  assert.ok(Object.isFrozen(SAFE_OPERATION_ERRORS));

  for (const message of [
    'Ja existe um dia operacional aberto.',
    'Nao ha dia operacional aberto.',
    'Ja existe um turno operacional aberto.',
    'Nao ha turno operacional aberto.',
    'Feche o turno aberto antes de fechar o dia.',
    'Abra o dia operacional antes de iniciar operacoes.',
    'Abra um turno antes de vender ou lancar despesas.',
    'Informe um valor de caixa valido.',
  ]) {
    assert.ok(SAFE_OPERATION_ERRORS.includes(message), `missing safe message: ${message}`);
  }
});
