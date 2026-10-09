import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { dateHeureLocale, jourIso } from '../../core/format';
import { iconeIncident } from '../../core/incidents';
import { versApiErreur } from '../../services/api-erreur';
import { Propriete, ProprietesService } from '../../services/proprietes.service';
import { FiltresIncidents, IncidentsService, Incident, OptionsIncident } from '../../services/incidents.service';

// Incidents des propriétés du propriétaire (signalés par lui, ses gardiens ou l'entreprise) :
// GET /api/incidents/mes-incidents
// (du plus récent au plus ancien, filtres facultatifs).
@Component({
  selector: 'app-incidents',
  templateUrl: './incidents.page.html',
  styleUrls: ['./incidents.page.scss'],
  standalone: false
})
export class IncidentsPage {

  private incidentsService = inject(IncidentsService);
  private proprietesService = inject(ProprietesService);
  private route = inject(ActivatedRoute);

  readonly dateHeure = dateHeureLocale;
  readonly icone = iconeIncident;
  readonly aujourdHui = jourIso(new Date());

  incidents: Incident[] = [];
  options: OptionsIncident | null = null;
  proprietes: Propriete[] = [];
  charge = false;
  isLoading = false;
  errorMessage = '';

  filtresOuverts = false;
  filtres: FiltresIncidents = {};

  ionViewWillEnter(): void {
    // Arrivée depuis une propriété : filtre sur cette propriété
    const propriete = this.route.snapshot.queryParamMap.get('propriete');
    if (propriete) {
      this.filtres = { ...this.filtres, propriete };
      this.filtresOuverts = true;
    }
    this.charger();
    this.proprietesService.mesProprietes().then(p => (this.proprietes = p)).catch(() => undefined);
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

  auteur(incident: Incident): string {
    if (incident.signaleParModele === 'Proprietaire') return 'Signalé par vous';
    if (incident.signaleParModele === 'Gardien') return 'Signalé par le gardien';
    return 'Signalé par Empire Security';
  }

  miniature(incident: Incident): string {
    return incident.photos?.[0] ?? '';
  }
}
