import {
  Injectable,
  ViewContainerRef,
  ComponentRef,
  Type,
} from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalService {
  private viewContainerRef!: ViewContainerRef;

  setRootViewContainerRef(vcr: ViewContainerRef) {
    this.viewContainerRef = vcr;
  }

  open<T extends Record<string, any>>(
    component: Type<T>,
    inputs?: Partial<T>,
  ): ComponentRef<T> {
    if (!this.viewContainerRef) throw new Error('Modal root not set');

    this.viewContainerRef.clear();
    const componentRef = this.viewContainerRef.createComponent(component);

    if (inputs) {
      Object.assign(componentRef.instance, inputs);
    }

    return componentRef;
  }

  close() {
    if (this.viewContainerRef) {
      this.viewContainerRef.clear();
    }
  }
}
