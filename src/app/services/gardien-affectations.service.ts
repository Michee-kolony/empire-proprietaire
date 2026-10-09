import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { versApiErreur } from './api-erreur';

const API_AFFECTATIONS = `${environment.apiUrl}/affectations`;
const API_PROPRIETES = `${environment.apiUrl}/proprietes`;

// =====================================================
// MODELES (affectation renvoyée par le backend)
// =====================================================

// Calculé par le serveur : ne jamais le recalculer dans l'application
export type StatutAffectation = 'en cours' | 'expiree' | 'a venir';
export type UniteDuree = 'jours' | 'semaines' | 'mois';
export type RoleAffectation = 'principal' | 'remplacant';
export type JourService = 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi' | 'dimanche';
export const JOURS_SERVICE: JourService[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export interface PersonneContact {
  nom: string;
  postnom: string;
  prenom: string;
  telephone: string;
  photo?: string;
}

export interface ProprieteAffectee {
  _id: string;
  nomReference: string;
  typePropriete: string;
  commune: string;
  quartier: string;
  avenue: string;
  numero: string;
  photos: string[];
  proprietaire?: PersonneContact | null;
}

export interface GardienEquipe {
  _id: string;
  matricule: string;
  nom: string;
  postnom: string;
  prenom: string;
  photoProfil: string;
  telephonePrincipal?: string;
  telephoneSecondaire?: string;
  statut?: string;
}

// Affectation liée (remplacée / remplaçante) : seulement le gardien et la période
export interface AffectationLiee {
  _id: string;
  role: RoleAffectation;
  dateDebut: string;
  dateFin: string;
  gardien: GardienEquipe | null;
}

export interface MonAffectation {
  _id: string;
  statut: StatutAffectation;
  role: RoleAffectation;
  // 'HH:mm' ; heureFin < heureDebut = le service finit le lendemain
  heureDebut: string | null;
  heureFin: string | null;
  // Jours où le service commence
  joursService: JourService[];
  duree: number;
  uniteDuree: UniteDuree;
  dateDebut: string;
  dateFin: string;
  retireLe: string | null;
  motifRetrait: string;
  remplace: AffectationLiee | null;
  remplacePar: AffectationLiee | null;
  description: string;
  propriete: ProprieteAffectee | null;
  gardien: GardienEquipe | null;
}

export type NiveauSecurite = 'standard' | 'renforce' | 'haute surveillance';

// Détail d'une propriété (GET /api/proprietes/:id) : seuls les champs utiles au gardien
export interface ProprieteDetail extends ProprieteAffectee {
  typeAutre?: string;
  referenceComplementaire: string;
  coordonnees: { lat: number | null; lng: number | null };
  lienCarte: string;
  niveauSecurite: NiveauSecurite;
  cloture: boolean;
  portail: boolean;
  garage: boolean;
  cameras: boolean;
  nombreCameras?: number;
  alarme: boolean;
  eclairageSecurite: boolean;
  interphone: boolean;
  autresEquipementsSecurite?: string;
  autresInformations: string;
}

interface ListeAffectationsResponse {
  success: boolean;
  total: number;
  affectations: MonAffectation[];
}

@Injectable({ providedIn: 'root' })
export class GardienAffectationsService {

  private http = inject(HttpClient);

  // Dernières affectations chargées : ouverture immédiate du détail
  private cache = new Map<string, MonAffectation>();

  // =====================================================
  // MES AFFECTATIONS : GET /api/affectations/mes-affectations
  // (le backend identifie le gardien par son token)
  // =====================================================

  async mesAffectations(statut?: StatutAffectation): Promise<MonAffectation[]> {
    let params = new HttpParams();
    if (statut) params = params.set('statut', statut);

    const res = await this.requete(() =>
      this.http.get<ListeAffectationsResponse>(`${API_AFFECTATIONS}/mes-affectations`, { params })
    );
    res.affectations.forEach(a => this.cache.set(a._id, a));
    return res.affectations;
  }

  // Détail : depuis la liste déjà chargée, sinon GET /api/affectations/:id
  async affectation(id: string): Promise<MonAffectation> {
    const enCache = this.cache.get(id);
    if (enCache) return enCache;
    const res = await this.requete(() =>
      this.http.get<{ success: boolean; affectation: MonAffectation }>(`${API_AFFECTATIONS}/${id}`)
    );
    this.cache.set(id, res.affectation);
    return res.affectation;
  }

  // =====================================================
  // PROPRIETE : GET /api/proprietes/:id
  // =====================================================

  async propriete(id: string): Promise<ProprieteDetail> {
    const res = await this.requete(() =>
      this.http.get<{ success: boolean; propriete: ProprieteDetail }>(`${API_PROPRIETES}/${id}`)
    );
    return res.propriete;
  }

  // =====================================================
  // EQUIPE : GET /api/affectations?propriete=<id>&statut=en cours
  // (principal d'abord, puis les remplaçants)
  // =====================================================

  async equipe(proprieteId: string): Promise<MonAffectation[]> {
    const params = new HttpParams().set('propriete', proprieteId).set('statut', 'en cours');
    const res = await this.requete(() =>
      this.http.get<ListeAffectationsResponse>(API_AFFECTATIONS, { params })
    );
    return res.affectations;
  }

  private async requete<T>(appel: () => Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(appel());
    } catch (error) {
      throw versApiErreur(error);
    }
  }
}
