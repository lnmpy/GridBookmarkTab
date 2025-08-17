import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';

import { NewTabComponent } from '@app/new-tab/new-tab.component';

describe('NewTabComponent', () => {
  let component: NewTabComponent;
  let fixture: ComponentFixture<NewTabComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewTabComponent],
      providers: [provideAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(NewTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
