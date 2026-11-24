import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { versApiErreur } from './api-erreur';

const API_EVALUATIONS = `${environment.apiUrl}/evaluations`;

// Évaluation mensuelle d'un gardien, rédigée par le propriétaire ou par le gardien (auto-évaluation).
export interface Evaluation {
  _id: string;
  // Mois évalué, au format 'AAAA-MM'
  periode: string;
  commentaire: string;
  auteurModele: 'Proprietaire' | 'Gardien';
  auteurNom: string;
  modifie: boolean;
  modifieLe: string | null;
  createdAt: string;
  updatedAt: string;
  gardien: { _id: string; matricule: string; nom: string; postnom: string; prenom: string; photoProfil: string } | null;
  propriete: { _id: string; nomReference: string; commune?: string; quartier?: string } | null;
}

export interface FiltresEvaluations {
  propriete?: string;
  gardien?: string;
  // 'AAAA-MM'
  periode?: string;
}

@Injectable({ providedIn: 'root' })
export class EvaluationsService {

  private http = inject(HttpClient);

  // GET /api/evaluations/proprietaire : évaluations sur les propriétés du propriétaire
  // (la sienne et l'auto-évaluation du gardien). Renvoie aussi le mois en cours.
  async mesEvaluations(filtres: FiltresEvaluations = {}): Promise<{ evaluations: Evaluation[]; periodeCourante: string }> {
    let params = new HttpParams();
    for (const [cle, valeur] of Object.entries(filtres)) {
      if (valeur) params = params.set(cle, valeur);
    }
    try {
      const res = await firstValueFrom(
        this.http.get<{ success: boolean; evaluations: Evaluation[]; periodeCourante: string }>(
          `${API_EVALUATIONS}/proprietaire`, { params }
        )
      );
      return { evaluations: res.evaluations, periodeCourante: res.periodeCourante };
    } catch (error) {
      throw versApiErreur(error);
    }
  }

  // POST /api/evaluations : créer ou mettre à jour MON évaluation du mois pour un gardien/une propriété
  async enregistrer(payload: { gardien: string; propriete: string; commentaire: string; periode?: string }): Promise<Evaluation> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; evaluation: Evaluation }>(API_EVALUATIONS, payload)
      );
      return res.evaluation;
    } catch (error) {
      throw versApiErreur(error);
    }
  }
}

// 'AAAA-MM' -> « octobre 2026 »
const FORMAT_MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
export function moisLabel(periode: string | null | undefined): string {
  if (!periode) return '';
  const [a, m] = periode.split('-').map(Number);
  return a && m ? FORMAT_MOIS.format(new Date(a, m - 1, 1)) : periode;
}

// Les N derniers mois (mois en cours d'abord) : [{ valeur: 'AAAA-MM', libelle: 'octobre 2026' }]
export function derniersMois(n = 6, reference = new Date()): { valeur: string; libelle: string }[] {
  const mois: { valeur: string; libelle: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(reference.getFullYear(), reference.getMonth() - i, 1);
    const valeur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    mois.push({ valeur, libelle: FORMAT_MOIS.format(d) });
  }
  return mois;
}
