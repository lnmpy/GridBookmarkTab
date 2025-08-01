import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ModalService } from '@app/services/modal.service';

@Component({
  selector: 'app-confirm-modal',
  imports: [FormsModule],
  standalone: true,
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.scss'],
})
export class ConfirmModalComponent {
  private modalService: ModalService = inject(ModalService);

  @Input() title: string = 'Confirm';
  @Input() confirmButtonClass?: string = 'btn-warning';
  @Input() cancelButtonClass?: string = '';

  @Output() confirm = new EventEmitter<void>();

  onConfirm() {
    this.confirm.emit();
    this.modalService.close();
  }

  onCancel() {
    this.modalService.close();
  }
}
