import { Component, EventEmitter, OnInit, Output, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Bookmark } from '@app/services/types';
import { ModalService } from '@app/services/modal.service';
import { FaviconService } from '@app/services/favicon.service';
import { I18nService } from '@app/services/i18n.service';

@Component({
  selector: 'app-bookmark-favicon-modal',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './bookmark-favicon-modal.component.html',
  styleUrls: ['./bookmark-favicon-modal.component.scss'],
})
export class BookmarkFaviconModalComponent implements OnInit {
  private modalService: ModalService = inject(ModalService);
  private faviconService: FaviconService = inject(FaviconService);
  i18n: I18nService = inject(I18nService);

  @Output() confirm = new EventEmitter<string>();

  title!: string;
  bookmark!: Bookmark;
  currentFaviconUrl!: string | undefined;

  faviconUrl: string = '';
  previewUrl: string = '';
  isLoading: boolean = false;
  errorMessage: string = '';

  ngOnInit() {
    // Input properties already set by ModalService.open()
    if (this.currentFaviconUrl) {
      this.faviconUrl = this.currentFaviconUrl;
      this.previewUrl = this.currentFaviconUrl;
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    if (!this.isLoading) {
      event.preventDefault();
      this.onCancel();
    }
  }

  async onUrlChange() {
    this.errorMessage = '';

    if (!this.faviconUrl.trim()) {
      this.previewUrl = '';
      return;
    }

    // Validate URL format
    try {
      new URL(this.faviconUrl);
      this.previewUrl = this.faviconUrl;
    } catch (e) {
      this.errorMessage = this.i18n.t('invalidUrlFormat');
      this.previewUrl = '';
    }
  }

  async onConfirm() {
    if (!this.faviconUrl.trim()) {
      this.errorMessage = this.i18n.t('pleaseEnterFaviconUrl');
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      // Fetch and convert to base64
      const base64Url = await this.faviconService.urlToBase64Public(this.faviconUrl);

      if (!base64Url) {
        this.errorMessage = this.i18n.t('failedToFetchImage');
        this.isLoading = false;
        return;
      }

      // Save to custom icon settings
      await this.faviconService.saveCustomIcon(this.bookmark.id, base64Url);

      // Update bookmark's favicon immediately
      this.bookmark.favIconUrl = base64Url;

      this.confirm.emit(base64Url);
      this.modalService.close();
    } catch (error) {
      console.error('Error saving favicon:', error);
      this.errorMessage = this.i18n.t('errorSavingFavicon');
      this.isLoading = false;
    }
  }

  onCancel() {
    this.modalService.close();
  }
}
