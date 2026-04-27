/**
 * SwitchboardOS — Angular Renderer Entry Point
 *
 * Bootstraps the Angular application inside Electron's renderer process.
 */

import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => console.error('Angular bootstrap failed:', err));
