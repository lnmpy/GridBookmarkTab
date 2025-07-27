import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterModule],
  template: `<router-outlet></router-outlet>`,
  styleUrls: ['./app.scss'],
})
export class AppComponent {}
