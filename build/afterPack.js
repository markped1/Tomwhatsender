/**
 * afterPack hook — copies bundled Chrome into app.asar.unpacked after packaging.
 * This keeps Chrome out of the traversal scan (which is what makes builds slow)
 * while still making it available at runtime.
 */
const fs = require('fs')
const path = require('path')

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context
  const projectDir = packager.projectDir

  const chromeSrc = path.join(projectDir, 'node_modules', 'puppeteer', '.local-chrome')
  const chromeDest = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', 'puppeteer', '.local-chrome')

  if (!fs.existsSync(chromeSrc)) {
    console.log('[afterPack] Chrome source not found at:', chromeSrc)
    return
  }

  console.log('[afterPack] Copying Chrome from:', chromeSrc)
  console.log('[afterPack] Copying Chrome to:', chromeDest)

  fs.mkdirSync(path.dirname(chromeDest), { recursive: true })
  copyDirSync(chromeSrc, chromeDest)
  console.log('[afterPack] Chrome copied successfully.')

  // Also copy node-machine-id native module
  const nmidSrc = path.join(projectDir, 'node_modules', 'node-machine-id')
  const nmidDest = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', 'node-machine-id')
  if (fs.existsSync(nmidSrc)) {
    fs.mkdirSync(path.dirname(nmidDest), { recursive: true })
    copyDirSync(nmidSrc, nmidDest)
    console.log('[afterPack] node-machine-id copied.')
  }

  // Also copy sql.js wasm
  const wasmSrc = path.join(projectDir, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const wasmDest = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  if (fs.existsSync(wasmSrc)) {
    fs.mkdirSync(path.dirname(wasmDest), { recursive: true })
    fs.copyFileSync(wasmSrc, wasmDest)
    console.log('[afterPack] sql-wasm.wasm copied.')
  }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
