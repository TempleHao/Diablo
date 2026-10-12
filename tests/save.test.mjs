import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSaveManager, SAVE_KEYS } from '../dist/save.js';

const legacyRaw = readFileSync(new URL('./fixtures/legacy-v0.2.0.json', import.meta.url), 'utf8');
const legacy = JSON.parse(legacyRaw);
const fixedNow = 1_797_000_000_000;

class MapStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
    this.operations = [];
    this.failGet = new Set();
    this.failSet = new Set();
    this.failRemove = new Set();
    this.failureName = 'QuotaExceededError';
  }

  getItem(key) {
    this.operations.push({ type: 'get', key });
    if (this.failGet.has(key)) throw this.failure();
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.operations.push({ type: 'set', key });
    if (this.failSet.has(key)) throw this.failure();
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.operations.push({ type: 'remove', key });
    if (this.failRemove.has(key)) throw this.failure();
    this.values.delete(key);
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  get length() {
    return this.values.size;
  }

  failure() {
    return Object.assign(new Error('Injected storage failure'), { name: this.failureName });
  }

  snapshot() {
    return [...this.values.entries()].sort(([a], [b]) => a.localeCompare(b));
  }

  writes() {
    return this.operations.filter(({ type }) => type !== 'get');
  }
}

const clone = (value) => structuredClone(value);
const character = (level = legacy.level) => ({ ...clone(legacy), level, xp: 100 + level, clears: level });
const managerFor = (storage) => createSaveManager({ storage, now: () => fixedNow });

function encoded(data = legacy) {
  const manager = managerFor(new MapStorage());
  manager.load();
  return manager.exportSave(data);
}

function loadedPrimary(data = legacy) {
  const raw = encoded(data);
  const storage = new MapStorage([[SAVE_KEYS.main, raw]]);
  const manager = managerFor(storage);
  const loaded = manager.load();
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.data, data);
  return { storage, manager, raw };
}

function assertFailure(result) {
  assert.equal(result.ok, false);
  assert.equal(typeof result.code, 'string');
  assert.equal(typeof result.message, 'string');
}

function storedCharacter(storage) {
  return managerFor(storage).load().data;
}

test('migrates the real 0.2.0 fixture while preserving the original legacy bytes', () => {
  const storage = new MapStorage([[SAVE_KEYS.legacy, legacyRaw]]);
  const manager = managerFor(storage);

  const result = manager.load();

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, legacy);
  assert.equal(storage.values.get(SAVE_KEYS.legacy), legacyRaw);
  assert.equal(manager.getStatus().canSave, true);
  assert.equal(manager.getStatus().hasBackup, true);
  assert.deepEqual(manager.previewBackup().data, legacy);

  const envelope = JSON.parse(storage.values.get(SAVE_KEYS.main));
  assert.equal(envelope.schemaVersion, 2);
  assert.deepEqual(envelope.data, legacy);
  for (const key of ['format', 'revision', 'savedAt', 'restorePointId', 'checksum']) {
    assert.equal(Object.hasOwn(envelope, key), true, `missing envelope field ${key}`);
  }
  assert.deepEqual(managerFor(storage).load().data, legacy);
});

test('does not commit a legacy migration when its backup cannot be written', () => {
  const storage = new MapStorage([[SAVE_KEYS.legacy, legacyRaw]]);
  storage.failSet.add(SAVE_KEYS.backup);
  const manager = managerFor(storage);

  manager.load();

  assert.equal(storage.values.get(SAVE_KEYS.legacy), legacyRaw);
  assert.equal(storage.values.has(SAVE_KEYS.main), false);
  assert.equal(manager.getStatus().canSave, false);
  assertFailure(manager.save(character(8)));
});

test('round-trips a level 100 legacy character without clipping its large XP', () => {
  const data = { ...character(100), xp: 987_654_321 };
  const raw = JSON.stringify(data);
  const storage = new MapStorage([[SAVE_KEYS.legacy, raw]]);
  const manager = managerFor(storage);

  assert.deepEqual(manager.load().data, data);
  assert.equal(manager.save(data).ok, true);
  assert.equal(storage.values.get(SAVE_KEYS.legacy), raw);
  assert.deepEqual(managerFor(storage).load().data, data);
  assert.deepEqual(manager.previewImport(manager.exportSave(data)).data, data);
});

