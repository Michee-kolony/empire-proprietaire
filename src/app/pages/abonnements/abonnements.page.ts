import { Component, inject } from '@angular/core';
import { dateLocale } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import { MODES_PAIEMENT, Paiement, PaiementsService, montantLabel } from '../../services/paiements.service';
import { Propriete, ProprietesService, joursRestants } from '../../services/proprietes.service';

// Abonnements de gardiennage (par propriété) et historique des paiements.
// Les paiements sont enregistrés par Empire Security : lecture seule.
@Component({
  selector: 'app-abonnements',
  templateUrl: './abonnements.page.html',
  styleUrls: ['./abonnements.page.scss'],
  standalone: false
})
export class AbonnementsPage {

  private proprietesService = inject(ProprietesService);
  private paiementsService = inject(PaiementsService);

  readonly date = dateLocale;
  readonly montant = montantLabel;

  proprietes: Propriete[] = [];
  paiements: Paiement[] = [];
  charge = false;
  isLoading = false;
  errorMessage = '';

  ionViewWillEnter(): void {
    this.charger();
  }

  async charger(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const [proprietes, paiements] = await Promise.all([
        this.proprietesService.mesProprietes(),
        this.paiementsService.mesPaiements()
      ]);
      // Abonnements à régulariser d'abord
      const ordre = { expire: 0, aucun: 1, actif: 2 };
      this.proprietes = proprietes.sort((a, b) => ordre[a.statutAbonnement] - ordre[b.statutAbonnement]);
      this.paiements = paiements;
      this.charge = true;
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.errorMessage = erreur.message;
    } finally {
      this.isLoading = false;
    }
  }

  async actualiser(event: CustomEvent): Promise<void> {
    await this.charger();
    (event.target as HTMLIonRefresherElement).complete();
  }

  // Totaux payés par devise
  get totaux(): string[] {
    const parDevise = new Map<string, number>();
    this.paiements.forEach(p => parDevise.set(p.devise, (parDevise.get(p.devise) ?? 0) + p.montant));
    return [...parDevise.entries()].map(([devise, total]) => montantLabel(total, devise));
  }

  mode(valeur: string): string {
    return MODES_PAIEMENT[valeur] ?? valeur;
  }

  etat(p: Propriete): { classe: string; texte: string; progression: number } {
    if (p.statutAbonnement === 'aucun') return { classe: 'aucun', texte: 'Aucun abonnement', progression: 0 };
    if (p.statutAbonnement === 'expire') {
      return { classe: 'expire', texte: `Expiré depuis le ${dateLocale(p.dateExpirationAbonnement)}`, progression: 0 };
    }
    const jours = joursRestants(p) ?? 0;
    const debut = new Date(p.dateDebutAbonnement ?? Date.now()).getTime();
    const fin = new Date(p.dateExpirationAbonnement ?? Date.now()).getTime();
    const progression = fin > debut ? Math.min(1, Math.max(0, (fin - Date.now()) / (fin - debut))) : 0;
    return {
      classe: jours <= 15 ? 'bientot' : 'actif',
      texte: `${jours} jour${jours > 1 ? 's' : ''} restant${jours > 1 ? 's' : ''} · jusqu'au ${dateLocale(p.dateExpirationAbonnement)}`,
      progression
    };
  }
}
