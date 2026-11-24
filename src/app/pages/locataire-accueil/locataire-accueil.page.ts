import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { adresse, dateLocale, heureAffectation, lienTel, nomComplet, roleLabel } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import { ChatService, ModeleChat } from '../../services/chat.service';
import { EspaceLocataire, LocataireService } from '../../services/locataire.service';
import { ProprietaireAuthService } from '../../services/proprietaire-auth.service';

// Accueil du locataire : GET /api/locataires/moi
// Son logement, son propriétaire et les gardiens en service, avec un accès direct au chat.
@Component({
  selector: 'app-locataire-accueil',
  templateUrl: './locataire-accueil.page.html',
  styleUrls: ['./locataire-accueil.page.scss'],
  standalone: false
})
export class LocataireAccueilPage {

  private locataireService = inject(LocataireService);
  private chat = inject(ChatService);
  private router = inject(Router);

  readonly locataire$ = inject(ProprietaireAuthService).locataire$;
  readonly nonLus$ = this.chat.nonLus$;
  readonly nomComplet = nomComplet;
  readonly adresse = adresse;
  readonly date = dateLocale;
  readonly heure = heureAffectation;
  readonly role = roleLabel;
  readonly lienTel = lienTel;

  espace: EspaceLocataire | null = null;
  isLoading = false;
  errorMessage = '';
  // Correspondant dont la discussion est en cours d'ouverture
  ouverture = '';
  erreurChat = '';

  ionViewWillEnter(): void {
    void this.charger();
  }

  async charger(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.espace = await this.locataireService.monEspace();
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

  get salutation(): string {
    const heure = new Date().getHours();
    return heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir';
  }

  // Ouvre (ou retrouve) la discussion privée avec le propriétaire ou un gardien
  async ecrire(id: string, modele: ModeleChat): Promise<void> {
    if (this.ouverture) return;
    this.ouverture = id;
    this.erreurChat = '';
    try {
      const conversation = await this.chat.ouvrirDirecte({ id, modele });
      await this.router.navigate(['/locataire/messages', conversation._id]);
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.erreurChat = erreur.message;
    } finally {
      this.ouverture = '';
    }
  }
}