test('accepts the full 60-wand inventory and keeps equipped references intact', () => {
  const data = character();
  data.items = Array.from({ length: 60 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: `测试法杖${index}`,
    rarity: index % 3,
    power: 18 + index,
  }));
  data.equipped = data.items[59].id;
  const { manager, storage } = loadedPrimary();

  assert.equal(manager.save(data).ok, true);
  assert.deepEqual(storedCharacter(storage), data);
});

const invalidCharacters = [
  ['string level', (data) => { data.level = '7'; }],
  ['level below one', (data) => { data.level = 0; }],
  ['level above 100', (data) => { data.level = 101; }],
  ['fractional level', (data) => { data.level = 7.5; }],
  ['non-finite level', (data) => { data.level = Infinity; }],
  ['negative XP', (data) => { data.xp = -1; }],
  ['string XP', (data) => { data.xp = '123'; }],
  ['NaN XP', (data) => { data.xp = NaN; }],
  ['infinite XP', (data) => { data.xp = Infinity; }],
  ['string clears', (data) => { data.clears = '3'; }],
  ['non-finite clears', (data) => { data.clears = Infinity; }],
  ['non-array inventory', (data) => { data.items = {}; }],
  ['null wand', (data) => { data.items[0] = null; }],
  ['numeric item ID', (data) => { data.items[0].id = 123; }],
  ['non-string wand name', (data) => { data.items[0].name = {}; }],
  ['string wand rarity', (data) => { data.items[0].rarity = '1'; }],
  ['non-finite wand power', (data) => { data.items[0].power = Infinity; }],
  ['duplicate item IDs', (data) => { data.items[1].id = data.items[0].id; }],
  ['missing equipped item', (data) => { data.equipped = 'missing-item'; }],
  ['missing equipped field', (data) => { delete data.equipped; }],
  ['61 wands', (data) => {
    data.items = Array.from({ length: 61 }, (_, index) => ({
      ...clone(legacy.items[0]),
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }));
    data.equipped = data.items[0].id;
  }],
];

test('rejects invalid character data without touching a good primary', async (t) => {
  for (const [name, invalidate] of invalidCharacters) {
    await t.test(name, () => {
      const { storage, manager } = loadedPrimary();
      const data = clone(legacy);
      invalidate(data);
      const before = storage.snapshot();

      assertFailure(manager.save(data));
      assertFailure(manager.previewImport(JSON.stringify(data)));
      assertFailure(manager.importSave(JSON.stringify(data)));
      assert.throws(() => manager.exportSave(data), (error) => typeof error.code === 'string');
      assert.deepEqual(storage.snapshot(), before);
      assert.deepEqual(storedCharacter(storage), legacy);
    });
  }
});

test('rejects malformed and oversized imports with no storage writes', () => {
  const { storage, manager } = loadedPrimary();
  const before = storage.snapshot();
  const writesBefore = storage.writes().length;
  const oversized = `${' '.repeat(4 * 1024 * 1024)}${encoded(character(8))}`;

  for (const raw of ['{bad JSON', 'null', '[]', oversized]) {
    assertFailure(manager.previewImport(raw));
    assertFailure(manager.importSave(raw));
  }

  assert.equal(storage.writes().length, writesBefore);
  assert.deepEqual(storage.snapshot(), before);
});

test('detects payload tampering using an envelope produced by exportSave', () => {
  const { storage, manager } = loadedPrimary();
  const envelope = JSON.parse(manager.exportSave(character(8)));
  envelope.data.xp += 1;
  const tampered = JSON.stringify(envelope);
  const before = storage.snapshot();

  assertFailure(manager.previewImport(tampered));
  assertFailure(manager.importSave(tampered));
  assert.deepEqual(storage.snapshot(), before);
});

test('previewImport and previewBackup are read-only even when their content is valid', () => {
  const { storage, manager } = loadedPrimary(character(5));
  assert.equal(manager.importSave(encoded(legacy)).ok, true);
  storage.values.set(SAVE_KEYS.backup, encoded(character(6)));
  const before = storage.snapshot();
  const writesBefore = storage.writes().length;

  const imported = manager.previewImport(encoded(character(8)));
  const backup = manager.previewBackup();

  assert.equal(imported.ok, true);
  assert.deepEqual(imported.data, character(8));
  assert.equal(backup.ok, true);
  assert.deepEqual(backup.data, character(5));
  assert.equal(storage.writes().length, writesBefore);
  assert.deepEqual(storage.snapshot(), before);
});

