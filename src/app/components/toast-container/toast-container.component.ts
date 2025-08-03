import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroXMark } from '@ng-icons/heroicons/outline';

import { ToastService } from '@app/services/toast.service';

@Component({
  selector: 'app-toast-container',
  imports: [CommonModule, NgIcon],
  providers: [provideIcons({ heroXMark })],
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
})
export class ToastContainerComponent {
  public toastService: ToastService = inject(ToastService);
}
