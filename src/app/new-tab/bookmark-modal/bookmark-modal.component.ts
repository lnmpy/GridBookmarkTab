import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  HostListener,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { BookmarkService } from '@app/services/bookmark.service';
import { Bookmark, Type } from '@app/services/types';
import { ModalService } from '@app/services/modal.service';
import { FaviconService, isSvgCode, svgToDataUrl } from '@app/services/favicon.service';
import { TabService } from '@app/services/tab.service';
import { I18nService } from '@app/services/i18n.service';

@Component({
  selector: 'app-bookmark-modal',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './bookmark-modal.component.html',
  styleUrls: ['./bookmark-modal.component.scss'],
})
export class BookmarkModalComponent implements OnInit {
  private bookmarkService: BookmarkService = inject(BookmarkService);
  private modalService: ModalService = inject(ModalService);
  private faviconService: FaviconService = inject(FaviconService);
  private tabService: TabService = inject(TabService);
  i18n: I18nService = inject(I18nService);

  @Input() title?: string;
  @Input() bookmark!: Bookmark;
  @Output() confirm = new EventEmitter<void>();

  bookmarkType!: Type;
  bookmarkTitle?: string;
  bookmarkParentId?: string;
  bookmarkUrl?: string;
  urlError?: string;

  faviconUrl: string = '';
  previewFaviconUrl: string = '';
  initialFaviconUrl: string = '';
  isFaviconLoading: boolean = false;
  faviconError?: string;

  bookmarkFolders: Bookmark[] = [];

  async ngOnInit() {
    this.bookmarkType = this.bookmark.type;
    this.bookmarkTitle = this.bookmark.title;
    this.bookmarkParentId = this.bookmark.parentId;
    this.bookmarkUrl = this.bookmark.url;
    this.initialFaviconUrl = this.bookmark.favIconUrl || '';
    this.previewFaviconUrl = this.initialFaviconUrl;

    if (!this.title) {
      this.title = this.bookmarkType === 'bookmarkFolder'
        ? this.i18n.t('editBookmarkFolder')
        : this.i18n.t('editBookmark');
    }

    this.bookmarkFolders = (await this.bookmarkService.getAllBookmarkFolders())
      .filter((f) => f.depth)
      .map((f) => ({ ...f, depth: f.depth! - 1 }));
  }

  @HostListener('document:keydown.enter', ['$event'])
  onKeydownEnter(event: Event) {
    if (!this.isFaviconLoading) {
      event.preventDefault();
      this.onConfirm();
    }
  }

  @HostListener('document:keydown.esc', ['$event'])
  onKeydownEsc(event: Event) {
    if (!this.isFaviconLoading) {
      event.preventDefault();
      this.onCancel();
    }
  }

  onUrlChange() {
    if (this.bookmarkType !== 'bookmark') {
      this.urlError = undefined;
      return;
    }
    if (this.bookmarkUrl && !this.normalizeUrl(this.bookmarkUrl)) {
      this.urlError = this.i18n.t('invalidUrl');
    } else {
      this.urlError = undefined;
    }
  }

  async onFaviconUrlChange() {
    this.faviconError = undefined;

    const input = this.faviconUrl.trim();
    if (!input) {
      this.previewFaviconUrl = this.initialFaviconUrl;
      return;
    }

    if (isSvgCode(input)) {
      this.previewFaviconUrl = svgToDataUrl(input);
      return;
    }

    if (input.startsWith('data:image/')) {
      this.previewFaviconUrl = input;
      return;
    }

    // Validate URL format
    try {
      new URL(input);
      this.previewFaviconUrl = input;
    } catch {
      this.faviconError = this.i18n.t('invalidUrlFormat');
      this.previewFaviconUrl = this.initialFaviconUrl;
    }
  }

