import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { adresse, dateLocale, heureAffectation, lienTel, nomComplet, roleLabel } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import { GardienAuthService } from '../../services/gardien-auth.service';
import {
  GardienAffectationsService,
  JOURS_SERVICE,
  MonAffectation,
  NiveauSecurite,
  ProprieteDetail
} from '../../services/gardien-affectations.service';

// Détail d'une affectation, en lecture seule (gérée par l'administration) :
// propriété (GET /api/proprietes/:id), itinéraire, propriétaire et équipe de gardiens.
@Component({
  selector: 'app-gardien-affectation-detail',
  templateUrl: './gardien-affectation-detail.page.html',
  styleUrls: ['./gardien-affectation-detail.page.scss'],
  standalone: false
})
export class GardienAffectationDetailPage {

  private route = inject(ActivatedRoute);
  private affectationsService = inject(GardienAffectationsService);
  private auth = inject(GardienAuthService);

  readonly adresse = adresse;
  readonly date = dateLocale;
  readonly nomComplet = nomComplet;
  readonly roleLabel = roleLabel;
  readonly lienTel = lienTel;

  affectation: MonAffectation | null = null;
  propriete: ProprieteDetail | null = null;
  equipe: MonAffectation[] = [];

  isLoading = false;
  errorMessage = '';
  erreurEquipe = '';
  photoOuverte: string | null = null;

  ionViewWillEnter(): void {
    this.charger();
  }

  async charger(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.erreurEquipe = '';
    try {
      this.affectation = await this.affectationsService.affectation(id);
      const proprieteId = this.affectation.propriete?._id;
      if (proprieteId) {
        const [propriete, equipe] = await Promise.all([
          this.affectationsService.propriete(proprieteId),
          // L'équipe est un complément : son échec n'empêche pas d'afficher la propriété
          this.affectationsService.equipe(proprieteId).catch(error => {
            this.erreurEquipe = versApiErreur(error).message;
            return [] as MonAffectation[];
          })
        ]);
        this.propriete = propriete;
        this.equipe = equipe;
      }
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

  get photos(): string[] {
    return this.propriete?.photos?.length ? this.propriete.photos : this.affectation?.propriete?.photos ?? [];
  }

  // lienCarte saisi par l'administration, sinon itinéraire Google Maps vers les coordonnées
  get lienItineraire(): string {
    const p = this.propriete;
    if (!p) return '';
    if (p.lienCarte) return p.lienCarte;
    const { lat, lng } = p.coordonnees ?? {};
    return lat != null && lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : '';
  }

  estMoi(membre: MonAffectation): boolean {
    return membre.gardien?._id === this.auth.gardien?._id;
  }

  horaire(a: { heureDebut: string | null; heureFin: string | null }): string {
    if (!a.heureDebut || !a.heureFin) return 'Horaire non défini';
    const lendemain = a.heureFin < a.heureDebut ? ' (lendemain)' : '';
    return `${heureAffectation(a.heureDebut)} → ${heureAffectation(a.heureFin)}${lendemain}`;
  }

  jours(a: MonAffectation): string {
    if (!a.joursService?.length || a.joursService.length === 7) return 'Tous les jours';
    return JOURS_SERVICE.filter(j => a.joursService.includes(j)).join(', ');
  }

  niveauLabel(niveau: NiveauSecurite | undefined): string {
    const labels: Record<NiveauSecurite, string> = {
      standard: 'Standard',
      renforce: 'Renforcé',
      'haute surveillance': 'Haute surveillance'
    };
    return niveau ? labels[niveau] : '—';
  }

  equipements(p: ProprieteDetail): { label: string; present: boolean }[] {
    return [
      { label: 'Clôture', present: p.cloture },
      { label: 'Portail', present: p.portail },
      { label: 'Garage', present: p.garage },
      { label: p.cameras && p.nombreCameras ? `Caméras (${p.nombreCameras})` : 'Caméras', present: p.cameras },
      { label: 'Alarme', present: p.alarme },
      { label: 'Éclairage de sécurité', present: p.eclairageSecurite },
      { label: 'Interphone', present: p.interphone }
    ];
  }
}
