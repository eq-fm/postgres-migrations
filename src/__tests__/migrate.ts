// tslint:disable no-console
import test from "ava"
import * as pg from "pg"
import SQL from "sql-template-strings"
import {createDb, migrate, MigrateDBConfig} from "../"
import {PASSWORD, startPostgres, stopPostgres} from "./fixtures/docker-postgres"

const CONTAINER_NAME = "pg-migrations-test-migrate"

let port: number

process.on("uncaughtException", function (err) {
  console.log(err)
})

test.before(async (t) => {
  port = await startPostgres(CONTAINER_NAME)
})

test.after.always(() => {
  stopPostgres(CONTAINER_NAME)
})

test("concurrent migrations", async (t) => {
  const databaseName = "migration-test-concurrent"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  await createDb(databaseName, dbConfig)

  await migrate(dbConfig, "src/__tests__/fixtures/concurrent")

  // should deadlock if running concurrently
  await Promise.all([
    migrate(dbConfig, "src/__tests__/fixtures/concurrent-2"),
    migrate(dbConfig, "src/__tests__/fixtures/concurrent-2"),
  ])

  const exists = await doesTableExist(dbConfig, "concurrent")
  t.truthy(exists)
})

// https://github.com/ThomWright/postgres-migrations/issues/36
test("concurrent migrations - index concurrently", async (t) => {
  const databaseName = "migration-test-concurrent-no-tx"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  await createDb(databaseName, dbConfig)

  await migrate(dbConfig, "src/__tests__/fixtures/concurrent")

  // will deadlock if one process has the advisory lock and tries to index concurrently
  // while the other waits for the advisory lock
  await Promise.all([
    migrate(dbConfig, "src/__tests__/fixtures/concurrent-index-2", {
      logger: (msg) => console.log("A", msg),
    }),
    migrate(dbConfig, "src/__tests__/fixtures/concurrent-index-2", {
      logger: (msg) => console.log("B", msg),
    }),
  ])

  const exists = await doesTableExist(dbConfig, "concurrent")
  t.truthy(exists)
})

// can't test with unconnected client because `pg` just hangs on the first query...
test("with connected client", async (t) => {
  const databaseName = "migration-test-with-connected-client"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  {
    const client = new pg.Client({
      ...dbConfig,
      database: "postgres",
    })
    await client.connect()
    try {
      await createDb(databaseName, {client})
    } finally {
      await client.end()
    }
  }

  {
    const client = new pg.Client(dbConfig)
    try {
      await client.connect()

      await migrate({client}, "src/__tests__/fixtures/success-first")

      const exists = await doesTableExist(dbConfig, "success")
      t.truthy(exists)
    } finally {
      await client.end()
    }
  }
})

test("with pool", async (t) => {
  const databaseName = "migration-test-with-pool"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  {
    const client = new pg.Client({
      ...dbConfig,
      database: "postgres",
    })
    await client.connect()
    try {
      await createDb(databaseName, {client})
    } finally {
      await client.end()
    }
  }

  const pool = new pg.Pool(dbConfig)
  try {
    await createDb(databaseName, dbConfig)

    await migrate({client: pool}, "src/__tests__/fixtures/success-first")

    const exists = await doesTableExist(dbConfig, "success")
    t.truthy(exists)
  } finally {
    await pool.end()
  }
})

