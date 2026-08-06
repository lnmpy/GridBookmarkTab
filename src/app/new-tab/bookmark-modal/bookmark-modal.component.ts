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
  i18n: I18nService = inject(I18nService);

  title!: string;
  @Input() bookmark!: Bookmark;
  @Output() confirm = new EventEmitter<void>();

  bookmarkType!: Type;
  bookmarkTitle?: string;
  bookmarkParentId?: string;
  bookmarkUrl?: string;
  urlError?: string;

  bookmarkFolders: Bookmark[] = [];

  async ngOnInit() {
    this.title = 'Edit Bookmark';
    this.bookmarkType = this.bookmark.type;
    this.bookmarkTitle = this.bookmark.title;
    this.bookmarkParentId = this.bookmark.parentId;
    this.bookmarkUrl = this.bookmark.url;
    this.bookmarkFolders = (await this.bookmarkService.getAllBookmarkFolders())
      .filter((f) => f.depth)
      .map((f) => ({ ...f, depth: f.depth! - 1 }));
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

  private isUrlValid(url: string): boolean {
    return this.normalizeUrl(url) !== null;
  }

  async onConfirm() {
    // validate URL for bookmark type
    if (this.bookmarkType === 'bookmark') {
      const normalized = this.normalizeUrl(this.bookmarkUrl);
      if (!normalized) {
        this.urlError = this.i18n.t('invalidUrl');
        return;
      }
      this.bookmarkUrl = normalized;
    }

    if (!!this.bookmark.id) {
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
      await this.bookmarkService.create({
        ...this.bookmark,
        title: this.bookmarkTitle!,
        url: this.bookmarkUrl,
        parentId: this.bookmarkParentId,
      });
    }
    this.confirm.emit();
    this.modalService.close();
  }

  onCancel() {
    this.modalService.close();
  }
}