test('ordinary save refuses to commit if backing up the current primary fails', () => {
  const { storage, manager, raw } = loadedPrimary();
  storage.failSet.add(SAVE_KEYS.backup);

  assertFailure(manager.save(character(8)));

  assert.equal(storage.values.get(SAVE_KEYS.main), raw);
  assert.deepEqual(storedCharacter(storage), legacy);
});

test('a quota failure on the primary write never destroys the previous primary', () => {
  const { storage, manager, raw } = loadedPrimary();
  storage.failSet.add(SAVE_KEYS.main);

  assertFailure(manager.save(character(8)));

  assert.equal(storage.values.get(SAVE_KEYS.main), raw);
  assert.deepEqual(storedCharacter(storage), legacy);
  assert.deepEqual(manager.previewBackup().data, legacy);
});

test('storage read failures leave a good primary untouched and disable unsafe saving', () => {
  const { storage, raw } = loadedPrimary();
  const before = storage.snapshot();
  const writesBefore = storage.writes().length;
  storage.failureName = 'SecurityError';
  storage.failGet.add(SAVE_KEYS.main);
  const manager = managerFor(storage);

  assert.doesNotThrow(() => manager.load());
  assert.equal(manager.getStatus().canSave, false);
  assert.equal(manager.getStatus().canImport, false);
  assertFailure(manager.save(character(8)));
  assert.equal(storage.values.get(SAVE_KEYS.main), raw);
  assert.equal(storage.writes().length, writesBefore);
  assert.deepEqual(storage.snapshot(), before);
});

test('storage=null supports inspection and export without pretending it can persist', () => {
  const manager = managerFor(null);

  assert.doesNotThrow(() => manager.load());
  assert.equal(manager.getStatus().canSave, false);
  assert.equal(manager.getStatus().canImport, false);
  assertFailure(manager.save(legacy));
  assertFailure(manager.importSave(encoded(legacy)));
  assertFailure(manager.recoverBackup());
  assertFailure(manager.exportStoredSave());
  assert.equal(typeof manager.exportSave(legacy), 'string');
});

test('a damaged primary falls back read-only until recovery is explicitly committed', () => {
  const damaged = '{damaged primary';
  const storage = new MapStorage([
    [SAVE_KEYS.main, damaged],
    [SAVE_KEYS.backup, encoded(legacy)],
  ]);
  const manager = managerFor(storage);
  const before = storage.snapshot();

  assert.deepEqual(manager.load().data, legacy);
  assert.equal(manager.getStatus().canSave, false);
  assert.equal(manager.getStatus().canImport, true);
  assert.equal(manager.getStatus().hasBackup, true);
  assert.deepEqual(storage.snapshot(), before);
  assert.equal(storage.writes().length, 0);
  assertFailure(manager.save(character(8)));
  assert.equal(manager.exportStoredSave().content, damaged);
  assert.deepEqual(manager.previewBackup().data, legacy);
  assert.deepEqual(storage.snapshot(), before);

  const recovered = manager.recoverBackup();
  assert.equal(recovered.ok, true);
  assert.deepEqual(recovered.data, legacy);
  assert.deepEqual(storedCharacter(storage), legacy);
  assert.equal(manager.getStatus().canSave, true);
  assert.equal(manager.save(character(8)).ok, true);
  assert.deepEqual(storedCharacter(storage), character(8));
});

function futurePrimary() {
  const envelope = JSON.parse(encoded(character(50)));
  envelope.schemaVersion = 999;
  return JSON.stringify(envelope);
}

test('future-schema imports cannot overwrite a valid current character', () => {
  const { storage, manager } = loadedPrimary();
  const before = storage.snapshot();

  assertFailure(manager.previewImport(futurePrimary()));
  assertFailure(manager.importSave(futurePrimary()));

  assert.deepEqual(storage.snapshot(), before);
  assert.deepEqual(storedCharacter(storage), legacy);
});

