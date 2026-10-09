import { Component, inject } from '@angular/core';
import { dateHeureLocale, lienTel, nomComplet } from '../../core/format';
import { iconeIncident } from '../../core/incidents';
import { Affectation, AffectationsService, horaireLabel } from '../../services/affectations.service';
import { versApiErreur } from '../../services/api-erreur';
import { Incident, IncidentsService } from '../../services/incidents.service';
import { ProprietaireAuthService } from '../../services/proprietaire-auth.service';
import { Propriete, ProprietesService, iconeType, joursRestants, libelleType } from '../../services/proprietes.service';

// Seuil d'alerte avant l'expiration d'un abonnement
const ALERTE_ABONNEMENT_JOURS = 15;

interface AlerteAbonnement {
  propriete: Propriete;
  texte: string;
  danger: boolean;
}

// Tableau de bord du propriétaire : propriétés, gardiens en poste, incidents, abonnements
@Component({
  selector: 'app-accueil',
  templateUrl: './accueil.page.html',
  styleUrls: ['./accueil.page.scss'],
  standalone: false
})
export class AccueilPage {

  private auth = inject(ProprietaireAuthService);
  private proprietesService = inject(ProprietesService);
  private affectationsService = inject(AffectationsService);
  private incidentsService = inject(IncidentsService);

  readonly proprietaire$ = this.auth.proprietaire$;
  readonly nomComplet = nomComplet;
  readonly lienTel = lienTel;
  readonly horaire = horaireLabel;
  readonly dateHeure = dateHeureLocale;
  readonly iconeIncident = iconeIncident;
  readonly iconeType = iconeType;
  readonly libelleType = libelleType;

  proprietes: Propriete[] = [];
  enPoste: Affectation[] = [];
  incidents: Incident[] = [];
  alertes: AlerteAbonnement[] = [];

  charge = false;
  isLoading = false;
  errorMessage = '';

  ionViewWillEnter(): void {
    this.charger();
  }

  get salutation(): string {
    const heure = new Date().getHours();
    return heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir';
  }

  get nombreGardiens(): number {
    return new Set(this.enPoste.map(a => a.gardien?._id)).size;
  }

  get nombreEnService(): number {
    return new Set(this.enPoste.filter(a => a.gardien?.statut === 'en service').map(a => a.gardien?._id)).size;
  }

  get incidentsOuverts(): number {
    return this.incidents.filter(i => i.statut === 'nouveau' || i.statut === 'en_cours').length;
  }

  get derniersIncidents(): Incident[] {
    return this.incidents.slice(0, 3);
  }

  async charger(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const [proprietes, incidents] = await Promise.all([
        this.proprietesService.mesProprietes(),
        this.incidentsService.mesIncidents().catch(() => [] as Incident[])
      ]);
      this.proprietes = proprietes;
      this.incidents = incidents;
      this.enPoste = (await this.affectationsService.enCoursDe(proprietes.map(p => p._id)))
        .filter(a => a.gardien)
        // Gardiens en service d'abord, puis principaux
        .sort((a, b) => Number(b.gardien?.statut === 'en service') - Number(a.gardien?.statut === 'en service')
          || Number(b.role === 'principal') - Number(a.role === 'principal'));
      this.alertes = this.calculerAlertes(proprietes);
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

  gardiensDe(propriete: Propriete): number {
    return this.enPoste.filter(a => a.propriete?._id === propriete._id).length;
  }

  private calculerAlertes(proprietes: Propriete[]): AlerteAbonnement[] {
    const alertes: AlerteAbonnement[] = [];
    for (const p of proprietes) {
      const jours = joursRestants(p);
      if (p.statutAbonnement === 'expire') {
        alertes.push({ propriete: p, texte: `L'abonnement de « ${p.nomReference} » a expiré.`, danger: true });
      } else if (p.statutAbonnement === 'aucun') {
        alertes.push({ propriete: p, texte: `« ${p.nomReference} » n'a pas encore d'abonnement.`, danger: false });
      } else if (jours !== null && jours <= ALERTE_ABONNEMENT_JOURS) {
        alertes.push({
          propriete: p,
          texte: `L'abonnement de « ${p.nomReference} » expire dans ${jours} jour${jours > 1 ? 's' : ''}.`,
          danger: false
        });
      }
    }
    return alertes;
  }
}
