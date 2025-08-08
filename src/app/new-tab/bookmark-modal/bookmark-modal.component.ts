import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BookmarkService } from '@app/services/bookmark.service';
import { Bookmark } from '@app/services/types';
import { ModalService } from '@app/services/modal.service';

@Component({
  selector: 'app-bookmark-modal',
  imports: [FormsModule],
  standalone: true,
  templateUrl: './bookmark-modal.component.html',
  styleUrls: ['./bookmark-modal.component.scss'],
})
export class BookmarkModalComponent {
  private bookmarkService: BookmarkService = inject(BookmarkService);
  private modalService: ModalService = inject(ModalService);

  title!: string;
  @Input() bookmark!: Bookmark;
  @Output() confirm = new EventEmitter<void>();

  bookmarkTitle?: string;
  bookmarkUrl?: string;

  ngOnInit() {
    this.title = 'Edit Bookmark';
    this.bookmarkTitle = this.bookmark.title;
    this.bookmarkUrl = this.bookmark.url;
  }

  async onConfirm() {
    if (this.bookmark.id) {
      await this.bookmarkService.update(this.bookmark.id, {
        ...this.bookmark,
        title: this.bookmarkTitle,
        url: this.bookmarkUrl,
      });
      this.bookmark.title = this.bookmarkTitle!;
      this.bookmark.url = this.bookmarkUrl!;
    } else {
      await this.bookmarkService.create({
        ...this.bookmark,
        title: this.bookmarkTitle!,
        url: this.bookmarkUrl,
      });
    }
    this.confirm.emit();
    this.modalService.close();
  }

  onCancel() {
    this.modalService.close();
  }
}
