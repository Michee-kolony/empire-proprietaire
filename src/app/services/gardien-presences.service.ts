import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Network } from '@capacitor/network';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiErreur, versApiErreur } from './api-erreur';
import { PositionAppareil } from './gardien-localisation.service';
import { GardienRappelsService } from './gardien-rappels.service';
import { GardienTrackingService } from './gardien-tracking.service';

const API_PRESENCES = `${environment.apiUrl}/presences`;

// =====================================================
// MODELES (pointage renvoyé par le backend)
// Statut, retard, durée, distance et totaux sont calculés par le serveur.
// =====================================================

export type StatutPresence = 'en cours' | 'termine' | 'non cloture';
export type RoleAffectation = 'principal' | 'remplacant';

export interface ProprietePointage {
  _id: string;
  nomReference: string;
  commune: string;
  quartier: string;
  avenue: string;
  numero?: string;
  photos: string[];
  coordonnees?: { lat: number | null; lng: number | null };
  proprietaire?: { nom: string; postnom: string; prenom: string; telephone: string } | null;
}

export interface PositionPointage {
  lat: number;
  lng: number;
  precision: number | null;
  distanceMetres: number | null;
  horsZone: boolean;
}

export interface Presence {
  _id: string;
  statut: StatutPresence;
  propriete: ProprietePointage | null;
  affectation: {
    _id: string;
    role: RoleAffectation;
    heureDebut: string | null;
    heureFin: string | null;
    joursService?: string[];
    dateDebut?: string;
    dateFin?: string;
  } | null;
  jourService: string;
  debutPrevu: string;
  finPrevue: string;
  heureArrivee: string;
  positionArrivee: PositionPointage | null;
  retardMinutes: number;
  enRetard: boolean;
  heureDepart: string | null;
  positionDepart: PositionPointage | null;
  dureeMinutes: number | null;
  departAnticipeMinutes: number | null;
  cloture: 'gardien' | 'admin' | 'automatique' | null;
  commentaire: string;
}

export interface ProchainService {
  jourService: string;
  debutPrevu: string;
  finPrevue: string;
  role: RoleAffectation;
  affectation: string | { _id: string };
  propriete: ProprietePointage | null;
  // Déjà pointé (affiché jusqu'à l'heure de fin prévue)
  effectue?: boolean;
}

export interface MonService {
  serviceEnCours: Presence | null;
  peutCommencer: boolean;
  prochainsServices: ProchainService[];
}

export interface MesServices {
  du: string;
  au: string;
  total: number;
  minutesTravaillees: number;
  heuresTravaillees: number;
  presences: Presence[];
}

export interface ReponsePointage {
  success: boolean;
  message: string;
  presence: Presence;
}

@Injectable({ providedIn: 'root' })
export class GardienPresencesService {

  private http = inject(HttpClient);
  private rappels = inject(GardienRappelsService);
  private tracking = inject(GardienTrackingService);

  // =====================================================
  // GET /api/presences/mon-service
  // Chaque chargement resynchronise les rappels et l'envoi de position.
  // =====================================================

  async monService(): Promise<MonService> {
    const res = await this.requete(() =>
      this.http.get<MonService & { success: boolean }>(`${API_PRESENCES}/mon-service`)
    );
    const etat: MonService = {
      serviceEnCours: res.serviceEnCours,
      peutCommencer: res.peutCommencer,
      prochainsServices: res.prochainsServices ?? []
    };
    this.synchroniserPartage(etat);
    void this.rappels.planifier(etat);
    return etat;
  }

  // Partage de position : pendant le service en cours, puis jusqu'à l'heure de fin prévue
  // d'un service déjà terminé (le serveur ne renvoie que les services pas encore finis)
  private synchroniserPartage(etat: MonService): void {
    if (etat.serviceEnCours) {
      this.tracking.synchroniser(true);
      return;
    }
    const fins = etat.prochainsServices
      .filter(s => s.effectue)
      .map(s => new Date(s.finPrevue).getTime())
      .filter(fin => fin > Date.now());
    this.tracking.synchroniser(fins.length > 0, fins.length ? Math.max(...fins) : null);
  }

  // =====================================================
  // POINTAGE : POST /api/presences/debut et /fin
  // Le serveur choisit le service prévu et fait foi pour l'heure :
  // pas de pointage hors ligne, pas de file d'attente.
  // =====================================================

  async commencer(position: PositionAppareil): Promise<ReponsePointage> {
    await this.exigerReseau();
    return this.requete(() => this.http.post<ReponsePointage>(`${API_PRESENCES}/debut`, position));
  }

  async terminer(position: PositionAppareil, commentaire?: string): Promise<ReponsePointage> {
    await this.exigerReseau();
    const body = commentaire ? { ...position, commentaire } : position;
    return this.requete(() => this.http.post<ReponsePointage>(`${API_PRESENCES}/fin`, body));
  }

  // =====================================================
  // HISTORIQUE : GET /api/presences/mes-services (défaut : 30 derniers jours)
  // =====================================================

  async mesServices(du?: string, au?: string): Promise<MesServices> {
    let params = new HttpParams();
    if (du) params = params.set('du', du);
    if (au) params = params.set('au', au);
    return this.requete(() =>
      this.http.get<MesServices & { success: boolean }>(`${API_PRESENCES}/mes-services`, { params })
    );
  }

  async detail(id: string): Promise<Presence> {
    const res = await this.requete(() =>
      this.http.get<{ success: boolean; presence: Presence }>(`${API_PRESENCES}/${id}`)
    );
    return res.presence;
  }

  // =====================================================
  // OUTILS
  // =====================================================

  async exigerReseau(): Promise<void> {
    try {
      if (!(await Network.getStatus()).connected) {
        throw new ApiErreur('Pas de connexion internet, réessayez', 0);
      }
    } catch (error) {
      if (error instanceof ApiErreur) throw error;
      // Plugin indisponible : la requête dira elle-même s'il n'y a pas de réseau
    }
  }

  private async requete<T>(appel: () => Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(appel());
    } catch (error) {
      // 401 : déjà traité par l'intercepteur (session effacée, retour à la connexion)
      throw versApiErreur(error);
    }
  }
}
