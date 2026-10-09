import { Component, inject } from '@angular/core';
import { adresse, dateLocale, heureAffectation, nomComplet } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import {
  GardienAffectationsService,
  JOURS_SERVICE,
  JourService,
  MonAffectation,
  StatutAffectation
} from '../../services/gardien-affectations.service';

// Onglets : En cours / À venir / Historique (affectations expirées ou retirées)
type Filtre = StatutAffectation;

const INITIALES: Record<JourService, string> = {
  lundi: 'L', mardi: 'M', mercredi: 'M', jeudi: 'J', vendredi: 'V', samedi: 'S', dimanche: 'D'
};

@Component({
  selector: 'app-gardien-affectations',
  templateUrl: './gardien-affectations.page.html',
  styleUrls: ['./gardien-affectations.page.scss'],
  standalone: false
})
export class GardienAffectationsPage {

  private affectationsService = inject(GardienAffectationsService);

  readonly semaine = JOURS_SERVICE;
  readonly initiales = INITIALES;
  readonly adresse = adresse;
  readonly date = dateLocale;
  readonly nomComplet = nomComplet;

  affectations: MonAffectation[] = [];
  filtre: Filtre = 'en cours';
  isLoading = false;
  errorMessage = '';

  // Les statuts changent avec le temps : rechargement à chaque ouverture de l'écran
  ionViewWillEnter(): void {
    this.charger();
  }

  async charger(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.affectations = await this.affectationsService.mesAffectations(this.filtre);
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

  changerFiltre(event: CustomEvent): void {
    this.filtre = (event.detail.value as Filtre) || 'en cours';
    this.affectations = [];
    this.charger();
  }

  get messageVide(): string {
    const messages: Record<Filtre, string> = {
      'en cours': 'Aucune affectation en cours.',
      'a venir': 'Aucune affectation à venir.',
      expiree: 'Aucune affectation passée.'
    };
    return messages[this.filtre];
  }

  statutLabel(statut: StatutAffectation): string {
    const labels: Record<StatutAffectation, string> = { 'en cours': 'En cours', expiree: 'Terminée', 'a venir': 'À venir' };
    return labels[statut];
  }

  statutClasse(statut: StatutAffectation): string {
    const classes: Record<StatutAffectation, string> = { 'en cours': 'en_cours', expiree: 'expiree', 'a venir': 'a_venir' };
    return classes[statut];
  }

  // « 18h00 → 06h00 » ; le service passe minuit si l'heure de fin est avant l'heure de début
  horaire(affectation: MonAffectation): string {
    const { heureDebut, heureFin } = affectation;
    if (!heureDebut || !heureFin) return 'Horaire non défini';
    if (heureDebut === heureFin) return `24 h à partir de ${heureAffectation(heureDebut)}`;
    return `${heureAffectation(heureDebut)} → ${heureAffectation(heureFin)}`;
  }

  finLendemain(affectation: MonAffectation): boolean {
    const { heureDebut, heureFin } = affectation;
    return !!heureDebut && !!heureFin && heureFin < heureDebut;
  }

  tousLesJours(affectation: MonAffectation): boolean {
    return !affectation.joursService?.length || affectation.joursService.length === 7;
  }

  jourActif(affectation: MonAffectation, jour: JourService): boolean {
    return !!affectation.joursService?.includes(jour);
  }
}
