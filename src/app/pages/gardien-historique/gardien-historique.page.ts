import { Component, inject } from '@angular/core';
import {
  adresse,
  dateLocale,
  dureeLabel,
  heureLocale,
  heuresLabel,
  jourCourt,
  jourIso,
  jourLabel,
  roleLabel
} from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import { GardienPresencesService, MesServices, Presence } from '../../services/gardien-presences.service';

type Periode = '30j' | '7j' | 'mois' | 'moisDernier';

// Historique des présences du gardien : GET /api/presences/mes-services (défaut : 30 derniers jours)
@Component({
  selector: 'app-gardien-historique',
  templateUrl: './gardien-historique.page.html',
  styleUrls: ['./gardien-historique.page.scss'],
  standalone: false
})
export class GardienHistoriquePage {

  private presences = inject(GardienPresencesService);

  readonly adresse = adresse;
  readonly heure = heureLocale;
  readonly date = dateLocale;
  readonly duree = dureeLabel;
  readonly heures = heuresLabel;
  readonly jourCourt = jourCourt;
  readonly jourLabel = jourLabel;
  readonly roleLabel = roleLabel;

  periode: Periode = '30j';
  historique: MesServices | null = null;
  isLoading = false;
  errorMessage = '';

  // Détail d'un service (GET /api/presences/:id)
  detail: Presence | null = null;
  detailOuvert = false;
  detailLoading = false;
  detailErreur = '';

  ionViewWillEnter(): void {
    this.charger();
  }

  get nombreRetards(): number {
    return this.historique?.presences.filter(p => p.enRetard).length ?? 0;
  }

  changerPeriode(event: CustomEvent): void {
    this.periode = (event.detail.value as Periode) || '30j';
    this.historique = null;
    this.charger();
  }

  async charger(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const { du, au } = this.bornes();
      this.historique = await this.presences.mesServices(du, au);
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

  async ouvrir(presence: Presence): Promise<void> {
    this.detail = presence;
    this.detailOuvert = true;
    this.detailErreur = '';
    this.detailLoading = true;
    try {
      this.detail = await this.presences.detail(presence._id);
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut === 401) this.detailOuvert = false;
      else this.detailErreur = erreur.message;
    } finally {
      this.detailLoading = false;
    }
  }

  fermer(): void {
    this.detailOuvert = false;
  }

  horsZone(p: Presence): boolean {
    return !!(p.positionArrivee?.horsZone || p.positionDepart?.horsZone);
  }

  statutLabel(p: Presence): string {
    return p.statut === 'en cours' ? 'En cours' : p.statut === 'termine' ? 'Terminé' : 'Non clôturé';
  }

  clotureLabel(p: Presence): string {
    if (p.cloture === 'admin') return 'Clôturé par l\'administration';
    if (p.cloture === 'automatique') return 'Clôture automatique (départ non pointé)';
    return '';
  }

  // Période en jours locaux ; undefined = défaut du serveur (30 derniers jours)
  private bornes(): { du?: string; au?: string } {
    const aujourdHui = new Date();
    switch (this.periode) {
      case '7j': {
        const du = new Date(aujourdHui);
        du.setDate(du.getDate() - 6);
        return { du: jourIso(du), au: jourIso(aujourdHui) };
      }
      case 'mois':
        return { du: jourIso(new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), 1)), au: jourIso(aujourdHui) };
      case 'moisDernier':
        return {
          du: jourIso(new Date(aujourdHui.getFullYear(), aujourdHui.getMonth() - 1, 1)),
          au: jourIso(new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), 0))
        };
      default:
        return {};
    }
  }
}
