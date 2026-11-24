import { Component, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { dateLocale, nomComplet } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import { LocataireService } from '../../services/locataire.service';
import { MOT_DE_PASSE_MIN, ProprietaireAuthService } from '../../services/proprietaire-auth.service';

// Profil du locataire. Ses informations sont tenues par son propriétaire (« Logements & locataires ») ;
// le locataire peut seulement changer son mot de passe (PUT /api/locataires/moi/password).
@Component({
  selector: 'app-locataire-profil',
  templateUrl: './locataire-profil.page.html',
  styleUrls: ['./locataire-profil.page.scss'],
  standalone: false
})
export class LocataireProfilPage {

  private auth = inject(ProprietaireAuthService);
  private locataireService = inject(LocataireService);
  private alertCtrl = inject(AlertController);

  readonly locataire$ = this.auth.locataire$;
  readonly nomComplet = nomComplet;
  readonly date = dateLocale;
  readonly motDePasseMin = MOT_DE_PASSE_MIN;

  ancien = '';
  motDePasse = '';
  confirmation = '';
  afficherMotDePasse = false;
  enregistrement = false;
  erreur = '';
  succes = '';

  ionViewWillEnter(): void {
    this.succes = '';
    // Données à jour (modifiées éventuellement par le propriétaire)
    this.locataireService.monEspace().catch(() => undefined);
  }

  async changerMotDePasse(): Promise<void> {
    this.erreur = '';
    this.succes = '';
    if (!this.ancien) {
      this.erreur = 'Saisissez votre mot de passe actuel.';
      return;
    }
    if (this.motDePasse.length < MOT_DE_PASSE_MIN) {
      this.erreur = `Au moins ${MOT_DE_PASSE_MIN} caractères.`;
      return;
    }
    if (this.motDePasse !== this.confirmation) {
      this.erreur = 'Les deux mots de passe ne correspondent pas.';
      return;
    }
    this.enregistrement = true;
    try {
      this.succes = await this.locataireService.changerMotDePasse(this.ancien, this.motDePasse);
      this.ancien = '';
      this.motDePasse = '';
      this.confirmation = '';
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.erreur = erreur.message;
    } finally {
      this.enregistrement = false;
    }
  }

  async deconnexion(): Promise<void> {
    const alerte = await this.alertCtrl.create({
      header: 'Se déconnecter ?',
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        { text: 'Se déconnecter', role: 'confirm', cssClass: 'gd-alert-danger' }
      ]
    });
    await alerte.present();
    const { role } = await alerte.onDidDismiss();
    if (role === 'confirm') await this.auth.logout();
  }
}
