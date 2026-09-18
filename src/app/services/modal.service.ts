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

  open<T extends object>(
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

  async openLazy<T extends object>(
    loader: () => Promise<Type<T>>,
    inputs?: Partial<T>,
  ): Promise<ComponentRef<T>> {
    if (!this.viewContainerRef) throw new Error('Modal root not set');
    const component = await loader();
    return this.open(component, inputs);
  }

  close() {
    if (this.viewContainerRef) {
      this.viewContainerRef.clear();
    }
  }

  hasOpenModals(): boolean {
    return !!this.viewContainerRef && this.viewContainerRef.length > 0;
  }
}
