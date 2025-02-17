import SQL from "sql-template-strings"
import {Logger, Migration, BasicPgClient} from "./types"
import {coerceError} from "./util"

const noop = async () => {
  //
}

const insertMigration = async (
  client: BasicPgClient,
  migration: Migration,
  log: Logger,
) => {
  log(
    `Saving migration: ${migration.id} | ${migration.name} | ${migration.hash}`,
  )

  const sql = SQL`INSERT INTO public.migration `.append(
    SQL` ("id", "name", "hash") VALUES (${migration.id},${migration.name},${migration.hash})`,
  )

  return client.query(sql)
}

export const runMigration =
  (client: BasicPgClient, log: Logger = noop) =>
  async (migration: Migration) => {
    const inTransaction =
      migration.contents.includes(
        "-- postgres-migrations disable-transaction",
      ) === false

    log(`Running migration in transaction: ${inTransaction}`)

    const begin = inTransaction
      ? async () => client.query("START TRANSACTION")
      : noop

    const end = inTransaction ? async () => client.query("COMMIT") : noop

    const cleanup = inTransaction ? async () => client.query("ROLLBACK") : noop

    try {
      await begin()
      await client.query(migration.contents)
      await insertMigration(client, migration, log)
      await end()

      return migration
    } catch (err) {
      try {
        await cleanup()
      } catch {
        //
      }
      throw new Error(
        `An error occurred running '${
          migration.name
        }'. Rolled back this migration. No further migrations were run. Reason: ${
          coerceError(err).message
        }`,
      )
    }
  }
