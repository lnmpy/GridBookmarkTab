import {
  Component,
  EventEmitter,
  Output,
  inject,
  HostListener,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Bookmark, AVAILABLE_THEMES, WallpaperType } from '@app/services/types';
import { SettingsService } from '@app/services/settings.service';
import { ModalService } from '@app/services/modal.service';
import { BookmarkService } from '@app/services/bookmark.service';
import { I18nService } from '@app/services/i18n.service';
import { WallpaperService } from '@app/services/wallpaper.service';

@Component({
  selector: 'app-settings-modal',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.scss'],
})
export class SettingsModalComponent implements OnInit {
  private bookmarkService: BookmarkService = inject(BookmarkService);
  private settingsService: SettingsService = inject(SettingsService);
  private modalService: ModalService = inject(ModalService);
  public wallpaperService: WallpaperService = inject(WallpaperService);
  i18n: I18nService = inject(I18nService);

  @Output() confirm = new EventEmitter<void>();
  @Output() columnsChange = new EventEmitter<number>();

  readonly themes = AVAILABLE_THEMES;
  readonly columnsMin = 4;
  readonly columnsMax = 12;

  bookmarkRootFolders: Bookmark[] = [];

  async ngOnInit() {
    this.bookmarkRootFolders =
      await this.bookmarkService.getAllBookmarkFolders();
  }

  get theme() {
    return this.settingsService.settingsSource.value.theme;
  }

  set theme(value: string) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      theme: value,
    });
    document.documentElement.setAttribute('data-theme', this.theme);
  }

  get language() {
    return this.settingsService.settingsSource.value.language;
  }

  set language(value: string) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      language: value,
    });
    // Update i18n service immediately for preview
    this.i18n.setLanguage(value);
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

  get bookmarkSize() {
    return this.settingsService.settingsSource.value.bookmarkSize;
  }

  set bookmarkSize(value: number) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      bookmarkSize: value,
    });
  }

  get bookmarkOpenInNewTab() {
    return this.settingsService.settingsSource.value.bookmarkOpenInNewTab;
  }

  set bookmarkOpenInNewTab(value: boolean) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      bookmarkOpenInNewTab: value,
    });
  }



  get bookmarkRootFolderId() {
    return this.settingsService.settingsSource.value.bookmarkRootFolderId;
  }

  set bookmarkRootFolderId(value: string) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      bookmarkRootFolderId: value,
    });
  }

  get wallpaperType(): WallpaperType {
    return this.settingsService.settingsSource.value.wallpaperType || 'none';
  }

  set wallpaperType(value: WallpaperType) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      wallpaperType: value,
    });
  }

  get wallpaperDim(): number {
    return this.settingsService.settingsSource.value.wallpaperDim ?? 10;
  }

  set wallpaperDim(value: number) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      wallpaperDim: value,
    });
  }

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
    document.documentElement.setAttribute(
      'data-theme',
      localStorage.getItem('theme') as string,
    );
    this.modalService.close();
  }

  openFullOptions() {
    this.modalService.close();
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: 'options.html' });
    } else {
      window.location.hash = '#/?target=options';
    }
  }
}
