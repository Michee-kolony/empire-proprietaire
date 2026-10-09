import { Component, inject } from '@angular/core';
import { dateHeureLocale, jourIso } from '../../core/format';
import { iconeIncident } from '../../core/incidents';
import { versApiErreur } from '../../services/api-erreur';
import { FiltresIncidents, GardienIncidentsService, Incident, OptionsIncident } from '../../services/gardien-incidents.service';

// Incidents signalés par le gardien ou qui le concernent : GET /api/incidents/mes-incidents
// (du plus récent au plus ancien, filtres facultatifs).
@Component({
  selector: 'app-gardien-incidents',
  templateUrl: './gardien-incidents.page.html',
  styleUrls: ['./gardien-incidents.page.scss'],
  standalone: false
})
export class GardienIncidentsPage {

  private incidentsService = inject(GardienIncidentsService);

  readonly dateHeure = dateHeureLocale;
  readonly icone = iconeIncident;
  readonly aujourdHui = jourIso(new Date());

  incidents: Incident[] = [];
  options: OptionsIncident | null = null;
  charge = false;
  isLoading = false;
  errorMessage = '';

  filtresOuverts = false;
  filtres: FiltresIncidents = {};

  ionViewWillEnter(): void {
    this.charger();
    if (!this.options) {
      this.incidentsService.options().then(o => (this.options = o)).catch(() => undefined);
    }
  }

  async charger(): Promise<void> {
    this.errorMessage = '';
    if (this.filtres.du && this.filtres.au && this.filtres.du > this.filtres.au) {
      this.errorMessage = 'La date de début doit précéder la date de fin.';
      return;
    }
    this.isLoading = true;
    try {
      this.incidents = await this.incidentsService.mesIncidents(this.filtres);
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
  // FILTRES
  // =====================================================

  get nombreFiltres(): number {
    return Object.values(this.filtres).filter(Boolean).length;
  }

  changerFiltre(cle: keyof FiltresIncidents, event: CustomEvent): void {
    const valeur = String(event.detail.value ?? '');
    if ((this.filtres[cle] ?? '') === valeur) return;
    this.filtres = { ...this.filtres, [cle]: valeur || undefined };
    this.charger();
  }

  effacerFiltres(): void {
    this.filtres = {};
    this.charger();
  }

  miniature(incident: Incident): string {
    return incident.photos?.[0] ?? '';
  }
}