  async onFileSelected(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    if (!inputElement.files || inputElement.files.length === 0) {
      return;
    }

    const file = inputElement.files[0];
    this.faviconError = undefined;
    this.isFaviconLoading = true;

    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      this.faviconUrl = dataUrl;
      await this.onFaviconUrlChange();
    } catch (error) {
      console.error('Error reading file:', error);
      this.faviconError = this.i18n.t('failedToFetchImage');
    } finally {
      this.isFaviconLoading = false;
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

    const targetUrl = this.bookmarkUrl || this.bookmark?.url;
    let domain = '';
    if (targetUrl) {
      try {
        const parsed = this.normalizeUrl(targetUrl);
        domain = parsed ? new URL(parsed).hostname : targetUrl;
      } catch {
        domain = targetUrl;
      }
    }
    if (!domain) {
      domain = this.bookmarkTitle || this.bookmark?.title || '';
    }

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
      },
    );
  }

  private normalizeUrl(url?: string): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    // 1. Try direct URL/URI parsing (handles any URI with scheme, e.g. http:, https:, javascript:, chrome:, mailto:, etc.)
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol) {
        return trimmed;
      }
    } catch {
      // Continue to check missing schema
    }

    // 2. Try prefixing with https:// for schema-less URLs (e.g. google.com)
    try {
      const parsedWithHttps = new URL(`https://${trimmed}`);
      const hostPortion = trimmed.split(/[/?#]/)[0];
      if (parsedWithHttps.protocol && parsedWithHttps.hostname && !/\s/.test(hostPortion)) {
        return `https://${trimmed}`;
      }
    } catch {
      // Parsing failed
    }

    return null;
  }

  async onConfirm() {
    if (this.isFaviconLoading) {
      return;
    }

    // validate URL for bookmark type
    if (this.bookmarkType === 'bookmark') {
      const normalized = this.normalizeUrl(this.bookmarkUrl);
      if (!normalized) {
        this.urlError = this.i18n.t('invalidUrl');
        return;
      }
      this.bookmarkUrl = normalized;

      if (this.faviconError) {
        return;
      }
    }

    let base64FaviconUrl: string | null = null;
    const favInput = this.faviconUrl.trim();

    if (this.bookmarkType === 'bookmark' && favInput) {
      this.isFaviconLoading = true;
      this.faviconError = undefined;

      try {
        if (isSvgCode(favInput)) {
          base64FaviconUrl = svgToDataUrl(favInput);
        } else if (favInput.startsWith('data:image/')) {
          base64FaviconUrl = svgToDataUrl(favInput);
        } else {
          base64FaviconUrl = await this.faviconService.urlToBase64Public(favInput);
        }

        if (!base64FaviconUrl) {
          this.faviconError = this.i18n.t('failedToFetchImage');
          this.isFaviconLoading = false;
          return;
        }

        if (this.bookmark.id) {
          await this.faviconService.saveCustomIcon(this.bookmark.id, base64FaviconUrl);
          this.bookmark.favIconUrl = base64FaviconUrl;
        }
      } catch (error) {
        console.error('Error saving favicon:', error);
        this.faviconError = this.i18n.t('errorSavingFavicon');
        this.isFaviconLoading = false;
        return;
      }
    }

    try {
      if (this.bookmark.id) {
        // update
        await this.bookmarkService.update(this.bookmark.id, {
          title: this.bookmarkTitle,
          url: this.bookmarkUrl,
          parentId:
            this.bookmarkParentId !== this.bookmark.parentId
              ? this.bookmarkParentId
              : undefined,
        });
        this.bookmark.title = this.bookmarkTitle!;
        this.bookmark.url = this.bookmarkUrl!;
        this.bookmark.parentId = this.bookmarkParentId;
      } else {
        // create
        const created = await this.bookmarkService.create({
          ...this.bookmark,
          title: this.bookmarkTitle!,
          url: this.bookmarkUrl,
          parentId: this.bookmarkParentId,
        });
        if (base64FaviconUrl && created?.id) {
          try {
            await this.faviconService.saveCustomIcon(created.id, base64FaviconUrl);
          } catch (e) {
            console.error('Failed to save custom icon for new bookmark:', e);
          }
        }
      }
      this.confirm.emit();
      this.modalService.close();
    } finally {
      this.isFaviconLoading = false;
    }
  }

  onCancel() {
    this.modalService.close();
  }
}

