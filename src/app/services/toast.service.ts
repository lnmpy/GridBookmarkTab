import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Toast {
  id: number;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number; // 毫秒
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = new BehaviorSubject<Toast[]>([]);
  private toastId = 0;

  get toasts$() {
    return this._toasts.asObservable();
  }

  show(message: string, type: Toast['type'] = 'info', duration = 3000) {
    const id = this.toastId++;
    const toast: Toast = { id, message, type, duration };
    const updated = [...this._toasts.value, toast];
    this._toasts.next(updated);

    setTimeout(() => this.remove(id), duration);
  }

  remove(id: number) {
    const updated = this._toasts.value.filter((t) => t.id !== id);
    this._toasts.next(updated);
  }
}
