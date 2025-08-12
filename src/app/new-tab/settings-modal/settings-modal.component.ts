import {
  Component,
  EventEmitter,
  Output,
  inject,
  HostListener,
} from '@angular/core';
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

  ngOnInit() {
    this.title = 'Settings';
  }

  get columns() {
    return this.settingsService.settingsSource.value.columns;
  }

  set columns(value: number) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      columns: value,
    });
  }

  get showActiveWindows() {
    return this.settingsService.settingsSource.value.showActiveWindows;
  }

  set showActiveWindows(value: boolean) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      showActiveWindows: value,
    });
  }

  get clickOpenBookmarkInCurrentTab() {
    return this.settingsService.settingsSource.value
      .clickOpenBookmarkInCurrentTab;
  }

  set clickOpenBookmarkInCurrentTab(value: boolean) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      clickOpenBookmarkInCurrentTab: value,
    });
  }

  get dragOpenBookmarkInBackground() {
    return this.settingsService.settingsSource.value
      .dragOpenBookmarkInBackground;
  }

  set dragOpenBookmarkInBackground(value: boolean) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      dragOpenBookmarkInBackground: value,
    });
  }

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
    this.settingsService.storeSettings(
      this.settingsService.settingsSource.value,
    );
    this.confirm.emit();
    this.modalService.close();
  }

  onCancel() {
    this.settingsService.reloadSettings();
    this.modalService.close();
  }
}
