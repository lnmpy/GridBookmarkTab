import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-popup',
  standalone: true,
  template: `<p></p>`,
})
export class PopupComponent implements OnInit {
  colorPicker: string = '';

  ngOnInit() {
    chrome.tabs.create({ url: 'chrome://newtab' });
    window.close();
  }
}
