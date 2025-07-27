import {
  Component,
  ViewChild,
  ViewContainerRef,
  AfterViewInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { ModalService } from '@app/services/modal.service';

@Component({
  selector: 'app-modal-host',
  imports: [CommonModule],
  template: `<ng-template #modalHost></ng-template>`,
})
export class ModalHostComponent implements AfterViewInit {
  private modalService: ModalService = inject(ModalService);

  @ViewChild('modalHost', { read: ViewContainerRef }) vcr!: ViewContainerRef;

  ngAfterViewInit() {
    this.modalService.setRootViewContainerRef(this.vcr);
  }
  onCancel() {
    this.modalService.close();
  }
}
