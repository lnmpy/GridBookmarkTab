import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SettingsService } from '@app/services/settings.service';
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
  @Output() columnsChange = new EventEmitter<number>();
  @Output() showActiveWindowsChange = new EventEmitter<boolean>();

  title!: string;
  columns!: number;
  showActiveWindows!: boolean;

  ngOnInit() {
    this.title = 'Settings';
    this.columns = this.settingsService.getSettings().columns;
    this.showActiveWindows =
      this.settingsService.getSettings().showActiveWindows;
  }

  onColumnsChange() {
    this.columnsChange.emit(this.columns);
  }

  onShowActiveWindowsChange() {
    this.showActiveWindowsChange.emit(this.showActiveWindows);
  }

  onConfirm() {
    const setting = this.settingsService.getSettings();
    setting.columns = this.columns;
    setting.showActiveWindows = this.showActiveWindows;
    this.settingsService.setSettings(setting);
    this.confirm.emit();
    this.modalService.close();
  }

  onCancel() {
    this.columnsChange.emit(this.settingsService.getSettings().columns);
    this.showActiveWindowsChange.emit(
      this.settingsService.getSettings().showActiveWindows,
    );
    this.modalService.close();
  }
}
