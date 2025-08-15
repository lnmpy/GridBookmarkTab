import {
  Component,
  EventEmitter,
  Output,
  inject,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SettingsService } from '@app/services/settings.service';
import { ModalService } from '@app/services/modal.service';

@Component({
  selector: 'app-settings-modal',
  imports: [CommonModule, FormsModule],
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

  readonly themes = [
    'light',
    'cmyk',
    'dim',
    'dracula',
    'emerald',
    'lofi',
    'night',
    'retro',
  ];
  readonly columnsMin = 4;
  readonly columnsMax = 12;

  readonly gapMin = 2;
  readonly gapMax = 8;

  readonly rowHeightMin = 4;
  readonly rowHeightMax = 7;

  ngOnInit() {
    this.title = 'Settings';
  }

  get theme() {
    return this.settingsService.settingsSource.value.theme;
  }

  set theme(value: string) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      theme: value,
    });
  }

  get bookmarkDisplayColumn() {
    return this.settingsService.settingsSource.value.bookmarkDisplayColumn;
  }

  set bookmarkDisplayColumn(value: number) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      bookmarkDisplayColumn: value,
    });
    this.columnsChange.emit(value);
  }

  get bookmarkDisplayGap() {
    return this.settingsService.settingsSource.value.bookmarkDisplayGap;
  }

  set bookmarkDisplayGap(value: number) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      bookmarkDisplayGap: value,
    });
  }

  get windowDisplay() {
    return this.settingsService.settingsSource.value.windowDisplay;
  }

  set windowDisplay(value: boolean) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      windowDisplay: value,
    });
    this.showActiveWindowsChange.emit(value);
  }

  get bookmarkDisplayRowHeight() {
    return this.settingsService.settingsSource.value.bookmarkDisplayRowHeight;
  }

  set bookmarkDisplayRowHeight(value: number) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      bookmarkDisplayRowHeight: value,
    });
  }

  get bookmarkClickOpenInCurrentTab() {
    return this.settingsService.settingsSource.value
      .bookmarkClickOpenInCurrentTab;
  }

  set bookmarkClickOpenInCurrentTab(value: boolean) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      bookmarkClickOpenInCurrentTab: value,
    });
  }

  get bookmarkDragOpenInBackground() {
    return this.settingsService.settingsSource.value
      .bookmarkDragOpenInBackground;
  }

  set bookmarkDragOpenInBackground(value: boolean) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      bookmarkDragOpenInBackground: value,
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
    localStorage.setItem('theme', this.theme);
    document.documentElement.setAttribute('data-theme', this.theme);
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
