import {promisify} from "util"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
import {parseFileName} from "./file-name-parser"
import {coerceError} from "./util"

const readFile = promisify(fs.readFile)

const getFileName = (filePath: string) => path.basename(filePath)

const getFileContents = async (filePath: string) => readFile(filePath, "utf8")

const hashString = (s: string) =>
  crypto.createHash("sha1").update(s, "utf8").digest("hex")

export const loadMigrationFile = async (filePath: string) => {
  const fileName = getFileName(filePath)

  try {
    const {id, name} = parseFileName(fileName)
    const contents = await getFileContents(filePath)
    const hash = hashString(fileName + contents)

    return {
      id,
      name,
      contents,
      fileName,
      hash,
    }
  } catch (err) {
    throw new Error(
      `${coerceError(err).message} - Offending file: '${fileName}'.`,
    )
  }
}
