import test from "ava"

import {parseFileName} from "../../file-name-parser"

test("parse name: 1.sql", (t) => {
  const parsed = parseFileName("1.sql")
  t.deepEqual(
    parsed,
    {
      id: 1n,
      name: "1.sql",
    },
    "should parse correctly without name, the parsed name must be the fileName",
  )
})

test("parse name: 0001.sql", (t) => {
  const parsed = parseFileName("0001.sql")
  t.deepEqual(
    parsed,
    {
      id: 1n,
      name: "0001.sql",
    },
    "should parse correctly with leading zeros",
  )
})

test("parse name: 1file.sql", (t) => {
  const parsed = parseFileName("1file.sql")
  t.deepEqual(
    parsed,
    {
      id: 1n,
      name: "1file.sql",
    },
    "should parse correctly with postfix",
  )
})

test("parse name: 9007199254740992file.sql", (t) => {
  const parsed = parseFileName("9007199254740992file.sql")
  t.deepEqual(
    parsed,
    {
      id: 9007199254740992n,
      name: "9007199254740992file.sql",
    },
    "should parse correctly with postfix",
  )
})

test("parse name: 63.SQL", (t) => {
  const err = t.throws(() => parseFileName("63.SQL"))

  t.regex(err.message, /Invalid file name/)
  t.regex(err.message, /63/, "Should name the problem file")
})

test("parse name: not_file.sql", (t) => {
  const err = t.throws(() => parseFileName("not_file.sql"))

  t.regex(err.message, /Invalid file name/)
  t.regex(err.message, /not_file/, "Should name the problem file")
})
