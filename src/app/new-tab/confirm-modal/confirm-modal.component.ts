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
import { I18nService } from '@app/services/i18n.service';

@Component({
  selector: 'app-confirm-modal',
  imports: [FormsModule],
  standalone: true,
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.scss'],
})
export class ConfirmModalComponent {
  private modalService: ModalService = inject(ModalService);
  i18n: I18nService = inject(I18nService);

  @Input() title: string = 'Confirm';
  @Input() confirmButtonClass?: string = 'btn-warning';
  @Input() cancelButtonClass?: string = '';

  @Output() confirm = new EventEmitter<void>();

  @HostListener('document:keydown.enter', ['$event'])
  onKeydownEnter(event: Event) {
    event.preventDefault();
    this.onConfirm();
  }

  @HostListener('document:keydown.esc', ['$event'])
  onKeydownEsc(event: Event) {
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
