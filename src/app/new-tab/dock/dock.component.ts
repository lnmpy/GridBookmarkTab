import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
  inject,
  HostListener,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroFolder } from '@ng-icons/heroicons/outline';
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { BookmarkService } from '@app/services/bookmark.service';
import { Bookmark } from '@app/services/types';

@Component({
  selector: 'app-dock',
  standalone: true,
  imports: [NgIcon, DragDropModule],
  providers: [
    provideIcons({
      heroFolder,
    }),
  ],
  templateUrl: './dock.component.html',
  styleUrls: ['./dock.component.scss'],
})
export class DockComponent implements OnInit, OnChanges, OnDestroy {
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private bookmarkService: BookmarkService = inject(BookmarkService);

  @Input() dockFolder: Bookmark | null = null;
  @Input() iconSize: number = 52;

  @Output() folderClick = new EventEmitter<{
    event: MouseEvent;
    folder: Bookmark;
  }>();
  @Output() bookmarkClick = new EventEmitter<{
    event: MouseEvent;
    bookmark: Bookmark;
  }>();
  @Output() bookmarkContextMenu = new EventEmitter<{
    event: MouseEvent;
    bookmark: Bookmark;
  }>();
  @Output() itemDrop = new EventEmitter<{
    previousIndex: number;
    currentIndex: number;
    item: Bookmark;
  }>();

  @ViewChild('dockContainer') dockContainerRef?: ElementRef<HTMLDivElement>;

  public static readonly MAX_DOCK_ITEMS = 12;
  public maxVisibleItems: number = 12;
  public isDragging = false;
  private dragResetTimeout: ReturnType<typeof setTimeout> | null = null;

  public ngOnInit(): void {
    this.updateMaxVisibleItems();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['iconSize'] || changes['dockFolder']) {
      this.updateMaxVisibleItems();
    }
  }

  public ngOnDestroy(): void {
    if (this.dragResetTimeout) {
      clearTimeout(this.dragResetTimeout);
      this.dragResetTimeout = null;
    }
  }

  @HostListener('window:resize')
  public onWindowResize(): void {
    this.updateMaxVisibleItems();
  }

  public updateMaxVisibleItems(): void {
    if (typeof window === 'undefined') return;
    const windowWidth = window.innerWidth;
    const isMobile = windowWidth < 640;
    const gap = isMobile ? 12 : 14;
    const padding = isMobile ? 32 : 40;
    const availableWidth = Math.min(windowWidth * 0.92, windowWidth - 32);
    const itemFullWidth = (this.iconSize || 52) + gap;
    const calculatedCount = Math.floor(
      (availableWidth - padding + gap) / itemFullWidth,
    );
    this.maxVisibleItems = Math.min(
      DockComponent.MAX_DOCK_ITEMS,
      Math.max(1, calculatedCount),
    );
    this.cdr.markForCheck();
  }

  public get items(): Bookmark[] {
    return (this.dockFolder?.children || []).slice(0, this.maxVisibleItems);
  }

  public onDragStarted(): void {
    if (this.dragResetTimeout) {
      clearTimeout(this.dragResetTimeout);
      this.dragResetTimeout = null;
    }
    this.isDragging = true;
  }

  public onDragEnded(): void {
    if (this.dragResetTimeout) {
      clearTimeout(this.dragResetTimeout);
    }
    this.dragResetTimeout = setTimeout(() => {
      this.isDragging = false;
      this.dragResetTimeout = null;
      this.cdr.markForCheck();
    }, 100);
  }

  public onDropListDropped(event: CdkDragDrop<Bookmark[]>): void {
    const previousIndex = event.previousIndex;
    const currentIndex = event.currentIndex;

    if (
      !this.dockFolder?.children ||
      previousIndex === currentIndex ||
      previousIndex < 0 ||
      currentIndex < 0
    ) {
      return;
    }

    const dragItem = event.item.data as Bookmark;
    if (!dragItem) {
      return;
    }

    // Optimistic in-place update for seamless UI animation
    moveItemInArray(this.dockFolder.children, previousIndex, currentIndex);
    this.dockFolder.children.forEach((child, idx) => {
      child.index = idx;
    });
    this.cdr.markForCheck();

    // Persist new position to Chrome native bookmarks
    // Pass reload=false to avoid jarring flash since local state is already optimistically updated
    this.bookmarkService.move(
      dragItem.id,
      {
        index: currentIndex,
      },
      false,
    );

    this.itemDrop.emit({
      previousIndex,
      currentIndex,
      item: dragItem,
    });
  }

  public onItemClick(event: MouseEvent, item: Bookmark): void {
    if (this.isDragging) {
      return;
    }
    if (item.type === 'bookmarkFolder') {
      this.folderClick.emit({ event, folder: item });
    } else {
      this.bookmarkClick.emit({ event, bookmark: item });
    }
  }

  public onContextMenu(event: MouseEvent, item: Bookmark): void {
    event.preventDefault();
    event.stopPropagation();
    this.bookmarkContextMenu.emit({ event, bookmark: item });
  }

  public clearContextMenuState(): void {
    // No-op for pure-CSS dock interactions
  }

  public getFolderMiniIcons(folder: Bookmark): (Bookmark | null)[] {
    const list: (Bookmark | null)[] = [];
    const children = (folder.children || []).slice(0, 4);
    for (let i = 0; i < 4; i++) {
      list.push(children[i] || null);
    }
    return list;
  }

  public trackById(_index: number, item: Bookmark): string {
    return item.id;
  }
}
