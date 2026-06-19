const {
  SETTING_DEFINITIONS,
  CATALOG_DEFINITIONS,
  validateSettingValue,
} = require('./configurationRegistry');

const CONFIGURATION_ERROR_CODES = Object.freeze({
  VALIDATION: 'CONFIGURATION_VALIDATION',
  CONFLICT: 'CONFIGURATION_CONFLICT',
  NOT_FOUND: 'CONFIGURATION_NOT_FOUND',
  CORRUPT_DATA: 'CONFIGURATION_CORRUPT_DATA',
});

const DATABASE_MUTATION_QUEUES = new WeakMap();
const MAX_RESERVATION_ATTEMPTS = 5;
const RESERVATION_RETRY = Symbol('RESERVATION_RETRY');

class ConfigurationError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'ConfigurationError';
    this.code = code;
  }
}

const jsonClone = (value) => JSON.parse(JSON.stringify(value));

const parseJson = (serialized, fallback) => {
  try {
    return { value: JSON.parse(serialized), readable: true };
  } catch (_error) {
    return { value: jsonClone(fallback), readable: false };
  }
};

const parseSettingJson = (key, serialized) => {
  const definition = SETTING_DEFINITIONS[key];
  const parsed = parseJson(serialized, definition.defaultValue);
  if (!parsed.readable) return parsed;

  try {
    return { value: validateSettingValue(key, parsed.value), readable: true };
  } catch (_error) {
    return { value: jsonClone(definition.defaultValue), readable: false };
  }
};

const parseMetadataJson = (serialized) => {
  const parsed = parseJson(serialized, {});
  if (!parsed.readable || !parsed.value || typeof parsed.value !== 'object'
    || Array.isArray(parsed.value)) {
    return { value: {}, readable: false };
  }
  return parsed;
};

const validationError = (message, cause) => new ConfigurationError(
  CONFIGURATION_ERROR_CODES.VALIDATION,
  message,
  cause ? { cause } : undefined,
);

const conflictError = () => new ConfigurationError(
  CONFIGURATION_ERROR_CODES.CONFLICT,
  'Configuração alterada por outra sessão.',
);

const validateMutationShape = ({ section, values, expectedVersions }) => {
  if (typeof section !== 'string' || !values || typeof values !== 'object'
    || Array.isArray(values) || !expectedVersions || typeof expectedVersions !== 'object'
    || Array.isArray(expectedVersions)) {
    throw validationError('Pedido de atualização de configuração inválido.');
  }

  const keys = Object.keys(values);
  if (keys.length === 0) throw validationError('Nenhuma configuração foi informada.');

  for (const key of keys) {
    const definition = SETTING_DEFINITIONS[key];
    if (!definition || definition.group !== section) {
      throw validationError(`Configuração inválida para a secção "${section}".`);
    }
    if (!Number.isInteger(expectedVersions[key]) || expectedVersions[key] < 0) {
      throw validationError(`Versão esperada inválida para a configuração "${key}".`);
    }
  }

  return keys;
};

const validateSeries = (documentType, series) => {
  if (!series || typeof series !== 'object' || Array.isArray(series)
    || typeof series.prefix !== 'string' || !/^[A-Z0-9]{1,12}$/.test(series.prefix)
    || typeof series.year !== 'string' || !/^\d{2}$/.test(series.year)
    || !Number.isSafeInteger(series.nextNumber) || series.nextNumber < 1
    || series.nextNumber >= Number.MAX_SAFE_INTEGER
    || !Number.isInteger(series.padding) || series.padding < 1 || series.padding > 12
  ) {
    throw validationError(`Série fiscal inválida para o tipo de documento "${documentType}".`);
  }

  return {
    prefix: series.prefix,
    year: series.year,
    nextNumber: series.nextNumber,
    padding: series.padding,
  };
};

const defaultSeries = (documentType, year) => {
  const prefixes = {
    factura: 'FAT',
    recibo: 'REC',
    proforma: 'PRO',
    'nota-credito': 'NC',
  };
  return {
    prefix: prefixes[documentType],
    year,
    nextNumber: 1,
    padding: 3,
  };
};

const serializeDatabaseMutation = (db, mutation) => {
  const queue = DATABASE_MUTATION_QUEUES.get(db) || Promise.resolve();
  const result = queue.then(mutation, mutation);
  DATABASE_MUTATION_QUEUES.set(db, result.catch(() => undefined));
  return result;
};

