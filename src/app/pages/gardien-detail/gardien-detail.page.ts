import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import {
  ACTUALISATION_CARTE_MS, RAYON_ZONE_METRES, depuisLabel, distanceLabel, distanceMetres, gardienHorsZone, gardienVisible
} from '../../core/carte';
import { dateHeureLocale, dateLocale, lienTel, nomComplet } from '../../core/format';
import { Affectation, AffectationsService, horaireLabel, joursLabel } from '../../services/affectations.service';
import { ApiErreur, versApiErreur } from '../../services/api-erreur';
import { ChatService } from '../../services/chat.service';
import { CommentaireGardien, Gardien, GardiensService } from '../../services/gardiens.service';
import { ProprietaireAuthService } from '../../services/proprietaire-auth.service';
import { Propriete, ProprietesService, aCoordonnees } from '../../services/proprietes.service';
import { GardienCarte, ProprieteCarte } from '../../components/carte/carte-gardiens.component';

const AVIS_MIN = 3;
const AVIS_MAX = 1000;

// Fiche d'un gardien, accessible seulement s'il est (ou a été) affecté à une propriété du propriétaire
@Component({
  selector: 'app-gardien-detail',
  templateUrl: './gardien-detail.page.html',
  styleUrls: ['./gardien-detail.page.scss'],
  standalone: false
})
export class GardienDetailPage {

  private gardiensService = inject(GardiensService);
  private affectationsService = inject(AffectationsService);
  private proprietesService = inject(ProprietesService);
  private auth = inject(ProprietaireAuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chat = inject(ChatService);
  private toastCtrl = inject(ToastController);

  readonly nomComplet = nomComplet;
  readonly lienTel = lienTel;
  readonly date = dateLocale;
  readonly dateHeure = dateHeureLocale;
  readonly horaire = horaireLabel;
  readonly jours = joursLabel;
  readonly depuis = depuisLabel;
  readonly distanceLabel = distanceLabel;
  readonly avisMax = AVIS_MAX;

  gardien: Gardien | null = null;
  affectations: Affectation[] = [];
  proprietes: Propriete[] = [];

  proprietesCarte: ProprieteCarte[] = [];
  gardiensCarte: GardienCarte[] = [];

  isLoading = false;
  errorMessage = '';

  ouvertureChat = false;

  avis = '';
  envoiAvis = false;
  erreurAvis = '';
  succesAvis = '';

  private id = '';
  private minuterie: ReturnType<typeof setInterval> | undefined;

  ionViewDidEnter(): void {
    clearInterval(this.minuterie);
    this.minuterie = setInterval(() => void this.actualiserGardien(), ACTUALISATION_CARTE_MS);
  }

  ionViewWillLeave(): void {
    clearInterval(this.minuterie);
  }

  // Actualisation silencieuse du statut et de la position du gardien
  private async actualiserGardien(): Promise<void> {
    if (this.isLoading || !this.gardien) return;
    try {
      this.gardien = await this.gardiensService.gardien(this.id);
      this.calculerCarte();
    } catch {
      // Nouvel essai au prochain tour
    }
  }

  ionViewWillEnter(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (id !== this.id) {
      this.gardien = null;
      this.avis = '';
    }
    this.id = id;
    this.succesAvis = '';
    this.charger();
  }

  async charger(): Promise<void> {
    if (!this.id) return;
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.proprietes = await this.proprietesService.mesProprietes();
      this.affectations = await this.affectationsService.duGardien(this.id, this.proprietes.map(p => p._id));
      if (!this.affectations.length) {
        throw new ApiErreur('Ce gardien n\'est pas affecté à vos propriétés.', 403);
      }
      this.gardien = await this.gardiensService.gardien(this.id);
      this.calculerCarte();
    } catch (error) {
      const erreur = versApiErreur(error);
      this.gardien = null;
      if (erreur.statut !== 401) this.errorMessage = erreur.message;
    } finally {
      this.isLoading = false;
    }
  }

