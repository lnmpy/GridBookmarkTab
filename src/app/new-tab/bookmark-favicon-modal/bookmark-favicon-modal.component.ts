import { Component, EventEmitter, OnInit, Output, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Bookmark } from '@app/services/types';
import { ModalService } from '@app/services/modal.service';
import { FaviconService, isSvgCode, svgToDataUrl } from '@app/services/favicon.service';
import { TabService } from '@app/services/tab.service';
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
  private tabService: TabService = inject(TabService);
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

    const input = this.faviconUrl.trim();
    if (!input) {
      this.previewUrl = '';
      return;
    }

    if (isSvgCode(input)) {
      this.previewUrl = svgToDataUrl(input);
      return;
    }

    if (input.startsWith('data:image/')) {
      this.previewUrl = input;
      return;
    }

    // Validate URL format
    try {
      new URL(input);
      this.previewUrl = input;
    } catch (e) {
      this.errorMessage = this.i18n.t('invalidUrlFormat');
      this.previewUrl = '';
    }
  }

  async onFileSelected(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    if (!inputElement.files || inputElement.files.length === 0) {
      return;
    }

    const file = inputElement.files[0];
    this.errorMessage = '';
    this.isLoading = true;

    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      this.faviconUrl = dataUrl;
      await this.onUrlChange();
    } catch (error) {
      console.error('Error reading file:', error);
      this.errorMessage = this.i18n.t('failedToFetchImage');
    } finally {
      this.isLoading = false;
      inputElement.value = '';
    }
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  async onConfirm() {
    const input = this.faviconUrl.trim();
    if (!input) {
      this.errorMessage = this.i18n.t('pleaseEnterFaviconUrl');
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      let base64Url: string | null = null;

      if (isSvgCode(input)) {
        base64Url = svgToDataUrl(input);
      } else if (input.startsWith('data:image/')) {
        base64Url = svgToDataUrl(input);
      } else {
        // Fetch and convert to base64
        base64Url = await this.faviconService.urlToBase64Public(input);
      }

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

  triggerFileInput(fileInput: HTMLInputElement, detailsElement?: HTMLDetailsElement) {
    if (detailsElement) {
      detailsElement.removeAttribute('open');
    }
    fileInput.click();
  }

  onSearchIcon(detailsElement?: HTMLDetailsElement) {
    if (detailsElement) {
      detailsElement.removeAttribute('open');
    }

    const domain = this.bookmark?.url
      ? new URL(this.bookmark.url).hostname
      : (this.bookmark?.title || '');
    const searchQuery = encodeURIComponent(`${domain} favicon`);

    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    const windowWidth = 600;
    const windowHeight = 800;

    const left = Math.floor(screenWidth - windowWidth - 20);
    const top = Math.floor((screenHeight - windowHeight) / 2);

    this.tabService.createWindow(
      `https://www.google.com/search?tbm=isch&q=${searchQuery}`,
      false,
      {
        width: windowWidth,
        height: windowHeight,
        left: left,
        top: top,
      }
    );
  }
}
