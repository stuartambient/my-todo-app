import { beforeEach, expect, jest, test } from '@jest/globals';

const mockDatabase = {
    closeAsync: jest.fn<() => Promise<void>>(),
    execAsync: jest.fn<(sql: string) => Promise<void>>(),
};
const mockOpen = jest.fn<() => Promise<typeof mockDatabase>>();
const mockInitialize = jest.fn<() => Promise<void>>();
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: mockOpen }));
jest.mock('../initializeConnection', () => ({
    initializeConnection: mockInitialize,
}));
beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockOpen.mockResolvedValue(mockDatabase);
    mockInitialize.mockResolvedValue(undefined);
    mockDatabase.closeAsync.mockResolvedValue(undefined);
    mockDatabase.execAsync.mockResolvedValue(undefined);
});
test('concurrent callers share one initialization on a dedicated connection', async () => {
    const { getDatabase } =
        jest.requireActual<typeof import('../database')>('../database');
    const first = getDatabase();
    expect(getDatabase()).toBe(first);
    expect(await first).toBe(mockDatabase);
    expect(mockOpen).toHaveBeenCalledWith('todo.db', {
        useNewConnection: true,
    });
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockDatabase.execAsync).toHaveBeenCalledWith(
        'PRAGMA busy_timeout = 5000;',
    );
    expect(mockDatabase.closeAsync).not.toHaveBeenCalled();
});
test('failed initialization closes its handle and a later request opens a fresh connection', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockInitialize.mockRejectedValueOnce(new Error('database is locked'));
    const { getDatabase } =
        jest.requireActual<typeof import('../database')>('../database');
    await expect(getDatabase()).rejects.toThrow('database is locked');
    expect(mockDatabase.closeAsync).toHaveBeenCalledTimes(1);
    expect(await getDatabase()).toBe(mockDatabase);
    expect(mockOpen).toHaveBeenCalledTimes(2);
    log.mockRestore();
});
