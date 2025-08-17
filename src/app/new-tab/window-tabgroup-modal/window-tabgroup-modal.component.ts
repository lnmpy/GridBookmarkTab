import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { WindowTabService } from '@app/services/window-tab.service';
import { Window, TabGroup, TabGroupColor } from '@app/services/types';
import { ModalService } from '@app/services/modal.service';

@Component({
  selector: 'app-window-tabgroup-modal',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './window-tabgroup-modal.component.html',
  styleUrls: ['./window-tabgroup-modal.component.scss'],
})
export class WindowTabgroupModalComponent {
  private windowTabService: WindowTabService = inject(WindowTabService);
  private modalService: ModalService = inject(ModalService);

  title!: string;
  @Input() window?: Window;
  @Input() tabGroup?: TabGroup;
  @Output() confirm = new EventEmitter<void>();

  windowTitle?: string;
  tabGroupTitle?: string;
  tabGroupColor?: TabGroupColor;

  tabGroupColors: TabGroupColor[] = Object.values(
    chrome.tabGroups.Color,
  ) as TabGroupColor[];

  ngOnInit() {
    this.title = 'Edit Bookmark';
    this.windowTitle = this.window?.title;
    this.tabGroupTitle = this.tabGroup?.title;
    this.tabGroupColor = this.tabGroup?.color;
  }

  @HostListener('document:keydown.enter', ['$event'])
  onKeydownEnter(event: KeyboardEvent) {
    event.preventDefault();
    this.onConfirm();
  }

  @HostListener('document:keydown.esc', ['$event'])
  onKeydownEsc(event: KeyboardEvent) {
    event.preventDefault();
    this.onCancel();
  }

  async onConfirm() {
    if (!!this.tabGroup) {
      // update
      await this.windowTabService.updateTabGroup(this.tabGroup, {
        ...this.tabGroup,
        title: this.tabGroupTitle!,
        color: this.tabGroupColor!,
      });
      this.tabGroup.title = this.tabGroupTitle!;
      this.tabGroup.color = this.tabGroupColor!;
    } else {
      // TODO rename window
    }
    this.confirm.emit();
    this.modalService.close();
  }

  onCancel() {
    this.modalService.close();
  }
}