test('a future primary is protected until explicit recovery archives its original bytes', () => {
  const future = futurePrimary();
  const storage = new MapStorage([
    [SAVE_KEYS.main, future],
    [SAVE_KEYS.backup, encoded(legacy)],
  ]);
  const manager = managerFor(storage);
  const before = storage.snapshot();

  manager.load();
  assert.equal(manager.getStatus().canSave, false);
  assert.equal(manager.getStatus().canImport, true);
  assertFailure(manager.save(character(8)));
  assert.deepEqual(storage.snapshot(), before);
  assert.equal(storage.writes().length, 0);
  assert.equal(manager.exportStoredSave('primary').content, future);

  const recovered = manager.recoverBackup();
  assert.equal(recovered.ok, true);
  assert.deepEqual(recovered.data, legacy);
  assert.deepEqual(storedCharacter(storage), legacy);
  const archived = manager.exportStoredSave('rejected');
  assert.equal(archived.ok, true);
  assert.equal(archived.content, future);
  assert.equal(manager.getStatus().hasRejected, true);
});

test('explicit legacy-file import can replace a future primary only after archiving its original bytes', () => {
  const future = futurePrimary();
  const storage = new MapStorage([[SAVE_KEYS.main, future]]);
  const manager = managerFor(storage);
  manager.load();
  assert.equal(manager.getStatus().canSave, false);
  assert.equal(manager.getStatus().canImport, true);
  const before = storage.snapshot();
  const raw = legacyRaw;

  const preview = manager.previewImport(raw);
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.data, legacy);
  assert.deepEqual(storage.snapshot(), before);
  assert.equal(storage.writes().length, 0);

  const imported = manager.importSave(raw);
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.data, legacy);
  assert.deepEqual(storedCharacter(storage), legacy);
  assert.equal(manager.getStatus().canSave, true);
  assert.equal(manager.getStatus().canImport, true);
  const archived = manager.exportStoredSave('rejected');
  assert.equal(archived.ok, true);
  assert.equal(archived.content, future);
  assert.equal(manager.getStatus().hasRejected, true);
});

test('explicit valid import recovers a damaged primary without requiring a local backup', () => {
  const damaged = '{damaged primary without a local backup';
  const storage = new MapStorage([[SAVE_KEYS.main, damaged]]);
  const manager = managerFor(storage);
  manager.load();
  assert.equal(manager.getStatus().hasBackup, false);
  assert.equal(manager.getStatus().canSave, false);
  assert.equal(manager.getStatus().canImport, true);
  assert.equal(storage.writes().length, 0);

  const imported = manager.importSave(encoded(character(8)));

  assert.equal(imported.ok, true);
  assert.deepEqual(imported.data, character(8));
  assert.deepEqual(storedCharacter(storage), character(8));
  assert.equal(manager.getStatus().canSave, true);
  assert.equal(manager.getStatus().canImport, true);
  const archived = manager.exportStoredSave('rejected');
  assert.equal(archived.ok, true);
  assert.equal(archived.content, damaged);
});

test('protected-primary imports cannot proceed when rejected archival fails', async (t) => {
  for (const [name, original] of [
    ['future schema', futurePrimary()],
    ['damaged JSON', '{damaged protected primary'],
  ]) {
    await t.test(name, () => {
      const storage = new MapStorage([[SAVE_KEYS.main, original]]);
      const manager = managerFor(storage);
      manager.load();
      assert.equal(manager.getStatus().canSave, false);
      assert.equal(manager.getStatus().canImport, true);
      const before = storage.snapshot();
      storage.failSet.add(SAVE_KEYS.rejected);

      assertFailure(manager.importSave(encoded(character(8))));

      assert.equal(storage.values.get(SAVE_KEYS.main), original);
      assert.deepEqual(storage.snapshot(), before);
      assert.equal(manager.getStatus().canSave, false);
      assert.equal(manager.exportStoredSave('primary').content, original);
    });
  }
});

test('recovery refuses to replace a future primary when its rejected archive write fails', () => {
  const future = futurePrimary();
  const storage = new MapStorage([
    [SAVE_KEYS.main, future],
    [SAVE_KEYS.backup, encoded(legacy)],
  ]);
  const manager = managerFor(storage);
  manager.load();
  const before = storage.snapshot();
  storage.failSet.add(SAVE_KEYS.rejected);

  assertFailure(manager.recoverBackup());
  assert.deepEqual(storage.snapshot(), before);
  assert.equal(manager.getStatus().canSave, false);
  assert.deepEqual(manager.previewBackup().data, legacy);

  storage.failSet.clear();
  assert.equal(manager.recoverBackup().ok, true);
  assert.equal(manager.exportStoredSave('rejected').content, future);
});

