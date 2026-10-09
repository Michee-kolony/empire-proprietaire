import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { versApiErreur } from './api-erreur';

const API_RAPPORTS = `${environment.apiUrl}/rapports`;

export interface OptionRapport {
  valeur: string;
  libelle: string;
}

// Rapport écrit par un gardien pendant ou après son service
export interface Rapport {
  _id: string;
  objet: string;
  objetLibelle: string;
  description: string;
  statut: 'nouveau' | 'lu' | 'traite';
  commentaireAdmin: string;
  createdAt: string;
  gardien: {
    _id: string;
    matricule: string;
    nom: string;
    postnom: string;
    prenom: string;
    photoProfil: string;
    telephonePrincipal: string;
  } | null;
  propriete: { _id: string; nomReference: string; commune: string; quartier: string } | null;
  presence: { jourService: string; heureArrivee: string | null; heureDepart: string | null } | null;
}

export interface FiltresRapports {
  propriete?: string;
  gardien?: string;
  objet?: string;
  // 'AAAA-MM-JJ'
  du?: string;
  au?: string;
}

@Injectable({ providedIn: 'root' })
export class RapportsService {

  private http = inject(HttpClient);
  private objetsCache: OptionRapport[] | null = null;

  // GET /api/rapports/proprietaire : rapports des gardiens sur les propriétés du propriétaire
  async mesRapports(filtres: FiltresRapports = {}): Promise<Rapport[]> {
    let params = new HttpParams();
    for (const [cle, valeur] of Object.entries(filtres)) {
      if (valeur) params = params.set(cle, valeur);
    }
    try {
      const res = await firstValueFrom(
        this.http.get<{ success: boolean; rapports: Rapport[] }>(`${API_RAPPORTS}/proprietaire`, { params })
      );
      return res.rapports;
    } catch (error) {
      throw versApiErreur(error);
    }
  }

  // GET /api/rapports/objets : liste du filtre « Objet »
  async objets(): Promise<OptionRapport[]> {
    if (this.objetsCache) return this.objetsCache;
    try {
      const res = await firstValueFrom(this.http.get<{ success: boolean; objets: OptionRapport[] }>(`${API_RAPPORTS}/objets`));
      this.objetsCache = res.objets ?? [];
      return this.objetsCache;
    } catch (error) {
      throw versApiErreur(error);
    }
  }
}

// Icône selon l'objet du rapport
export function iconeRapport(objet: string | null | undefined): string {
  switch (objet) {
    case 'incident': return 'warning-outline';
    case 'maltraitance': return 'hand-left-outline';
    case 'vol': return 'bag-remove-outline';
    case 'intrusion': return 'log-in-outline';
    case 'degat': return 'hammer-outline';
    case 'panne': return 'construct-outline';
    case 'simple': return 'document-text-outline';
    default: return 'chatbox-ellipses-outline';
  }
}
