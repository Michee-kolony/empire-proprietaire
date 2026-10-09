import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiErreur, versApiErreur } from './api-erreur';
import { ProprietaireAuthService } from './proprietaire-auth.service';

const API_PAIEMENTS = `${environment.apiUrl}/paiements`;

// =====================================================
// MODELES (modèle Mongoose "Paiement" du backend)
// Les paiements sont enregistrés par l'entreprise : lecture seule ici.
// =====================================================

export const MODES_PAIEMENT: Record<string, string> = {
  especes: 'Espèces',
  mobile_money: 'Mobile money',
  virement: 'Virement',
  carte: 'Carte bancaire',
  cheque: 'Chèque',
  autre: 'Autre'
};

export interface Paiement {
  _id: string;
  propriete: { _id: string; nomReference: string } | null;
  montant: number;
  devise: 'CDF' | 'USD';
  modePaiement: string;
  referenceTransaction: string;
  dureeMois: number;
  periodeDebut: string;
  periodeFin: string;
  description: string;
  createdAt: string;
}

export function montantLabel(montant: number, devise: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise, maximumFractionDigits: 2 }).format(montant);
  } catch {
    return `${montant} ${devise}`;
  }
}

@Injectable({ providedIn: 'root' })
export class PaiementsService {

  private http = inject(HttpClient);
  private auth = inject(ProprietaireAuthService);

  // GET /api/paiements?proprietaire=<moi> (du plus récent au plus ancien)
  async mesPaiements(proprieteId?: string): Promise<Paiement[]> {
    const moi = this.auth.proprietaire?._id;
    if (!moi) throw new ApiErreur('Session introuvable, reconnectez-vous', 401);
    let params = new HttpParams().set('proprietaire', moi);
    if (proprieteId) params = params.set('propriete', proprieteId);
    try {
      const res = await firstValueFrom(
        this.http.get<{ success: boolean; total: number; paiements: Paiement[] }>(API_PAIEMENTS, { params })
      );
      return res.paiements;
    } catch (error) {
      throw versApiErreur(error);
    }
  }
}
