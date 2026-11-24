import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject, Observable, combineLatest, distinctUntilChanged, firstValueFrom, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { versApiErreur } from './api-erreur';

const TOKEN_KEY = 'proprietaire_token';
const PROPRIETAIRE_KEY = 'proprietaire_data';
const LOCATAIRE_KEY = 'locataire_data';

// Longueur minimale d'un nouveau mot de passe (changement depuis le profil)
export const MOT_DE_PASSE_MIN = 6;

const API_PROPRIETAIRES = `${environment.apiUrl}/proprietaires`;
const API_LOCATAIRES = `${environment.apiUrl}/locataires`;

// Espace choisi à la connexion : propriétaire (compte principal) ou locataire (créé par le propriétaire)
export type Espace = 'proprietaire' | 'locataire';

// =====================================================
// MODELES (identiques au modèle Mongoose "Proprietaire" du backend)
// =====================================================

export type RoleProprietaire = 'PROPRIETAIRE' | 'GESTIONNAIRE' | 'MANDATAIRE' | 'LOCATAIRE';

export const ROLES_PROPRIETAIRE: Record<RoleProprietaire, string> = {
  PROPRIETAIRE: 'Propriétaire',
  GESTIONNAIRE: 'Gestionnaire',
  MANDATAIRE: 'Mandataire',
  LOCATAIRE: 'Locataire'
};

export interface Proprietaire {
  _id: string;
  nom: string;
  postnom?: string;
  prenom?: string;
  sexe?: 'M' | 'F';
  profession?: string;
  telephone: string;
  email?: string;
  photo: string | null;
  adresse?: string;
  role: RoleProprietaire;
  actif: boolean;
  dateInscription?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Champs envoyés à la modification du profil (multipart/form-data)
export interface ChampsProprietaire {
  nom?: string;
  postnom?: string;
  prenom?: string;
  sexe?: 'M' | 'F' | '';
  profession?: string;
  telephone?: string;
  email?: string;
  adresse?: string;
  password?: string;
}

// Compte d'un locataire (modèle Mongoose "Locataire") : créé par son propriétaire
// depuis « Logements & locataires » avec un email et un mot de passe
export interface Locataire {
  _id: string;
  nom: string;
  postnom?: string;
  prenom?: string;
  telephone?: string;
  email: string;
  photo: string | null;
  role: 'LOCATAIRE';
  actif: boolean;
  sousCompte: string;
  propriete: string;
  createdAt?: string;
}

interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  proprietaire: Proprietaire;
}

interface LoginLocataireResponse {
  success: boolean;
  message: string;
  token: string;
  locataire: Locataire;
}

interface ProprietaireResponse {
  success: boolean;
  message?: string;
  proprietaire: Proprietaire;
}

@Injectable({ providedIn: 'root' })
export class ProprietaireAuthService {

  private http = inject(HttpClient);
  private router = inject(Router);

  // Session gardée en mémoire (lue une fois depuis @capacitor/preferences au démarrage)
  private tokenCourant: string | null = null;
  private proprietaireSubject = new BehaviorSubject<Proprietaire | null>(null);
  private locataireSubject = new BehaviorSubject<Locataire | null>(null);
  private messageConnexion = '';

  // Un seul des deux est rempli : la session est celle d'un propriétaire OU d'un locataire
  proprietaire$ = this.proprietaireSubject.asObservable();
  locataire$ = this.locataireSubject.asObservable();

  // Personne connectée, quel que soit l'espace (menu, messagerie)
  readonly utilisateur$: Observable<Proprietaire | Locataire | null> = combineLatest([this.proprietaire$, this.locataire$])
    .pipe(map(([proprietaire, locataire]) => proprietaire ?? locataire));
  readonly espace$: Observable<Espace | null> = this.utilisateur$.pipe(
    map(() => this.espace),
    distinctUntilChanged()
  );

  // Appelé au démarrage de l'application (avant la navigation)
  async init(): Promise<void> {
    const [token, proprietaire, locataire] = await Promise.all([
      Preferences.get({ key: TOKEN_KEY }),
      Preferences.get({ key: PROPRIETAIRE_KEY }),
      Preferences.get({ key: LOCATAIRE_KEY })
    ]);
    this.tokenCourant = token.value;
    this.proprietaireSubject.next(lireJson<Proprietaire>(proprietaire.value));
    this.locataireSubject.next(this.proprietaireSubject.value ? null : lireJson<Locataire>(locataire.value));
  }

  get token(): string | null {
    return this.tokenCourant;
  }

  get proprietaire(): Proprietaire | null {
    return this.proprietaireSubject.value;
  }

  get locataire(): Locataire | null {
    return this.locataireSubject.value;
  }

  get espace(): Espace | null {
    if (!this.tokenCourant) return null;
    if (this.proprietaire) return 'proprietaire';
    return this.locataire ? 'locataire' : null;
  }

