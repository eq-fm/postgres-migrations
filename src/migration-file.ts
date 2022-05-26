import {promisify} from "util"
import * as fs from "fs"
import * as path from "path"
import {parseFileName} from "./file-name-parser"
import {coerceError, hashString} from "./util"

const readFile = promisify(fs.readFile)

const getFileContents = async (filePath: string) => readFile(filePath, "utf8")

export const loadMigrationFile = async (filePath: string) => {
  const fileName = path.basename(filePath)

  try {
    const {id, name} = parseFileName(fileName)
    const contents = await getFileContents(filePath)
    const hash = hashString(fileName + contents)

    return {
      id,
      name,
      contents,
      hash,
    }
  } catch (err) {
    throw new Error(
      `${coerceError(err).message} - Offending file: '${fileName}'.`,
    )
  }
}
