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
import { CommonModule } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroFolder } from '@ng-icons/heroicons/outline';
import { Bookmark } from '@app/services/types';

interface DockItemTransform {
  scale: number;
  translateY: number;
}

@Component({
  selector: 'app-dock',
  standalone: true,
  imports: [CommonModule, NgIcon],
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
  @Input() magnification: boolean = true;

  @Output() folderClick = new EventEmitter<{ event: MouseEvent; folder: Bookmark }>();
  @Output() bookmarkClick = new EventEmitter<{ event: MouseEvent; bookmark: Bookmark }>();
  @Output() bookmarkContextMenu = new EventEmitter<{ event: MouseEvent; bookmark: Bookmark }>();

  @ViewChild('dockContainer') dockContainerRef?: ElementRef<HTMLDivElement>;

  public itemTransforms: DockItemTransform[] = [];
  public isHoveringDock: boolean = false;
  public isContextMenuActive: boolean = false;

  public static readonly MAX_DOCK_ITEMS = 12;
  public maxVisibleItems: number = 12;

  private readonly maxScale = 1.55;
  private readonly defaultTransform: DockItemTransform = { scale: 1, translateY: 0 };

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
    const calculatedCount = Math.floor((availableWidth - padding + gap) / itemFullWidth);
    this.maxVisibleItems = Math.min(DockComponent.MAX_DOCK_ITEMS, Math.max(1, calculatedCount));
    this.cdr.markForCheck();
  }

  public get items(): Bookmark[] {
    return (this.dockFolder?.children || []).slice(0, this.maxVisibleItems);
  }

  public getTransform(index: number): DockItemTransform {
    if (!this.magnification || (!this.isHoveringDock && !this.isContextMenuActive)) {
      return this.defaultTransform;
    }
    return this.itemTransforms[index] || this.defaultTransform;
  }

  public onMouseMove(event: MouseEvent): void {
    if (!this.magnification || !this.dockContainerRef) {
      return;
    }

    const container = this.dockContainerRef.nativeElement;
    const mouseX = event.clientX;
    const items = this.items;

    if (items.length === 0) return;

    this.isHoveringDock = true;
    const radius = Math.max(this.iconSize * 2.2, 120);

    const itemElements = container.querySelectorAll('.dock-item-wrapper');
    const newTransforms: DockItemTransform[] = [];

    itemElements.forEach((el, index) => {
      const elRect = el.getBoundingClientRect();
      const elCenterX = elRect.left + elRect.width / 2;
      const distance = Math.abs(mouseX - elCenterX);

      if (distance < radius) {
        // Smooth cosine bell curve
        const cosFactor = (Math.cos((distance / radius) * Math.PI) + 1) / 2;
        const scale = 1 + (this.maxScale - 1) * Math.pow(cosFactor, 1.2);
        const translateY = -((scale - 1) * this.iconSize * 0.55);
        newTransforms[index] = { scale, translateY };
      } else {
        newTransforms[index] = { scale: 1, translateY: 0 };
      }
    });

    this.itemTransforms = newTransforms;
    this.cdr.markForCheck();
  }

  public onMouseLeave(): void {
    this.isHoveringDock = false;
    if (!this.isContextMenuActive) {
      this.itemTransforms = [];
      this.cdr.markForCheck();
    }
  }

  public clearContextMenuState(): void {
    this.isContextMenuActive = false;
    if (!this.isHoveringDock) {
      this.itemTransforms = [];
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:click', ['$event'])
  @HostListener('document:contextmenu', ['$event'])
  public onDocumentClickOrContext(event: MouseEvent): void {
    if (!this.isContextMenuActive) return;
    const target = event.target as HTMLElement;
    if (!this.dockContainerRef?.nativeElement.contains(target)) {
      this.clearContextMenuState();
    }
  }

  public onItemClick(event: MouseEvent, item: Bookmark): void {
    this.clearContextMenuState();
    if (item.type === 'bookmarkFolder') {
      this.folderClick.emit({ event, folder: item });
    } else {
      this.bookmarkClick.emit({ event, bookmark: item });
    }
  }

  public onContextMenu(event: MouseEvent, item: Bookmark): void {
    event.preventDefault();
    event.stopPropagation();
    this.isContextMenuActive = true;
    this.bookmarkContextMenu.emit({ event, bookmark: item });
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
