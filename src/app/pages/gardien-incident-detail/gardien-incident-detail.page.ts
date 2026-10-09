import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { adresse, dateHeureLocale, lienTel, nomComplet } from '../../core/format';
import { iconeIncident, lienMaps } from '../../core/incidents';
import { versApiErreur } from '../../services/api-erreur';
import { GardienAuthService } from '../../services/gardien-auth.service';
import { GardienIncidentsService, Incident } from '../../services/gardien-incidents.service';

// Détail d'un incident : GET /api/incidents/:id (lecture seule pour le gardien).
@Component({
  selector: 'app-gardien-incident-detail',
  templateUrl: './gardien-incident-detail.page.html',
  styleUrls: ['./gardien-incident-detail.page.scss'],
  standalone: false
})
export class GardienIncidentDetailPage {

  private incidentsService = inject(GardienIncidentsService);
  private auth = inject(GardienAuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly dateHeure = dateHeureLocale;
  readonly icone = iconeIncident;
  readonly adresse = adresse;
  readonly nomComplet = nomComplet;
  readonly lienTel = lienTel;

  incident: Incident | null = null;
  isLoading = false;
  errorMessage = '';
  messageSucces = '';
  photoOuverte: string | null = null;

  private id = '';

  ionViewWillEnter(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    // Arrivée depuis le formulaire (?signale=1) : confirmation affichée une seule fois
    if (this.route.snapshot.queryParamMap.get('signale')) {
      this.messageSucces = 'Incident signalé : l\'entreprise a été prévenue.';
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    } else {
      this.messageSucces = '';
    }
    this.incident = this.incidentsService.enCache(this.id);
    this.charger();
  }

  async charger(): Promise<void> {
    if (!this.id) return;
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.incident = await this.incidentsService.incident(this.id);
    } catch (error) {
      const erreur = versApiErreur(error);
      // Version en cache conservée si le réseau échoue
      if (erreur.statut !== 401 && !this.incident) this.errorMessage = erreur.message;
    } finally {
      this.isLoading = false;
    }
  }

  async actualiser(event: CustomEvent): Promise<void> {
    await this.charger();
    (event.target as HTMLIonRefresherElement).complete();
  }

  get lienCarte(): string {
    return lienMaps(this.incident?.position);
  }

  // « Vous » si le gardien connecté est l'auteur du signalement
  get signalePar(): string {
    const i = this.incident;
    if (!i) return '';
    if (i.signaleParModele === 'Gardien') {
      const moi = this.auth.gardien?._id;
      if (moi && i.signalePar?._id === moi) return 'Vous';
      return nomComplet(i.signalePar) || 'Gardien';
    }
    const role = i.signaleParModele === 'Proprietaire' ? 'Propriétaire' : 'Administration';
    const nom = nomComplet(i.signalePar);
    return nom ? `${nom} (${role.toLowerCase()})` : role;
  }
}
