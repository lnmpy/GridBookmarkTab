import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  HostListener,
} from '@angular/core';
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

  @HostListener('document:keydown.enter', ['$event'])
  onKeydownEnter(event: KeyboardEvent) {
    event.preventDefault();
    this.onConfirm();
  }

  @HostListener('document:keydown.esc', ['$event'])
  onKeydownEsc(event: KeyboardEvent) {
    event.preventDefault();
    this.onCancel();
  }

  onConfirm() {
    this.confirm.emit();
    this.modalService.close();
  }

  onCancel() {
    this.modalService.close();
  }
}
