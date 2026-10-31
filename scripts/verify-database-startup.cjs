// Node 24+: real SQLite connections and a worker simulate overlapping runtimes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { Worker } = require('node:worker_threads');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-startup-'));
const connections = [];
let checks = 0;
function check(name, assertion) {
    assertion();
    checks += 1;
    console.log('PASS', name);
}
const originalLoad = Module._load;
Module._load = function (request, parent, main) {
    if (request === 'expo-crypto') return { randomUUID };
    return originalLoad.call(this, request, parent, main);
};
require.extensions['.ts'] = (module, filename) => {
    module._compile(
        ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
            },
        }).outputText,
        filename,
    );
};
const {
    initializeConnection,
    DATABASE_VERSION,
} = require('../src/database/initializeConnection.ts');
const { INITIAL_SCHEMA } = require('../src/database/migrations.ts');
class Adapter {
    constructor(filename) {
        this.db = new DatabaseSync(filename);
        this.trace = [];
        connections.push(this.db);
    }
    async execAsync(sql) {
        this.trace.push(sql);
        this.db.exec(sql);
    }
    async getFirstAsync(sql, ...params) {
        return this.db.prepare(sql).get(...params) ?? null;
    }
    async getAllAsync(sql, ...params) {
        return this.db.prepare(sql).all(...params);
    }
    async runAsync(sql, ...params) {
        const result = this.db.prepare(sql).run(...params);
        return {
            changes: Number(result.changes),
            lastInsertRowId: Number(result.lastInsertRowid),
        };
    }
}
const now = new Date().toISOString();
function insertLegacyTodo(db, typeName = 'Task') {
    db.prepare(
        'INSERT INTO todo_types (id,name,created_at,updated_at) VALUES (?,?,?,?)',
    ).run('existing-task', typeName, now, now);
    db.prepare(
        'INSERT INTO todos (id,type_id,subject,notes,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    ).run(
        'existing-todo',
        'existing-task',
        'Existing todo',
        'Preserve these notes',
        now,
        now,
    );
}
async function main() {
    const file = path.join(directory, 'healthy.db');
    const initial = new Adapter(file);
    await initializeConnection(initial);
    check(
        'fresh database commits schema version, recurrence columns, defaults and WAL together',
        () => {
            assert.equal(
                initial.db.prepare('PRAGMA user_version').get().user_version,
                DATABASE_VERSION,
            );
            assert.equal(
                initial.db.prepare('PRAGMA journal_mode').get().journal_mode,
                'wal',
            );
            assert.equal(
                initial.db.prepare('SELECT COUNT(*) AS n FROM todo_types').get()
                    .n,
                8,
            );
            assert(
                initial.db
                    .prepare('PRAGMA table_info(todos)')
                    .all()
                    .some((row) => row.name === 'recurrence_source_id'),
            );
        },
    );
    const writer = new Adapter(file);
    writer.db.exec(
        'BEGIN IMMEDIATE; UPDATE todo_notification_sync SET revision = revision + 1 WHERE id = 1;',
    );
    const oldStartup = new Adapter(file);
    oldStartup.db.exec('PRAGMA busy_timeout = 20;');
    check(
        'regression: rerunning the previous schema setup fails under an active writer',
        () =>
            assert.throws(
                () => oldStartup.db.exec(INITIAL_SCHEMA),
                /database is locked/,
            ),
    );
    const reloaded = new Adapter(file);
    await initializeConnection(reloaded);
    check(
        'current database opens during an active writer without schema or seed writes',
        () => {
            assert.equal(reloaded.trace.length, 1);
            assert(
                !reloaded.trace.some((sql) =>
                    /BEGIN|CREATE|INSERT|UPDATE/.test(sql),
                ),
            );
            assert.equal(
                reloaded.db
                    .prepare('SELECT COUNT(*) AS n FROM todo_types')
                    .get().n,
                8,
            );
        },
    );
    writer.db.exec('ROLLBACK');

    const legacyFile = path.join(directory, 'legacy.db');
    const legacy = new Adapter(legacyFile);
    legacy.db.exec('PRAGMA journal_mode = WAL;');
    legacy.db.exec(INITIAL_SCHEMA);
    insertLegacyTodo(legacy.db);
    const worker = new Worker(
        `
        const {parentPort,workerData}=require('node:worker_threads');
        const {DatabaseSync}=require('node:sqlite');
        const db=new DatabaseSync(workerData);
        db.exec('BEGIN IMMEDIATE; UPDATE todo_notification_sync SET revision=revision+1 WHERE id=1;');
        parentPort.postMessage('locked');
        setTimeout(()=>{db.exec('COMMIT');db.close();},1600);
    `,
        { eval: true, workerData: legacyFile },
    );
    const exited = new Promise((resolve, reject) => {
        worker.once('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(`worker exit ${code}`)),
        );
        worker.once('error', reject);
    });
    await new Promise((resolve, reject) => {
        worker.once('message', resolve);
        worker.once('error', reject);
    });
    const upgrade = new Adapter(legacyFile);
    await initializeConnection(upgrade);
    await exited;
    check(
        'legacy upgrade waits/retries a real competing writer, then commits once',
        () => {
            assert(
                upgrade.trace.filter((sql) => sql === 'BEGIN IMMEDIATE')
                    .length >= 2,
            );
            assert.equal(
                upgrade.db.prepare('PRAGMA user_version').get().user_version,
                DATABASE_VERSION,
            );
            assert.equal(
                upgrade.db.prepare('SELECT COUNT(*) AS n FROM todo_types').get()
                    .n,
                8,
            );
        },
    );
    check('upgrade preserves existing todo data and type IDs', () => {
        const row = upgrade.db
            .prepare('SELECT subject,notes,type_id FROM todos WHERE id=?')
            .get('existing-todo');
        assert.equal(row.subject, 'Existing todo');
        assert.equal(row.notes, 'Preserve these notes');
        assert.equal(row.type_id, 'existing-task');
    });
    // Recreate the installed version-1 schema, including stored reminders and
    // completed history, then exercise the actual in-place upgrade.
    const v1File = path.join(directory, 'version-one.db');
    const v1 = new Adapter(v1File);
    await initializeConnection(v1);
    insertLegacyTodo(v1.db, 'Custom existing type');
    v1.db
        .prepare(
            `INSERT INTO todos (id,type_id,subject,status,created_at,updated_at,completed_at) VALUES (?,?,?,'completed',?,?,?)`,
        )
        .run(
            'completed-todo',
            'existing-task',
            'Completed history',
            now,
            now,
            now,
        );
    v1.db
        .prepare(
            'INSERT INTO todos (id,type_id,subject,created_at,updated_at) VALUES (?,?,?,?,?)',
        )
        .run('undated-todo', 'existing-task', 'No due date', now, now);
    v1.db.exec(`ALTER TABLE todos DROP COLUMN recurrence_end_date;
        PRAGMA user_version = 1;
        UPDATE todos SET due_date = '2030-06-15', due_time = '23:55',
            reminder_at = '2030-06-15T20:00:00.000Z', recurrence_frequency = 'day',
            recurrence_interval = 1, recurrence_basis = 'due_date',
            recurrence_anchor_date = '2030-06-15' WHERE id = 'existing-todo';`);
    const beforeV1 = v1.db.prepare('SELECT * FROM todos ORDER BY id').all();
    const beforeTypes = v1.db
        .prepare('SELECT * FROM todo_types ORDER BY id')
        .all();
    const upgradedV1 = new Adapter(v1File);
    await initializeConnection(upgradedV1);
    check(
        'version-1 upgrade preserves every todo field and type and defaults to no end date',
        () => {
            const after = upgradedV1.db
                .prepare('SELECT * FROM todos ORDER BY id')
                .all();
            assert.deepEqual(
                after.map(({ recurrence_end_date, ...row }) => ({ ...row })),
                beforeV1.map((row) => ({ ...row })),
            );
            assert(after.every((row) => row.recurrence_end_date === null));
            assert.deepEqual(
                upgradedV1.db
                    .prepare('SELECT * FROM todo_types ORDER BY id')
                    .all(),
                beforeTypes,
            );
            assert.equal(
                upgradedV1.db.prepare('PRAGMA user_version').get().user_version,
                DATABASE_VERSION,
            );
        },
    );

    const rollback = new Adapter(path.join(directory, 'rollback.db'));
    rollback.db.exec(INITIAL_SCHEMA);
    insertLegacyTodo(rollback.db);
    rollback.db.exec(
        "CREATE TRIGGER fail_seed BEFORE INSERT ON todo_types BEGIN SELECT RAISE(ABORT,'forced seed failure'); END;",
    );
    await assert.rejects(
        () => initializeConnection(rollback),
        /forced seed failure/,
    );
    check(
        'failed upgrade rolls back schema and version without removing old todos',
        () => {
            assert.equal(
                rollback.db.prepare('PRAGMA user_version').get().user_version,
                0,
            );
            assert(
                !rollback.db
                    .prepare('PRAGMA table_info(todos)')
                    .all()
                    .some((row) => row.name === 'recurrence_basis'),
            );
            assert.equal(
                rollback.db
                    .prepare('SELECT notes FROM todos WHERE id=?')
                    .get('existing-todo').notes,
                'Preserve these notes',
            );
            assert.equal(rollback.db.isTransaction, false);
        },
    );
    rollback.db.exec('DROP TRIGGER fail_seed;');
    await initializeConnection(rollback);
    check(
        'a subsequent upgrade succeeds after a non-lock failure is corrected',
        () =>
            assert.equal(
                rollback.db.prepare('PRAGMA user_version').get().user_version,
                DATABASE_VERSION,
            ),
    );
    console.log(`${checks} database startup checks passed.`);
}
main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        for (const db of connections) db.close();
        fs.rmSync(directory, { recursive: true, force: true });
    });
