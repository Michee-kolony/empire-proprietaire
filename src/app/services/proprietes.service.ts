import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable, filter, firstValueFrom, map, tap, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiErreur, versApiErreur } from './api-erreur';
import { ProprietaireAuthService } from './proprietaire-auth.service';

const API_PROPRIETES = `${environment.apiUrl}/proprietes`;

// Envoi avec photos / documents : délai d'attente long (connexion mobile lente)
const DELAI_ENVOI_MS = 10 * 60 * 1000;

// =====================================================
// MODELES (identiques au modèle Mongoose "Propriete" du backend)
// =====================================================

export type TypePropriete = 'maison' | 'villa' | 'appartement' | 'immeuble' | 'bureau' | 'commerce' | 'autre';
export type NiveauSecurite = 'standard' | 'renforce' | 'haute surveillance';
export type StatutAbonnement = 'actif' | 'expire' | 'aucun';

export const TYPES_PROPRIETE: { valeur: TypePropriete; libelle: string; icone: string }[] = [
  { valeur: 'maison', libelle: 'Maison', icone: 'home-outline' },
  { valeur: 'villa', libelle: 'Villa', icone: 'home-outline' },
  { valeur: 'appartement', libelle: 'Appartement', icone: 'business-outline' },
  { valeur: 'immeuble', libelle: 'Immeuble', icone: 'business-outline' },
  { valeur: 'bureau', libelle: 'Bureau', icone: 'briefcase-outline' },
  { valeur: 'commerce', libelle: 'Commerce', icone: 'storefront-outline' },
  { valeur: 'autre', libelle: 'Autre', icone: 'grid-outline' }
];

export const NIVEAUX_SECURITE: { valeur: NiveauSecurite; libelle: string }[] = [
  { valeur: 'standard', libelle: 'Standard' },
  { valeur: 'renforce', libelle: 'Renforcé' },
  { valeur: 'haute surveillance', libelle: 'Haute surveillance' }
];

export const STATUTS_ABONNEMENT: Record<StatutAbonnement, string> = {
  actif: 'Abonnement actif',
  expire: 'Abonnement expiré',
  aucun: 'Sans abonnement'
};

// Limites du middleware d'upload du backend
export const PHOTOS_PROPRIETE_MAX = 5;
export const AUTRES_DOCUMENTS_MAX = 5;
export const PHOTO_PROPRIETE_TAILLE_MAX = 5 * 1024 * 1024;
export const DOCUMENT_TAILLE_MAX = 10 * 1024 * 1024;

export interface Coordonnees {
  lat: number | null;
  lng: number | null;
}

export interface Propriete {
  _id: string;
  proprietaire: string | { _id: string; nom?: string; postnom?: string; prenom?: string; telephone?: string } | null;
  nomReference: string;
  typePropriete: TypePropriete;
  typeAutre: string;
  numeroParcelle: string;
  nombreBatiments: number | null;
  nombreNiveaux: number | null;
  commune: string;
  quartier: string;
  avenue: string;
  numero: string;
  referenceComplementaire: string;
  coordonnees: Coordonnees;
  lienCarte: string;
  nombreChambres: number | null;
  nombrePortesAcces: number | null;
  cloture: boolean;
  portail: boolean;
  garage: boolean;
  nombreVehicules: number | null;
  autresInformations: string;
  niveauSecurite: NiveauSecurite;
  cameras: boolean;
  nombreCameras: number | null;
  alarme: boolean;
  eclairageSecurite: boolean;
  interphone: boolean;
  autresEquipementsSecurite: string;
  dateDebutAbonnement: string | null;
  dateExpirationAbonnement: string | null;
  statutAbonnement: StatutAbonnement;
  photos: string[];
  documentPropriete: string | null;
  autresDocuments: string[];
  createdAt?: string;
  updatedAt?: string;
}

// Champs du formulaire (tout est envoyé en texte dans le multipart)
export interface ChampsPropriete {
  nomReference: string;
  typePropriete: TypePropriete | '';
  typeAutre: string;
  numeroParcelle: string;
  nombreBatiments: number | null;
  nombreNiveaux: number | null;
  commune: string;
  quartier: string;
  avenue: string;
  numero: string;
  referenceComplementaire: string;
  lat: number | null;
  lng: number | null;
  lienCarte: string;
  nombreChambres: number | null;
  nombrePortesAcces: number | null;
  cloture: boolean;
  portail: boolean;
  garage: boolean;
  nombreVehicules: number | null;
  autresInformations: string;
  niveauSecurite: NiveauSecurite;
  cameras: boolean;
  nombreCameras: number | null;
  alarme: boolean;
  eclairageSecurite: boolean;
  interphone: boolean;
  autresEquipementsSecurite: string;
}

// Fichiers envoyés : un champ non vide REMPLACE les fichiers existants de ce champ
export interface FichiersPropriete {
  photos: File[];
  documentPropriete: File | null;
  autresDocuments: File[];
}

export const CHAMPS_OBLIGATOIRES: (keyof ChampsPropriete)[] = ['nomReference', 'typePropriete', 'commune', 'quartier', 'avenue'];

