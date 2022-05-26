import * as fs from "fs"
import * as path from "path"
import {promisify} from "util"
import {loadMigrationFile} from "./migration-file"
import {Logger, Migration} from "./types"
import {hashString} from "./util"
import {validateMigrationNoDuplicates} from "./validation"

const readDir = promisify(fs.readdir)

const isValidFile = (fileName: string) => /\.sql$/gi.test(fileName)

const INITIAL_MIGRATION_NAME = "0.sql"
const INITIAL_MIGRATION_CONTENT = `
create table public.migration (
  id bigint primary key,
  name text unique not null,
  hash text not null,
  executed_at timestamp default current_timestamp not null
);
`

const INITIAL_MIGRATION = {
  id: 0,
  name: INITIAL_MIGRATION_NAME,
  contents: INITIAL_MIGRATION_CONTENT,
  hash: hashString(INITIAL_MIGRATION_NAME + INITIAL_MIGRATION_CONTENT),
}

/**
 * Load the migration files and assert they are reasonably valid.
 *
 * 'Reasonably valid' in this case means obeying the file name and
 * consecutive ordering rules.
 *
 * No assertions are made about the validity of the SQL.
 */
export const loadMigrationFiles = async (
  directory: string,
  // tslint:disable-next-line no-empty
  log: Logger = () => {},
): Promise<Array<Migration>> => {
  log(`Loading migrations from: ${directory}`)

  const fileNames = await readDir(directory)
  log(`Found migration files: ${fileNames}`)

  if (fileNames == null) {
    return []
  }

  const migrationFiles = fileNames
    .map((fileName) => path.resolve(directory, fileName))
    .filter(isValidFile)

  const unorderedMigrations = await Promise.all(
    migrationFiles.map(loadMigrationFile),
  )

  // Arrange in ID order
  const orderedMigrations = [
    INITIAL_MIGRATION,
    ...unorderedMigrations.sort((a, b) => a.id - b.id),
  ]

  validateMigrationNoDuplicates(orderedMigrations)

  return orderedMigrations
}