test("with pool client", async (t) => {
  const databaseName = "migration-test-with-pool-client"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  {
    const client = new pg.Client({
      ...dbConfig,
      database: "postgres",
    })
    await client.connect()
    try {
      await createDb(databaseName, {client})
    } finally {
      await client.end()
    }
  }

  const pool = new pg.Pool(dbConfig)
  try {
    await createDb(databaseName, dbConfig)
    const client = await pool.connect()
    try {
      await migrate({client}, "src/__tests__/fixtures/success-first")

      const exists = await doesTableExist(dbConfig, "success")
      t.truthy(exists)
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
})

test("successful first migration", (t) => {
  const databaseName = "migration-test-success-first"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  return createDb(databaseName, dbConfig)
    .then(() => migrate(dbConfig, "src/__tests__/fixtures/success-first"))
    .then(() => doesTableExist(dbConfig, "success"))
    .then((exists) => {
      t.truthy(exists)
    })
})

test("successful second migration", (t) => {
  const databaseName = "migration-test-success-second"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  return createDb(databaseName, dbConfig)
    .then(() => migrate(dbConfig, "src/__tests__/fixtures/success-first"))
    .then(() => migrate(dbConfig, "src/__tests__/fixtures/success-second"))
    .then(() => doesTableExist(dbConfig, "more_success"))
    .then((exists) => {
      t.truthy(exists)
    })
})

test("bad arguments - no db config", (t) => {
  // tslint:disable-next-line no-any
  return t.throwsAsync((migrate as any)()).then((err) => {
    t.regex(err.message, /config/)
  })
})

test("bad arguments - no migrations directory argument", (t) => {
  return t
    .throwsAsync(
      // tslint:disable-next-line no-any
      (migrate as any)({
        database: "migration-test-args",
        user: "postgres",
        password: PASSWORD,
        host: "localhost",
        port,
      }),
    )
    .then((err) => {
      t.regex(err.message, /directory/)
    })
})

test("bad arguments - incorrect user", (t) => {
  return t
    .throwsAsync(
      migrate(
        {
          database: "migration-test-args",
          user: "nobody",
          password: PASSWORD,
          host: "localhost",
          port,
        },
        "src/__tests__/fixtures/empty",
      ),
    )
    .then((err) => {
      t.regex(err.message, /nobody/)
    })
})

test("bad arguments - incorrect password", (t) => {
  return t
    .throwsAsync(
      migrate(
        {
          database: "migration-test-args",
          user: "postgres",
          password: "not_the_password",
          host: "localhost",
          port,
        },
        "src/__tests__/fixtures/empty",
      ),
    )
    .then((err) => {
      t.regex(err.message, /password/)
    })
})

test("bad arguments - incorrect host", (t) => {
  return t
    .throwsAsync(
      migrate(
        {
          database: "migration-test-args",
          user: "postgres",
          password: PASSWORD,
          host: "sillyhost",
          port,
        },
        "src/__tests__/fixtures/empty",
      ),
    )
    .then((err) => {
      t.regex(err.message, /sillyhost/)
    })
})

test("bad arguments - incorrect port", (t) => {
  return t
    .throwsAsync(
      migrate(
        {
          database: "migration-test-args",
          user: "postgres",
          password: PASSWORD,
          host: "localhost",
          port: 1234,
        },
        "src/__tests__/fixtures/empty",
      ),
    )
    .then((err) => {
      t.regex(err.message, /1234/)
    })
})

test("no database - ensureDatabaseExists = undefined", (t) => {
  return t
    .throwsAsync(
      migrate(
        {
          database: "migration-test-no-database",
          user: "postgres",
          password: PASSWORD,
          host: "localhost",
          port,
        },
        "src/__tests__/fixtures/empty",
      ),
    )
    .then((err) => {
      t.regex(
        err.message,
        /database "migration-test-no-database" does not exist/,
      )
    })
})

test("no database - ensureDatabaseExists = true", (t) => {
  const databaseName = "migration-test-no-db-ensure-exists"
  const dbConfig: MigrateDBConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,

    ensureDatabaseExists: true,
  }

  return migrate(dbConfig, "src/__tests__/fixtures/ensure-exists")
    .then(() => doesTableExist(dbConfig, "success"))
    .then((exists) => {
      t.truthy(exists)
    })
})

test("existing database - ensureDatabaseExists = true", (t) => {
  const databaseName = "migration-test-existing-db-ensure-exists"
  const dbConfig: MigrateDBConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,

    ensureDatabaseExists: true,
  }

  return createDb(databaseName, dbConfig)
    .then(() => migrate(dbConfig, "src/__tests__/fixtures/ensure-exists"))
    .then(() => doesTableExist(dbConfig, "success"))
    .then((exists) => {
      t.truthy(exists)
    })
})

