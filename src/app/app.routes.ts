import { Routes } from '@angular/router';
import { Injectable, inject } from '@angular/core';

import { AppComponent } from './app';

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
class TargetGuard implements CanActivate {
  private router = inject(Router);

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ):
    | Observable<boolean | UrlTree>
    | Promise<boolean | UrlTree>
    | boolean
    | UrlTree {
    let target = route.queryParams['target'];
    if (!['new-tab', 'popup', 'options'].includes(target)) {
      target = 'new-tab';
    }
    document.body.classList.add(target);
    this.router.navigateByUrl(`/${target}`, { skipLocationChange: true });
    return false;
  }
}

export const routes: Routes = [
  {
    path: 'new-tab',
    loadComponent: () =>
      import('./new-tab/new-tab.component').then((m) => m.NewTabComponent),
  },
  {
    path: 'popup',
    loadComponent: () =>
      import('./popup/popup.component').then((m) => m.PopupComponent),
  },
  {
    path: 'options',
    loadComponent: () =>
      import('./options/options.component').then((m) => m.OptionsComponent),
  },
  { path: '**', component: AppComponent, canActivate: [TargetGuard] },
];
