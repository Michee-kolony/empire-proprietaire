import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { dateLocale, lienTel, nomComplet } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import { Gardien, GardienAuthService } from '../../services/gardien-auth.service';

// Profil du gardien connecté (GET /api/gardiens/:id), en lecture seule :
// modification du profil et du statut réservées à l'administration.
@Component({
  selector: 'app-gardien-profil',
  templateUrl: './gardien-profil.page.html',
  styleUrls: ['./gardien-profil.page.scss'],
  standalone: false
})
export class GardienProfilPage implements OnInit, OnDestroy {

  private auth = inject(GardienAuthService);
  private alertCtrl = inject(AlertController);

  readonly date = dateLocale;
  readonly nomComplet = nomComplet;
  readonly lienTel = lienTel;

  guard: Gardien | null = null;
  isLoading = false;
  errorMessage = '';
  private abonnement?: Subscription;

  ngOnInit(): void {
    this.abonnement = this.auth.gardien$.subscribe(g => (this.guard = g));
  }

  ngOnDestroy(): void {
    this.abonnement?.unsubscribe();
  }

  ionViewWillEnter(): void {
    this.charger();
  }

  async charger(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      await this.auth.refreshGardien();
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

  get adresse(): string {
    const g = this.guard;
    if (!g) return '';
    return g.adresseActuelle || [g.avenue, g.quartier, g.commune].filter(Boolean).join(', ');
  }

  async deconnexion(): Promise<void> {
    const alerte = await this.alertCtrl.create({
      header: 'Se déconnecter ?',
      message: 'Les rappels de service programmés sur ce téléphone seront annulés.',
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        { text: 'Se déconnecter', role: 'confirm' }
      ]
    });
    await alerte.present();
    const { role } = await alerte.onDidDismiss();
    if (role === 'confirm') await this.auth.logout();
  }
}