test('two managers loaded at the same revision cannot overwrite one another', () => {
  const { storage, manager: first } = loadedPrimary();
  const second = managerFor(storage);
  second.load();

  assert.equal(first.save(character(8)).ok, true);
  const afterFirst = storage.snapshot();
  assertFailure(second.save(character(9)));
  assert.equal(second.getStatus().canSave, false);
  assert.equal(second.getStatus().canImport, false);

  assert.deepEqual(storage.snapshot(), afterFirst);
  assert.deepEqual(storedCharacter(storage), character(8));
});

test('a conflicting manual import does not alter any recovery point or archive', () => {
  const { storage, manager: first } = loadedPrimary();
  const second = managerFor(storage);
  second.load();
  assert.equal(first.importSave(encoded(character(8))).ok, true);
  const before = storage.snapshot();

  assertFailure(second.importSave(encoded(character(9))));
  assert.equal(second.getStatus().canImport, false);

  assert.deepEqual(storage.snapshot(), before);
  assert.deepEqual(first.previewBackup().data, legacy);
});

test('a conflicting recovery cannot stage over the active restore point', () => {
  const { storage, manager: first } = loadedPrimary();
  assert.equal(first.importSave(encoded(character(8))).ok, true);
  const second = managerFor(storage);
  second.load();
  assert.equal(first.save(character(9)).ok, true);
  const before = storage.snapshot();

  assertFailure(second.recoverBackup());

  assert.deepEqual(storage.snapshot(), before);
  assert.deepEqual(first.previewBackup().data, legacy);
  assert.deepEqual(storedCharacter(storage), character(9));
});

test('manual import preserves its restore point through the first ordinary save', () => {
  const { storage, manager } = loadedPrimary();
  const imported = manager.importSave(encoded(character(8)));

  assert.equal(imported.ok, true);
  assert.deepEqual(imported.data, character(8));
  assert.deepEqual(storedCharacter(storage), character(8));
  assert.equal(manager.getStatus().hasRestorePoint, true);
  assert.deepEqual(manager.previewBackup().data, legacy);
  const restorePoint = storage.values.get(SAVE_KEYS.restorePoint);
  const restoreWrites = storage.writes().filter(({ key }) => key === SAVE_KEYS.restorePoint).length;

  assert.equal(manager.save(character(9)).ok, true);
  assert.equal(storage.values.get(SAVE_KEYS.restorePoint), restorePoint);
  assert.equal(storage.writes().filter(({ key }) => key === SAVE_KEYS.restorePoint).length, restoreWrites);
  assert.deepEqual(manager.previewBackup().data, legacy);

  const restarted = managerFor(storage);
  restarted.load();
  assert.deepEqual(restarted.previewBackup().data, legacy);
});

test('explicit recovery is reversible by retaining the previous valid current character', () => {
  const { storage, manager } = loadedPrimary();
  assert.equal(manager.importSave(encoded(character(8))).ok, true);

  const firstRecovery = manager.recoverBackup();
  assert.equal(firstRecovery.ok, true);
  assert.deepEqual(firstRecovery.data, legacy);
  assert.deepEqual(storedCharacter(storage), legacy);
  assert.deepEqual(manager.previewBackup().data, character(8));

  const secondRecovery = manager.recoverBackup();
  assert.equal(secondRecovery.ok, true);
  assert.deepEqual(secondRecovery.data, character(8));
  assert.deepEqual(storedCharacter(storage), character(8));
  assert.deepEqual(manager.previewBackup().data, legacy);
});

test('failed manual-import primary write preserves the earlier restorable character', () => {
  const { storage, manager } = loadedPrimary();
  assert.equal(manager.importSave(encoded(character(8))).ok, true);
  const primaryBefore = storage.values.get(SAVE_KEYS.main);
  assert.deepEqual(manager.previewBackup().data, legacy);
  storage.failSet.add(SAVE_KEYS.main);

  assertFailure(manager.importSave(encoded(character(9))));

  assert.equal(storage.values.get(SAVE_KEYS.main), primaryBefore);
  assert.deepEqual(manager.previewBackup().data, legacy);
  const restarted = managerFor(storage);
  assert.deepEqual(restarted.load().data, character(8));
  assert.deepEqual(restarted.previewBackup().data, legacy);

  storage.failSet.clear();
  assert.equal(manager.recoverBackup().ok, true);
  assert.deepEqual(storedCharacter(storage), legacy);
  assert.deepEqual(manager.previewBackup().data, character(8));
});

