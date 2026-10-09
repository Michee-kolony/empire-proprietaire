import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { GardienDataService, Incident } from '../../services/gardien-data.service';

const HOLD_DURATION_MS = 1800;
const HOLD_STEP_MS = 40;

@Component({
  selector: 'app-gardien-urgence',
  templateUrl: './gardien-urgence.page.html',
  styleUrls: ['./gardien-urgence.page.scss'],
  standalone: false
})
export class GardienUrgencePage implements OnDestroy {

  progress = 0;
  isHolding = false;
  isSending = false;
  isSent = false;
  incident: Incident | null = null;

  private holdInterval: any;

  constructor(private data: GardienDataService, private router: Router) {}

  startHold(): void {
    if (this.isSending || this.isSent) return;
    this.isHolding = true;
    this.progress = 0;

    this.holdInterval = setInterval(() => {
      this.progress += (HOLD_STEP_MS / HOLD_DURATION_MS) * 100;

      if (this.progress >= 100) {
        this.progress = 100;
        this.cancelHold();
        this.declencherAlerte();
      }
    }, HOLD_STEP_MS);
  }

  cancelHold(): void {
    this.isHolding = false;
    clearInterval(this.holdInterval);
    if (!this.isSending && !this.isSent) {
      this.progress = 0;
    }
  }

  private async declencherAlerte(): Promise<void> {
    this.isSending = true;
    this.incident = await this.data.triggerUrgence();
    this.isSending = false;
    this.isSent = true;
  }

  retour(): void {
    this.router.navigateByUrl('/gardien/service');
  }

  ngOnDestroy(): void {
    clearInterval(this.holdInterval);
  }
}
