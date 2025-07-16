import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-new-tab',
  standalone: true,
  templateUrl: './new-tab.component.html',
  styleUrls: ['./new-tab.component.scss'],
})
export class NewTabComponent implements OnInit {
  constructor() {}

  ngOnInit(): void {
    console.log('new-tab component init');
  }
}
