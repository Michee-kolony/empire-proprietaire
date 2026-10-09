import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { dateLocale, heureLocale, jourLabel } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  GardienRapportsService,
  ObjetRapport,
  Rapport,
  StatutRapport
} from '../../services/gardien-rapports.service';

// Rapports du gardien, lus par l'administration : GET /api/rapports/mes-rapports et POST /api/rapports.
// Un rapport se fait pendant un service ou jusqu'à 24 h après (règle du serveur).
@Component({
  selector: 'app-gardien-rapports',
  templateUrl: './gardien-rapports.page.html',
  styleUrls: ['./gardien-rapports.page.scss'],
  standalone: false
})
export class GardienRapportsPage {

  private rapportsService = inject(GardienRapportsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly date = dateLocale;
  readonly heure = heureLocale;
  readonly jourLabel = jourLabel;
  readonly descriptionMin = DESCRIPTION_MIN;
  readonly descriptionMax = DESCRIPTION_MAX;

  rapports: Rapport[] = [];
  charge = false;
  isLoading = false;
  errorMessage = '';
  messageSucces = '';

  // Formulaire « Nouveau rapport »
  formOuvert = false;
  objets: ObjetRapport[] = [];
  objet = '';
  description = '';
  envoiEnCours = false;
  erreurForm = '';

  ionViewWillEnter(): void {
    this.charger();
    // Ouverture directe du formulaire depuis « Mon service » (?nouveau=1)
    if (this.route.snapshot.queryParamMap.get('nouveau')) {
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      this.ouvrirForm();
    }
  }

  async charger(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.rapports = await this.rapportsService.mesRapports();
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

  // =====================================================
  // NOUVEAU RAPPORT
  // =====================================================

  async ouvrirForm(): Promise<void> {
    this.formOuvert = true;
    this.erreurForm = '';
    this.messageSucces = '';
    if (this.objets.length) return;
    try {
      this.objets = await this.rapportsService.objets();
      if (!this.objet && this.objets.length) this.objet = this.objets[0].valeur;
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut === 401) this.formOuvert = false;
      else this.erreurForm = erreur.message;
    }
  }

  fermerForm(): void {
    this.formOuvert = false;
  }

  onObjet(event: CustomEvent): void {
    this.objet = String(event.detail.value ?? '');
  }

  onDescription(event: CustomEvent): void {
    this.description = String(event.detail.value ?? '');
  }

  get peutEnvoyer(): boolean {
    const longueur = this.description.trim().length;
    return !!this.objet && longueur >= DESCRIPTION_MIN && longueur <= DESCRIPTION_MAX && !this.envoiEnCours;
  }

  async envoyer(): Promise<void> {
    if (!this.peutEnvoyer) return;
    this.envoiEnCours = true;
    this.erreurForm = '';
    try {
      const res = await this.rapportsService.envoyer(this.objet, this.description);
      // Brouillon effacé seulement après la confirmation du serveur
      this.description = '';
      this.formOuvert = false;
      this.messageSucces = `${res.message} à l'administration.`;
      this.rapports = [res.rapport, ...this.rapports.filter(r => r._id !== res.rapport._id)];
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut === 401) this.formOuvert = false;
      else this.erreurForm = erreur.message;
    } finally {
      this.envoiEnCours = false;
    }
  }

  // =====================================================
  // AFFICHAGE
  // =====================================================

  statutLabel(statut: StatutRapport): string {
    const labels: Record<StatutRapport, string> = { nouveau: 'Envoyé', lu: 'Lu', traite: 'Traité' };
    return labels[statut];
  }
}
