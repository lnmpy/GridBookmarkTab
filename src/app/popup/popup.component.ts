import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-popup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p></p>`,
})
export class PopupComponent implements OnInit {
  ngOnInit() {
    chrome.tabs.create({ url: 'chrome://newtab' });
    window.close();
  }
}
