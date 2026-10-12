// Local, synchronous persistence for the existing 0.2.0 character model.
// The checksum detects accidental corruption; it is not a security signature.
// Read/compare/write is optimistic detection, not a cross-tab transaction.
export const SAVE_KEYS = Object.freeze({
  main: 'ember-mage-save-v2',
  backup: 'ember-mage-save-v2-backup',
  restorePoint: 'ember-mage-save-v2-restore-point',
  rejected: 'ember-mage-save-v2-rejected',
  legacy: 'ember-mage-v1',
});

const FORMAT = 'ember-mage-save';
const SCHEMA = 2;
const MAX_BYTES = 256 * 1024;
const DEFAULT_DATA = {level: 1, xp: 0, items: [], equipped: null, clears: 0};
const DATA_KEYS = ['level', 'xp', 'items', 'equipped', 'clears'];
const ITEM_KEYS = ['id', 'name', 'rarity', 'power'];
const ENVELOPE_KEYS = ['format', 'schemaVersion', 'revision', 'savedAt', 'restorePointId', 'data', 'checksum'];

function error(code, message, metadata) {
  const value = new Error(message);
  value.code = code;
  if (metadata) value.metadata = metadata;
  return value;
}

function failure(value, extra = {}) {
  return {ok: false, code: value.code || 'INVALID_SAVE', message: value.message || '存档无效。',
    ...(value.metadata ? {metadata: value.metadata} : {}), ...extra};
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function fields(value, keys) {
  if (!plain(value) || Object.keys(value).length !== keys.length
      || keys.some(key => !Object.hasOwn(value, key))
      || Object.values(Object.getOwnPropertyDescriptors(value)).some(property => !Object.hasOwn(property, 'value'))) {
    throw error('INVALID_STRUCTURE', '存档字段不完整、类型错误或含未知字段。');
  }
}

function textValue(value, limit) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit
    && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validateData(value) {
  fields(value, DATA_KEYS);
  if (!Number.isInteger(value.level) || value.level < 1 || value.level > 100
      || typeof value.xp !== 'number' || !Number.isFinite(value.xp) || value.xp < 0
      || !Number.isSafeInteger(value.clears) || value.clears < 0) {
    throw error('INVALID_CHARACTER', '等级应为1–100，经验和通关次数必须是合法非负数值。');
  }
  if (!Array.isArray(value.items) || value.items.length > 60) {
    throw error('INVALID_ITEMS', '法杖列表无效，最多保留60件。');
  }
  const ids = new Set();
  const items = value.items.map(item => {
    fields(item, ITEM_KEYS);
    if (!textValue(item.id, 128) || !textValue(item.name, 128)
        || !Number.isInteger(item.rarity) || item.rarity < 0 || item.rarity > 2
        || typeof item.power !== 'number' || !Number.isFinite(item.power) || item.power < 0) {
      throw error('INVALID_ITEM', '法杖ID、名称、品质或伤害数值无效。');
    }
    if (ids.has(item.id)) throw error('DUPLICATE_ID', '法杖ID重复，未导入任何装备。');
    ids.add(item.id);
    return {id: item.id, name: item.name, rarity: item.rarity, power: item.power};
  });
  if (value.equipped !== null && (typeof value.equipped !== 'string' || !ids.has(value.equipped))) {
    throw error('INVALID_EQUIPPED', '已装备法杖必须引用列表中实际存在的ID。');
  }
  return {level: value.level, xp: value.xp, items, equipped: value.equipped, clears: value.clears};
}

function bytes(value) {
  return new TextEncoder().encode(value);
}

function hash(value) {
  let result = 0x811c9dc5;
  for (const byte of bytes(value)) result = Math.imul(result ^ byte, 0x01000193) >>> 0;
  return result.toString(16).padStart(8, '0');
}

function parseJSON(raw, limit = MAX_BYTES) {
  if (typeof raw !== 'string') throw error('INVALID_INPUT', '请选择JSON文本存档。');
  if (raw.length > limit || bytes(raw).length > limit) throw error('INPUT_TOO_LARGE', '存档文件超过256 KiB限制。');
  try { return JSON.parse(raw); }
  catch { throw error('INVALID_JSON', '无法读取JSON，原存档未被替换。'); }
}

function integer(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function marker(value) {
  return value === null || textValue(value, 128);
}

function core(value, data) {
  return {format: FORMAT, schemaVersion: SCHEMA, revision: value.revision, savedAt: value.savedAt,
    restorePointId: value.restorePointId, data};
}

function decode(raw, allowLegacy = false) {
  const value = parseJSON(raw);
  if (plain(value) && Object.hasOwn(value, 'schemaVersion')) {
    if (Number.isInteger(value.schemaVersion) && value.schemaVersion > SCHEMA) {
      throw error('FUTURE_VERSION', '此存档来自更高版本，已保护原文件；确认恢复或导入合法旧备份后才能替换。',
        {schemaVersion: value.schemaVersion});
    }
    fields(value, ENVELOPE_KEYS);
    if (value.format !== FORMAT || value.schemaVersion !== SCHEMA || !integer(value.revision)
        || !integer(value.savedAt) || !marker(value.restorePointId)) {
      throw error('INVALID_ENVELOPE', '存档版本、修订或时间字段无效。');
    }
    fields(value.checksum, ['algorithm', 'value']);
    if (value.checksum.algorithm !== 'fnv1a32' || typeof value.checksum.value !== 'string'
        || !/^[0-9a-f]{8}$/u.test(value.checksum.value)) {
      throw error('INVALID_CHECKSUM', '存档内容校验字段无效。');
    }
    const data = validateData(value.data);
    const payload = core(value, data);
    if (hash(JSON.stringify(payload)) !== value.checksum.value) {
      throw error('CHECKSUM_MISMATCH', '存档内容校验失败，原角色未被替换。');
    }
    return {data, envelope: {...payload, checksum: {...value.checksum}}, raw, source: 'versioned'};
  }
  if (!allowLegacy) throw error('INVALID_ENVELOPE', '主存档缺少版本信息。');
  return {data: validateData(value), envelope: null, raw, source: 'legacy'};
}

function metadata(record, source) {
  return {source, schemaVersion: record.envelope?.schemaVersion || 1,
    revision: record.envelope?.revision || 0, savedAt: record.envelope?.savedAt ?? null,
    level: record.data.level, itemCount: record.data.items.length, equipped: record.data.equipped};
}

function defaultStorage() {
  try { return globalThis.localStorage ?? null; }
  catch { return null; }
}

export function createSaveManager({storage = defaultStorage(), now = Date.now} = {}) {
  const store = storage;
  let initialized = false;
  let expectedMain = null;
  let expectedLegacy = null;
  let current = null;
  let currentData = validateData(DEFAULT_DATA);
  let protection = null;
  let markerCounter = 0;
  let status = {canSave: false, canImport: false, hasBackup: false, hasRestorePoint: false, hasRejected: false,
    source: 'empty', code: 'NOT_LOADED', message: '尚未读取本机存档。'};

  function update(code, message, values = {}) {
    const canImport = initialized && Boolean(store) && !['unavailable', 'conflict', 'uncertain'].includes(protection)
      && !['STORAGE_UNAVAILABLE', 'STORAGE_READ_FAILED', 'COMMIT_UNCONFIRMED', 'REVISION_CONFLICT'].includes(code);
    status = {...status, code, message, canImport, ...values};
  }

  function requireStorage() {
    if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function') {
      throw error('STORAGE_UNAVAILABLE', '本机存储不可用；仍可导出当前角色，请勿关闭页面。');
    }
  }

  function read(key) {
    requireStorage();
    try {
      const raw = store.getItem(key);
      if (raw !== null && typeof raw !== 'string') throw new Error('Invalid storage value');
      return raw;
    } catch { throw error('STORAGE_READ_FAILED', '无法读取本机存储；未覆盖存档，仍可导出角色。'); }
  }

  function write(key, raw) {
    requireStorage();
    try { store.setItem(key, raw); }
    catch { throw error('STORAGE_WRITE_FAILED', '本机存储写入失败或空间已满；原角色未确认替换，请先导出。'); }
    if (read(key) !== raw) throw error('STORAGE_VERIFY_FAILED', '本机存储写入无法确认；请先导出角色。');
  }

  function timestamp() {
    let value;
    try { value = now(); } catch { throw error('INVALID_TIME', '无法取得合法存档时间。'); }
    if (!integer(value)) throw error('INVALID_TIME', '存档时间必须是非负安全整数。');
    return value;
  }

  function make(data, revision, restorePointId = null) {
    const payload = {format: FORMAT, schemaVersion: SCHEMA, revision, savedAt: timestamp(), restorePointId,
      data: validateData(data)};
    return JSON.stringify({...payload, checksum: {algorithm: 'fnv1a32', value: hash(JSON.stringify(payload))}});
  }

  function optional(raw, allowLegacy = false) {
    if (raw === null) return null;
    try { return decode(raw, allowLegacy); } catch { return null; }
  }

  function checkMain() {
    const actual = read(SAVE_KEYS.main);
    if (actual !== expectedMain) {
      protection = 'conflict';
      throw error('REVISION_CONFLICT', '另一页面已变更存档，已拒绝覆盖；请先导出当前角色，再重新读取。');
    }
    if (expectedLegacy !== null && expectedMain === null && read(SAVE_KEYS.legacy) !== expectedLegacy) {
      protection = 'conflict';
      throw error('REVISION_CONFLICT', '旧角色已由另一页面变更，已拒绝迁移覆盖。');
    }
    return actual;
  }

  // Keep both the previous active point and the candidate until its main-file
  // marker is committed. Failed replacement therefore cannot erase that point.
  function restoreRecord() {
    const raw = read(SAVE_KEYS.restorePoint);
    if (raw === null) return {raw, value: null};
    try {
      const value = parseJSON(raw, MAX_BYTES * 2 + 2048);
      fields(value, ['format', 'recordVersion', 'previous', 'candidate']);
      if (value.format !== 'ember-mage-restore-point' || value.recordVersion !== 1) throw new Error();
      for (const entry of [value.previous, value.candidate]) {
        if (entry === null) continue;
        fields(entry, ['marker', 'raw']);
        if (!textValue(entry.marker, 128)) throw new Error();
        decode(entry.raw);
      }
      if (!value.candidate) throw new Error();
      return {raw, value};
    } catch { return {raw, value: null}; }
  }

  function selectedRestore(record, mainRecord = optional(expectedMain)) {
    if (!record.value) return null;
    const entry = mainRecord
      ? (mainRecord.envelope.restorePointId === record.value.candidate.marker
        ? record.value.candidate : record.value.previous)
      : record.value.candidate;
    return entry ? {...decode(entry.raw), pointMarker: entry.marker, source: 'restore-point'} : null;
  }

  function backups(mainRecord = optional(expectedMain)) {
    const auto = optional(read(SAVE_KEYS.backup));
    const restore = selectedRestore(restoreRecord(), mainRecord);
    status.hasRestorePoint = Boolean(restore);
    status.hasBackup = Boolean(auto || restore);
    status.hasRejected = read(SAVE_KEYS.rejected) !== null;
    return {auto, restore};
  }

  function archive(raw, reason) {
    if (raw === null) return;
    const previous = read(SAVE_KEYS.rejected);
    let value = {archiveVersion: 1, entries: []};
    if (previous !== null) {
      try {
        value = parseJSON(previous, MAX_BYTES * 8 + 8192);
        fields(value, ['archiveVersion', 'entries']);
        if (value.archiveVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 8
            || value.entries.some(entry => !plain(entry) || !integer(entry.savedAt)
              || typeof entry.reason !== 'string' || typeof entry.raw !== 'string')) throw new Error();
      } catch { throw error('ARCHIVE_INVALID', '已保留原始档的记录无法读取，未覆盖它或主档。'); }
    }
    if (value.entries.some(entry => entry.raw === raw)) return;
    if (value.entries.length >= 8) throw error('ARCHIVE_FULL', '原始档保留区已满；未替换主档，请导出原始文件。');
    const next = JSON.stringify({...value, entries: [...value.entries, {savedAt: timestamp(), reason, raw}]});
    if (bytes(next).length > MAX_BYTES * 8 + 8192) throw error('ARCHIVE_FULL', '原始文件过大，无法可靠保留；未替换主档。');
    write(SAVE_KEYS.rejected, next);
    status.hasRejected = true;
  }

  function stageRestore(old, nextMarker) {
    const previousRecord = restoreRecord();
    // Explicit replacement may repair a damaged point only after preserving
    // its original bytes. Failure to archive leaves the main and point intact.
    if (previousRecord.raw !== null && !previousRecord.value) {
      archive(previousRecord.raw, 'invalid-restore-point');
    }
    const selected = selectedRestore(previousRecord);
    const previous = selected ? {marker: selected.pointMarker, raw: selected.raw} : null;
    const raw = JSON.stringify({format: 'ember-mage-restore-point', recordVersion: 1, previous,
      candidate: {marker: nextMarker, raw: old.raw}});
    write(SAVE_KEYS.restorePoint, raw);
    return raw;
  }

  function commit(raw, restoreStage = null) {
    checkMain();
    if (restoreStage !== null && read(SAVE_KEYS.restorePoint) !== restoreStage) {
      throw error('REVISION_CONFLICT', '另一页面已变更恢复点，已拒绝覆盖角色。');
    }
    const old = expectedMain;
    try { write(SAVE_KEYS.main, raw); }
    catch (value) {
      // Web Storage setItem is atomic on an exception. A failed read-back may
      // follow a successful write: restore the known previous main if possible.
      try {
        const actual = store.getItem(SAVE_KEYS.main);
        if (actual === raw) {
          if (old === null) {
            if (typeof store.removeItem !== 'function') throw new Error();
            store.removeItem(SAVE_KEYS.main);
          } else store.setItem(SAVE_KEYS.main, old);
          if (store.getItem(SAVE_KEYS.main) !== old) throw new Error();
        } else if (actual !== old) throw new Error();
      } catch {
        protection = 'uncertain';
        throw error('COMMIT_UNCONFIRMED', '无法确认或撤回主档提交；可靠旧档仍已保留，请先导出并重新读取。');
      }
      throw value;
    }
    expectedMain = raw;
    expectedLegacy = null;
    current = decode(raw);
    currentData = validateData(current.data);
    protection = null;
    update('SAVED', '角色已保存在本机。', {canSave: true, source: 'primary'});
  }

  function opFailure(value) {
    update(value.code || 'INVALID_SAVE', value.message, {canSave: false});
    return failure(value);
  }

  function requireLoaded() {
    if (!initialized) throw error('NOT_LOADED', '请先读取本机存档。');
    requireStorage();
    if (['conflict', 'uncertain', 'unavailable'].includes(protection)) {
      throw error('WRITE_PROTECTED', '存档状态已变更或无法确认，请先导出并重新读取。');
    }
  }

  function load() {
    initialized = true;
    current = null;
    currentData = validateData(DEFAULT_DATA);
    protection = null;
    expectedLegacy = null;
    try {
      expectedMain = read(SAVE_KEYS.main);
      let problem = null;
      if (expectedMain !== null) {
        try { current = decode(expectedMain); }
        catch (value) { problem = value; }
      }
      // Auxiliary storage may fail after the main character was decoded. Keep
      // that character in memory, and block writes until a complete reload.
      if (current) currentData = validateData(current.data);
      const available = backups(current);
      if (current) {
        currentData = validateData(current.data);
        update('LOADED', '已读取本机角色。', {source: 'primary', canSave: true});
        return {ok: true, data: validateData(currentData), source: 'primary', code: status.code,
          message: status.message, metadata: metadata(current, 'primary')};
      }
      if (problem?.code === 'FUTURE_VERSION') {
        protection = 'future';
        update(problem.code, problem.message, {source: 'future', canSave: false});
        return failure(problem, {data: validateData(currentData), source: 'future'});
      }
      const fallback = available.auto || available.restore;
      if (fallback) {
        currentData = validateData(fallback.data);
        protection = 'backup';
        const source = available.auto ? 'backup' : 'restore-point';
        update('BACKUP_FALLBACK', '已读取可靠备份，自动保存已保护；确认恢复后才能替换主档。', {source, canSave: false});
        return {ok: true, data: validateData(currentData), source, code: status.code, message: status.message,
          metadata: metadata(fallback, source)};
      }
      if (expectedMain !== null) {
        protection = 'corrupt';
        update(problem.code, '主存档损坏且无可靠备份，已禁止自动覆盖；可导出原文件或导入合法角色。',
          {source: 'default', canSave: false});
        return failure(problem, {data: validateData(currentData), source: 'default', message: status.message});
      }
      expectedLegacy = read(SAVE_KEYS.legacy);
      if (expectedLegacy !== null) {
        let legacy;
        try { legacy = decode(expectedLegacy, true); }
        catch (value) {
          protection = 'legacy-invalid';
          update(value.code, '旧存档无效，已保留原文并禁止自动覆盖。', {source: 'default', canSave: false});
          return failure(value, {data: validateData(currentData), source: 'default', message: status.message});
        }
        currentData = validateData(legacy.data);
        const backupRaw = make(legacy.data, 0);
        const primaryRaw = make(legacy.data, 1);
        try {
          checkMain();
          write(SAVE_KEYS.backup, backupRaw);
          status.hasBackup = true;
          commit(primaryRaw);
          update('MIGRATED', '旧角色已备份并迁移，旧存档键保持原样。', {source: 'legacy', canSave: true});
          return {ok: true, data: validateData(currentData), source: 'legacy', code: status.code,
            message: status.message, metadata: metadata(current, 'legacy')};
        } catch (value) {
          protection = protection || 'migration-pending';
          update(value.code, '旧角色仍可继续；迁移未提交，请先导出角色。', {source: 'legacy', canSave: false});
          return failure(value, {data: validateData(currentData), source: 'legacy', message: status.message});
        }
      }
      expectedLegacy = null;
      update('EMPTY', '尚无本机存档，可开始新角色。', {source: 'empty', canSave: true});
      return {ok: true, data: validateData(currentData), source: 'empty', code: status.code, message: status.message};
    } catch (value) {
      protection = 'unavailable';
      update(value.code, value.message, {source: 'unavailable', canSave: false});
      return failure(value, {data: validateData(currentData), source: 'unavailable'});
    }
  }

  function save(data) {
    try {
      const valid = validateData(data);
      requireLoaded();
      if (['future', 'backup', 'corrupt', 'legacy-invalid'].includes(protection)) {
        throw error('WRITE_PROTECTED', '当前主档受保护；请明确恢复备份或确认导入，自动保存不会覆盖。');
      }
      checkMain();
      const previous = optional(expectedMain);
      const revision = previous ? previous.envelope.revision + 1 : 1;
      if (!integer(revision)) throw error('REVISION_LIMIT', '存档修订已达边界，未覆盖原文件。');
      const raw = make(valid, revision, previous?.envelope.restorePointId ?? null);
      if (previous) write(SAVE_KEYS.backup, previous.raw);
      else if (expectedLegacy !== null) write(SAVE_KEYS.backup, make(decode(expectedLegacy, true).data, 0));
      commit(raw);
      backups(current);
      return {ok: true, code: status.code, message: status.message};
    } catch (value) { return opFailure(value); }
  }

  function previewImport(raw) {
    try {
      const record = decode(raw, true);
      return {ok: true, data: validateData(record.data), source: record.source, code: 'IMPORT_PREVIEW',
        message: '存档校验通过，确认后才会替换当前角色。', metadata: metadata(record, record.source)};
    } catch (value) { return failure(value); }
  }

  function replacement(data, mode, selected = null, previousCharacter = null) {
    requireLoaded();
    checkMain();
    const previous = optional(expectedMain);
    const available = backups(previous);
    // A corrupt legacy key remains untouched, but must not block the user's
    // explicitly confirmed import of a valid external recovery file.
    const old = previousCharacter !== null
      ? {data: validateData(previousCharacter), envelope: null}
      : previous || available.auto || available.restore
        || optional(expectedLegacy, true) || {data: currentData, envelope: null};
    const revision = (previous?.envelope.revision || 0) + 1;
    if (!integer(revision)) throw error('REVISION_LIMIT', '存档修订已达边界，未替换。');
    const nextMarker = `r-${revision}-${timestamp()}-${hash(JSON.stringify(data))}-${++markerCounter}`;
    const raw = make(data, revision, nextMarker);
    const oldRecord = old.envelope ? old : {...old, raw: make(old.data, 0)};
    if (expectedMain !== null && !previous) archive(expectedMain, protection || 'invalid-main');
    const staged = stageRestore(oldRecord, nextMarker);
    commit(raw, staged);
    update(mode === 'recover' ? 'RECOVERED' : 'IMPORTED', mode === 'recover'
      ? '备份已恢复；被替换的合法角色保留为手动恢复点。' : '角色已导入；旧角色保留为手动恢复点。',
    {source: 'primary', canSave: true, hasBackup: true, hasRestorePoint: true});
    return {ok: true, data: validateData(currentData), code: status.code, message: status.message,
      ...(selected ? {source: selected.source} : {})};
  }

  function importSave(raw, previousCharacter = null) {
    const preview = previewImport(raw);
    if (!preview.ok) return preview;
    try { return replacement(preview.data, 'import', null, previousCharacter); }
    catch (value) { return opFailure(value); }
  }

  function previewBackup() {
    try {
      requireLoaded();
      const available = backups(optional(read(SAVE_KEYS.main)));
      const record = available.restore || available.auto;
      if (!record) throw error('NO_BACKUP', '没有通过校验的可恢复备份。');
      const source = available.restore ? 'restore-point' : 'backup';
      return {ok: true, data: validateData(record.data), source, code: 'BACKUP_PREVIEW',
        message: source === 'restore-point' ? '这是手动替换前保留的旧角色。' : '这是最近一次普通保存前的角色。',
        metadata: metadata(record, source)};
    } catch (value) { return failure(value); }
  }

  function recoverBackup(previousCharacter = null) {
    const preview = previewBackup();
    if (!preview.ok) return preview;
    try { return replacement(preview.data, 'recover', {source: preview.source}, previousCharacter); }
    catch (value) { return opFailure(value); }
  }

  function exportSave(data) {
    return make(validateData(data), current?.envelope.revision || 0, current?.envelope.restorePointId ?? null);
  }

  function exportStoredSave(source = 'primary') {
    try {
      if (!['primary', 'rejected', 'restore-point', 'legacy'].includes(source)) {
        throw error('INVALID_SOURCE', '原始档导出来源无效。');
      }
      let content;
      if (source === 'rejected') {
        const raw = read(SAVE_KEYS.rejected);
        if (raw === null) throw error('NO_STORED_SAVE', '没有保留的原始主档。');
        const value = parseJSON(raw, MAX_BYTES * 8 + 8192);
        if (!plain(value) || value.archiveVersion !== 1 || !Array.isArray(value.entries)) throw new Error();
        content = value.entries.at(-1)?.raw;
      } else if (source === 'restore-point') content = selectedRestore(restoreRecord())?.raw;
      else content = read(source === 'legacy' ? SAVE_KEYS.legacy : SAVE_KEYS.main);
      if (typeof content !== 'string') throw error('NO_STORED_SAVE', '没有可导出的原始存档。');
      return {ok: true, content, source, code: 'EXPORTED_STORED', message: '已读取原始文件，未改写存储。'};
    } catch (value) { return failure(value); }
  }

  return {load, save, previewImport, importSave, exportSave, previewBackup, recoverBackup,
    exportStoredSave, getStatus: () => ({...status})};
}
