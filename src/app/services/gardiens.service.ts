import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { versApiErreur } from './api-erreur';
import { Affectation, AffectationsService } from './affectations.service';

const API_GARDIENS = `${environment.apiUrl}/gardiens`;

// =====================================================
// MODELES (modèle Mongoose "Gardien" du backend, sans le mot de passe)
// =====================================================

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
  photoProfil: string;
  telephonePrincipal: string;
  telephoneSecondaire: string;
  statut: 'en service' | 'non en service';
  coordonnees?: { lat: number | null; lng: number | null };
  commentaires: CommentaireGardien[];
  createdAt?: string;
  // Modifié à chaque envoi de position par l'application du gardien
  updatedAt?: string;
}

// Gardien en poste sur une propriété, avec sa dernière position connue
export interface GardienEnPoste {
  gardien: Gardien;
  affectations: Affectation[];
  proprieteIds: string[];
}

@Injectable({ providedIn: 'root' })
export class GardiensService {

  private http = inject(HttpClient);
  private affectationsService = inject(AffectationsService);

  // GET /api/gardiens/:id
  async gardien(id: string): Promise<Gardien> {
    try {
      const res = await firstValueFrom(this.http.get<{ success: boolean; gardien: Gardien }>(`${API_GARDIENS}/${id}`));
      return res.gardien;
    } catch (error) {
      throw versApiErreur(error);
    }
  }

  // Gardiens actuellement affectés aux propriétés données (affectations « en cours »),
  // avec leur position. Seuls ces gardiens sont affichés sur la carte du propriétaire.
  async enPoste(proprieteIds: string[], affectations?: Affectation[]): Promise<GardienEnPoste[]> {
    const liste = affectations ?? await this.affectationsService.enCoursDe(proprieteIds);
    const parGardien = new Map<string, Affectation[]>();
    for (const a of liste) {
      if (!a.gardien || a.statut !== 'en cours') continue;
      parGardien.set(a.gardien._id, [...(parGardien.get(a.gardien._id) ?? []), a]);
    }

    const resultats = await Promise.all([...parGardien.entries()].map(async ([id, affs]) => {
      try {
        return { gardien: await this.gardien(id), affectations: affs, proprieteIds: [...new Set(affs.map(a => a.propriete?._id ?? ''))] };
      } catch {
        // Gardien supprimé entre-temps : ignoré
        return null;
      }
    }));
    return resultats.filter((r): r is GardienEnPoste => r !== null);
  }

  // POST /api/gardiens/:id/commentaires (avis du propriétaire sur le gardien)
  async commenter(id: string, nomProprietaire: string, contenu: string, photoProprietaire: string | null): Promise<CommentaireGardien[]> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; commentaires: CommentaireGardien[] }>(`${API_GARDIENS}/${id}/commentaires`, {
          nomProprietaire,
          contenu: contenu.trim(),
          photoProprietaire: photoProprietaire ?? ''
        })
      );
      return res.commentaires;
    } catch (error) {
      throw versApiErreur(error);
    }
  }
}
