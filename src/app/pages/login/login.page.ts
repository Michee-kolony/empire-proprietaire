import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { Espace, ProprietaireAuthService } from '../../services/proprietaire-auth.service';

// Dernier espace choisi, proposé à la prochaine connexion
const ESPACE_KEY = 'login_espace';

// Connexion : l'utilisateur choisit d'abord son espace
// - propriétaire : POST /api/proprietaires/login (téléphone ou email + mot de passe)
// - locataire : POST /api/locataires/login (email + mot de passe donnés par son propriétaire)
@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false
})
export class LoginPage {

  private auth = inject(ProprietaireAuthService);
  private router = inject(Router);

  espace: Espace = 'proprietaire';

  loginData = {
    identifiant: '',
    password: ''
  };

  isLoading = false;
  showPassword = false;

  showToast = false;
  toastType: 'success' | 'error' = 'success';
  toastMessage = '';

  private toastTimeout: ReturnType<typeof setTimeout> | undefined;

  // « Session expirée, reconnectez-vous » après un 401
  ionViewWillEnter(): void {
    const message = this.auth.lireMessageConnexion();
    if (message) this.showErrorToast(message);
    void Preferences.get({ key: ESPACE_KEY }).then(({ value }) => {
      if (value === 'proprietaire' || value === 'locataire') this.espace = value;
    });
  }

  choisirEspace(espace: Espace): void {
    if (this.isLoading) return;
    this.espace = espace;
    void Preferences.set({ key: ESPACE_KEY, value: espace });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  async login(): Promise<void> {
    const identifiant = this.loginData.identifiant.trim();
    const password = this.loginData.password;

    if (!identifiant) {
      this.showErrorToast(this.espace === 'locataire'
        ? 'Saisissez l\'adresse email donnée par votre propriétaire.'
        : 'Saisissez votre téléphone ou votre adresse email.');
      return;
    }
    if (!password) {
      this.showErrorToast('Saisissez votre mot de passe.');
      return;
    }

    this.isLoading = true;
    try {
      const compte = this.espace === 'locataire'
        ? await this.auth.loginLocataire(identifiant, password)
        : await this.auth.login(identifiant, password);
      this.showSuccessToast(`Bienvenue, ${compte.prenom || compte.nom} !`);
      this.loginData.password = '';
      setTimeout(() => this.router.navigateByUrl(this.auth.accueil, { replaceUrl: true }), 500);
    } catch (error) {
      this.showErrorToast((error as Error).message);
    } finally {
      this.isLoading = false;
    }
  }

  private showSuccessToast(message: string): void {
    this.displayToast(message, 'success');
  }

  private showErrorToast(message: string): void {
    this.displayToast(message, 'error');
  }

  private displayToast(message: string, type: 'success' | 'error'): void {
    clearTimeout(this.toastTimeout);
    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;
    this.toastTimeout = setTimeout(() => this.closeToast(), 3500);
  }

  closeToast(): void {
    this.showToast = false;
  }
}
