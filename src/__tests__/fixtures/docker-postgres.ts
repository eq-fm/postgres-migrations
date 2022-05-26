// tslint:disable no-console

import {execSync, spawnSync} from "child_process"
import {Client} from "pg"

export const PASSWORD = "mysecretpassword"

const DOCKER = spawnSync("which", ["podman"]).status === 0 ? "podman" : "docker"

export const stopPostgres = (containerName: string) => {
  try {
    execSync(`${DOCKER} rm -f ${containerName}`)
  } catch (error) {
    console.log("Could not remove the Postgres container")
    throw error
  }
}

export const startPostgres = async (containerName: string) => {
  try {
    try {
      execSync(`${DOCKER} rm -f ${containerName}`, {stdio: "ignore"})
    } catch (error) {
      //
    }

    execSync(`${DOCKER} run --detach --publish-all  \
      --name ${containerName} \
      --env POSTGRES_PASSWORD=${PASSWORD} \
      postgres:14`)

    const portMapping = execSync(
      `${DOCKER} port ${containerName} 5432`,
    ).toString()
    const port = parseInt(portMapping.split(":")[1], 10)

    let connected = false

    while (!connected) {
      const client = new Client({
        host: "localhost",
        user: "postgres",
        port,
        password: PASSWORD,
      })

      try {
        await client.connect()
        connected = true
        await client.end()
      } catch (e) {
        await new Promise((r) => setTimeout(r, 100))
      }
    }

    return port
  } catch (error) {
    console.log("Could not start Postgres", error)
    throw error
  }
}
