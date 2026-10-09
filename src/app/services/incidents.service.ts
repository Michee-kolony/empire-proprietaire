import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType, HttpParams } from '@angular/common/http';
import { Network } from '@capacitor/network';
import { Observable, filter, firstValueFrom, map, tap, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiErreur, versApiErreur } from './api-erreur';

const API_INCIDENTS = `${environment.apiUrl}/incidents`;

// Envoi avec photos / vidéos : délai d'attente long (connexion mobile lente)
const DELAI_ENVOI_MS = 10 * 60 * 1000;

// =====================================================
// MODELES (incident renvoyé par le backend)
// Types, gravités et statuts viennent de GET /api/incidents/options : jamais codés en dur.
// =====================================================

export interface OptionIncident {
  valeur: string;
  libelle: string;
}

export interface OptionsIncident {
  types: OptionIncident[];
  gravites: OptionIncident[];
  statuts: OptionIncident[];
  // type -> gravité appliquée par le serveur si aucune n'est envoyée
  graviteParDefaut: Record<string, string>;
}

export type ModeleSignaleur = 'Gardien' | 'Proprietaire' | 'Administrateur';

export interface Incident {
  _id: string;
  type: string;
  typeLibelle: string;
  description: string;
  dateIncident: string;
  createdAt: string;
  position: { lat: number | null; lng: number | null; precision: number | null } | null;
  photos: string[];
  videos: string[];
  gravite: string;
  graviteLibelle: string;
  statut: string;
  statutLibelle: string;
  commentaireAdmin: string;
  traiteLe: string | null;
  // Renseigné quand c'est le propriétaire qui a fait avancer le statut
  traiteParProprietaire?: { _id: string; nom?: string; postnom?: string; prenom?: string } | null;
  commentaireProprietaire?: string;
  signaleParModele: ModeleSignaleur;
  signalePar: { _id: string; nom?: string; postnom?: string; prenom?: string } | null;
  gardien: {
    _id: string;
    matricule: string;
    nom: string;
    postnom: string;
    prenom: string;
    photoProfil: string;
    telephonePrincipal: string;
  } | null;
  propriete: {
    _id: string;
    nomReference: string;
    commune: string;
    quartier: string;
    avenue: string;
    numero?: string;
    coordonnees?: { lat: number | null; lng: number | null };
    photos?: string[];
    proprietaire?: { nom: string; postnom: string; prenom: string; telephone: string } | null;
  } | null;
}

export interface FiltresIncidents {
  type?: string;
  gravite?: string;
  statut?: string;
  propriete?: string;
  // 'AAAA-MM-JJ'
  du?: string;
  au?: string;
}

export interface NouvelIncident {
  type: string;
  description: string;
  // ISO 8601 ; absent = maintenant (côté serveur)
  dateIncident?: string;
  position?: { lat: number; lng: number; precision: number } | null;
  gravite?: string;
  // Obligatoire pour un propriétaire
  propriete: string;
  // Gardien concerné (facultatif, doit être affecté à la propriété)
  gardien?: string;
  photos: File[];
  videos: File[];
}

// Limite du commentaire du propriétaire (modèle Incident du backend)
export const COMMENTAIRE_PROPRIETAIRE_MAX = 2000;

// Statuts d'un incident pas encore résolu ni classé
export const STATUTS_ACTIFS = ['nouveau', 'en_cours'];

// Position d'un incident sur la carte : celle envoyée au signalement, sinon celle de la propriété
export function positionIncident(incident: Incident): { lat: number; lng: number } | null {
  for (const p of [incident.position, incident.propriete?.coordonnees]) {
    if (p?.lat != null && p?.lng != null) return { lat: p.lat, lng: p.lng };
  }
  return null;
}

// Limites du modèle Incident du backend
export const DESCRIPTION_MIN = 5;
export const DESCRIPTION_MAX = 5000;

export const PHOTOS_MAX = 5;
export const PHOTO_TAILLE_MAX = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

export const VIDEOS_MAX = 2;
export const VIDEO_TAILLE_MAX = 30 * 1024 * 1024;
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'];
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', '3gp'];

@Injectable({ providedIn: 'root' })
export class IncidentsService {

  private http = inject(HttpClient);
  private optionsCache: OptionsIncident | null = null;

  // Derniers incidents chargés / créés : ouverture immédiate du détail
  private cache = new Map<string, Incident>();

