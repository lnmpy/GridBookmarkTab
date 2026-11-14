import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  Output,
  ViewContainerRef,
  inject,
  signal,
} from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { I18nService } from '@app/services/i18n.service';
import {
  ToolDefinition,
  ToolId,
  ToolboxService,
} from '@app/services/toolbox.service';
import { ToastService } from '@app/services/toast.service';
import {
  ContextMenuComponent,
  ContextMenuItem,
} from '@app/components/context-menu/context-menu.component';
import { ToolIconComponent } from './tool-icon.component';

@Component({
  selector: 'app-toolbox-popover',
  standalone: true,
  imports: [CdkDropList, CdkDrag, ToolIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="surface glass-overlay elev-3 rounded-[20px] w-[312px] sm:w-[328px] p-4 select-none"
      role="dialog"
      [attr.aria-label]="i18n.t('toolbox')"
      (click)="$event.stopPropagation()"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-1 mb-3">
        <span class="text-[14px] font-semibold text-base-content">
          {{ i18n.t('toolbox') }}
        </span>
        <button
          type="button"
          class="text-[12px] font-medium text-primary hover:opacity-80 transition-opacity cursor-pointer"
          (click)="onManageTools()"
        >
          {{ i18n.t('manageTools') }}
        </button>
      </div>

      <!-- 3x3 Tool Grid -->
      <div
        class="grid grid-cols-3 gap-1.5"
        cdkDropList
        cdkDropListOrientation="mixed"
        [cdkDropListData]="toolboxService.visibleTools()"
        (cdkDropListDropped)="onDrop($event)"
      >
        @for (tool of toolboxService.visibleTools(); track tool.id) {
          <button
            type="button"
            class="group flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-2xl hover:bg-chip transition-colors cursor-pointer relative"
            cdkDrag
            [cdkDragData]="tool"
            [cdkDragStartDelay]="{ touch: 200, mouse: 140 }"
            (cdkDragStarted)="isDragging.set(true)"
            (cdkDragEnded)="onDragEnded()"
            (click)="onToolClick(tool)"
            (contextmenu)="onToolContextMenu($event, tool)"
          >
            <div
              class="w-11 h-11 rounded-[13px] surface-sunken flex items-center justify-center text-base-content/85 group-hover:text-base-content transition-colors relative"
            >
              <app-tool-icon [toolId]="tool.id" iconClass="w-5 h-5" />
            </div>
            <span class="text-[12px] text-ink-2 group-hover:text-base-content truncate max-w-full leading-tight">
              {{ i18n.t(tool.nameKey) }}
            </span>
          </button>
        }
      </div>

      <!-- Footer Hint -->
      <div class="mt-2.5 pt-2.5 border-t border-line-soft text-[11px] text-ink-3 text-center">
        {{ i18n.t('toolboxHint') }}
      </div>
    </div>
  `,
})
export class ToolboxPopoverComponent implements OnDestroy {
  public i18n = inject(I18nService);
  public toolboxService = inject(ToolboxService);
  private toastService = inject(ToastService);
  private overlay = inject(Overlay);
  private vcr = inject(ViewContainerRef);
  private elementRef = inject(ElementRef<HTMLElement>);

  @Output() selectTool = new EventEmitter<ToolId>();
  @Output() manageTools = new EventEmitter<void>();
  @Output() closePopover = new EventEmitter<void>();

  isDragging = signal(false);
  private dragEndTimer: ReturnType<typeof setTimeout> | null = null;
  private contextMenuRef: OverlayRef | null = null;

  ngOnDestroy(): void {
    this.closeContextMenu();
    if (this.dragEndTimer) {
      clearTimeout(this.dragEndTimer);
      this.dragEndTimer = null;
    }
  }

  onDragEnded(): void {
    if (this.dragEndTimer) clearTimeout(this.dragEndTimer);
    this.dragEndTimer = setTimeout(() => {
      this.isDragging.set(false);
      this.dragEndTimer = null;
    }, 80);
  }

  onDrop(event: CdkDragDrop<ToolDefinition[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    void this.toolboxService.reorderVisibleTools(
      event.previousIndex,
      event.currentIndex,
    );
  }

  onToolClick(tool: ToolDefinition): void {
    if (this.isDragging()) return;
    this.closeContextMenu();
    this.selectTool.emit(tool.id);
  }

  onManageTools(): void {
    this.closeContextMenu();
    this.manageTools.emit();
  }

  onToolContextMenu(event: MouseEvent, tool: ToolDefinition): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeContextMenu();

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo({ x: event.clientX, y: event.clientY })
      .withPositions([
        {
          originX: 'start',
          originY: 'top',
          overlayX: 'start',
          overlayY: 'top',
        },
        {
          originX: 'end',
          originY: 'top',
          overlayX: 'end',
          overlayY: 'top',
        },
      ]);

    const overlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.close(),
    });
    this.contextMenuRef = overlayRef;

    const isPinned = this.toolboxService.isPinned(tool.id);
    const items: ContextMenuItem[] = [
      {
        label: this.i18n.t('openTool'),
        action: () => {
          this.closeContextMenu();
          this.selectTool.emit(tool.id);
        },
      },
      {
        label: isPinned ? this.i18n.t('unpinFromMenu') : this.i18n.t('pinToMenu'),
        action: () => {
          this.closeContextMenu();
          void this.togglePin(tool);
        },
      },
    ];

    const portal = new ComponentPortal(ContextMenuComponent, this.vcr);
    const componentRef = overlayRef.attach(portal);
    componentRef.instance.items = items;
    componentRef.instance.menuSelect.subscribe((item) => {
      item.action();
    });

    overlayRef.backdropClick().subscribe(() => {
      this.closeContextMenu();
    });
  }

  private async togglePin(tool: ToolDefinition): Promise<void> {
    const pinned = await this.toolboxService.togglePinToMenu(tool.id);
    const toolName = this.i18n.t(tool.nameKey);
    this.toastService.show(
      this.i18n.t(pinned ? 'pinnedToMenuToast' : 'unpinnedFromMenuToast', [toolName]),
      'success',
    );
  }

  private closeContextMenu(): void {
    if (this.contextMenuRef) {
      this.contextMenuRef.dispose();
      this.contextMenuRef = null;
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (this.contextMenuRef) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (this.elementRef.nativeElement.contains(target)) return;
    if (target.closest('[data-toolbox-trigger]')) return;
    this.closePopover.emit();
  }

  @HostListener('window:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (this.contextMenuRef) {
      event.stopPropagation();
      this.closeContextMenu();
      return;
    }
    this.closePopover.emit();
  }
}
