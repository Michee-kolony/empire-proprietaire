import { Component, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StatusBar, Style } from '@capacitor/status-bar';
import { AlarmeIncidentsService } from './services/alarme-incidents.service';
import { ChatService } from './services/chat.service';
import { ProprietaireAuthService } from './services/proprietaire-auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  readonly proprietaire$ = inject(ProprietaireAuthService).proprietaire$;
  readonly alarme = inject(AlarmeIncidentsService);

  private router = inject(Router);
  private zone = inject(NgZone);

  constructor() {
    if (Capacitor.isNativePlatform()) {
      void StatusBar.setOverlaysWebView({ overlay: false });
      void StatusBar.setStyle({ style: Style.Dark });

      // Toucher la notification d'un incident ouvre son détail
      void LocalNotifications.addListener('localNotificationActionPerformed', action => {
        const id = action.notification.extra?.incident;
        if (id) this.zone.run(() => this.router.navigate(['/proprietaire/incidents', id]));
      });
    }
    this.alarme.demarrer();
    // Messagerie en temps réel (et compteur de messages non lus)
    inject(ChatService).demarrer();
  }

  voirIncidents(actifs: { _id: string }[]): void {
    if (actifs.length === 1) this.router.navigate(['/proprietaire/incidents', actifs[0]._id]);
    else this.router.navigate(['/proprietaire/carte']);
  }
}
