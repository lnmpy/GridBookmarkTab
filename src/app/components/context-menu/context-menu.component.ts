import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
} from '@angular/core';

export interface ContextMenuItem {
  label: string;
  action: () => void;
}

@Component({
  selector: 'app-context-menu',
  imports: [],
  templateUrl: './context-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './context-menu.component.scss',
})
export class ContextMenuComponent {
  @Input() items: ContextMenuItem[] = [];
  @Output() menuSelect = new EventEmitter<ContextMenuItem>();

  onSelect(item: ContextMenuItem) {
    this.menuSelect.emit(item);
  }
}
