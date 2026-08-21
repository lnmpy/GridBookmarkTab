import { Routes } from '@angular/router';
import { Injectable, inject } from '@angular/core';

import { AppComponent } from '@app/app';

import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class TargetGuard implements CanActivate {
  private router: Router = inject(Router);

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ):
    | Observable<boolean | UrlTree>
    | Promise<boolean | UrlTree>
    | boolean
    | UrlTree {
    let target = route.queryParams['target'];

    if (!target && typeof window !== 'undefined') {
      target = new URLSearchParams(window.location.search).get('target') || undefined;

      if (!target && window.location.hash.includes('?')) {
        const queryPart = window.location.hash.split('?')[1];
        target = new URLSearchParams(queryPart).get('target') || undefined;
      }

      if (!target) {
        const hashPath = window.location.hash.replace(/^#\/?/, '').split('?')[0];
        if (['new-tab', 'popup', 'options'].includes(hashPath)) {
          target = hashPath;
        }
      }
    }

    if (!['new-tab', 'popup', 'options'].includes(target as string)) {
      target = 'new-tab';
    }
    document.body.classList.add(target as string);
    this.router.navigateByUrl(`/${target}`, { skipLocationChange: true });
    return false;
  }
}

export const routes: Routes = [
  {
    path: 'new-tab',
    loadComponent: () =>
      import('@app/new-tab/new-tab.component').then((m) => m.NewTabComponent),
  },
  {
    path: 'popup',
    loadComponent: () =>
      import('@app/popup/popup.component').then((m) => m.PopupComponent),
  },
  {
    path: 'options',
    loadComponent: () =>
      import('@app/options/options.component').then((m) => m.OptionsComponent),
  },
  { path: '**', component: AppComponent, canActivate: [TargetGuard] },
];
