import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Gardien, GardienAuthService } from './gardien-auth.service';

// =====================================================
// MODELES
// =====================================================

// Le gardien connecté est celui renvoyé par l'API (voir GardienAuthService)
export type Guard = Gardien;

export interface Assignment {
  propriete: string;
  adresse: string;
  client: string;
  photos: string[];
  horaireDebut: string;
  horaireFin: string;
  prochainService: {
    date: string;
    horaire: string;
    propriete: string;
  };
}

export interface GpsPosition {
  lat: number;
  lng: number;
}

export interface ServiceSession {
  id: number;
  propriete: string;
  date: string;
  heureDebut: string;
  gpsDebut: GpsPosition;
  heureFin?: string;
  gpsFin?: GpsPosition;
  duree?: string;
  statut: 'en_cours' | 'terminee';
}

export type NiveauUrgence = 'faible' | 'moyenne' | 'haute' | 'critique';

export interface Incident {
  id: number;
  type: string;
  description: string;
  photo?: string;
  video?: string;
  gps: GpsPosition;
  urgence: NiveauUrgence;
  date: string;
  heure: string;
}

export type StatutVisiteur = 'present' | 'sorti';

export interface Visiteur {
  id: number;
  nom: string;
  photo: string;
  motif: string;
  personneVisitee: string;
  date: string;
  heureEntree: string;
  heureSortie?: string;
  statut: StatutVisiteur;
}

const STORAGE_KEY = 'gardien_app_state';

// Position affichée localement quand le GPS est indisponible (jamais envoyée au backend)
const POSITION_REPLI: GpsPosition = { lat: -4.3217, lng: 15.3125 };

interface GardienState {
  assignment: Assignment;
  currentSession: ServiceSession | null;
  serviceHistory: ServiceSession[];
  incidents: Incident[];
  visiteurs: Visiteur[];
}

function defaultState(): GardienState {
  return {
    assignment: {
      propriete: 'Résidence du client',
      adresse: '12, Avenue des Palmiers, Kinshasa',
      client: 'M. et Mme Kalonji',
      // Photos de la propriété (hébergées en ligne)
      photos: [
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=800&q=70',
        'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=70',
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=70'
      ],
      horaireDebut: '18h00',
      horaireFin: '06h00',
      prochainService: {
        date: "aujourd'hui",
        horaire: '18h00 – 06h00',
        propriete: 'Résidence du client'
      }
    },
    currentSession: null,
    serviceHistory: [],
    incidents: [],
    visiteurs: []
  };
}

@Injectable({ providedIn: 'root' })
export class GardienDataService {

  private auth = inject(GardienAuthService);

  // Identifiant du gardien dont l'état local est chargé (clé de stockage)
  private gardienId: string | null = this.auth.gardien?._id ?? null;

  private state: GardienState = this.loadState();

  private assignmentSubject = new BehaviorSubject<Assignment>(this.state.assignment);
  private currentSessionSubject = new BehaviorSubject<ServiceSession | null>(this.state.currentSession);
  private serviceHistorySubject = new BehaviorSubject<ServiceSession[]>(this.state.serviceHistory);
  private incidentsSubject = new BehaviorSubject<Incident[]>(this.state.incidents);
  private visiteursSubject = new BehaviorSubject<Visiteur[]>(this.state.visiteurs);

  guard$: Observable<Guard | null> = this.auth.gardien$;
  assignment$ = this.assignmentSubject.asObservable();
  currentSession$ = this.currentSessionSubject.asObservable();
  serviceHistory$ = this.serviceHistorySubject.asObservable();
  incidents$ = this.incidentsSubject.asObservable();
  visiteurs$ = this.visiteursSubject.asObservable();

  constructor() {
    // Changement de gardien connecté (connexion / déconnexion) :
    // on recharge l'état local qui lui est propre.
    this.auth.gardien$
      .pipe(map(g => g?._id ?? null), distinctUntilChanged())
      .subscribe(id => {
        if (id === this.gardienId) return;
        this.gardienId = id;
        this.state = this.loadState();
        this.emitAll();
      });
  }

  get guard(): Guard | null {
    return this.auth.gardien;
  }

  get assignment(): Assignment {
    return this.state.assignment;
  }

  get currentSession(): ServiceSession | null {
    return this.state.currentSession;
  }

  get incidents(): Incident[] {
    return this.state.incidents;
  }

  // =====================================================
  // GEOLOCALISATION (best effort, valeur de repli statique)
  // =====================================================

  async getPosition(): Promise<GpsPosition> {
    return (await this.getPositionReelle()) ?? POSITION_REPLI;
  }

