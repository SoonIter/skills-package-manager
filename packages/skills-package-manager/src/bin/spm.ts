#!/usr/bin/env node
import { runCli } from '../cli/runCli'

runCli(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
