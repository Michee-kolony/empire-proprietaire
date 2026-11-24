import { Injectable, NgZone, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { BehaviorSubject } from 'rxjs';
import { Incident, IncidentsService } from './incidents.service';
import { ProprietaireAuthService } from './proprietaire-auth.service';

const VERIFICATION_MS = 10000;
const SON_ALARME = 'assets/sons/alarme.wav';
const CANAL_INCIDENTS = 'incidents';

// Alarme du propriétaire : tant qu'un incident de ses propriétés n'est pas résolu
// (« nouveau » ou « en cours de traitement »), une sirène tourne en boucle et le téléphone vibre.
// L'alarme s'arrête d'elle-même quand l'administration résout ou classe le dernier incident.
// « Couper le son » la fait taire jusqu'au prochain NOUVEL incident.
@Injectable({ providedIn: 'root' })
export class AlarmeIncidentsService {

  private incidentsService = inject(IncidentsService);
  private auth = inject(ProprietaireAuthService);
  private zone = inject(NgZone);

  private actifsSubject = new BehaviorSubject<Incident[]>([]);
  readonly actifs$ = this.actifsSubject.asObservable();

  private sonneSubject = new BehaviorSubject<boolean>(false);
  readonly sonne$ = this.sonneSubject.asObservable();

  private audio: HTMLAudioElement | null = null;
  private minuterie: ReturnType<typeof setInterval> | undefined;
  private connus = new Set<string>();
  // Incidents pour lesquels le propriétaire a coupé le son
  private silencieux = new Set<string>();
  private premiereVerification = true;
  private demarre = false;

  // Appelé une fois au lancement de l'application
  demarrer(): void {
    if (this.demarre) return;
    this.demarre = true;

    void this.preparerNotifications();

    this.auth.proprietaire$.subscribe(proprietaire => {
      clearInterval(this.minuterie);
      if (!proprietaire) {
        this.reinitialiser();
        return;
      }
      void this.verifier();
      this.minuterie = setInterval(() => void this.verifier(), VERIFICATION_MS);
    });

    // Retour au premier plan : vérification immédiate
    if (Capacitor.isNativePlatform()) {
      void App.addListener('resume', () => this.zone.run(() => {
        if (this.auth.proprietaire) void this.verifier();
      }));
    }
  }

  couperSon(): void {
    this.actifsSubject.value.forEach(i => this.silencieux.add(i._id));
    this.mettreAJourAlarme();
  }

  // Après une action du propriétaire (incident résolu…) : la sirène s'arrête sans attendre 10 s
  verifierMaintenant(): void {
    if (this.auth.proprietaire) void this.verifier();
  }

  private async verifier(): Promise<void> {
    let actifs: Incident[];
    try {
      actifs = await this.incidentsService.incidentsActifs();
    } catch {
      return; // Réseau indisponible : on garde l'état actuel, nouvel essai au prochain tour
    }
    if (!this.auth.proprietaire) return;

    const nouveaux = actifs.filter(i => !this.connus.has(i._id));
    if (!this.premiereVerification) nouveaux.forEach(i => void this.notifier(i));
    this.premiereVerification = false;

    // Les incidents résolus sortent des listes ; un nouvel incident relance donc toujours la sirène
    const ids = new Set(actifs.map(i => i._id));
    this.connus = ids;
    this.silencieux = new Set([...this.silencieux].filter(id => ids.has(id)));

    this.actifsSubject.next(actifs);
    this.mettreAJourAlarme();
  }

  private mettreAJourAlarme(): void {
    const doitSonner = this.actifsSubject.value.some(i => !this.silencieux.has(i._id));
    if (doitSonner) {
      this.jouer();
      void Haptics.vibrate({ duration: 800 }).catch(() => undefined);
    } else {
      this.arreter();
    }
    if (this.sonneSubject.value !== doitSonner) this.sonneSubject.next(doitSonner);
  }

  private jouer(): void {
    if (!this.audio) {
      this.audio = new Audio(SON_ALARME);
      this.audio.loop = true;
    }
    if (this.audio.paused) {
      // Navigateur : la lecture peut être bloquée tant que l'utilisateur n'a pas touché la page ;
      // nouvel essai à la prochaine vérification
      void this.audio.play().catch(() => undefined);
    }
  }

  private arreter(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }

  private reinitialiser(): void {
    this.arreter();
    this.connus.clear();
    this.silencieux.clear();
    this.premiereVerification = true;
    this.actifsSubject.next([]);
    this.sonneSubject.next(false);
  }

  // Notification système Android / iOS (son et vibration du téléphone), visible même hors de l'application
  private async preparerNotifications(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') await LocalNotifications.requestPermissions();
      if (Capacitor.getPlatform() === 'android') {
        await LocalNotifications.createChannel({
          id: CANAL_INCIDENTS,
          name: 'Incidents',
          description: 'Alerte quand un incident est signalé sur vos propriétés',
          importance: 5,
          visibility: 1,
          vibration: true
        });
      }
    } catch {
      // Notifications refusées : la sirène dans l'application reste active
    }
  }

  private async notifier(incident: Incident): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 2_000_000_000),
          title: `🚨 Incident : ${incident.typeLibelle}`,
          body: `${incident.graviteLibelle}${incident.propriete ? ' — ' + incident.propriete.nomReference : ''}`,
          channelId: CANAL_INCIDENTS,
          extra: { incident: incident._id }
        }]
      });
    } catch {
      // Ignoré : la sirène dans l'application reste active
    }
  }
}
