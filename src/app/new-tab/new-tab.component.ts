import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Bookmark, BookmarkService } from '../services/bookmark.service';

@Component({
  selector: 'app-new-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './new-tab.component.html',
  styleUrls: ['./new-tab.component.scss'],
})
export class NewTabComponent implements OnInit {
  columns: number = 8;

  bookmarks: Bookmark[] = [];
  breadcrumb: Bookmark[] = [];
  currentFolder: Bookmark | undefined;

  constructor(private bookmarkService: BookmarkService) {}

  ngOnInit() {
    this.bookmarks = this.bookmarkService.getBookmarks()[0].children || [];
    this.currentFolder = this.bookmarks[0];
    this.breadcrumb = [this.bookmarks[0]];
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
}