test('failed recovery primary write preserves both current and existing restore-point characters', () => {
  const { storage, manager } = loadedPrimary();
  assert.equal(manager.importSave(encoded(character(8))).ok, true);
  const primaryBefore = storage.values.get(SAVE_KEYS.main);
  storage.failSet.add(SAVE_KEYS.main);

  assertFailure(manager.recoverBackup());

  assert.equal(storage.values.get(SAVE_KEYS.main), primaryBefore);
  assert.deepEqual(manager.previewBackup().data, legacy);
  const restarted = managerFor(storage);
  assert.deepEqual(restarted.load().data, character(8));
  assert.deepEqual(restarted.previewBackup().data, legacy);

  storage.failSet.clear();
  assert.equal(manager.recoverBackup().ok, true);
  assert.deepEqual(storedCharacter(storage), legacy);
  assert.deepEqual(manager.previewBackup().data, character(8));
});

test('a valid external backup repairs a damaged legacy-only character without erasing its original bytes', async (t) => {
  const damagedSources = [
    ['malformed legacy JSON', '{damaged legacy'],
    ['invalid legacy character', JSON.stringify({ ...legacy, equipped: 'missing-wand' })],
  ];

  for (const [name, damaged] of damagedSources) {
    await t.test(name, () => {
      const storage = new MapStorage([[SAVE_KEYS.legacy, damaged]]);
      const manager = managerFor(storage);

      assertFailure(manager.load());
      assert.equal(manager.getStatus().canImport, true);
      assert.equal(manager.previewImport(legacyRaw).ok, true);
      assert.equal(storage.values.get(SAVE_KEYS.legacy), damaged);

      const imported = manager.importSave(legacyRaw);

      assert.equal(imported.ok, true);
      assert.deepEqual(imported.data, legacy);
      assert.deepEqual(storedCharacter(storage), legacy);
      assert.equal(storage.values.get(SAVE_KEYS.legacy), damaged);
    });
  }
});

test('auxiliary read failures preserve the primary character and require a successful reload before any replacement', async (t) => {
  for (const key of [SAVE_KEYS.backup, SAVE_KEYS.restorePoint, SAVE_KEYS.rejected]) {
    await t.test(key, () => {
      const primary = encoded(legacy);
      const storage = new MapStorage([
        [SAVE_KEYS.main, primary],
        [SAVE_KEYS.backup, encoded(character(6))],
      ]);
      const before = storage.snapshot();
      storage.failGet.add(key);
      const manager = managerFor(storage);

      const failedLoad = manager.load();

      assertFailure(failedLoad);
      assert.deepEqual(failedLoad.data, legacy);
      assert.equal(manager.getStatus().canSave, false);
      assert.equal(manager.getStatus().canImport, false);
      assert.deepEqual(storage.snapshot(), before);

      storage.failGet.clear();
      const gainedXP = { ...clone(failedLoad.data), xp: failedLoad.data.xp + 12 };
      assertFailure(manager.save(gainedXP));
      assertFailure(manager.importSave(encoded(character(9))));
      assertFailure(manager.recoverBackup());
      assert.deepEqual(storage.snapshot(), before);

      const reloaded = manager.load();
      assert.equal(reloaded.ok, true);
      assert.deepEqual(reloaded.data, legacy);
      assert.equal(manager.save(gainedXP).ok, true);
      assert.deepEqual(storedCharacter(storage), gainedXP);
    });
  }
});

