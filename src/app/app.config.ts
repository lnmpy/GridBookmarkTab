// src/app/app.config.ts
import {
  ApplicationConfig,
  provideAppInitializer,
  inject,
  importProvidersFrom,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { withHashLocation } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { OverlayModule } from '@angular/cdk/overlay';
import { routes } from './app.routes';

import { SettingsService } from '@app/services/settings.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withHashLocation()), // routes
    provideAnimations(),
    importProvidersFrom(OverlayModule),
    provideAppInitializer(() => {
      return inject(SettingsService).initService();
    }), // init service when app start
  ],
};
