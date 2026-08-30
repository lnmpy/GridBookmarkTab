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
import { Bookmark } from '@app/services/types';
import { ModalService } from '@app/services/modal.service';
import { I18nService } from '@app/services/i18n.service';
import { ToastService } from '@app/services/toast.service';

@Component({
  selector: 'app-bookmark-move-modal',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './bookmark-move-modal.component.html',
  styleUrls: ['./bookmark-move-modal.component.scss'],
})
export class BookmarkMoveModalComponent implements OnInit {
  private bookmarkService: BookmarkService = inject(BookmarkService);
  private modalService: ModalService = inject(ModalService);
  private toastService: ToastService = inject(ToastService);
  i18n: I18nService = inject(I18nService);

  @Input() selectedBookmarkIds: string[] = [];
  @Input() currentFolderId?: string;
  @Output() confirm = new EventEmitter<void>();

  mode: 'existing' | 'new' = 'existing';
  selectedTargetFolderId: string = '';
  newFolderName: string = '';
  newFolderParentId: string = '';
  bookmarkFolders: Bookmark[] = [];
  isSubmitting = false;

  async ngOnInit() {
    const allFolders = await this.bookmarkService.getAllBookmarkFolders();
    const invalidFolderIds = this.getInvalidFolderIds(allFolders, this.selectedBookmarkIds);

    this.bookmarkFolders = allFolders
      .filter((f) => !invalidFolderIds.has(f.id))
      .map((f) => ({
        ...f,
        depth: Math.max(0, (f.depth || 1) - 1),
      }));

    if (this.currentFolderId && this.bookmarkFolders.some((f) => f.id === this.currentFolderId)) {
      this.selectedTargetFolderId = this.currentFolderId;
      this.newFolderParentId = this.currentFolderId;
    } else if (this.bookmarkFolders.length > 0) {
      this.selectedTargetFolderId = this.bookmarkFolders[0].id;
      this.newFolderParentId = this.bookmarkFolders[0].id;
    }
  }

  private getInvalidFolderIds(allFolders: Bookmark[], selectedIds: string[]): Set<string> {
    const invalid = new Set<string>();
    const selectedSet = new Set(selectedIds);

    // Build parent -> children map for folders
    const parentMap = new Map<string, string[]>();
    allFolders.forEach((f) => {
      if (f.parentId) {
        if (!parentMap.has(f.parentId)) {
          parentMap.set(f.parentId, []);
        }
        parentMap.get(f.parentId)!.push(f.id);
      }
    });

    // Helper to recursively collect child folders
    const addDescendants = (id: string) => {
      invalid.add(id);
      const children = parentMap.get(id) || [];
      children.forEach((childId) => addDescendants(childId));
    };

    allFolders.forEach((f) => {
      if (selectedSet.has(f.id)) {
        addDescendants(f.id);
      }
    });

    return invalid;
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

  async onConfirm() {
    if (this.isSubmitting || this.selectedBookmarkIds.length === 0) {
      return;
    }

    let targetFolderId: string;

    if (this.mode === 'new') {
      const folderName = this.newFolderName.trim();
      if (!folderName) {
        return;
      }
      this.isSubmitting = true;
      try {
        const parentId = this.newFolderParentId || this.currentFolderId || '1';
        const newFolderNode = await chrome.bookmarks.create({
          title: folderName,
          parentId: parentId,
        });
        targetFolderId = newFolderNode.id;
      } catch (e) {
        console.error('Failed to create new folder', e);
        this.isSubmitting = false;
        return;
      }
    } else {
      targetFolderId = this.selectedTargetFolderId;
    }

    if (!targetFolderId) {
      return;
    }

    this.isSubmitting = true;
    try {
      for (const id of this.selectedBookmarkIds) {
        await this.bookmarkService.move(id, { parentId: targetFolderId }, false);
      }
      // Reload bookmarks in service
      await this.bookmarkService.reloadBookmarks();
      this.toastService.show(this.i18n.t('bookmarksMoved'), 'success');
      this.confirm.emit();
      this.modalService.close();
    } catch (e) {
      console.error('Failed to move bookmarks', e);
    } finally {
      this.isSubmitting = false;
    }
  }

  onCancel() {
    this.modalService.close();
  }
}