function createConfigurationService({ db, models, now = () => new Date() }) {
  if (!db || !models) throw new TypeError('db e models são obrigatórios.');
  if (typeof now !== 'function') throw new TypeError('now deve ser uma função.');

  const { ConfiguracaoSistema, OpcaoCatalogo, AuditoriaConfiguracao } = models;
  const serializeMutation = (mutation) => serializeDatabaseMutation(db, mutation);

  const seedDefaults = async () => {
    for (const [key, definition] of Object.entries(SETTING_DEFINITIONS)) {
      await ConfiguracaoSistema.findOrCreate({
        where: { chave: key },
        defaults: {
          grupo: definition.group,
          tipo: definition.type,
          valor_json: JSON.stringify(definition.defaultValue),
          versao: 1,
        },
      });
    }

    for (const [catalog, definition] of Object.entries(CATALOG_DEFINITIONS)) {
      for (const option of definition.options) {
        await OpcaoCatalogo.findOrCreate({
          where: { catalogo: catalog, codigo: option.code },
          defaults: {
            nome: option.name,
            ordem: option.order,
            ativo: true,
            sistema: option.system,
            metadados_json: JSON.stringify(option.metadata || {}),
            versao: 1,
          },
        });
      }
    }
  };

  const getSnapshot = async () => {
    const [settingRows, catalogRows] = await Promise.all([
      ConfiguracaoSistema.findAll({ order: [['chave', 'ASC']] }),
      OpcaoCatalogo.findAll({ order: [['catalogo', 'ASC'], ['ordem', 'ASC'], ['id', 'ASC']] }),
    ]);
    const settings = {};

    for (const row of settingRows) {
      const definition = SETTING_DEFINITIONS[row.chave];
      if (!definition) continue;
      const parsed = parseSettingJson(row.chave, row.valor_json);
      settings[definition.group] ||= {};
      settings[definition.group][row.chave.slice(definition.group.length + 1)] = {
        key: row.chave,
        value: parsed.value,
        version: row.versao,
        updatedAt: row.updatedAt,
        readable: parsed.readable,
      };
    }

    const catalogs = {};
    for (const row of catalogRows) {
      const parsedMetadata = parseMetadataJson(row.metadados_json);
      catalogs[row.catalogo] ||= [];
      catalogs[row.catalogo].push({
        id: row.id,
        code: row.codigo,
        name: row.nome,
        order: row.ordem,
        active: row.ativo,
        system: row.sistema,
        metadata: parsedMetadata.value,
        metadataReadable: parsedMetadata.readable,
        version: row.versao,
      });
    }

    const settingDefinitions = Object.fromEntries(
      Object.entries(SETTING_DEFINITIONS).map(([key, definition]) => [key, jsonClone(definition)]),
    );
    const catalogDefinitions = Object.fromEntries(
      Object.entries(CATALOG_DEFINITIONS).map(([key, definition]) => [key, {
        editable: definition.editable,
        system: definition.options.every((option) => option.system),
      }]),
    );
    const migrationVersion = settings.migration?.legacyLocalStorageVersion?.value;

    return {
      settings,
      catalogs,
      definitions: { settings: settingDefinitions, catalogs: catalogDefinitions },
      migrations: { legacyLocalStoragePending: !(typeof migrationVersion === 'number' && migrationVersion >= 1) },
    };
  };

  const updateSection = (request) => serializeMutation(async () => {
    const keys = validateMutationShape(request);
    const validated = {};
    for (const key of keys) {
      try {
        validated[key] = validateSettingValue(key, request.values[key]);
      } catch (error) {
        throw validationError(error.message, error);
      }
    }

    await db.transaction(async (transaction) => {
      for (const key of keys) {
        const row = await ConfiguracaoSistema.findOne({ where: { chave: key }, transaction });
        if (!row) {
          throw new ConfigurationError(
            CONFIGURATION_ERROR_CODES.NOT_FOUND,
            `Configuração não encontrada: "${key}".`,
          );
        }
        if (row.versao !== request.expectedVersions[key]) throw conflictError();

        const oldValue = parseJson(row.valor_json, SETTING_DEFINITIONS[key].defaultValue).value;
        const [updated] = await ConfiguracaoSistema.update({
          valor_json: JSON.stringify(validated[key]),
          versao: row.versao + 1,
          atualizado_por_usuario_id: request.actorUserId ?? null,
        }, {
          where: { id: row.id, versao: request.expectedVersions[key] },
          transaction,
        });
        if (updated !== 1) throw conflictError();

        await AuditoriaConfiguracao.create({
          ator_usuario_id: request.actorUserId ?? null,
          tipo_alvo: 'setting',
          alvo_chave: key,
          acao: 'update',
          valor_anterior_json: JSON.stringify(oldValue),
          valor_novo_json: JSON.stringify(validated[key]),
        }, { transaction });
      }
    });

    return getSnapshot();
  });

  const reserveNextDocumentNumber = ({ actorUserId, documentType } = {}) => serializeMutation(async () => {
    const supported = CATALOG_DEFINITIONS.document_types.options
      .some((option) => option.code === documentType);
    if (!supported) throw validationError('Tipo de documento fiscal não suportado.');

    const current = now();
    if (!(current instanceof Date) || Number.isNaN(current.getTime())) {
      throw validationError('Data atual inválida para a reserva fiscal.');
    }
    const currentYear = String(current.getFullYear()).slice(-2);

    for (let attempt = 1; attempt <= MAX_RESERVATION_ATTEMPTS; attempt += 1) {
      try {
        return await db.transaction(async (transaction) => {
          const key = 'documents.fiscal';
          const row = await ConfiguracaoSistema.findOne({ where: { chave: key }, transaction });
          if (!row) {
            throw new ConfigurationError(
              CONFIGURATION_ERROR_CODES.NOT_FOUND,
              'Configuração fiscal não encontrada.',
            );
          }
          const parsed = parseSettingJson(key, row.valor_json);
          if (!parsed.readable || !parsed.value || typeof parsed.value !== 'object'
            || Array.isArray(parsed.value) || !parsed.value.series
            || typeof parsed.value.series !== 'object' || Array.isArray(parsed.value.series)) {
            throw new ConfigurationError(
              CONFIGURATION_ERROR_CODES.CORRUPT_DATA,
              'Configuração de séries fiscais inválida.',
            );
          }

          const storedSeries = validateSeries(
            documentType,
            parsed.value.series[documentType] || defaultSeries(documentType, currentYear),
          );
          const series = storedSeries.year === currentYear
            ? storedSeries
            : { ...storedSeries, year: currentYear, nextNumber: 1 };
          const reservedNumber = `${series.prefix}${String(series.nextNumber).padStart(series.padding, '0')}/${series.year}`;
          const newSeries = { ...series, nextNumber: series.nextNumber + 1 };
          const newValue = jsonClone(parsed.value);
          newValue.series[documentType] = newSeries;

          const [updated] = await ConfiguracaoSistema.update({
            valor_json: JSON.stringify(newValue),
            versao: row.versao + 1,
            atualizado_por_usuario_id: actorUserId ?? null,
          }, {
            where: { id: row.id, versao: row.versao },
            transaction,
          });
          if (updated !== 1) throw RESERVATION_RETRY;

          await AuditoriaConfiguracao.create({
            ator_usuario_id: actorUserId ?? null,
            tipo_alvo: 'document-number',
            alvo_chave: documentType,
            acao: 'reserve',
            valor_anterior_json: JSON.stringify({
              configVersion: row.versao,
              series: storedSeries,
            }),
            valor_novo_json: JSON.stringify({
              configVersion: row.versao + 1,
              number: reservedNumber,
              series: newSeries,
            }),
          }, { transaction });
          return reservedNumber;
        });
      } catch (error) {
        const retryable = error === RESERVATION_RETRY
          || error?.original?.code === 'SQLITE_BUSY'
          || error?.parent?.code === 'SQLITE_BUSY';
        if (!retryable) throw error;
        if (attempt === MAX_RESERVATION_ATTEMPTS) throw conflictError();
      }
    }

    throw conflictError();
  });

  return {
    seedDefaults,
    getSnapshot,
    updateSection,
    reserveNextDocumentNumber,
  };
}

module.exports = {
  CONFIGURATION_ERROR_CODES,
  ConfigurationError,
  createConfigurationService,
};