  // Position GPS réelle de l'appareil, ou null si indisponible
  // (seule une position réelle est envoyée au backend)
  private getPositionReelle(): Promise<GpsPosition | null> {
    if (!('geolocation' in navigator)) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  // =====================================================
  // INCIDENTS
  // =====================================================

  async reportIncident(data: { type: string; description: string; photo?: string; video?: string; urgence: NiveauUrgence }): Promise<Incident> {
    const gps = await this.getPosition();
    const now = new Date();

    const incident: Incident = {
      id: Date.now(),
      type: data.type,
      description: data.description,
      photo: data.photo,
      video: data.video,
      gps,
      urgence: data.urgence,
      date: now.toLocaleDateString('fr-FR'),
      heure: this.formatTime(now)
    };

    this.state.incidents = [incident, ...this.state.incidents];
    this.incidentsSubject.next(this.state.incidents);
    this.persist();

    return incident;
  }

  async triggerUrgence(): Promise<Incident> {
    const gps = await this.getPosition();
    const now = new Date();

    const incident: Incident = {
      id: Date.now(),
      type: 'Urgence — Bouton SOS',
      description: 'Alerte déclenchée manuellement par le gardien via le bouton d’urgence.',
      gps,
      urgence: 'critique',
      date: now.toLocaleDateString('fr-FR'),
      heure: this.formatTime(now)
    };

    this.state.incidents = [incident, ...this.state.incidents];
    this.incidentsSubject.next(this.state.incidents);
    this.persist();

    return incident;
  }

  // Appareil photo natif disponible (application Android / iOS via Capacitor)
  get cameraNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  // Prend une photo avec l'appareil photo du téléphone (ou la choisit dans
  // la galerie). Renvoie null si le gardien annule.
  async prendrePhoto(source: 'camera' | 'galerie' = 'camera'): Promise<string | null> {
    try {
      const photo = await Camera.getPhoto({
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        resultType: CameraResultType.DataUrl,
        quality: 70,
        width: 1024,
        height: 1024,
        correctOrientation: true,
        saveToGallery: false
      });
      return photo.dataUrl ?? null;
    } catch (error) {
      const message = String((error as Error)?.message ?? error).toLowerCase();
      if (message.includes('cancel')) return null;
      if (message.includes('denied') || message.includes('permission')) {
        throw new Error("Autorisez l'accès à l'appareil photo dans les paramètres du téléphone.");
      }
      throw new Error('Impossible de prendre la photo, veuillez réessayer.');
    }
  }

  // Réduit une photo de l'appareil photo (plusieurs Mo) en JPEG léger
  // pour pouvoir la stocker sur le téléphone
  compresserPhoto(file: File, tailleMax = 1024, qualite = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const ratio = Math.min(1, tailleMax / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', qualite));
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Photo illisible, veuillez réessayer.'));
      };

      img.src = url;
    });
  }


  // =====================================================
  // REGISTRE DES VISITEURS
  // (identification à l'entrée pour prévenir intrusions,
  // vols et agressions sur la propriété)
  // =====================================================

  enregistrerVisiteur(data: { nom: string; photo: string; motif: string; personneVisitee: string; date: string; heureEntree: string }): Visiteur {
    const visiteur: Visiteur = {
      id: Date.now(),
      nom: data.nom,
      photo: data.photo,
      motif: data.motif,
      personneVisitee: data.personneVisitee,
      date: data.date,
      heureEntree: data.heureEntree,
      statut: 'present'
    };

    this.state.visiteurs = [visiteur, ...this.state.visiteurs];
    this.visiteursSubject.next(this.state.visiteurs);
    this.persist();

    return visiteur;
  }

  enregistrerSortieVisiteur(id: number): void {
    const visiteur = this.state.visiteurs.find(v => v.id === id);
    if (!visiteur) return;
    visiteur.statut = 'sorti';
    visiteur.heureSortie = this.formatTime(new Date());
    this.visiteursSubject.next([...this.state.visiteurs]);
    this.persist();
  }

  // =====================================================
  // OUTILS
  // =====================================================

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  }

  // Chaque gardien a son propre état local (incidents, visiteurs)
  private get storageKey(): string | null {
    return this.gardienId ? `${STORAGE_KEY}_${this.gardienId}` : null;
  }

  private emitAll(): void {
    this.assignmentSubject.next(this.state.assignment);
    this.currentSessionSubject.next(this.state.currentSession);
    this.serviceHistorySubject.next(this.state.serviceHistory);
    this.incidentsSubject.next(this.state.incidents);
    this.visiteursSubject.next(this.state.visiteurs);
  }

  private loadState(): GardienState {
    const state = defaultState();
    const key = this.storageKey;
    if (!key) return state;

    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GardienState>;

        // L'identité du gardien vient de l'API et l'affectation du code :
        // seul l'état dynamique de la session (service en cours, historique,
        // incidents, visiteurs) est restauré depuis le cache local.
        state.currentSession = parsed.currentSession ?? null;
        state.serviceHistory = parsed.serviceHistory ?? state.serviceHistory;
        state.incidents = parsed.incidents ?? state.incidents;
        state.visiteurs = parsed.visiteurs ?? state.visiteurs;
      }
    } catch {
      // ignore, on repart sur l'état par défaut
    }

    return state;
  }

  // Renvoie false si le stockage local est indisponible ou plein
  private persist(): boolean {
    const key = this.storageKey;
    if (!key) return true;

    try {
      localStorage.setItem(key, JSON.stringify(this.state));
      return true;
    } catch {
      // stockage indisponible : on continue en mémoire uniquement
      return false;
    }
  }
}
