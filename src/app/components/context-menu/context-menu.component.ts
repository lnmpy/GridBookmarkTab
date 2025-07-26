import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ContextMenuItem {
  label: string;
  action: () => void;
}

@Component({
  selector: 'app-context-menu',
  imports: [CommonModule],
  templateUrl: './context-menu.component.html',
  styleUrl: './context-menu.component.scss',
})
export class ContextMenuComponent {
  @Input() items: ContextMenuItem[] = [];
  @Output() menuSelect = new EventEmitter<ContextMenuItem>();

  onSelect(item: ContextMenuItem) {
    this.menuSelect.emit(item);
  }
}
