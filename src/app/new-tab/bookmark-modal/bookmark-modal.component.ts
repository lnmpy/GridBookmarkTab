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

  title!: string;
  @Input() bookmark!: Bookmark;
  @Output() confirm = new EventEmitter<void>();

  bookmarkType!: Type;
  bookmarkTitle?: string;
  bookmarkParentId?: string;
  bookmarkUrl?: string;

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
  onKeydownEnter(event: KeyboardEvent) {
    event.preventDefault();
    this.onConfirm();
  }

  @HostListener('document:keydown.esc', ['$event'])
  onKeydownEsc(event: KeyboardEvent) {
    event.preventDefault();
    this.onCancel();
  }

  async onConfirm() {
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
