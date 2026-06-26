const { Op } = require('sequelize');
const { getModels } = require('../database');

const STATUS_OPEN = 'Aberto';
const STATUS_CLOSED = 'Fechado';
const OPERATION_ERROR_CODE = 'OPERATION_STATE_INVALID';

const MESSAGES = Object.freeze({
  DAY_ALREADY_OPEN: 'Ja existe um dia operacional aberto.',
  DAY_NOT_OPEN: 'Nao ha dia operacional aberto.',
  SHIFT_ALREADY_OPEN: 'Ja existe um turno operacional aberto.',
  SHIFT_NOT_OPEN: 'Nao ha turno operacional aberto.',
  CLOSE_SHIFT_FIRST: 'Feche o turno aberto antes de fechar o dia.',
  OPEN_DAY_TO_OPERATE: 'Abra o dia operacional antes de iniciar operacoes.',
  OPEN_SHIFT_TO_OPERATE: 'Abra um turno antes de vender ou lancar despesas.',
  INVALID_MONEY: 'Informe um valor de caixa valido.',
  CLOSE_SHIFT_DB_ERROR: 'Nao foi possivel fechar o turno. Recarregue a pagina e tente novamente.',
  CLOSE_DAY_DB_ERROR: 'Nao foi possivel fechar o dia. Recarregue a pagina e tente novamente.',
});

const SAFE_OPERATION_ERRORS = Object.freeze(Object.values(MESSAGES));
let operationMutationQueue = Promise.resolve();

function createOperationError(message) {
  const error = new Error(message);
  error.code = OPERATION_ERROR_CODE;
  return error;
}

function serializeOperationMutation(run) {
  const next = operationMutationQueue.then(run, run);
  operationMutationQueue = next.catch(() => {});
  return next;
}

