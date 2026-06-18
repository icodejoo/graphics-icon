#!/usr/bin/env node
import { run } from './cli.ts'

run(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error('[colorfont] 失败:', err?.message ?? err)
    process.exit(1)
  },
)
