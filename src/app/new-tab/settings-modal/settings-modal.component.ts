import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SettingsService, Setting } from '@app/services/settings.service';
import { ModalService } from '@app/services/modal.service';

@Component({
  selector: 'app-settings-modal',
  imports: [FormsModule],
  standalone: true,
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.scss'],
})
export class SettingsModalComponent {
  private settingsService: SettingsService = inject(SettingsService);
  private modalService: ModalService = inject(ModalService);

  @Output() confirm = new EventEmitter<void>();

  title!: string;
  columns!: number;

  ngOnInit() {
    this.title = 'Settings';
    this.columns = this.settingsService.getSettings().columns;
  }

  onConfirm() {
    const setting = this.settingsService.getSettings();
    setting.columns = this.columns;
    this.settingsService.setSettings(setting);
    this.confirm.emit();
    this.modalService.close();
  }

  onCancel() {
    this.modalService.close();
  }
}
