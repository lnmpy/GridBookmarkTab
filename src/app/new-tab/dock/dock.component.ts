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
  SimpleChanges,
} from '@angular/core';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroFolder } from '@ng-icons/heroicons/outline';
import { Bookmark } from '@app/services/types';

@Component({
  selector: 'app-dock',
  standalone: true,
  imports: [NgIcon],
  providers: [
    provideIcons({
      heroFolder,
    }),
  ],
  templateUrl: './dock.component.html',
  styleUrls: ['./dock.component.scss'],
})
export class DockComponent implements OnInit, OnChanges {
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

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

  @ViewChild('dockContainer') dockContainerRef?: ElementRef<HTMLDivElement>;

  public static readonly MAX_DOCK_ITEMS = 12;
  public maxVisibleItems: number = 12;

  public ngOnInit(): void {
    this.updateMaxVisibleItems();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['iconSize'] || changes['dockFolder']) {
      this.updateMaxVisibleItems();
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

  public onItemClick(event: MouseEvent, item: Bookmark): void {
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
