import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-popup',
  template: `<p></p>`,
})
export class PopupComponent implements OnInit {
  ngOnInit() {
    chrome.tabs.create({ url: 'chrome://newtab' });
    window.close();
  }
}
