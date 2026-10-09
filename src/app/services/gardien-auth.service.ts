import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { versApiErreur } from './api-erreur';
import { GardienRappelsService } from './gardien-rappels.service';

const TOKEN_KEY = 'gardien_token';
const GARDIEN_KEY = 'gardien_data';
const ACTION_KEY = 'gardien_action_en_attente';

const API_GARDIENS = `${environment.apiUrl}/gardiens`;

// =====================================================
// MODELES (identiques au modèle Mongoose "Gardien" du backend)
// =====================================================

export type StatutGardien = 'en service' | 'non en service';

export interface CommentaireGardien {
  _id: string;
  photoProprietaire: string;
  nomProprietaire: string;
  contenu: string;
  dateAjout: string;
}

export interface Gardien {
  _id: string;
  matricule: string;
  nom: string;
  postnom: string;
  prenom: string;
  sexe: 'M' | 'F';
  dateNaissance?: string;
  lieuNaissance?: string;
  nationalite?: string;
  etatCivil?: 'celibataire' | 'marie' | 'divorce' | 'veuf';
  taille?: number;
  photoProfil: string;
  telephonePrincipal: string;
  telephoneSecondaire: string;
  email: string;
  adresseActuelle?: string;
  commune: string;
  quartier: string;
  avenue: string;
  statut: StatutGardien;
  coordonnees?: { lat: number | null; lng: number | null };
  commentaires: CommentaireGardien[];
  createdAt?: string;
  updatedAt?: string;
}

// « Terminer mon service » interrompu par un token expiré (service de nuit > 24 h de token) :
// relancé automatiquement après la reconnexion du même gardien.
// Enregistrée juste avant l'envoi (un 401 efface la session), effacée dès que le serveur
// a répondu autre chose qu'un 401.
export interface FinEnAttente {
  type: 'fin';
  gardienId: string;
  lat: number;
  lng: number;
  precision: number;
  commentaire?: string;
}

interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  gardien: Gardien;
}

interface PositionResponse {
  success: boolean;
  coordonnees: { lat: number | null; lng: number | null };
}

interface GardienResponse {
  success: boolean;
  message?: string;
  gardien: Gardien;
}

@Injectable({ providedIn: 'root' })
export class GardienAuthService {

  private http = inject(HttpClient);
  private router = inject(Router);
  private rappels = inject(GardienRappelsService);

  // Session gardée en mémoire (lue une fois depuis @capacitor/preferences au démarrage)
  private tokenCourant: string | null = null;
  private gardienSubject = new BehaviorSubject<Gardien | null>(null);
  private messageConnexion = '';

  gardien$ = this.gardienSubject.asObservable();

  // Appelé au démarrage de l'application (avant la navigation)
  async init(): Promise<void> {
    // Anciennes versions de l'application : session stockée dans localStorage
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(GARDIEN_KEY);
    } catch {
      // stockage indisponible
    }

    const [token, gardien] = await Promise.all([
      Preferences.get({ key: TOKEN_KEY }),
      Preferences.get({ key: GARDIEN_KEY })
    ]);
    this.tokenCourant = token.value;
    try {
      this.gardienSubject.next(gardien.value ? (JSON.parse(gardien.value) as Gardien) : null);
    } catch {
      this.gardienSubject.next(null);
    }
  }

  get token(): string | null {
    return this.tokenCourant;
  }

  get gardien(): Gardien | null {
    return this.gardienSubject.value;
  }

  // Connecté = un token stocké et les données du gardien. La validité réelle du token
  // est vérifiée par le serveur (un 401 renvoie vers la connexion).
  get isLoggedIn(): boolean {
    return !!this.tokenCourant && !!this.gardien;
  }

  // =====================================================
  // CONNEXION : POST /api/gardiens/login
  // =====================================================

  async login(email: string, password: string): Promise<Gardien> {
    try {
      const res = await firstValueFrom(
        this.http.post<LoginResponse>(`${API_GARDIENS}/login`, {
          email: email.trim().toLowerCase(),
          password
        })
      );

      this.tokenCourant = res.token;
      await Preferences.set({ key: TOKEN_KEY, value: res.token });
      await this.setGardien(res.gardien);

      return res.gardien;
    } catch (error) {
      throw versApiErreur(error);
    }
  }

  // Déconnexion volontaire : on efface tout, y compris une fin de service en attente
  async logout(): Promise<void> {
    await this.effacerSession();
    await Preferences.remove({ key: ACTION_KEY });
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  // Token expiré ou refusé par le serveur (401)
  async expirerSession(): Promise<void> {
    if (!this.tokenCourant) return;
    await this.effacerSession();
    this.messageConnexion = 'Session expirée, reconnectez-vous';
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  // Message à afficher une seule fois sur l'écran de connexion
  lireMessageConnexion(): string {
    const message = this.messageConnexion;
    this.messageConnexion = '';
    return message;
  }

  private async effacerSession(): Promise<void> {
    this.tokenCourant = null;
    this.gardienSubject.next(null);
    await Promise.all([
      Preferences.remove({ key: TOKEN_KEY }),
      Preferences.remove({ key: GARDIEN_KEY }),
      this.rappels.annulerTout()
    ]);
  }

  // =====================================================
  // FIN DE SERVICE EN ATTENTE (401 pendant « Terminer mon service »)
  // =====================================================

  async memoriserFinEnAttente(action: Omit<FinEnAttente, 'type' | 'gardienId'>): Promise<void> {
    const gardienId = this.gardien?._id;
    if (!gardienId) return;
    const valeur: FinEnAttente = { type: 'fin', gardienId, ...action };
    await Preferences.set({ key: ACTION_KEY, value: JSON.stringify(valeur) });
  }

  async effacerFinEnAttente(): Promise<void> {
    await Preferences.remove({ key: ACTION_KEY });
  }

  // Renvoie (et efface) la fin de service en attente du gardien connecté
  async prendreFinEnAttente(): Promise<FinEnAttente | null> {
    const { value } = await Preferences.get({ key: ACTION_KEY });
    if (!value) return null;
    await Preferences.remove({ key: ACTION_KEY });
    try {
      const action = JSON.parse(value) as FinEnAttente;
      return action.gardienId === this.gardien?._id ? action : null;
    } catch {
      return null;
    }
  }

  // =====================================================
  // PROFIL : GET /api/gardiens/:id
  // =====================================================

  async refreshGardien(): Promise<Gardien | null> {
    const current = this.gardien;
    if (!current || !this.token) return null;

    try {
      const res = await firstValueFrom(this.http.get<GardienResponse>(`${API_GARDIENS}/${current._id}`));
      await this.setGardien(res.gardien);
      return res.gardien;
    } catch (error) {
      throw versApiErreur(error);
    }
  }

  // =====================================================
  // POSITION PENDANT LE SERVICE : PATCH /api/gardiens/position
  // (le backend identifie le gardien par son token)
  // =====================================================

  async envoyerPosition(lat: number, lng: number): Promise<void> {
    if (!this.gardien || !this.token) return;

    try {
      const res = await firstValueFrom(
        this.http.patch<PositionResponse>(`${API_GARDIENS}/position`, { lat, lng })
      );
      const gardien = this.gardien;
      if (gardien) {
        await this.setGardien({ ...gardien, coordonnees: res.coordonnees });
      }
    } catch (error) {
      throw versApiErreur(error);
    }
  }

  // =====================================================
  // OUTILS
  // =====================================================

  private async setGardien(gardien: Gardien): Promise<void> {
    this.gardienSubject.next(gardien);
    await Preferences.set({ key: GARDIEN_KEY, value: JSON.stringify(gardien) });
  }
}
