const { spawn } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const mode = process.argv[2] || "dev"
const rootDir = path.resolve(__dirname, "..")
const sourceDir = path.join(rootDir, "_locales")
const targetDir = path.join(rootDir, "build", `chrome-mv3-${mode}`, "_locales")
const plasmoBin = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "plasmo.cmd" : "plasmo")

if (fs.existsSync(sourceDir)) {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true })
}

spawn(plasmoBin, [mode], {
  cwd: rootDir,
  shell: process.platform === "win32",
  stdio: "inherit"
})