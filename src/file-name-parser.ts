const parseId = (id: string) => {
  const parsed = parseInt(id, 10)
  if (isNaN(parsed)) {
    throw new Error(`Migration file name should begin with an integer ID.'`)
  }

  return parsed
}

export interface FileInfo {
  id: number
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