  // Identifiant du compte connecté (auteur des messages du chat)
  get monId(): string {
    return (this.proprietaire ?? this.locataire)?._id ?? '';
  }

  // Page d'accueil de l'espace connecté
  get accueil(): string {
    return this.espace === 'locataire' ? '/locataire/accueil' : '/proprietaire/accueil';
  }

  // Connecté = un token stocké et les données du compte. La validité réelle du token
  // est vérifiée par le serveur (un 401 renvoie vers la connexion).
  get isLoggedIn(): boolean {
    return this.espace !== null;
  }

  // =====================================================
  // CONNEXION : POST /api/proprietaires/login (téléphone ou email)
  // =====================================================

  async login(identifiant: string, password: string): Promise<Proprietaire> {
    try {
      const res = await firstValueFrom(
        this.http.post<LoginResponse>(`${API_PROPRIETAIRES}/login`, { identifiant: identifiant.trim(), password })
      );

      await this.effacerSession();
      this.tokenCourant = res.token;
      await Preferences.set({ key: TOKEN_KEY, value: res.token });
      await this.setProprietaire(res.proprietaire);
      return res.proprietaire;
    } catch (error) {
      throw versApiErreur(error);
    }
  }

  // CONNEXION LOCATAIRE : POST /api/locataires/login (email + mot de passe donnés par le propriétaire)
  async loginLocataire(email: string, password: string): Promise<Locataire> {
    try {
      const res = await firstValueFrom(
        this.http.post<LoginLocataireResponse>(`${API_LOCATAIRES}/login`, { identifiant: email.trim(), password })
      );

      await this.effacerSession();
      this.tokenCourant = res.token;
      await Preferences.set({ key: TOKEN_KEY, value: res.token });
      await this.setLocataire(res.locataire);
      return res.locataire;
    } catch (error) {
      throw versApiErreur(error);
    }
  }

  // Compte du locataire mis à jour par GET /api/locataires/moi (voir LocataireService)
  async setLocataire(locataire: Locataire): Promise<void> {
    this.locataireSubject.next(locataire);
    await Preferences.set({ key: LOCATAIRE_KEY, value: JSON.stringify(locataire) });
  }

  async logout(): Promise<void> {
    await this.effacerSession();
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

  // =====================================================
  // PROFIL : GET / PUT /api/proprietaires/:id
  // =====================================================

  async rafraichir(): Promise<Proprietaire | null> {
    const courant = this.proprietaire;
    if (!courant || !this.token) return null;
    try {
      const res = await firstValueFrom(this.http.get<ProprietaireResponse>(`${API_PROPRIETAIRES}/${courant._id}`));
      await this.setProprietaire(res.proprietaire);
      return res.proprietaire;
    } catch (error) {
      throw versApiErreur(error);
    }
  }

  // Seuls les champs fournis sont modifiés ; une nouvelle photo remplace l'ancienne
  async modifierProfil(champs: ChampsProprietaire, photo: File | null = null): Promise<{ message: string; proprietaire: Proprietaire }> {
    const courant = this.proprietaire;
    if (!courant) throw versApiErreur(new Error('Session introuvable, reconnectez-vous'));
    try {
      const res = await firstValueFrom(
        this.http.put<ProprietaireResponse>(`${API_PROPRIETAIRES}/${courant._id}`, this.formulaire(champs, photo))
      );
      await this.setProprietaire(res.proprietaire);
      return { message: res.message ?? 'Profil modifié', proprietaire: res.proprietaire };
    } catch (error) {
      throw versApiErreur(error);
    }
  }

  // =====================================================
  // OUTILS
  // =====================================================

  private formulaire(champs: ChampsProprietaire, photo: File | null): FormData {
    const form = new FormData();
    for (const [cle, valeur] of Object.entries(champs)) {
      if (valeur === undefined || valeur === null) continue;
      // Le mot de passe est envoyé tel quel (pas de trim)
      form.append(cle, cle === 'password' ? String(valeur) : String(valeur).trim());
    }
    if (photo) form.append('photo', photo, photo.name);
    return form;
  }

  private async effacerSession(): Promise<void> {
    this.tokenCourant = null;
    this.proprietaireSubject.next(null);
    this.locataireSubject.next(null);
    await Promise.all([
      Preferences.remove({ key: TOKEN_KEY }),
      Preferences.remove({ key: PROPRIETAIRE_KEY }),
      Preferences.remove({ key: LOCATAIRE_KEY })
    ]);
  }

  private async setProprietaire(proprietaire: Proprietaire): Promise<void> {
    this.proprietaireSubject.next(proprietaire);
    await Preferences.set({ key: PROPRIETAIRE_KEY, value: JSON.stringify(proprietaire) });
  }
}

function lireJson<T>(valeur: string | null): T | null {
  if (!valeur) return null;
  try {
    return JSON.parse(valeur) as T;
  } catch {
    return null;
  }
}