test('explicit replacement archives a damaged restore point before repairing a damaged primary', async (t) => {
  for (const mode of ['recover', 'import']) {
    await t.test(mode, () => {
      const damagedPrimary = '{damaged primary';
      const damagedPoint = '{damaged manual restore point';
      const storage = new MapStorage([
        [SAVE_KEYS.main, damagedPrimary],
        [SAVE_KEYS.backup, encoded(legacy)],
        [SAVE_KEYS.restorePoint, damagedPoint],
      ]);
      const manager = managerFor(storage);
      const before = storage.snapshot();

      assert.deepEqual(manager.load().data, legacy);
      assert.deepEqual(manager.previewBackup().data, legacy);
      const expected = mode === 'recover' ? legacy : character(9);
      const replace = () => mode === 'recover'
        ? manager.recoverBackup() : manager.importSave(encoded(expected));

      storage.failSet.add(SAVE_KEYS.rejected);
      assertFailure(replace());
      assert.deepEqual(storage.snapshot(), before);
      assert.deepEqual(manager.previewBackup().data, legacy);

      storage.failSet.clear();
      const repaired = replace();
      assert.equal(repaired.ok, true);
      assert.deepEqual(repaired.data, expected);
      assert.deepEqual(storedCharacter(storage), expected);

      const archive = JSON.parse(storage.values.get(SAVE_KEYS.rejected));
      const originals = archive.entries.map(entry => entry.raw);
      assert.ok(originals.includes(damagedPrimary), 'the replaced primary bytes must remain recoverable');
      assert.ok(originals.includes(damagedPoint), 'the replaced restore-point bytes must remain recoverable');
      assert.equal(manager.save(character(10)).ok, true);
      assert.deepEqual(storedCharacter(storage), character(10));
    });
  }
});

test('manual import preserves the paused character including growth that failed to save', () => {
  const { storage, manager, raw } = loadedPrimary();
  const unsavedWand = {
    id: '9018a541-5d32-481e-ac72-187c82c3092c',
    name: '灰木法杖',
    rarity: 0,
    power: 14,
  };
  const pausedCharacter = {
    ...clone(legacy),
    xp: legacy.xp + 24,
    items: [...clone(legacy.items), unsavedWand],
    equipped: unsavedWand.id,
  };
  storage.failSet.add(SAVE_KEYS.main);
  assertFailure(manager.save(pausedCharacter));
  assert.equal(storage.values.get(SAVE_KEYS.main), raw);

  storage.failSet.clear();
  const importedCharacter = character(9);
  const imported = manager.importSave(encoded(importedCharacter), pausedCharacter);
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.data, importedCharacter);
  assert.deepEqual(storedCharacter(storage), importedCharacter);
  assert.deepEqual(manager.previewBackup().data, pausedCharacter);

  const restarted = managerFor(storage);
  assert.deepEqual(restarted.load().data, importedCharacter);
  assert.deepEqual(restarted.previewBackup().data, pausedCharacter);
  const recovered = restarted.recoverBackup(importedCharacter);
  assert.equal(recovered.ok, true);
  assert.deepEqual(recovered.data, pausedCharacter);
  assert.deepEqual(storedCharacter(storage), pausedCharacter);
});

test('manual recovery retains unsaved growth of the replaced character and can be reversed after reload', () => {
  const { storage, manager } = loadedPrimary();
  const importedCharacter = character(8);
  assert.equal(manager.importSave(encoded(importedCharacter), legacy).ok, true);
  const primaryBeforeGrowth = storage.values.get(SAVE_KEYS.main);
  const unsavedWand = {
    id: 'd993a8e3-8c92-4f04-b516-cdeea4c9b8a2',
    name: '余烬秘杖',
    rarity: 2,
    power: 44,
  };
  const pausedCharacter = {
    ...clone(importedCharacter),
    xp: importedCharacter.xp + 12,
    items: [...clone(importedCharacter.items), unsavedWand],
    equipped: unsavedWand.id,
  };
  storage.failSet.add(SAVE_KEYS.main);
  assertFailure(manager.save(pausedCharacter));
  assert.equal(storage.values.get(SAVE_KEYS.main), primaryBeforeGrowth);

  storage.failSet.clear();
  const recovered = manager.recoverBackup(pausedCharacter);
  assert.equal(recovered.ok, true);
  assert.deepEqual(recovered.data, legacy);
  assert.deepEqual(storedCharacter(storage), legacy);
  assert.deepEqual(manager.previewBackup().data, pausedCharacter);

  const restarted = managerFor(storage);
  assert.deepEqual(restarted.load().data, legacy);
  assert.deepEqual(restarted.previewBackup().data, pausedCharacter);
  const undone = restarted.recoverBackup(legacy);
  assert.equal(undone.ok, true);
  assert.deepEqual(undone.data, pausedCharacter);
  assert.deepEqual(storedCharacter(storage), pausedCharacter);
});