test("no database - ensureDatabaseExists = true, bad default database", (t) => {
  const databaseName = "migration-test-ensure-exists-nope"
  const dbConfig: MigrateDBConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,

    ensureDatabaseExists: true,
    defaultDatabase: "nopenopenope",
  }

  return t
    .throwsAsync(migrate(dbConfig, "src/__tests__/fixtures/ensure-exists"))
    .then((err) => {
      t.regex(err.message, /database "nopenopenope" does not exist/)
    })
})

test("no migrations dir", (t) => {
  const databaseName = "migration-test-no-dir"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  const promise = createDb(databaseName, dbConfig).then(() => {
    return migrate(dbConfig, "not/real/path")
  })

  return t.throwsAsync(promise).then((err) => {
    t.regex(err.message, /not\/real\/path/)
  })
})

test("empty migrations dir", async (t) => {
  t.plan(0)
  const databaseName = "migration-test-empty-dir"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  await createDb(databaseName, dbConfig).then(() => {
    return migrate(dbConfig, "src/__tests__/fixtures/empty")
  })
})

test("invalid file name", (t) => {
  const databaseName = "migration-test-invalid-file-name"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  const promise = createDb(databaseName, dbConfig).then(() => {
    return migrate(dbConfig, "src/__tests__/fixtures/invalid-file-name")
  })

  return t.throwsAsync(promise).then((err) => {
    t.regex(err.message, /Invalid file name/)
    t.regex(err.message, /migrate-this/, "Should name the problem file")
  })
})

test("syntax error", (t) => {
  const databaseName = "migration-test-syntax-error"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  const promise = createDb(databaseName, dbConfig).then(() => {
    return migrate(dbConfig, "src/__tests__/fixtures/syntax-error")
  })

  return t.throwsAsync(promise).then((err) => {
    t.regex(err.message, /syntax error/)
  })
})

test("hash check failure", (t) => {
  const databaseName = "migration-test-hash-check"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  const promise = createDb(databaseName, dbConfig)
    .then(() =>
      migrate(dbConfig, "src/__tests__/fixtures/hash-check/first-run"),
    )
    .then(() =>
      migrate(dbConfig, "src/__tests__/fixtures/hash-check/second-run"),
    )

  return t.throwsAsync(promise).then((err) => {
    t.regex(err.message, /Hashes don't match/)
    t.regex(err.message, /1_migration/, "Should name the problem file")
  })
})

test("rollback", (t) => {
  const databaseName = "migration-test-rollback"
  const dbConfig = {
    database: databaseName,
    user: "postgres",
    password: PASSWORD,
    host: "localhost",
    port,
  }

  const promise = createDb(databaseName, dbConfig).then(() =>
    migrate(dbConfig, "src/__tests__/fixtures/rollback"),
  )

  return t
    .throwsAsync(promise)
    .then((err) => {
      t.regex(err.message, /Rolled back/)
      t.regex(err.message, /trigger-rollback/)
    })
    .then(() => doesTableExist(dbConfig, "should_get_rolled_back"))
    .then((exists) => {
      t.false(
        exists,
        "The table created in the migration should not have been committed.",
      )
    })
})

function doesTableExist(dbConfig: pg.ClientConfig, tableName: string) {
  const client = new pg.Client(dbConfig)
  client.on("error", (err) => console.log("doesTableExist on error", err))
  return client
    .connect()
    .then(() =>
      client.query(SQL`
        SELECT EXISTS (
          SELECT 1
          FROM   pg_catalog.pg_class c
          WHERE  c.relname = ${tableName}
          AND    c.relkind = 'r'
        );
      `),
    )
    .then((result) => {
      try {
        return client
          .end()
          .then(() => {
            return result.rows.length > 0 && result.rows[0].exists
          })
          .catch((error) => {
            console.log("Async error in 'doesTableExist", error)
            return result.rows.length > 0 && result.rows[0].exists
          })
      } catch (error) {
        console.log("Sync error in 'doesTableExist", error)
        return result.rows.length > 0 && result.rows[0].exists
      }
    })
}
