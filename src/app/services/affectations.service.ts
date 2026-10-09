import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { versApiErreur } from './api-erreur';

const API_AFFECTATIONS = `${environment.apiUrl}/affectations`;

// =====================================================
// MODELES (affectation renvoyée par le backend, gardien et propriété peuplés)
// =====================================================

export type StatutAffectation = 'en cours' | 'expiree' | 'a venir';
export type RoleAffectation = 'principal' | 'remplacant';

export interface GardienAffecte {
  _id: string;
  matricule: string;
  nom: string;
  postnom: string;
  prenom: string;
  sexe?: 'M' | 'F';
  photoProfil: string;
  telephonePrincipal: string;
  telephoneSecondaire?: string;
  statut: 'en service' | 'non en service';
}

export interface Affectation {
  _id: string;
  propriete: { _id: string; nomReference: string; commune: string; quartier: string; avenue: string; numero?: string; photos?: string[] } | null;
  gardien: GardienAffecte | null;
  role: RoleAffectation;
  heureDebut: string | null;
  heureFin: string | null;
  joursService: string[];
  duree: number;
  uniteDuree: 'jours' | 'semaines' | 'mois';
  dateDebut: string;
  dateFin: string;
  retireLe: string | null;
  motifRetrait: string;
  description: string;
  statut: StatutAffectation;
  createdAt?: string;
}

export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// « Tous les jours », « Du lundi au vendredi » ou « lun, mer, ven »
export function joursLabel(jours: string[] | null | undefined): string {
  const liste = jours?.length ? jours : JOURS;
  if (liste.length === 7) return 'Tous les jours';
  const semaine = JOURS.slice(0, 5);
  if (liste.length === 5 && semaine.every(j => liste.includes(j))) return 'Du lundi au vendredi';
  return JOURS.filter(j => liste.includes(j)).map(j => j.slice(0, 3)).join(', ');
}

// « 18h00 → 06h00 »
export function horaireLabel(a: Pick<Affectation, 'heureDebut' | 'heureFin'>): string {
  if (!a.heureDebut || !a.heureFin) return 'Horaire non précisé';
  const f = (h: string) => h.replace(':', 'h');
  return `${f(a.heureDebut)} → ${f(a.heureFin)}`;
}

@Injectable({ providedIn: 'root' })
export class AffectationsService {

  private http = inject(HttpClient);

  // GET /api/affectations?propriete=… : gardiens de la propriété (principal d'abord)
  async parPropriete(proprieteId: string, statut?: StatutAffectation): Promise<Affectation[]> {
    let params = new HttpParams().set('propriete', proprieteId);
    if (statut) params = params.set('statut', statut);
    return this.liste(params);
  }

  // Historique complet de la propriété, du plus récent au plus ancien
  async historique(proprieteId: string): Promise<Affectation[]> {
    return this.liste(new HttpParams().set('propriete', proprieteId).set('tri', 'recent'));
  }

  // GET /api/affectations?gardien=… : affectations d'un gardien, limitées aux propriétés données
  async duGardien(gardienId: string, proprieteIds: string[]): Promise<Affectation[]> {
    const toutes = await this.liste(new HttpParams().set('gardien', gardienId).set('tri', 'recent'));
    const ids = new Set(proprieteIds);
    return toutes.filter(a => a.propriete && ids.has(a.propriete._id));
  }

  // Affectations en cours de plusieurs propriétés (un appel par propriété)
  async enCoursDe(proprieteIds: string[]): Promise<Affectation[]> {
    const listes = await Promise.all(proprieteIds.map(id => this.parPropriete(id, 'en cours')));
    return ([] as Affectation[]).concat(...listes);
  }

  private async liste(params: HttpParams): Promise<Affectation[]> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ success: boolean; total: number; affectations: Affectation[] }>(API_AFFECTATIONS, { params })
      );
      return res.affectations;
    } catch (error) {
      throw versApiErreur(error);
    }
  }
}