export function libelleType(propriete: Pick<Propriete, 'typePropriete' | 'typeAutre'> | null | undefined): string {
  if (!propriete) return '';
  if (propriete.typePropriete === 'autre' && propriete.typeAutre) return propriete.typeAutre;
  return TYPES_PROPRIETE.find(t => t.valeur === propriete.typePropriete)?.libelle ?? propriete.typePropriete;
}

export function iconeType(type: string | null | undefined): string {
  return TYPES_PROPRIETE.find(t => t.valeur === type)?.icone ?? 'home-outline';
}

export function aCoordonnees(c: Coordonnees | null | undefined): c is { lat: number; lng: number } {
  return c?.lat !== null && c?.lat !== undefined && c.lng !== null && c.lng !== undefined;
}

// Jours restants avant l'expiration de l'abonnement (négatif si expiré, null si aucun)
export function joursRestants(propriete: Pick<Propriete, 'dateExpirationAbonnement'>): number | null {
  if (!propriete.dateExpirationAbonnement) return null;
  return Math.ceil((new Date(propriete.dateExpirationAbonnement).getTime() - Date.now()) / 86400000);
}

@Injectable({ providedIn: 'root' })
export class ProprietesService {

  private http = inject(HttpClient);
  private auth = inject(ProprietaireAuthService);

  // Dernières propriétés chargées : ouverture immédiate du détail
  private cache = new Map<string, Propriete>();

  // GET /api/proprietes : le serveur renvoie toutes les propriétés,
  // on ne garde que celles du propriétaire connecté
  async mesProprietes(): Promise<Propriete[]> {
    const res = await this.requete(() =>
      this.http.get<{ success: boolean; total: number; proprietes: Propriete[] }>(API_PROPRIETES)
    );
    const miennes = res.proprietes.filter(p => this.estAMoi(p));
    miennes.forEach(p => this.cache.set(p._id, p));
    return miennes;
  }

  enCache(id: string): Propriete | null {
    return this.cache.get(id) ?? null;
  }

  // GET /api/proprietes/:id (refusé si la propriété n'appartient pas au propriétaire connecté)
  async propriete(id: string): Promise<Propriete> {
    const res = await this.requete(() =>
      this.http.get<{ success: boolean; propriete: Propriete }>(`${API_PROPRIETES}/${id}`)
    );
    if (!this.estAMoi(res.propriete)) {
      throw new ApiErreur('Cette propriété ne vous appartient pas', 403);
    }
    this.cache.set(id, res.propriete);
    return res.propriete;
  }

  // POST /api/proprietes (multipart) ; progression de 0 à 1
  async ajouter(champs: ChampsPropriete, fichiers: FichiersPropriete, progression?: (f: number) => void): Promise<Propriete> {
    const moi = this.auth.proprietaire?._id;
    if (!moi) throw new ApiErreur('Session introuvable, reconnectez-vous', 401);
    const form = this.formulaire(champs, fichiers);
    form.append('proprietaire', moi);
    const res = await this.envoyer('post', API_PROPRIETES, form, progression);
    this.cache.set(res._id, res);
    return res;
  }

  // PUT /api/proprietes/:id (multipart) : les fichiers envoyés remplacent les anciens du même champ
  async modifier(id: string, champs: ChampsPropriete, fichiers: FichiersPropriete, progression?: (f: number) => void): Promise<Propriete> {
    const res = await this.envoyer('put', `${API_PROPRIETES}/${id}`, this.formulaire(champs, fichiers), progression);
    this.cache.set(res._id, res);
    return res;
  }

  estAMoi(propriete: Propriete): boolean {
    const moi = this.auth.proprietaire?._id;
    const id = typeof propriete.proprietaire === 'string' ? propriete.proprietaire : propriete.proprietaire?._id;
    return !!moi && id === moi;
  }

  private formulaire(champs: ChampsPropriete, fichiers: FichiersPropriete): FormData {
    const form = new FormData();
    for (const [cle, valeur] of Object.entries(champs)) {
      // null / '' -> '' : le serveur remet le nombre (ou la coordonnée) à vide
      if (typeof valeur === 'boolean') form.append(cle, valeur ? 'true' : 'false');
      else form.append(cle, valeur === null || valeur === undefined ? '' : String(valeur).trim());
    }
    fichiers.photos.forEach(f => form.append('photos', f, f.name));
    if (fichiers.documentPropriete) form.append('documentPropriete', fichiers.documentPropriete, fichiers.documentPropriete.name);
    fichiers.autresDocuments.forEach(f => form.append('autresDocuments', f, f.name));
    return form;
  }

  private envoyer(methode: 'post' | 'put', url: string, form: FormData, progression?: (f: number) => void): Promise<Propriete> {
    return this.requete(() =>
      this.http.request<{ success: boolean; message: string; propriete: Propriete }>(methode.toUpperCase(), url, {
        body: form,
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
        map(evenement => (evenement as { body: { propriete: Propriete } }).body.propriete)
      )
    );
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
