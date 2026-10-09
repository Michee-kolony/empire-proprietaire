import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Network } from '@capacitor/network';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiErreur, versApiErreur } from './api-erreur';

const API_RAPPORTS = `${environment.apiUrl}/rapports`;

// =====================================================
// MODELES (rapport renvoyé par le backend)
// Le serveur rattache le rapport au service en cours, sinon au dernier service
// terminé depuis moins de 24 h : l'application n'envoie que l'objet et la description.
// =====================================================

export type StatutRapport = 'nouveau' | 'lu' | 'traite';

export interface ObjetRapport {
  valeur: string;
  libelle: string;
}

export interface Rapport {
  _id: string;
  objet: string;
  objetLibelle: string;
  description: string;
  statut: StatutRapport;
  traiteLe: string | null;
  commentaireAdmin: string;
  propriete: { _id: string; nomReference: string; commune: string; quartier: string; avenue: string; numero?: string } | null;
  presence: { _id: string; jourService: string; debutPrevu: string; finPrevue: string } | null;
  createdAt: string;
}

// Limites du modèle Rapport du backend
export const DESCRIPTION_MIN = 5;
export const DESCRIPTION_MAX = 5000;

@Injectable({ providedIn: 'root' })
export class GardienRapportsService {

  private http = inject(HttpClient);
  private objetsCache: ObjetRapport[] | null = null;

  // GET /api/rapports/objets : liste du select « Objet »
  async objets(): Promise<ObjetRapport[]> {
    if (this.objetsCache) return this.objetsCache;
    const res = await this.requete(() =>
      this.http.get<{ success: boolean; objets: ObjetRapport[] }>(`${API_RAPPORTS}/objets`)
    );
    this.objetsCache = res.objets;
    return res.objets;
  }

  // GET /api/rapports/mes-rapports
  async mesRapports(): Promise<Rapport[]> {
    const res = await this.requete(() =>
      this.http.get<{ success: boolean; total: number; rapports: Rapport[] }>(`${API_RAPPORTS}/mes-rapports`)
    );
    return res.rapports;
  }

  // POST /api/rapports  body { objet, description }
  async envoyer(objet: string, description: string): Promise<{ message: string; rapport: Rapport }> {
    try {
      if (!(await Network.getStatus()).connected) {
        throw new ApiErreur('Pas de connexion internet, réessayez', 0);
      }
    } catch (error) {
      if (error instanceof ApiErreur) throw error;
    }
    return this.requete(() =>
      this.http.post<{ success: boolean; message: string; rapport: Rapport }>(API_RAPPORTS, {
        objet,
        description: description.trim()
      })
    );
  }

  private async requete<T>(appel: () => Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(appel());
    } catch (error) {
      throw versApiErreur(error);
    }
  }
}
