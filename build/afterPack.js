/**
 * afterPack hook:
 * 1. Manually flips Electron fuses to disable asar integrity validation
 * 2. Copies bundled Chrome into app.asar.unpacked
 */
const fs = require('fs')
const path = require('path')

exports.default = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context
  const projectDir = packager.projectDir

  // ── 1. Flip Electron fuses to disable asar integrity check ──────────────────
  // electron-builder's electronFuses config key is unreliable in v26 — do it manually
  if (electronPlatformName === 'win32') {
    try {
      const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
      const exeName = packager.appInfo.productFilename + '.exe'
      const exePath = path.join(appOutDir, exeName)
      if (fs.existsSync(exePath)) {
        await flipFuses(exePath, {
          version: FuseVersion.V1,
          [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
          [FuseV1Options.OnlyLoadAppFromAsar]: false,
        })
        console.log('[afterPack] Fuses flipped — asar integrity validation disabled.')
      } else {
        console.warn('[afterPack] Exe not found at:', exePath)
      }
    } catch (e) {
      console.warn('[afterPack] Could not flip fuses:', e.message)
    }
  }

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
