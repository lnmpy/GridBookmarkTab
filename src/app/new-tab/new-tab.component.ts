import { booleanAttribute, Component, OnInit } from '@angular/core';
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
  bookmarks: Bookmark[] = [];
  loading: boolean = true;
  error: string | null = null;
  settings: SettingsService;

  constructor(
    private bookmarkService: BookmarkService,
    private settingsService: SettingsService,
  ) {
    this.settings = settingsService;
  }

  ngOnInit() {
    this.loading = false;
    this.bookmarks =
      (this.bookmarkService.getBookmarks()[0].children || [])[0].children || [];
  }

  /**
   * 辅助函数，用于在模板中递归渲染书签。
   * 这个函数会直接在模板中被调用，它处理单个 Bookmark 对象。
   */
  trackByBookmarkId(index: number, bookmark: Bookmark): string {
    return bookmark.id;
  }
}
