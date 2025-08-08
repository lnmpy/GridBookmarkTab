import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ModalService } from '@app/services/modal.service';
import { FaviconService as FaviconService } from '@app/services/favicon.service';

@Component({
  selector: 'app-bookmark-favicon-modal',
  imports: [FormsModule],
  standalone: true,
  templateUrl: './bookmark-favicon-modal.component.html',
  styleUrls: ['./bookmark-favicon-modal.component.scss'],
})
export class BookmarkFaviconModalComponent {
  private modalService: ModalService = inject(ModalService);
  private faviconService: FaviconService = inject(FaviconService);

  @Output() confirm = new EventEmitter<void>();

  title!: string;
  faviconUrl!: string;

  ngOnInit() {
    this.title = 'Update Bookmark Favicon';
  }

  async onConfirm() {
    this.confirm.emit();
    this.modalService.close();
  }

  onCancel() {
    this.modalService.close();
  }
}
