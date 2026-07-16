const { spawn, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const mode = process.argv[2]
const target = mode === "build" ? "prod" : mode
const rootDir = path.resolve(__dirname, "..")
const sourceDir = path.join(rootDir, "_locales")
const targetDir = path.join(rootDir, "build", `chrome-mv3-${target}`, "_locales")
const plasmoBin = path.join(rootDir, "node_modules", "plasmo", "bin", "index.mjs")

if (target === "prod") {
  spawnSync(process.execPath, [plasmoBin, "build"], {
    cwd: rootDir,
    stdio: "inherit"
  })
} else {
  spawn(process.execPath, [plasmoBin, mode], {
    cwd: rootDir,
    stdio: "inherit"
  })
}

if (fs.existsSync(sourceDir)) {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true })
}