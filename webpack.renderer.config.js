/**
 * Webpack configuration for the Angular Electron renderer process.
 *
 * This config extends the Angular CLI output to make it Electron-compatible:
 * - Externals Node/Electron modules so they resolve via the bundled node_modules
 * - No HTMLPlugin (Angular CLI generates its own index.html)
 * - No output path (Angular CLI handles dist/switchboardos/)
 *
 * Used by @angular-builders/custom-webpack in the Electron build target.
 */

const path = require('path');
const { ExternalsPlugin } = require('webpack');

module.exports = (config) => {
  // Remove Angular CLI's HTML plugin — Angular CLI generates index.html itself.
  // The Electron main process injects it via BrowserWindow.loadFile().
  config.plugins = config.plugins.filter(
    (p) => p.constructor.name !== 'HtmlWebpackPlugin'
  );

  // Resolve externals: node_modules that Electron provides natively
  // should NOT be bundled into the renderer bundle.
  config.externals = [
    new ExternalsPlugin('commonjs', [
      'electron',
      'electron/ipcRenderer',
      'electron/contextBridge',
    ]),
  ];

  // Ensure output directory aligns with Angular CLI's dist path
  config.output = {
    ...config.output,
    path: path.resolve(__dirname, 'dist/switchboardos'),
  };

  return config;
};
