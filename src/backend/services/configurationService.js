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
  PROTECTED: 'CONFIGURATION_PROTECTED',
  IN_USE: 'CONFIGURATION_IN_USE',
  INVARIANT: 'CONFIGURATION_INVARIANT',
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

const codedError = (code, message) => new ConfigurationError(code, message);

const normalizeCatalogName = (value) => {
  if (typeof value !== 'string') throw validationError('Nome da opção de catálogo inválido.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 120) throw validationError('Nome da opção de catálogo inválido.');
  return name;
};

const normalizedMeaning = (value) => normalizeCatalogName(value)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const slugCode = (name) => normalizedMeaning(name)
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const validateMetadata = (metadata = {}) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw validationError('Metadados da opção de catálogo inválidos.');
  }
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch (error) {
    throw validationError('Metadados da opção de catálogo inválidos.', error);
  }
};

const catalogOptionValue = (row) => ({
  id: row.id,
  code: row.codigo,
  name: row.nome,
  order: row.ordem,
  active: row.ativo,
  system: row.sistema,
  metadata: parseMetadataJson(row.metadados_json).value,
  version: row.versao,
});

const assertEditableCatalog = (catalogKey) => {
  const definition = CATALOG_DEFINITIONS[catalogKey];
  if (!definition) throw validationError('Catálogo desconhecido.');
  if (!definition.editable) {
    throw codedError(CONFIGURATION_ERROR_CODES.PROTECTED, 'Catálogo técnico protegido.');
  }
  return definition;
};

const assertEditableOption = (row) => {
  assertEditableCatalog(row.catalogo);
  if (row.sistema) {
    throw codedError(CONFIGURATION_ERROR_CODES.PROTECTED, 'Opção técnica protegida.');
  }
};

const validateMutationShape = (request) => {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw validationError('Pedido de atualização de configuração inválido.');
  }
  const { section, values, expectedVersions } = request;
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

