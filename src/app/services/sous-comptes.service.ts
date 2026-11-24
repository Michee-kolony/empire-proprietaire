import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { versApiErreur } from './api-erreur';
import { TypePropriete } from './proprietes.service';

const API_SOUS_COMPTES = `${environment.apiUrl}/sous-comptes`;

// =====================================================
// MODELES (identiques au modèle Mongoose "SousCompte" du backend)
// =====================================================

export type StatutSousCompte = 'libre' | 'occupe';

// Sous-compte locataire : un par logement d'une propriété (ex : 1 immeuble de 8 appartements = 8 sous-comptes).
// Créés et supprimés par le serveur selon le nombre de logements fixé par Empire Security.
// Le locataire est une fiche inscrite par le propriétaire ; avec un email et un mot de passe,
// il peut se connecter (espace « Locataire ») pour discuter avec le propriétaire et les gardiens.
export interface SousCompte {
  _id: string;
  proprietaire: string;
  propriete: {
    _id: string;
    nomReference: string;
    typePropriete: TypePropriete;
    commune: string;
    quartier: string;
    avenue: string;
    numero: string;
    nombreLogements: number;
  } | null;
  numero: number;
  libelle: string;
  nom?: string;
  postnom?: string;
  prenom?: string;
  // Simple contact, facultatif
  telephone?: string;
  dateEntree?: string;
  // Accès du locataire à l'application (absent : pas d'accès)
  locataire?: { _id: string; email: string; actif: boolean } | null;
  statut: StatutSousCompte;
  createdAt?: string;
  updatedAt?: string;
}

// Une chaîne vide retire le champ
export interface ChampsLocataire {
  libelle: string;
  nom: string;
  postnom: string;
  prenom: string;
  telephone: string;
  dateEntree: string;
  // Accès à l'application : email vide = pas d'accès (ou accès retiré)
  email: string;
  // Obligatoire pour créer l'accès ; vide = mot de passe inchangé
  password: string;
}

// Longueur minimale du mot de passe d'un locataire (vérifiée aussi par le serveur)
export const MOT_DE_PASSE_LOCATAIRE_MIN = 6;

export interface ListeSousComptes {
  total: number;
  occupes: number;
  libres: number;
  sousComptes: SousCompte[];
}

export function nomLocataire(sousCompte: Pick<SousCompte, 'prenom' | 'nom' | 'postnom'>): string {
  return [sousCompte.prenom, sousCompte.nom, sousCompte.postnom].filter(Boolean).join(' ');
}

@Injectable({ providedIn: 'root' })
export class SousComptesService {

  private http = inject(HttpClient);

  // GET /api/sous-comptes : le serveur ne renvoie que les sous-comptes du propriétaire connecté
  async mesSousComptes(filtres: { propriete?: string; statut?: StatutSousCompte } = {}): Promise<ListeSousComptes> {
    let params = new HttpParams();
    Object.entries(filtres).forEach(([cle, valeur]) => {
      if (valeur) params = params.set(cle, valeur);
    });
    return this.requete(() => this.http.get<ListeSousComptes & { success: boolean }>(API_SOUS_COMPTES, { params }));
  }

  // PUT /api/sous-comptes/:id : inscrire ou modifier le locataire du logement (et son accès à l'application)
  async enregistrer(id: string, champs: ChampsLocataire): Promise<SousCompte> {
    const { password, ...autres } = champs;
    const corps: Partial<ChampsLocataire> = { ...autres, email: autres.email.trim() };
    if (password) corps.password = password;
    const res = await this.requete(() =>
      this.http.put<{ success: boolean; sousCompte: SousCompte }>(`${API_SOUS_COMPTES}/${id}`, corps)
    );
    return res.sousCompte;
  }

  // POST /api/sous-comptes/:id/liberer : retire le locataire, le logement redevient libre
  async liberer(id: string): Promise<SousCompte> {
    const res = await this.requete(() =>
      this.http.post<{ success: boolean; sousCompte: SousCompte }>(`${API_SOUS_COMPTES}/${id}/liberer`, {})
    );
    return res.sousCompte;
  }

  private async requete<T>(appel: () => Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(appel());
    } catch (error) {
      throw versApiErreur(error);
    }
  }
}
