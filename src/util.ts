import * as crypto from "crypto"

export const coerceError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error
  }
  return new Error(String(error))
}

export const hashString = (s: string) =>
  crypto.createHash("sha1").update(s, "utf8").digest("hex")
