import { Component, inject } from '@angular/core';
import { adresse, dateLocale } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import { Propriete, ProprietesService, iconeType, joursRestants, libelleType } from '../../services/proprietes.service';

// Mes propriétés : GET /api/proprietes (filtrées sur le propriétaire connecté)
@Component({
  selector: 'app-proprietes',
  templateUrl: './proprietes.page.html',
  styleUrls: ['./proprietes.page.scss'],
  standalone: false
})
export class ProprietesPage {

  private proprietesService = inject(ProprietesService);

  readonly adresse = adresse;
  readonly date = dateLocale;
  readonly iconeType = iconeType;
  readonly libelleType = libelleType;

  proprietes: Propriete[] = [];
  recherche = '';
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
      this.proprietes = await this.proprietesService.mesProprietes();
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

  onRecherche(event: CustomEvent): void {
    this.recherche = String(event.detail.value ?? '');
  }

  get filtrees(): Propriete[] {
    const terme = this.normaliser(this.recherche);
    if (!terme) return this.proprietes;
    return this.proprietes.filter(p =>
      this.normaliser([p.nomReference, p.commune, p.quartier, p.avenue, p.numeroParcelle, libelleType(p)].join(' ')).includes(terme));
  }

  abonnement(p: Propriete): { classe: string; texte: string } {
    if (p.statutAbonnement === 'aucun') return { classe: 'aucun', texte: 'Sans abonnement' };
    if (p.statutAbonnement === 'expire') return { classe: 'expire', texte: `Expiré le ${dateLocale(p.dateExpirationAbonnement)}` };
    const jours = joursRestants(p) ?? 0;
    return jours <= 15
      ? { classe: 'bientot', texte: `Expire dans ${jours} j` }
      : { classe: 'actif', texte: `Actif jusqu'au ${dateLocale(p.dateExpirationAbonnement)}` };
  }

  private normaliser(texte: string): string {
    return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
