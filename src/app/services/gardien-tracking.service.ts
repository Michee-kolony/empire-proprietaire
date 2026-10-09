import { Injectable, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { BehaviorSubject } from 'rxjs';
import { GardienAuthService } from './gardien-auth.service';
import { GardienLocalisationService } from './gardien-localisation.service';

const INTERVALLE_ENVOI_MS = 5 * 60000;

// =====================================================
// POSITION PENDANT LE SERVICE
// Tant qu'un service est en cours (ou terminé mais avant son heure de fin prévue)
// ET que l'application est au premier plan, la position est envoyée toutes les 5 min
// (PATCH /api/gardiens/position). Pas de suivi en arrière-plan (batterie et vie privée).
// =====================================================

@Injectable({ providedIn: 'root' })
export class GardienTrackingService {

  private auth = inject(GardienAuthService);
  private localisation = inject(GardienLocalisationService);

  private enService = false;
  // Heure (ms) où le partage s'arrête de lui-même ; null : jusqu'à la fin du service en cours
  private finPartageMs: number | null = null;
  private enArrierePlan = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private envoiEnCours = false;
  private dernierEnvoiMs = 0;

  private dernierEnvoiSubject = new BehaviorSubject<Date | null>(null);
  dernierEnvoi$ = this.dernierEnvoiSubject.asObservable();

  constructor() {
    void App.addListener('pause', () => {
      this.enArrierePlan = true;
      this.programmer();
    });
    void App.addListener('resume', () => {
      this.enArrierePlan = false;
      this.programmer();
    });

    // Déconnexion (ou session expirée) : on coupe le suivi
    this.auth.gardien$.subscribe(g => {
      if (!g) this.synchroniser(false);
    });
  }

  // Appelé après chaque chargement de /presences/mon-service.
  // finPartageMs : heure de fin prévue d'un service déjà terminé (partage prolongé jusque-là)
  synchroniser(actif: boolean, finPartageMs: number | null = null): void {
    const fin = actif ? finPartageMs : null;
    if (actif === this.enService && fin === this.finPartageMs) return;
    this.enService = actif;
    this.finPartageMs = fin;
    if (!actif) this.dernierEnvoiSubject.next(null);
    this.programmer();
  }

  private get partageExpire(): boolean {
    return this.finPartageMs !== null && Date.now() >= this.finPartageMs;
  }

  private programmer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.enService && this.partageExpire) this.synchroniser(false);
    if (!this.enService || this.enArrierePlan) return;

    this.timer = setInterval(() => this.envoyer(), INTERVALLE_ENVOI_MS);
    // Premier envoi (ou retour au premier plan) si le dernier date de plus de 5 min
    if (Date.now() - this.dernierEnvoiMs >= INTERVALLE_ENVOI_MS) void this.envoyer();
  }

  private async envoyer(): Promise<void> {
    if (!this.enService || this.envoiEnCours) return;
    // Heure de fin prévue passée : on arrête de partager
    if (this.partageExpire) {
      this.synchroniser(false);
      return;
    }
    this.envoiEnCours = true;
    try {
      const position = await this.localisation.positionSiAutorisee();
      if (position && this.enService) {
        await this.auth.envoyerPosition(position.lat, position.lng);
        this.dernierEnvoiMs = Date.now();
        this.dernierEnvoiSubject.next(new Date());
      }
    } catch {
      // Réseau coupé : on réessaiera au prochain envoi
    } finally {
      this.envoiEnCours = false;
    }
  }
}
