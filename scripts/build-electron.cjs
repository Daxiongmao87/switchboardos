#!/usr/bin/env node
/**
 * Build script for Electron main process and preload.
 *
 * Uses esbuild to bundle TypeScript into JavaScript.
 * Runs after `ng build` to produce the Electron bundle.
 */

const { build } = require('esbuild');
const fs = require('fs');
const path = require('path');

const DIST_ELECTRON = path.join(__dirname, '..', 'dist-electron');
const SRC_MAIN = path.join(__dirname, '..', 'src', 'main', 'main.ts');
const SRC_PRELOAD = path.join(__dirname, '..', 'src', 'preload', 'preload.ts');

// Ensure output directory exists
if (!fs.existsSync(DIST_ELECTRON)) {
  fs.mkdirSync(DIST_ELECTRON, { recursive: true });
}

// Shared esbuild options
const sharedOptions = {
  bundle: true,
  platform: 'node',
  target: 'electron28',
  external: ['electron'],
  format: 'cjs',
  logLevel: 'info',
};

async function buildMain() {
  console.log('Building Electron main process...');
  await build({
    ...sharedOptions,
    entryPoints: [SRC_MAIN],
    outfile: path.join(DIST_ELECTRON, 'main.js'),
  });
  console.log('✓ Main process built');
}

async function buildPreload() {
  console.log('Building Electron preload script...');
  await build({
    ...sharedOptions,
    entryPoints: [SRC_PRELOAD],
    outfile: path.join(DIST_ELECTRON, 'preload.js'),
    format: 'cjs',
  });
  console.log('✓ Preload script built');
}

async function main() {
  try {
    await Promise.all([buildMain(), buildPreload()]);
    console.log('Electron build complete.');
  } catch (err) {
    console.error('Electron build failed:', err);
    process.exit(1);
  }
}

main();
