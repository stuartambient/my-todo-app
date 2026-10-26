import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
    DATABASE_VERSION,
    initializeConnection,
    isDatabaseLock,
} from '../initializeConnection';
import { INITIAL_SCHEMA, migrateDatabase } from '../migrations';
import { seedDatabase } from '../seed';

jest.mock('../migrations', () => ({
    INITIAL_SCHEMA: 'CREATE TABLE setup_test (id TEXT);',
    migrateDatabase: jest.fn(),
}));
jest.mock('../seed', () => ({ seedDatabase: jest.fn() }));
const exec = jest.fn<(sql: string) => Promise<void>>();
const read = jest.fn<(sql: string) => Promise<unknown>>();
const database = {
    execAsync: exec,
    getFirstAsync: read,
} as unknown as SQLiteDatabase;
let version = 0;
beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    version = 0;
    exec.mockImplementation(async (sql) => {
        if (sql.startsWith('PRAGMA user_version =')) version = DATABASE_VERSION;
    });
    read.mockImplementation(async (sql) =>
        sql === 'PRAGMA user_version'
            ? { user_version: version }
            : { journal_mode: 'wal' },
    );
    jest.mocked(migrateDatabase).mockResolvedValue(undefined);
    jest.mocked(seedDatabase).mockResolvedValue(undefined);
});
afterEach(() => {
    jest.useRealTimers();
});

test('up-to-date startup does not run DDL, migrations, seed inserts or a write transaction', async () => {
    version = DATABASE_VERSION;
    await initializeConnection(database);
    expect(exec.mock.calls).toEqual([
        ['PRAGMA busy_timeout = 1000; PRAGMA foreign_keys = ON;'],
    ]);
    expect(migrateDatabase).not.toHaveBeenCalled();
    expect(seedDatabase).not.toHaveBeenCalled();
});
test('schema and seeds upgrade in one writer transaction before publishing the version', async () => {
    await initializeConnection(database);
    expect(exec.mock.calls.map(([sql]) => sql)).toEqual([
        'PRAGMA busy_timeout = 1000; PRAGMA foreign_keys = ON;',
        'BEGIN IMMEDIATE',
        INITIAL_SCHEMA,
        `PRAGMA user_version = ${DATABASE_VERSION};`,
        'COMMIT',
    ]);
    expect(migrateDatabase).toHaveBeenCalledWith(database);
    expect(seedDatabase).toHaveBeenCalledWith(database);
    expect(exec.mock.invocationCallOrder[1]).toBeLessThan(
        read.mock.invocationCallOrder[2],
    );
});
test('does not rerun upgrades if another runtime upgraded while waiting for the writer', async () => {
    read.mockResolvedValueOnce({ user_version: 0 })
        .mockResolvedValueOnce({ journal_mode: 'wal' })
        .mockResolvedValueOnce({ user_version: DATABASE_VERSION });
    await initializeConnection(database);
    expect(exec).toHaveBeenCalledWith('BEGIN IMMEDIATE');
    expect(exec).toHaveBeenCalledWith('COMMIT');
    expect(migrateDatabase).not.toHaveBeenCalled();
    expect(seedDatabase).not.toHaveBeenCalled();
});
test('temporary writer contention retries setup after yielding', async () => {
    let blocked = true;
    exec.mockImplementation(async (sql) => {
        if (sql === 'BEGIN IMMEDIATE' && blocked) {
            blocked = false;
            throw new Error('database is locked');
        }
    });
    const setup = initializeConnection(database);
    await jest.runAllTimersAsync();
    await setup;
    expect(
        exec.mock.calls.filter(([sql]) => sql === 'BEGIN IMMEDIATE'),
    ).toHaveLength(2);
    expect(exec).not.toHaveBeenCalledWith('ROLLBACK');
    expect(seedDatabase).toHaveBeenCalledTimes(1);
});
test('lock during migration rolls back before retrying the complete transaction', async () => {
    jest.mocked(migrateDatabase)
        .mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked'))
        .mockResolvedValueOnce(undefined);
    const setup = initializeConnection(database);
    await jest.runAllTimersAsync();
    await setup;
    const calls = exec.mock.calls.map(([sql]) => sql);
    expect(calls.indexOf('ROLLBACK')).toBeLessThan(
        calls.lastIndexOf('BEGIN IMMEDIATE'),
    );
    expect(migrateDatabase).toHaveBeenCalledTimes(2);
    expect(seedDatabase).toHaveBeenCalledTimes(1);
});
test('persistent contention is bounded and reports the failing phase', async () => {
    exec.mockImplementation(async (sql) => {
        if (sql === 'BEGIN IMMEDIATE') throw new Error('database is locked');
    });
    const result = initializeConnection(database).catch(
        (error: unknown) => error,
    );
    await jest.runAllTimersAsync();
    expect(await result).toEqual(
        expect.objectContaining({
            message: expect.stringContaining('upgrade lock'),
        }),
    );
    expect(
        exec.mock.calls.filter(([sql]) => sql === 'BEGIN IMMEDIATE'),
    ).toHaveLength(5);
});
test('non-lock failures roll back and propagate without being retried', async () => {
    jest.mocked(seedDatabase).mockRejectedValueOnce(new Error('disk is full'));
    await expect(initializeConnection(database)).rejects.toThrow(
        'default todo types',
    );
    expect(exec).toHaveBeenCalledWith('ROLLBACK');
    expect(exec).not.toHaveBeenCalledWith('COMMIT');
    expect(exec).not.toHaveBeenCalledWith(
        `PRAGMA user_version = ${DATABASE_VERSION};`,
    );
    expect(seedDatabase).toHaveBeenCalledTimes(1);
});
test('a failed rollback aborts the connection rather than retrying an uncertain transaction', async () => {
    jest.mocked(seedDatabase).mockRejectedValueOnce(
        new Error('database is locked'),
    );
    exec.mockImplementation(async (sql) => {
        if (sql === 'ROLLBACK') throw new Error('closed');
    });
    await expect(initializeConnection(database)).rejects.toThrow(
        'during rollback',
    );
    expect(seedDatabase).toHaveBeenCalledTimes(1);
});
test('initial journal mode is enabled before starting the upgrade transaction', async () => {
    read.mockImplementation(async (sql) =>
        sql === 'PRAGMA user_version'
            ? { user_version: 0 }
            : { journal_mode: 'delete' },
    );
    await initializeConnection(database);
    const calls = exec.mock.calls.map(([sql]) => sql);
    expect(calls.indexOf('PRAGMA journal_mode = WAL;')).toBeLessThan(
        calls.indexOf('BEGIN IMMEDIATE'),
    );
});
test('does not downgrade a future schema version', async () => {
    version = DATABASE_VERSION + 1;
    await expect(initializeConnection(database)).rejects.toThrow(
        'newer version',
    );
    expect(exec).not.toHaveBeenCalledWith('BEGIN IMMEDIATE');
});
test('recognizes SQLite contention without retrying corruption or arbitrary failures', () => {
    expect(isDatabaseLock(new Error('database is locked'))).toBe(true);
    expect(isDatabaseLock(new Error('database table is locked'))).toBe(true);
    expect(isDatabaseLock(new Error('SQLITE_BUSY_SNAPSHOT'))).toBe(true);
    expect(isDatabaseLock(new Error('database disk image is malformed'))).toBe(
        false,
    );
    expect(isDatabaseLock(new Error('disk is full'))).toBe(false);
});
