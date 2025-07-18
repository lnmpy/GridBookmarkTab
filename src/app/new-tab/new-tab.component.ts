import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Bookmark, BookmarkService } from '../services/bookmark.service';
import { SettingsService } from '../services/settings.service';

@Component({
  selector: 'app-new-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './new-tab.component.html',
  styleUrls: ['./new-tab.component.scss'],
})
export class NewTabComponent implements OnInit {
  columns: number = 7;

  breadcrumb: Bookmark[] = [];
  currentFolder: Bookmark | undefined;

  constructor(
    private bookmarkService: BookmarkService,
    private settingsService: SettingsService,
  ) {}

  ngOnInit() {
    const rootFolderId = this.settingsService.getSettings().rootFolderId;
    const bookmarks = this.bookmarkService.getBookmarks()[0].children || [];
    this.currentFolder =
      this.getRootFolder(bookmarks, rootFolderId) || bookmarks[0];
    this.breadcrumb = [this.currentFolder];
  }

  openFolder(folder: any) {
    this.breadcrumb.push(folder);
    this.currentFolder = folder;
  }

  navigateToCrumb(crumb: any) {
    const index = this.breadcrumb.indexOf(crumb);
    this.breadcrumb = this.breadcrumb.slice(0, index + 1);
    this.currentFolder = crumb;
  }

  private getRootFolder(
    bookmarks: Bookmark[],
    rootFolderId: string,
  ): Bookmark | null {
    for (const bookmark of bookmarks) {
      if (bookmark.type !== 'bookmarkFolder') {
        continue;
      }
      if (bookmark.id === rootFolderId) {
        return bookmark;
      }

      if (bookmark.children) {
        const result = this.getRootFolder(bookmark.children, rootFolderId);
        if (result) return result;
      }
    }
    return null;
  }
}
