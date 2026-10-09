import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { adresse, dateHeureLocale, lienTel, nomComplet } from '../../core/format';
import { iconeIncident, lienMaps } from '../../core/incidents';
import { versApiErreur } from '../../services/api-erreur';
import { ProprietaireAuthService } from '../../services/proprietaire-auth.service';
import { AlarmeIncidentsService } from '../../services/alarme-incidents.service';
import {
  COMMENTAIRE_PROPRIETAIRE_MAX, IncidentsService, Incident, OptionIncident
} from '../../services/incidents.service';

// Détail d'un incident : GET /api/incidents/:id.
// Le propriétaire peut lui-même faire avancer le statut et laisser un commentaire (PATCH /api/incidents/:id).
@Component({
  selector: 'app-incident-detail',
  templateUrl: './incident-detail.page.html',
  styleUrls: ['./incident-detail.page.scss'],
  standalone: false
})
export class IncidentDetailPage {

  private incidentsService = inject(IncidentsService);
  private auth = inject(ProprietaireAuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private alarme = inject(AlarmeIncidentsService);

  readonly dateHeure = dateHeureLocale;
  readonly icone = iconeIncident;
  readonly adresse = adresse;
  readonly nomComplet = nomComplet;
  readonly lienTel = lienTel;
  readonly commentaireMax = COMMENTAIRE_PROPRIETAIRE_MAX;

  incident: Incident | null = null;
  isLoading = false;
  errorMessage = '';
  messageSucces = '';
  photoOuverte: string | null = null;

  // Gestion par le propriétaire
  statuts: OptionIncident[] = [];
  statutChoisi = '';
  commentaire = '';
  enregistrement = false;
  erreurGestion = '';

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
    this.preparerGestion();
    this.charger();
    this.incidentsService.options().then(o => this.statuts = o.statuts).catch(() => undefined);
  }

  async charger(): Promise<void> {
    if (!this.id) return;
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.incident = await this.incidentsService.incident(this.id);
      this.preparerGestion();
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

  private preparerGestion(): void {
    this.statutChoisi = this.incident?.statut ?? '';
    this.commentaire = this.incident?.commentaireProprietaire ?? '';
    this.erreurGestion = '';
  }

  get modifie(): boolean {
    const i = this.incident;
    return !!i && (this.statutChoisi !== i.statut || this.commentaire.trim() !== (i.commentaireProprietaire ?? ''));
  }

  async enregistrer(): Promise<void> {
    const i = this.incident;
    if (!i || !this.modifie || this.enregistrement) return;
    this.enregistrement = true;
    this.erreurGestion = '';
    try {
      const modifs: { statut?: string; commentaireProprietaire?: string } = {};
      if (this.statutChoisi !== i.statut) modifs.statut = this.statutChoisi;
      if (this.commentaire.trim() !== (i.commentaireProprietaire ?? '')) modifs.commentaireProprietaire = this.commentaire.trim();
      this.incident = await this.incidentsService.traiter(i._id, modifs);
      this.preparerGestion();
      this.messageSucces = 'Incident mis à jour.';
      this.alarme.verifierMaintenant();
    } catch (error) {
      this.erreurGestion = versApiErreur(error).message;
    } finally {
      this.enregistrement = false;
    }
  }

  // Qui a fait avancer le statut en dernier
  get traitePar(): string {
    const i = this.incident;
    if (!i?.traiteLe) return '';
    if (i.traiteParProprietaire) {
      return i.traiteParProprietaire._id === this.auth.proprietaire?._id ? 'Vous' : (nomComplet(i.traiteParProprietaire) || 'Propriétaire');
    }
    return 'Empire Security';
  }

  get lienCarte(): string {
    return lienMaps(this.incident?.position);
  }

  // « Vous » si le propriétaire connecté est l'auteur du signalement
  get signalePar(): string {
    const i = this.incident;
    if (!i) return '';
    if (i.signaleParModele === 'Proprietaire') {
      const moi = this.auth.proprietaire?._id;
      if (moi && i.signalePar?._id === moi) return 'Vous';
      return nomComplet(i.signalePar) || 'Propriétaire';
    }
    if (i.signaleParModele === 'Gardien') {
      const nom = nomComplet(i.signalePar);
      return nom ? `${nom} (gardien)` : 'Gardien';
    }
    return 'Empire Security';
  }
}