function isOperationalOpenUniqueConstraintError(error, tableName) {
  if (!error) {
    return false;
  }

  const oneOpenIndexName = tableName === 'DiaOperacionals'
    ? 'dia_operacional_one_open_unique'
    : 'turno_operacional_one_open_unique';
  const messages = [
    error.name,
    error.code,
    error.message,
    error.original && error.original.code,
    error.original && error.original.message,
    error.parent && error.parent.code,
    error.parent && error.parent.message,
  ].filter(Boolean);
  const fieldNames = [
    ...Object.keys(error.fields || {}),
    ...(error.errors || []).map((item) => item.path || item.validatorKey),
  ].filter(Boolean);
  const isUniqueError = messages.some((message) => (
    message === 'SequelizeUniqueConstraintError' ||
    String(message).includes('UNIQUE constraint failed')
  ));

  if (!isUniqueError) {
    return false;
  }

  return fieldNames.includes('status') ||
    messages.some((message) => (
      String(message).includes(oneOpenIndexName) ||
      String(message).includes(`${tableName}.status`) ||
      String(message).includes(`UNIQUE constraint failed: ${tableName}.status`)
    ));
}

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function roundToCents(number) {
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function normalizeMoney(value, { defaultValue = null } = {}) {
  const candidate = value === undefined || value === null || value === ''
    ? defaultValue
    : value;
  const number = Number(candidate);

  if (!Number.isFinite(number) || number < 0) {
    throw createOperationError(MESSAGES.INVALID_MONEY);
  }

  return roundToCents(number);
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text === '' ? null : text;
}

function normalizeShiftName(value) {
  const text = normalizeOptionalText(value);
  return text || 'Turno';
}

function asNumber(value) {
  if (value === undefined || value === null || value === '') {
    return value === null ? null : 0;
  }

  return roundToCents(Number(value));
}

function asIsoTimestamp(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function calculateCashDifference(record, finalBalance) {
  const expected = asNumber(record.saldo_inicial) +
    asNumber(record.total_vendas) -
    asNumber(record.total_despesas) -
    asNumber(record.total_perdas);

  return roundToCents(finalBalance - expected);
}

function calculateCashDifferenceWithTotals(saldoInicial, finalBalance, totalVendas, totalDespesas, totalPerdas) {
  const expected = saldoInicial + totalVendas - totalDespesas - totalPerdas;
  return roundToCents(finalBalance - expected);
}

function serializeDay(day) {
  if (!day) {
    return null;
  }

  const plain = typeof day.get === 'function' ? day.get({ plain: true }) : day;
  return {
    id: plain.id,
    data_operacional: plain.data_operacional,
    status: plain.status,
    saldo_inicial: asNumber(plain.saldo_inicial),
    saldo_final_informado: asNumber(plain.saldo_final_informado),
    total_vendas: asNumber(plain.total_vendas),
    total_despesas: asNumber(plain.total_despesas),
    total_perdas: asNumber(plain.total_perdas),
    diferenca_caixa: asNumber(plain.diferenca_caixa),
    observacao_abertura: plain.observacao_abertura || null,
    observacao_fechamento: plain.observacao_fechamento || null,
    aberto_por_usuario_id: plain.aberto_por_usuario_id || null,
    aberto_por_nome: plain.abertoPor?.nome_completo || null,
    fechado_por_usuario_id: plain.fechado_por_usuario_id || null,
    aberto_em: asIsoTimestamp(plain.aberto_em),
    fechado_em: asIsoTimestamp(plain.fechado_em),
  };
}

function serializeShift(shift) {
  if (!shift) {
    return null;
  }

  const plain = typeof shift.get === 'function' ? shift.get({ plain: true }) : shift;
  return {
    id: plain.id,
    dia_operacional_id: plain.dia_operacional_id,
    nome: plain.nome,
    status: plain.status,
    saldo_inicial: asNumber(plain.saldo_inicial),
    saldo_final_informado: asNumber(plain.saldo_final_informado),
    total_vendas: asNumber(plain.total_vendas),
    total_despesas: asNumber(plain.total_despesas),
    total_perdas: asNumber(plain.total_perdas),
    diferenca_caixa: asNumber(plain.diferenca_caixa),
    observacao_abertura: plain.observacao_abertura || null,
    observacao_fechamento: plain.observacao_fechamento || null,
    aberto_por_usuario_id: plain.aberto_por_usuario_id || null,
    aberto_por_nome: plain.abertoPor?.nome_completo || null,
    fechado_por_usuario_id: plain.fechado_por_usuario_id || null,
    aberto_em: asIsoTimestamp(plain.aberto_em),
    fechado_em: asIsoTimestamp(plain.fechado_em),
  };
}

async function findOpenDay(options = {}) {
  const { DiaOperacional } = getModels();
  return DiaOperacional.findOne({
    where: { status: STATUS_OPEN },
    order: [['aberto_em', 'DESC'], ['id', 'DESC']],
    ...options,
  });
}

async function findOpenShift(dayId = null, options = {}) {
  const { TurnoOperacional } = getModels();
  const where = { status: STATUS_OPEN };
  if (dayId) {
    where.dia_operacional_id = dayId;
  }

  return TurnoOperacional.findOne({
    where,
    order: [['aberto_em', 'DESC'], ['id', 'DESC']],
    ...options,
  });
}

async function calculateShiftTotals(shiftRecord) {
  const { Venda, TransacaoFinanceira } = getModels();
  const sinceTime = typeof shiftRecord.get === 'function'
    ? shiftRecord.get('aberto_em')
    : shiftRecord.aberto_em;

  const [totalVendas, totalDespesas, totalPerdas] = await Promise.all([
    Venda.sum('total', {
      where: {
        data_venda: { [Op.gte]: sinceTime },
        status: { [Op.notIn]: ['ANULADO', 'Cancelada', 'Anulada'] },
        tipo_documento: { [Op.ne]: 'NOTA_CREDITO' },
      },
    }).then((v) => roundToCents(Number(v) || 0)),
    TransacaoFinanceira.sum('valor', {
      where: {
        tipo: { [Op.in]: ['expense', 'Despesa'] },
        data_transacao: { [Op.gte]: sinceTime },
      },
    }).then((v) => roundToCents(Number(v) || 0)),
    TransacaoFinanceira.sum('valor', {
      where: {
        [Op.or]: [
          { tipo: { [Op.in]: ['loss', 'Perda'] } },
          { motivo_perda: { [Op.ne]: null } },
        ],
        data_transacao: { [Op.gte]: sinceTime },
      },
    }).then((v) => roundToCents(Number(v) || 0)),
  ]);

  return { totalVendas, totalDespesas, totalPerdas };
}

async function calculateDayTotals(dayRecord) {
  const { Venda, TransacaoFinanceira } = getModels();
  const sinceTime = typeof dayRecord.get === 'function'
    ? dayRecord.get('aberto_em')
    : dayRecord.aberto_em;

  const [totalVendas, totalDespesas, totalPerdas] = await Promise.all([
    Venda.sum('total', {
      where: {
        data_venda: { [Op.gte]: sinceTime },
        status: { [Op.notIn]: ['ANULADO', 'Cancelada', 'Anulada'] },
        tipo_documento: { [Op.ne]: 'NOTA_CREDITO' },
      },
    }).then((v) => roundToCents(Number(v) || 0)),
    TransacaoFinanceira.sum('valor', {
      where: {
        tipo: { [Op.in]: ['expense', 'Despesa'] },
        data_transacao: { [Op.gte]: sinceTime },
      },
    }).then((v) => roundToCents(Number(v) || 0)),
    TransacaoFinanceira.sum('valor', {
      where: {
        [Op.or]: [
          { tipo: { [Op.in]: ['loss', 'Perda'] } },
          { motivo_perda: { [Op.ne]: null } },
        ],
        data_transacao: { [Op.gte]: sinceTime },
      },
    }).then((v) => roundToCents(Number(v) || 0)),
  ]);

  return { totalVendas, totalDespesas, totalPerdas };
}

async function openDay({ actorUserId, data = {} }) {
  return serializeOperationMutation(() => openDayMutation({ actorUserId, data }));
}

async function openDayMutation({ actorUserId, data = {} }) {
  const { DiaOperacional } = getModels();
  const openDayRecord = await findOpenDay();

  if (openDayRecord) {
    throw createOperationError(MESSAGES.DAY_ALREADY_OPEN);
  }

  let day;
  try {
    day = await DiaOperacional.create({
      data_operacional: data.data_operacional || todayIsoDate(),
      status: STATUS_OPEN,
      saldo_inicial: normalizeMoney(data.saldo_inicial, { defaultValue: 0 }),
      observacao_abertura: normalizeOptionalText(data.observacao_abertura),
      aberto_por_usuario_id: actorUserId || null,
      aberto_em: new Date(),
    });
  } catch (error) {
    if (isOperationalOpenUniqueConstraintError(error, 'DiaOperacionals')) {
      throw createOperationError(MESSAGES.DAY_ALREADY_OPEN);
    }
    throw error;
  }

  return serializeDay(day);
}

async function closeDay({ actorUserId, data = {} }) {
  return serializeOperationMutation(() => closeDayMutation({ actorUserId, data }));
}

async function closeDayMutation({ actorUserId, data = {} }) {
  const openDayRecord = await findOpenDay();
  if (!openDayRecord) {
    throw createOperationError(MESSAGES.DAY_NOT_OPEN);
  }

  const openShiftRecord = await findOpenShift(openDayRecord.id);
  if (openShiftRecord) {
    throw createOperationError(MESSAGES.CLOSE_SHIFT_FIRST);
  }

  const finalBalance = normalizeMoney(data.saldo_final_informado);
  const { totalVendas, totalDespesas, totalPerdas } = await calculateDayTotals(openDayRecord);

  try {
    await openDayRecord.update({
      status: STATUS_CLOSED,
      saldo_final_informado: finalBalance,
      total_vendas: totalVendas,
      total_despesas: totalDespesas,
      total_perdas: totalPerdas,
      diferenca_caixa: calculateCashDifferenceWithTotals(
        asNumber(openDayRecord.saldo_inicial),
        finalBalance,
        totalVendas,
        totalDespesas,
        totalPerdas,
      ),
      observacao_fechamento: normalizeOptionalText(data.observacao_fechamento),
      fechado_por_usuario_id: actorUserId || null,
      fechado_em: new Date(),
    });
  } catch (error) {
    console.error('Erro ao fechar o dia operacional:', error);
    throw createOperationError(MESSAGES.CLOSE_DAY_DB_ERROR);
  }

  return serializeDay(openDayRecord);
}

async function openShift({ actorUserId, data = {} }) {
  return serializeOperationMutation(() => openShiftMutation({ actorUserId, data }));
}

async function openShiftMutation({ actorUserId, data = {} }) {
  const { TurnoOperacional } = getModels();
  const openDayRecord = await findOpenDay();

  if (!openDayRecord) {
    throw createOperationError(MESSAGES.DAY_NOT_OPEN);
  }

  const openShiftRecord = await findOpenShift(openDayRecord.id);
  if (openShiftRecord) {
    throw createOperationError(MESSAGES.SHIFT_ALREADY_OPEN);
  }

  let shift;
  try {
    shift = await TurnoOperacional.create({
      dia_operacional_id: openDayRecord.id,
      nome: normalizeShiftName(data.nome),
      status: STATUS_OPEN,
      saldo_inicial: normalizeMoney(data.saldo_inicial, { defaultValue: 0 }),
      observacao_abertura: normalizeOptionalText(data.observacao_abertura),
      aberto_por_usuario_id: actorUserId || null,
      aberto_em: new Date(),
    });
  } catch (error) {
    if (isOperationalOpenUniqueConstraintError(error, 'TurnoOperacionals')) {
      throw createOperationError(MESSAGES.SHIFT_ALREADY_OPEN);
    }
    throw error;
  }

  return serializeShift(shift);
}

async function closeShift({ actorUserId, data = {} }) {
  return serializeOperationMutation(() => closeShiftMutation({ actorUserId, data }));
}

async function closeShiftMutation({ actorUserId, data = {} }) {
  const openDayRecord = await findOpenDay();
  if (!openDayRecord) {
    throw createOperationError(MESSAGES.DAY_NOT_OPEN);
  }

  const openShiftRecord = await findOpenShift(openDayRecord.id);
  if (!openShiftRecord) {
    throw createOperationError(MESSAGES.SHIFT_NOT_OPEN);
  }

  const finalBalance = normalizeMoney(data.saldo_final_informado);
  const { totalVendas, totalDespesas, totalPerdas } = await calculateShiftTotals(openShiftRecord);

  try {
    await openShiftRecord.update({
      status: STATUS_CLOSED,
      saldo_final_informado: finalBalance,
      total_vendas: totalVendas,
      total_despesas: totalDespesas,
      total_perdas: totalPerdas,
      diferenca_caixa: calculateCashDifferenceWithTotals(
        asNumber(openShiftRecord.saldo_inicial),
        finalBalance,
        totalVendas,
        totalDespesas,
        totalPerdas,
      ),
      observacao_fechamento: normalizeOptionalText(data.observacao_fechamento),
      fechado_por_usuario_id: actorUserId || null,
      fechado_em: new Date(),
    });
  } catch (error) {
    console.error('Erro ao fechar o turno operacional:', error);
    throw createOperationError(MESSAGES.CLOSE_SHIFT_DB_ERROR);
  }

  return serializeShift(openShiftRecord);
}

async function getOperationalState() {
  const { Usuario } = getModels();
  const userInclude = [
    { model: Usuario, as: 'abertoPor', attributes: ['id', 'nome_completo'], required: false },
  ];

  const day = await findOpenDay({ include: userInclude });
  if (!day) {
    return {
      day: null,
      shift: null,
      canOperate: false,
      message: MESSAGES.OPEN_DAY_TO_OPERATE,
    };
  }

  const shift = await findOpenShift(day.id, { include: userInclude });
  if (!shift) {
    return {
      day: serializeDay(day),
      shift: null,
      canOperate: false,
      message: MESSAGES.OPEN_SHIFT_TO_OPERATE,
    };
  }

  // Inject real-time totals — stored totals are only written on close
  const { totalVendas, totalDespesas, totalPerdas } = await calculateShiftTotals(shift);
  const serializedShift = serializeShift(shift);
  serializedShift.total_vendas = totalVendas;
  serializedShift.total_despesas = totalDespesas;
  serializedShift.total_perdas = totalPerdas;

  return {
    day: serializeDay(day),
    shift: serializedShift,
    canOperate: true,
    message: '',
  };
}

async function assertOperationalSessionOpen() {
  const state = await getOperationalState();
  if (!state.canOperate) {
    throw createOperationError(state.message);
  }

  return state;
}

module.exports = {
  SAFE_OPERATION_ERRORS,
  createOperationError,
  openDay,
  closeDay,
  openShift,
  closeShift,
  getOperationalState,
  assertOperationalSessionOpen,
};
