import { Component } from '@angular/core';

import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterModule],
  template: `<router-outlet></router-outlet>`,
  styleUrls: ['./app.scss'],
})
export class AppComponent {}
