// src/app/app.config.ts
import {
  ApplicationConfig,
  importProvidersFrom,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { withHashLocation } from '@angular/router';
import { OverlayModule } from '@angular/cdk/overlay';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation()), // routes
    importProvidersFrom(OverlayModule),
  ],
};
