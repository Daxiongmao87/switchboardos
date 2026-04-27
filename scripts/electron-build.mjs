#!/usr/bin/env node

/**
 * Electron build script — bundles main and preload with esbuild.
 *
 * This script compiles the TypeScript main and preload files
 * into JavaScript output in dist-electron/, ready for Electron
 * to launch.
 */

const esbuild = require('esbuild');
const path = require('path');

const isDev = process.argv.includes('--dev');

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['electron'],
  logLevel: 'info',
  sourcemap: isDev,
};

async function build() {
  const mainCtx = esbuild.context({
    ...commonOptions,
    entryPoints: [path.resolve(__dirname, '../src/main/main.ts')],
    outfile: path.resolve(__dirname, '../dist-electron/main.js'),
  });

  const preloadCtx = esbuild.context({
    ...commonOptions,
    entryPoints: [path.resolve(__dirname, '../src/preload/preload.ts')],
    outfile: path.resolve(__dirname, '../dist-electron/preload.js'),
  });

  if (isDev) {
    await mainCtx.watch();
    await preloadCtx.watch();
    console.log('Watching for changes (dev mode)...');
  } else {
    await mainCtx.build();
    await preloadCtx.build();
    console.log('Electron main + preload built successfully.');
  }
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
