import { Component, OnDestroy, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { dateLocale, nomComplet } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import {
  ChampsProprietaire, MOT_DE_PASSE_MIN, Proprietaire, ProprietaireAuthService, ROLES_PROPRIETAIRE
} from '../../services/proprietaire-auth.service';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const PHOTO_TAILLE_MAX = 5 * 1024 * 1024;

type ChampsProfil = Required<Pick<ChampsProprietaire, 'nom' | 'postnom' | 'prenom' | 'sexe' | 'profession' | 'telephone' | 'email' | 'adresse'>>;

// Profil du propriétaire : GET / PUT /api/proprietaires/:id (photo et mot de passe compris)
@Component({
  selector: 'app-profil',
  templateUrl: './profil.page.html',
  styleUrls: ['./profil.page.scss'],
  standalone: false
})
export class ProfilPage implements OnDestroy {

  private auth = inject(ProprietaireAuthService);
  private alertCtrl = inject(AlertController);

  readonly proprietaire$ = this.auth.proprietaire$;
  readonly nomComplet = nomComplet;
  readonly date = dateLocale;
  readonly motDePasseMin = MOT_DE_PASSE_MIN;

  edition = false;
  champs: ChampsProfil = this.depuis(null);
  photo: File | null = null;
  photoUrl = '';

  motDePasse = '';
  confirmation = '';
  afficherMotDePasse = false;

  enregistrement = false;
  erreur = '';
  succes = '';
  erreurMotDePasse = '';
  succesMotDePasse = '';
  enregistrementMotDePasse = false;

  ionViewWillEnter(): void {
    this.succes = '';
    this.succesMotDePasse = '';
    // Données à jour (modifiées éventuellement par l'entreprise)
    this.auth.rafraichir().catch(() => undefined);
  }

  ngOnDestroy(): void {
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
  }

  role(p: Proprietaire): string {
    return ROLES_PROPRIETAIRE[p.role] ?? 'Propriétaire';
  }

  modifier(): void {
    this.champs = this.depuis(this.auth.proprietaire);
    this.edition = true;
    this.erreur = '';
    this.succes = '';
  }

  annuler(): void {
    this.edition = false;
    this.erreur = '';
    this.retirerPhoto();
  }

  onPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.erreur = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      this.erreur = 'Photo : JPEG, PNG, WEBP ou AVIF uniquement.';
      return;
    }
    if (file.size > PHOTO_TAILLE_MAX) {
      this.erreur = 'Photo trop lourde (5 Mo maximum).';
      return;
    }
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    this.photo = file;
    this.photoUrl = URL.createObjectURL(file);
    // Photo choisie hors édition : envoyée tout de suite
    if (!this.edition) void this.enregistrerPhoto();
  }

  retirerPhoto(): void {
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    this.photo = null;
    this.photoUrl = '';
  }

  async enregistrer(): Promise<void> {
    if (this.enregistrement) return;
    this.erreur = '';
    if (!this.champs.nom.trim()) {
      this.erreur = 'Le nom est obligatoire.';
      return;
    }
    if (!/^\+?[\d\s-]{8,}$/.test(this.champs.telephone.trim())) {
      this.erreur = 'Numéro de téléphone invalide.';
      return;
    }
    const email = this.champs.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.erreur = 'Adresse email invalide.';
      return;
    }

    this.enregistrement = true;
    try {
      // Sexe vide : non envoyé (le serveur n'accepte que M ou F)
      const champs: ChampsProprietaire = { ...this.champs };
      if (!champs.sexe) delete champs.sexe;
      const res = await this.auth.modifierProfil(champs, this.photo);
      this.succes = res.message;
      this.edition = false;
      this.retirerPhoto();
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.erreur = erreur.message;
    } finally {
      this.enregistrement = false;
    }
  }

  private async enregistrerPhoto(): Promise<void> {
    if (!this.photo) return;
    this.enregistrement = true;
    this.succes = '';
    try {
      await this.auth.modifierProfil({}, this.photo);
      this.succes = 'Photo de profil mise à jour.';
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.erreur = erreur.message;
    } finally {
      this.enregistrement = false;
      this.retirerPhoto();
    }
  }

  async changerMotDePasse(): Promise<void> {
    this.erreurMotDePasse = '';
    this.succesMotDePasse = '';
    if (this.motDePasse.length < MOT_DE_PASSE_MIN) {
      this.erreurMotDePasse = `Au moins ${MOT_DE_PASSE_MIN} caractères.`;
      return;
    }
    if (this.motDePasse !== this.confirmation) {
      this.erreurMotDePasse = 'Les deux mots de passe ne correspondent pas.';
      return;
    }
    this.enregistrementMotDePasse = true;
    try {
      await this.auth.modifierProfil({ password: this.motDePasse });
      this.motDePasse = '';
      this.confirmation = '';
      this.succesMotDePasse = 'Mot de passe modifié.';
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.erreurMotDePasse = erreur.message;
    } finally {
      this.enregistrementMotDePasse = false;
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

  private depuis(p: Proprietaire | null): ChampsProfil {
    return {
      nom: p?.nom ?? '',
      postnom: p?.postnom ?? '',
      prenom: p?.prenom ?? '',
      sexe: p?.sexe ?? '',
      profession: p?.profession ?? '',
      telephone: p?.telephone ?? '',
      email: p?.email ?? '',
      adresse: p?.adresse ?? ''
    };
  }
}
