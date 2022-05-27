import * as pg from "pg"
import SQL from "sql-template-strings"
import {runCreateQuery} from "./create"
import {loadMigrationFiles} from "./files-loader"
import {runMigration} from "./run-migration"
import {
  BasicPgClient,
  Config,
  Logger,
  MigrateDBConfig,
  Migration,
  MigrationError,
} from "./types"
import {coerceError} from "./util"
import {validateMigrationHashes} from "./validation"
import {withConnection} from "./with-connection"
import {withAdvisoryLock} from "./with-lock"

/**
 * Run the migrations.
 *
 * If `dbConfig.ensureDatabaseExists` is true then `dbConfig.database` will be created if it
 * does not exist.
 *
 * @param dbConfig Details about how to connect to the database
 * @param migrationsDirectory Directory containing the SQL migration files
 * @param config Extra configuration
 * @returns Details about the migrations which were run
 */
export async function migrate(
  dbConfig: MigrateDBConfig,
  migrationsDirectory: string,
  config: Config = {},
): Promise<Array<Migration>> {
  const log =
    config.logger != null
      ? config.logger
      : () => {
          //
        }

  if (dbConfig == null) {
    throw new Error("No config object")
  }

  if (typeof migrationsDirectory !== "string") {
    throw new Error("Must pass migrations directory as a string")
  }
  const intendedMigrations = await loadMigrationFiles(migrationsDirectory, log)

  if ("client" in dbConfig) {
    // we have been given a client to use, it should already be connected
    return withAdvisoryLock(
      log,
      runMigrations(intendedMigrations, log),
    )(dbConfig.client)
  }

  if (
    typeof dbConfig.database !== "string" ||
    typeof dbConfig.user !== "string" ||
    typeof dbConfig.password !== "string" ||
    typeof dbConfig.host !== "string" ||
    typeof dbConfig.port !== "number"
  ) {
    throw new Error("Database config problem")
  }

  if (dbConfig.ensureDatabaseExists === true) {
    // Check whether database exists
    const {user, password, host, port} = dbConfig
    const client = new pg.Client({
      database:
        dbConfig.defaultDatabase != null
          ? dbConfig.defaultDatabase
          : "postgres",
      user,
      password,
      host,
      port,
    })

    const runWith = withConnection(log, async (connectedClient) => {
      const result = await connectedClient.query({
        text: "SELECT 1 FROM pg_database WHERE datname=$1",
        values: [dbConfig.database],
      })
      if (result.rowCount !== 1) {
        await runCreateQuery(dbConfig.database, log)(connectedClient)
      }
    })

    await runWith(client)
  }
  {
    const client = new pg.Client(dbConfig)
    client.on("error", (err) => {
      log(`pg client emitted an error: ${err.message}`)
    })

    const runWith = withConnection(
      log,
      withAdvisoryLock(log, runMigrations(intendedMigrations, log)),
    )

    return runWith(client)
  }
}

function runMigrations(intendedMigrations: Array<Migration>, log: Logger) {
  return async (client: BasicPgClient) => {
    try {
      log("Starting migrations")

      const appliedMigrations = await fetchAppliedMigrationFromDB(client, log)

      validateMigrationHashes(intendedMigrations, appliedMigrations)

      const migrationsToRun = filterMigrations(
        intendedMigrations,
        appliedMigrations,
      )
      const completedMigrations = []

      for (const migration of migrationsToRun) {
        log(`Starting migration: ${migration.id} ${migration.name}`)
        const result = await runMigration(client, log)(migration)
        log(`Finished migration: ${migration.id} ${migration.name}`)
        completedMigrations.push(result)
      }

      logResult(completedMigrations, log)

      log("Finished migrations")

      return completedMigrations
    } catch (e) {
      const error: MigrationError = new Error(
        `Migration failed. Reason: ${coerceError(e).message}`,
      )
      error.cause = e
      throw error
    }
  }
}

/** Queries the database for migrations table and retrieve it rows if exists */
async function fetchAppliedMigrationFromDB(client: BasicPgClient, log: Logger) {
  let appliedMigrations = []
  if (await doesMigrationTableExist(client)) {
    log(`Migrations table exists, filtering not applied migrations.`)

    const {rows} = await client.query(
      "select * from public.migration order by id",
    )

    appliedMigrations = rows.map((row) => ({...row, id: BigInt(row.id)}))
  } else {
    log(
      `Migrations table hasn't been created, so the database is new and we need to run all migrations.`,
    )
  }
  return appliedMigrations
}

/** Work out which migrations to apply */
function filterMigrations(
  migrations: Array<Migration>,
  appliedMigrations: Array<Migration>,
) {
  const notAppliedMigration = (migration: Migration) =>
    appliedMigrations.filter((item) => item.id === migration.id).length === 0

  return migrations.filter(notAppliedMigration)
}

/** Logs the result */
function logResult(completedMigrations: Array<Migration>, log: Logger) {
  if (completedMigrations.length === 0) {
    log("No migrations applied")
  } else {
    log(
      `Successfully applied migrations: ${completedMigrations.map(
        ({name}) => name,
      )}`,
    )
  }
}

/** Check whether table exists in postgres - http://stackoverflow.com/a/24089729 */
async function doesMigrationTableExist(client: BasicPgClient) {
  const result = await client.query(SQL`select exists (
select
  1
from
  pg_catalog.pg_class as c join pg_catalog.pg_namespace as ns on c.relnamespace = ns.oid
where
  ns.nspname = 'public' and
  c.relname = 'migration' and
  c.relkind = 'r'
);`)

  return result.rows.length > 0 && result.rows[0].exists
}
