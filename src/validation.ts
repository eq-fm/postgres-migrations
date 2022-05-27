import {Migration} from "./types"

export function validateMigrationNoDuplicates(migrations: Array<Migration>) {
  const hasDuplicates =
    new Set(migrations.map((item) => item.id)).size !== migrations.length

  if (hasDuplicates) {
    throw new Error("Encountered duplicate migration identifiers.")
  }
}

/** Assert hashes match */
export function validateMigrationHashes(
  migrations: Array<Migration>,
  appliedMigrations: Array<Migration>,
) {
  const invalidHash = (migration: Migration) => {
    const appliedMigration = appliedMigrations.filter(
      (item) => item.id === migration.id,
    )[0]
    return appliedMigration != null && appliedMigration.hash !== migration.hash
  }

  // Assert migration hashes are still same
  const invalidHashes = migrations.filter(invalidHash)
  if (invalidHashes.length > 0) {
    // Someone has altered one or more migrations which has already run - gasp!
    const invalidFiles = invalidHashes.map(({name}) => name)
    throw new Error(`Hashes don't match for migrations '${invalidFiles}'.
This means that the scripts have changed since it was applied.`)
  }
}
