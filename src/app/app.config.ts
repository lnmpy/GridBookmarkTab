// src/app/app.config.ts
import {
  ApplicationConfig,
  provideAppInitializer,
  inject,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { withHashLocation } from '@angular/router';

import { routes } from './app.routes';

import { BookmarkService } from './services/bookmark.service';
import { SettingsService } from './services/settings.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withHashLocation()), // routes
    provideHttpClient(), // http
    provideAppInitializer(() => {
      return inject(BookmarkService).initService();
    }), // init service when app start
    provideAppInitializer(() => {
      return inject(SettingsService).initService();
    }), // init service when app start
  ],
};
