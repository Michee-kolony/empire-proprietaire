import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { dateHeureLocale, dateLocale, heureLocale, jourIso, lienTel, nomComplet } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import { Propriete, ProprietesService } from '../../services/proprietes.service';
import { FiltresRapports, OptionRapport, Rapport, RapportsService, iconeRapport } from '../../services/rapports.service';

// Rapports écrits par les gardiens sur les propriétés du propriétaire (lecture seule) :
// GET /api/rapports/proprietaire, du plus récent au plus ancien, filtres facultatifs.
@Component({
  selector: 'app-rapports',
  templateUrl: './rapports.page.html',
  styleUrls: ['./rapports.page.scss'],
  standalone: false
})
export class RapportsPage {

  private rapportsService = inject(RapportsService);
  private proprietesService = inject(ProprietesService);
  private route = inject(ActivatedRoute);

  readonly dateHeure = dateHeureLocale;
  readonly nomComplet = nomComplet;
  readonly lienTel = lienTel;
  readonly icone = iconeRapport;
  readonly aujourdHui = jourIso(new Date());

  rapports: Rapport[] = [];
  objets: OptionRapport[] = [];
  proprietes: Propriete[] = [];
  charge = false;
  isLoading = false;
  errorMessage = '';

  filtresOuverts = false;
  filtres: FiltresRapports = {};
  // Rapport déplié (texte complet)
  ouvert: string | null = null;

  ionViewWillEnter(): void {
    // Arrivée depuis une propriété : filtre sur cette propriété
    const propriete = this.route.snapshot.queryParamMap.get('propriete');
    if (propriete) {
      this.filtres = { ...this.filtres, propriete };
      this.filtresOuverts = true;
    }
    this.charger();
    this.proprietesService.mesProprietes().then(p => (this.proprietes = p)).catch(() => undefined);
    if (!this.objets.length) this.rapportsService.objets().then(o => (this.objets = o)).catch(() => undefined);
  }

  async charger(): Promise<void> {
    this.errorMessage = '';
    if (this.filtres.du && this.filtres.au && this.filtres.du > this.filtres.au) {
      this.errorMessage = 'La date de début doit précéder la date de fin.';
      return;
    }
    this.isLoading = true;
    try {
      this.rapports = await this.rapportsService.mesRapports(this.filtres);
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

  basculer(id: string): void {
    this.ouvert = this.ouvert === id ? null : id;
  }

  get nombreFiltres(): number {
    return Object.values(this.filtres).filter(Boolean).length;
  }

  changerFiltre(cle: keyof FiltresRapports, event: CustomEvent): void {
    const valeur = String(event.detail.value ?? '');
    if ((this.filtres[cle] ?? '') === valeur) return;
    this.filtres = { ...this.filtres, [cle]: valeur || undefined };
    this.charger();
  }

  effacerFiltres(): void {
    this.filtres = {};
    this.charger();
  }

  // « Service du 08/10/2026 · 18:00 → 06:00 »
  service(r: Rapport): string {
    const p = r.presence;
    if (!p?.heureArrivee) return '';
    const fin = p.heureDepart ? ` → ${heureLocale(p.heureDepart)}` : ' (en cours)';
    return `Service du ${dateLocale(p.heureArrivee)} · ${heureLocale(p.heureArrivee)}${fin}`;
  }
}
