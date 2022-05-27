const parseId = (id: string) => {
  try {
    return BigInt(id)
  } catch (e) {
    throw new Error(`Migration file name should begin with an integer ID.'`)
  }
}

export interface FileInfo {
  id: bigint
  name: string
}

export const parseFileName = (fileName: string): FileInfo => {
  const result = /^(\d+).*\.sql$/g.exec(fileName)

  if (!result) {
    throw new Error(`Invalid file name: '${fileName}'.`)
  }

  const [, id] = result

  return {
    id: parseId(id),
    name: fileName,
  }
}