  async actualiser(event: CustomEvent): Promise<void> {
    await this.charger();
    (event.target as HTMLIonRefresherElement).complete();
  }

  get enCours(): Affectation[] {
    return this.affectations.filter(a => a.statut !== 'expiree');
  }

  get passees(): Affectation[] {
    return this.affectations.filter(a => a.statut === 'expiree');
  }

  get aPosition(): boolean {
    const c = this.gardien?.coordonnees;
    return !!c && c.lat !== null && c.lng !== null;
  }

  // Distance à la plus proche de ses propriétés en cours (chez ce propriétaire)
  get distance(): { metres: number; propriete: Propriete } | null {
    const c = this.gardien?.coordonnees;
    if (!c || c.lat === null || c.lng === null) return null;
    let meilleure: { metres: number; propriete: Propriete } | null = null;
    for (const a of this.enCours) {
      const p = this.proprietes.find(x => x._id === a.propriete?._id);
      if (!p || !aCoordonnees(p.coordonnees)) continue;
      const metres = distanceMetres({ lat: c.lat, lng: c.lng }, p.coordonnees);
      if (!meilleure || metres < meilleure.metres) meilleure = { metres, propriete: p };
    }
    return meilleure;
  }

  get surSite(): boolean {
    const d = this.distance;
    return !!d && d.metres <= RAYON_ZONE_METRES;
  }

  get commentaires(): CommentaireGardien[] {
    return [...(this.gardien?.commentaires ?? [])].sort((a, b) => b.dateAjout.localeCompare(a.dateAjout));
  }

  get peutCommenter(): boolean {
    const longueur = this.avis.trim().length;
    return longueur >= AVIS_MIN && longueur <= AVIS_MAX && !this.envoiAvis;
  }

  onAvis(event: CustomEvent): void {
    this.avis = String(event.detail.value ?? '');
  }

  // POST /api/gardiens/:id/commentaires : nom et photo du propriétaire connecté
  async envoyerAvis(): Promise<void> {
    const moi = this.auth.proprietaire;
    if (!this.gardien || !moi || !this.peutCommenter) return;
    this.envoiAvis = true;
    this.erreurAvis = '';
    this.succesAvis = '';
    try {
      const commentaires = await this.gardiensService.commenter(this.gardien._id, nomComplet(moi) || moi.nom, this.avis, moi.photo);
      this.gardien = { ...this.gardien, commentaires };
      this.avis = '';
      this.succesAvis = 'Merci, votre avis a été publié.';
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.erreurAvis = erreur.message;
    } finally {
      this.envoiAvis = false;
    }
  }

  // Discussion privée avec ce gardien (possible tant qu'il est en service chez vous)
  async ecrire(): Promise<void> {
    if (!this.gardien || this.ouvertureChat) return;
    this.ouvertureChat = true;
    try {
      const conversation = await this.chat.ouvrirDirecte({ id: this.gardien._id, modele: 'Gardien' });
      await this.router.navigate(['/proprietaire/messages', conversation._id]);
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) await (await this.toastCtrl.create({ message: erreur.message, duration: 3000, position: 'top' })).present();
    } finally {
      this.ouvertureChat = false;
    }
  }

  private calculerCarte(): void {
    const ids = new Set(this.enCours.map(a => a.propriete?._id));
    this.proprietesCarte = this.proprietes
      .filter(p => ids.has(p._id) && aCoordonnees(p.coordonnees))
      .map(p => ({ id: p._id, nom: p.nomReference, lat: p.coordonnees.lat as number, lng: p.coordonnees.lng as number }));
    const g = this.gardien;
    this.gardiensCarte = g && gardienVisible(g.statut, g.coordonnees) && this.proprietesCarte.length
      ? [{
        id: g._id,
        nom: nomComplet(g),
        photo: g.photoProfil,
        enService: true,
        horsZone: gardienHorsZone(g.coordonnees, this.proprietesCarte),
        lat: g.coordonnees!.lat as number,
        lng: g.coordonnees!.lng as number
      }]
      : [];
  }
}
