import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { versApiErreur } from './api-erreur';
import { Locataire, ProprietaireAuthService } from './proprietaire-auth.service';
import { TypePropriete } from './proprietes.service';

const API_LOCATAIRES = `${environment.apiUrl}/locataires`;

// =====================================================
// MODELES (renvoyés par GET /api/locataires/moi, voir backend controllers/locataire.js)
// =====================================================

export interface EspaceLocataire {
  locataire: Locataire;
  logement: { _id: string; numero: number; libelle: string; dateEntree?: string } | null;
  propriete: {
    _id: string;
    nomReference: string;
    typePropriete: TypePropriete;
    commune: string;
    quartier: string;
    avenue: string;
    numero: string;
    photos: string[];
  } | null;
  proprietaire: {
    _id: string;
    nom: string;
    postnom?: string;
    prenom?: string;
    photo: string | null;
    telephone: string;
    role: string;
  } | null;
  // Gardiens en service sur la propriété
  gardiens: {
    _id: string;
    nom: string;
    postnom: string;
    prenom: string;
    photoProfil: string;
    matricule: string;
    telephonePrincipal: string;
    statut: 'en service' | 'non en service';
    roleAffectation: 'principal' | 'remplacant';
    heureDebut: string | null;
    heureFin: string | null;
  }[];
}

@Injectable({ providedIn: 'root' })
export class LocataireService {

  private http = inject(HttpClient);
  private auth = inject(ProprietaireAuthService);

  // Logement, propriétaire et gardiens ; met aussi à jour le compte gardé en session
  async monEspace(): Promise<EspaceLocataire> {
    const res = await this.requete(() =>
      this.http.get<EspaceLocataire & { success: boolean }>(`${API_LOCATAIRES}/moi`)
    );
    await this.auth.setLocataire(res.locataire);
    return res;
  }

  // PUT /api/locataires/moi/password
  async changerMotDePasse(ancienPassword: string, password: string): Promise<string> {
    const res = await this.requete(() =>
      this.http.put<{ success: boolean; message: string }>(`${API_LOCATAIRES}/moi/password`, { ancienPassword, password })
    );
    return res.message;
  }

  private async requete<T>(appel: () => Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(appel());
    } catch (error) {
      throw versApiErreur(error);
    }
  }
}
