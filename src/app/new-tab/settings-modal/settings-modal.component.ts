import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { ModalService } from '../../services/modal.service';

@Component({
  selector: 'app-settings-modal',
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.scss'],
  standalone: true,
})
export class SettingsModalComponent {
  private modalService: ModalService = inject(ModalService);

  @Input() title!: string;
  @Input() userId!: number;

  @Output() confirm = new EventEmitter<void>();

  onConfirm() {
    this.confirm.emit();
    this.modalService.close();
  }

  onCancel() {
    this.modalService.close();
  }
}