function createConfigurationService({
  db,
  models,
  now = () => new Date(),
  discoverCatalogValues = async () => ({}),
}) {
  if (!db || !models) throw new TypeError('db e models são obrigatórios.');
  if (typeof now !== 'function') throw new TypeError('now deve ser uma função.');

  if (typeof discoverCatalogValues !== 'function') {
    throw new TypeError('discoverCatalogValues deve ser uma função.');
  }
  const {
    ConfiguracaoSistema, OpcaoCatalogo, AuditoriaConfiguracao, TurnoOperacional,
  } = models;
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

  const listCatalog = async ({ catalogKey, includeInactive = false } = {}) => {
    if (!CATALOG_DEFINITIONS[catalogKey]) throw validationError('Catálogo desconhecido.');
    const where = { catalogo: catalogKey };
    if (!includeInactive) where.ativo = true;
    const rows = await OpcaoCatalogo.findAll({
      where,
      order: [['ordem', 'ASC'], ['id', 'ASC']],
    });
    return rows.map(catalogOptionValue);
  };

  const writeCatalogAudit = (transaction, actorUserId, row, action, before, after) => (
    AuditoriaConfiguracao.create({
      ator_usuario_id: actorUserId ?? null,
      tipo_alvo: 'catalog',
      alvo_chave: `${row.catalogo}.${row.codigo}`,
      acao: action,
      valor_anterior_json: before === null ? null : JSON.stringify(before),
      valor_novo_json: after === null ? null : JSON.stringify(after),
    }, { transaction })
  );

  const findCatalogOption = async (optionId, transaction) => {
    if (!Number.isInteger(optionId) || optionId < 1) throw validationError('Opção inválida.');
    const row = await OpcaoCatalogo.findByPk(optionId, { transaction });
    if (!row) {
      throw codedError(CONFIGURATION_ERROR_CODES.NOT_FOUND, 'Opção de catálogo não encontrada.');
    }
    return row;
  };

  const assertUniqueCatalogName = async (catalogKey, name, transaction, excludedId = null) => {
    const rows = await OpcaoCatalogo.findAll({ where: { catalogo: catalogKey }, transaction });
    const meaning = normalizedMeaning(name);
    if (rows.some((row) => row.id !== excludedId && normalizedMeaning(row.nome) === meaning)) {
      throw codedError(CONFIGURATION_ERROR_CODES.CONFLICT, 'Já existe uma opção com este nome.');
    }
  };

  const isUsedByOpenShift = async (row, transaction) => {
    if (row.catalogo !== 'operation_shifts' || !TurnoOperacional) return false;
    const shifts = await TurnoOperacional.findAll({ transaction });
    const identities = new Set([normalizedMeaning(row.nome), normalizedMeaning(row.codigo)]);
    return shifts.some((shift) => normalizedMeaning(shift.status) === 'aberto'
      && identities.has(normalizedMeaning(shift.nome)));
  };

  const createCatalogOption = (request = {}) => serializeMutation(async () => {
    const { actorUserId, catalogKey, data } = request;
    assertEditableCatalog(catalogKey);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw validationError('Dados da opção de catálogo inválidos.');
    }
    const name = normalizeCatalogName(data.name);
    const code = slugCode(name);
    if (!code) throw validationError('O nome não produz um código de catálogo válido.');
    const metadata = validateMetadata(data.metadata);

    return db.transaction(async (transaction) => {
      await assertUniqueCatalogName(catalogKey, name, transaction);
      const existingCode = await OpcaoCatalogo.findOne({
        where: { catalogo: catalogKey, codigo: code }, transaction,
      });
      if (existingCode) {
        throw codedError(
          CONFIGURATION_ERROR_CODES.CONFLICT,
          'Este código já pertence a outra opção e não pode ser reutilizado.',
        );
      }
      const rows = await OpcaoCatalogo.findAll({ where: { catalogo: catalogKey }, transaction });
      const nextOrder = rows.reduce((maximum, row) => Math.max(maximum, row.ordem), -1) + 1;
      const row = await OpcaoCatalogo.create({
        catalogo: catalogKey,
        codigo: code,
        nome: name,
        ordem: nextOrder,
        ativo: true,
        sistema: false,
        metadados_json: JSON.stringify(metadata),
        versao: 1,
        atualizado_por_usuario_id: actorUserId ?? null,
      }, { transaction });
      const after = catalogOptionValue(row);
      await writeCatalogAudit(transaction, actorUserId, row, 'create', null, after);
      return after;
    });
  });

  const updateCatalogOption = (request = {}) => serializeMutation(async () => {
    const { actorUserId, optionId, data, expectedVersion } = request;
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw validationError('Pedido de edição de catálogo inválido.');
    }
    return db.transaction(async (transaction) => {
      const row = await findCatalogOption(optionId, transaction);
      assertEditableOption(row);
      if (row.versao !== expectedVersion) throw conflictError();
      const before = catalogOptionValue(row);
      const updates = {};
      if (Object.prototype.hasOwnProperty.call(data, 'name')) {
        updates.nome = normalizeCatalogName(data.name);
        if (normalizedMeaning(updates.nome) !== normalizedMeaning(row.nome)
          && await isUsedByOpenShift(row, transaction)) {
          throw codedError(
            CONFIGURATION_ERROR_CODES.IN_USE,
            'Não é possível renomear uma opção usada por um turno atualmente aberto.',
          );
        }
        await assertUniqueCatalogName(row.catalogo, updates.nome, transaction, row.id);
      }
      if (Object.prototype.hasOwnProperty.call(data, 'metadata')) {
        updates.metadados_json = JSON.stringify(validateMetadata(data.metadata));
      }
      if (Object.keys(updates).length === 0) throw validationError('Nenhuma alteração foi informada.');
      updates.versao = row.versao + 1;
      updates.atualizado_por_usuario_id = actorUserId ?? null;
      const [updated] = await OpcaoCatalogo.update(updates, {
        where: { id: row.id, versao: expectedVersion }, transaction,
      });
      if (updated !== 1) throw conflictError();
      await row.reload({ transaction });
      const after = catalogOptionValue(row);
      await writeCatalogAudit(transaction, actorUserId, row, 'update', before, after);
      return after;
    });
  });

  const assertCanDeactivate = async (row, transaction) => {
    assertEditableOption(row);
    if (!row.ativo) throw validationError('A opção já está desativada.');

    for (const [key, definition] of Object.entries(SETTING_DEFINITIONS)) {
      if (definition.type !== 'catalog-code' || definition.catalog !== row.catalogo) continue;
      const setting = await ConfiguracaoSistema.findOne({ where: { chave: key }, transaction });
      if (setting && parseSettingJson(key, setting.valor_json).value === row.codigo) {
        throw codedError(
          CONFIGURATION_ERROR_CODES.IN_USE,
          'Altere primeiro a opção padrão atualmente selecionada.',
        );
      }
    }

    if (row.catalogo === 'payment_methods') {
      const activeCount = await OpcaoCatalogo.count({
        where: { catalogo: row.catalogo, ativo: true }, transaction,
      });
      if (activeCount <= 1) {
        throw codedError(
          CONFIGURATION_ERROR_CODES.INVARIANT,
          'Mantenha ao menos uma forma de pagamento ativa.',
        );
      }
    }

    if (await isUsedByOpenShift(row, transaction)) {
      throw codedError(
        CONFIGURATION_ERROR_CODES.IN_USE,
        'A opção está a ser usada por um turno atualmente aberto.',
      );
    }
  };

  const changeCatalogActivation = (action, active) => (request = {}) => serializeMutation(async () => {
    const { actorUserId, optionId, expectedVersion } = request;
    return db.transaction(async (transaction) => {
      const row = await findCatalogOption(optionId, transaction);
      if (expectedVersion !== undefined
        && (!Number.isInteger(expectedVersion) || row.versao !== expectedVersion)) throw conflictError();
      if (!active) await assertCanDeactivate(row, transaction);
      else {
        assertEditableOption(row);
        if (row.ativo) throw validationError('A opção já está ativa.');
      }
      const before = catalogOptionValue(row);
      await row.update({
        ativo: active,
        versao: row.versao + 1,
        atualizado_por_usuario_id: actorUserId ?? null,
      }, { transaction });
      const after = catalogOptionValue(row);
      await writeCatalogAudit(transaction, actorUserId, row, action, before, after);
      return after;
    });
  });

  const deactivateCatalogOption = changeCatalogActivation('deactivate', false);
  const activateCatalogOption = changeCatalogActivation('activate', true);

  const reorderCatalogOptions = (request = {}) => serializeMutation(async () => {
    const { actorUserId, catalogKey, optionIds } = request;
    assertEditableCatalog(catalogKey);
    if (!Array.isArray(optionIds) || optionIds.some((id) => !Number.isInteger(id) || id < 1)) {
      throw validationError('Ordem do catálogo inválida.');
    }
    return db.transaction(async (transaction) => {
      const activeRows = await OpcaoCatalogo.findAll({
        where: { catalogo: catalogKey, ativo: true }, transaction,
      });
      if (activeRows.some((row) => row.sistema)) {
        throw codedError(
          CONFIGURATION_ERROR_CODES.PROTECTED,
          'Opções técnicas protegidas não podem ser reordenadas.',
        );
      }
      const expected = activeRows.map((row) => row.id).sort((a, b) => a - b);
      const received = [...optionIds].sort((a, b) => a - b);
      if (expected.length !== received.length
        || expected.some((id, index) => id !== received[index])) {
        throw validationError('A ordem deve conter exatamente todas as opções ativas, uma vez cada.');
      }
      const byId = new Map(activeRows.map((row) => [row.id, row]));
      const before = activeRows.map(catalogOptionValue);
      for (let order = 0; order < optionIds.length; order += 1) {
        const row = byId.get(optionIds[order]);
        await row.update({
          ordem: order,
          versao: row.versao + 1,
          atualizado_por_usuario_id: actorUserId ?? null,
        }, { transaction });
      }
      const after = optionIds.map((id) => catalogOptionValue(byId.get(id)));
      await AuditoriaConfiguracao.create({
        ator_usuario_id: actorUserId ?? null,
        tipo_alvo: 'catalog',
        alvo_chave: catalogKey,
        acao: 'reorder',
        valor_anterior_json: JSON.stringify(before),
        valor_novo_json: JSON.stringify(after),
      }, { transaction });
      return after;
    });
  });

  const importLegacySettings = (request = {}) => serializeMutation(async () => {
    const { actorUserId, migrationVersion, data = {} } = request;
    if (!Number.isInteger(migrationVersion) || migrationVersion < 1
      || !data || typeof data !== 'object' || Array.isArray(data)) {
      throw validationError('Pedido de migração legado inválido.');
    }
    for (const field of ['branding', 'invoiceA4', 'discoveredCatalogValues']) {
      if (Object.prototype.hasOwnProperty.call(data, field)
        && (!data[field] || typeof data[field] !== 'object' || Array.isArray(data[field]))) {
        throw validationError(`Dados legados inválidos em "${field}".`);
      }
    }
    const discoveredByAdapter = await discoverCatalogValues();
    if (!discoveredByAdapter || typeof discoveredByAdapter !== 'object'
      || Array.isArray(discoveredByAdapter)) {
      throw validationError('Valores descobertos pelo adaptador são inválidos.');
    }

    return db.transaction(async (transaction) => {
      const markerKey = 'migration.legacyLocalStorageVersion';
      const marker = await ConfiguracaoSistema.findOne({ where: { chave: markerKey }, transaction });
      if (!marker) throw codedError(CONFIGURATION_ERROR_CODES.NOT_FOUND, 'Marcador de migração ausente.');
      const currentVersion = parseSettingJson(markerKey, marker.valor_json).value;
      if (currentVersion >= migrationVersion) {
        return { applied: false, skipped: true, migrationVersion };
      }

      const candidates = [];
      if (data.branding && typeof data.branding === 'object' && !Array.isArray(data.branding)) {
        const allowed = ['pharmacyName', 'taxId', 'address', 'phone', 'email', 'logoDataUrl'];
        candidates.push(['company.identity', Object.fromEntries(
          allowed.filter((key) => Object.prototype.hasOwnProperty.call(data.branding, key))
            .map((key) => [key, data.branding[key]]),
        )]);
      }
      if (data.invoiceA4 && typeof data.invoiceA4 === 'object' && !Array.isArray(data.invoiceA4)) {
        if (Object.prototype.hasOwnProperty.call(data.invoiceA4, 'documentHeaderText')) {
          candidates.push(['documents.headerText', data.invoiceA4.documentHeaderText]);
        }
        const fiscalFields = [
          'validationNumber', 'softwareName', 'fiscalRegime', 'showQrCode',
          'showTotalInWords', 'bankAccounts', 'series',
        ];
        const fiscal = Object.fromEntries(
          fiscalFields.filter((key) => Object.prototype.hasOwnProperty.call(data.invoiceA4, key))
            .map((key) => [key, data.invoiceA4[key]]),
        );
        if (Object.keys(fiscal).length) candidates.push(['documents.fiscal', fiscal]);
      }

      for (const [key, legacyPartial] of candidates) {
        const row = await ConfiguracaoSistema.findOne({ where: { chave: key }, transaction });
        if (!row) continue;
        const definition = SETTING_DEFINITIONS[key];
        const parsed = parseSettingJson(key, row.valor_json);
        const isUntouched = row.versao === 1
          && parsed.readable
          && JSON.stringify(parsed.value) === JSON.stringify(definition.defaultValue);
        if (!isUntouched) continue;
        const candidate = definition.type === 'object'
          ? { ...parsed.value, ...legacyPartial }
          : legacyPartial;
        let validated;
        try {
          validated = validateSettingValue(key, candidate);
        } catch (error) {
          throw validationError(`Valor legado inválido para "${key}".`, error);
        }
        const before = parsed.value;
        await row.update({
          valor_json: JSON.stringify(validated),
          versao: row.versao + 1,
          atualizado_por_usuario_id: actorUserId ?? null,
        }, { transaction });
        await AuditoriaConfiguracao.create({
          ator_usuario_id: actorUserId ?? null,
          tipo_alvo: 'setting',
          alvo_chave: key,
          acao: 'migrate',
          valor_anterior_json: JSON.stringify(before),
          valor_novo_json: JSON.stringify(validated),
        }, { transaction });
      }

      const discoverySources = [discoveredByAdapter, data.discoveredCatalogValues || {}];
      for (const source of discoverySources) {
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
          throw validationError('Valores de catálogo legados inválidos.');
        }
        for (const [catalogKey, values] of Object.entries(source)) {
          assertEditableCatalog(catalogKey);
          if (!Array.isArray(values)) throw validationError('Valores de catálogo legados inválidos.');
          for (const rawName of values) {
            const name = normalizeCatalogName(rawName);
            const code = slugCode(name);
            if (!code) throw validationError('O nome legado não produz um código válido.');
            const existingRows = await OpcaoCatalogo.findAll({
              where: { catalogo: catalogKey }, transaction,
            });
            if (existingRows.some((row) => normalizedMeaning(row.nome) === normalizedMeaning(name)
              || row.codigo === code)) continue;
            const order = existingRows.reduce((maximum, row) => Math.max(maximum, row.ordem), -1) + 1;
            const row = await OpcaoCatalogo.create({
              catalogo: catalogKey,
              codigo: code,
              nome: name,
              ordem: order,
              ativo: true,
              sistema: false,
              metadados_json: '{}',
              versao: 1,
              atualizado_por_usuario_id: actorUserId ?? null,
            }, { transaction });
            await writeCatalogAudit(
              transaction, actorUserId, row, 'migrate', null, catalogOptionValue(row),
            );
          }
        }
      }

      const markerBefore = currentVersion;
      await marker.update({
        valor_json: JSON.stringify(migrationVersion),
        versao: marker.versao + 1,
        atualizado_por_usuario_id: actorUserId ?? null,
      }, { transaction });
      await AuditoriaConfiguracao.create({
        ator_usuario_id: actorUserId ?? null,
        tipo_alvo: 'migration',
        alvo_chave: markerKey,
        acao: 'migrate',
        valor_anterior_json: JSON.stringify(markerBefore),
        valor_novo_json: JSON.stringify(migrationVersion),
      }, { transaction });
      return { applied: true, skipped: false, migrationVersion };
    });
  });

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

          const hasStoredSeries = Object.prototype.hasOwnProperty.call(
            parsed.value.series,
            documentType,
          );
          const storedSeries = validateSeries(
            documentType,
            hasStoredSeries
              ? parsed.value.series[documentType]
              : defaultSeries(documentType, currentYear),
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
    listCatalog,
    createCatalogOption,
    updateCatalogOption,
    reorderCatalogOptions,
    deactivateCatalogOption,
    activateCatalogOption,
    importLegacySettings,
  };
}

module.exports = {
  CONFIGURATION_ERROR_CODES,
  ConfigurationError,
  assertEditableCatalog,
  createConfigurationService,
};
