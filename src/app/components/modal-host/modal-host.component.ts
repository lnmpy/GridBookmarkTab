import {
  Component,
  ViewChild,
  ViewContainerRef,
  AfterViewInit,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';

import { ModalService } from '@app/services/modal.service';

@Component({
  selector: 'app-modal-host',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-template #modalHost></ng-template>`,
})
export class ModalHostComponent implements AfterViewInit {
  private modalService: ModalService = inject(ModalService);

  @ViewChild('modalHost', { read: ViewContainerRef }) vcr!: ViewContainerRef;

  ngAfterViewInit() {
    this.modalService.setRootViewContainerRef(this.vcr);
  }
}
