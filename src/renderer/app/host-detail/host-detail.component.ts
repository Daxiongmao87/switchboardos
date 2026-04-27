/**
 * SwitchboardOS — Host Detail Component (Stub)
 *
 * Placeholder for the host detail view that will be implemented in M3.
 */

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-host-detail',
  template: `
    <div class="host-detail-placeholder">
      <h2>Host Detail</h2>
      <p class="text-muted">Loading host detail… (M3)</p>
    </div>
  `,
  styles: [`
    .host-detail-placeholder {
      padding: 24px;
    }
  `],
})
export class HostDetailComponent implements OnInit {
  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    // Placeholder — host ID will be read from route in M3
  }
}
