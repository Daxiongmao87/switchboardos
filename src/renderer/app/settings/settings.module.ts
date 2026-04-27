/**
 * SwitchboardOS — Settings Module
 *
 * Provides the settings storage service and its dependencies.
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SettingsService } from '../services/settings.service';

@NgModule({
  imports: [CommonModule],
  providers: [SettingsService],
})
export class SettingsModule {}