  // GET /api/incidents/options : listes des selects
  async options(): Promise<OptionsIncident> {
    if (this.optionsCache) return this.optionsCache;
    const res = await this.requete(() =>
      this.http.get<{ success: boolean } & OptionsIncident>(`${API_INCIDENTS}/options`)
    );
    this.optionsCache = {
      types: res.types ?? [],
      gravites: res.gravites ?? [],
      statuts: res.statuts ?? [],
      graviteParDefaut: res.graviteParDefaut ?? {}
    };
    return this.optionsCache;
  }

  // GET /api/incidents/mes-incidents (du plus récent au plus ancien)
  async mesIncidents(filtres: FiltresIncidents = {}): Promise<Incident[]> {
    let params = new HttpParams();
    for (const [cle, valeur] of Object.entries(filtres)) {
      if (valeur) params = params.set(cle, valeur);
    }
    const res = await this.requete(() =>
      this.http.get<{ success: boolean; total: number; incidents: Incident[] }>(`${API_INCIDENTS}/mes-incidents`, { params })
    );
    res.incidents.forEach(i => this.cache.set(i._id, i));
    return res.incidents;
  }

  // Incidents non résolus (« nouveau » et « en cours de traitement ») des propriétés du propriétaire,
  // du plus récent au plus ancien : ce sont eux qui sont affichés sur la carte
  async incidentsActifs(propriete?: string): Promise<Incident[]> {
    const [nouveaux, enCours] = await Promise.all(
      STATUTS_ACTIFS.map(statut => this.mesIncidents({ statut, propriete }))
    );
    return [...nouveaux, ...enCours]
      .sort((a, b) => new Date(b.dateIncident).getTime() - new Date(a.dateIncident).getTime());
  }

  // PATCH /api/incidents/:id : le propriétaire fait avancer le statut d'un incident de sa propriété
  async traiter(id: string, modifs: { statut?: string; commentaireProprietaire?: string }): Promise<Incident> {
    const res = await this.requete(() =>
      this.http.patch<{ success: boolean; incident: Incident }>(`${API_INCIDENTS}/${id}`, modifs)
    );
    this.cache.set(id, res.incident);
    return res.incident;
  }

  // Détail déjà chargé (liste ou création), sans appel réseau
  enCache(id: string): Incident | null {
    return this.cache.get(id) ?? null;
  }

  // GET /api/incidents/:id
  async incident(id: string): Promise<Incident> {
    const res = await this.requete(() =>
      this.http.get<{ success: boolean; incident: Incident }>(`${API_INCIDENTS}/${id}`)
    );
    this.cache.set(id, res.incident);
    return res.incident;
  }

  // POST /api/incidents (multipart/form-data) ; progression de 0 à 1.
  // Pas de Content-Type manuel : le client HTTP ajoute le boundary.
  async signaler(
    donnees: NouvelIncident,
    progression?: (fraction: number) => void
  ): Promise<{ message: string; incident: Incident }> {
    try {
      if (!(await Network.getStatus()).connected) {
        throw new ApiErreur('Pas de connexion internet, réessayez', 0);
      }
    } catch (error) {
      if (error instanceof ApiErreur) throw error;
    }

    const form = new FormData();
    form.append('type', donnees.type);
    form.append('description', donnees.description.trim());
    if (donnees.dateIncident) form.append('dateIncident', donnees.dateIncident);
    if (donnees.position) {
      form.append('lat', String(donnees.position.lat));
      form.append('lng', String(donnees.position.lng));
      form.append('precision', String(donnees.position.precision));
    }
    if (donnees.gravite) form.append('gravite', donnees.gravite);
    form.append('propriete', donnees.propriete);
    if (donnees.gardien) form.append('gardien', donnees.gardien);
    donnees.photos.forEach(f => form.append('photos', f, f.name));
    donnees.videos.forEach(f => form.append('videos', f, f.name));

    const res = await this.requete(() =>
      this.http.post<{ success: boolean; message: string; incident: Incident }>(API_INCIDENTS, form, {
        reportProgress: true,
        observe: 'events'
      }).pipe(
        timeout(DELAI_ENVOI_MS),
        tap(evenement => {
          if (evenement.type === HttpEventType.UploadProgress && evenement.total) {
            progression?.(evenement.loaded / evenement.total);
          }
        }),
        filter(evenement => evenement.type === HttpEventType.Response),
        map(evenement => evenement.body!)
      )
    );

    this.cache.set(res.incident._id, res.incident);
    return res;
  }

  private async requete<T>(appel: () => Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(appel());
    } catch (error) {
      if ((error as Error)?.name === 'TimeoutError') {
        throw new ApiErreur('L\'envoi a pris trop de temps. Vérifiez votre connexion et réessayez.', 0);
      }
      throw versApiErreur(error);
    }
  }
}
