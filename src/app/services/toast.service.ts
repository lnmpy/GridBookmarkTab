import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Toast, ToastAction } from '@app/services/types';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = new BehaviorSubject<Toast[]>([]);
  private toastId = 0;

  get toasts$() {
    return this._toasts.asObservable();
  }

  show(
    message: string,
    type: Toast['type'] = 'info',
    duration = 3000,
    action?: ToastAction,
  ) {
    const id = this.toastId++;
    const toast: Toast = { id, message, type, duration, action };
    const updated = [...this._toasts.value, toast];
    this._toasts.next(updated);

    setTimeout(() => this.remove(id), duration);
  }

  runAction(toast: Toast) {
    this.remove(toast.id);
    toast.action?.run();
  }

  remove(id: number) {
    const updated = this._toasts.value.filter((t) => t.id !== id);
    this._toasts.next(updated);
  }
}
