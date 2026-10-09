import { Component, inject } from '@angular/core';
import { AlertController, MenuController } from '@ionic/angular';
import { nomComplet } from '../../core/format';
import { GardienAuthService } from '../../services/gardien-auth.service';

interface EntreeMenu {
  path: string;
  icon: string;
  label: string;
}

// Menu latéral du gardien : toutes les pages, y compris celles qui ne sont pas
// dans la barre du bas, et la déconnexion.
@Component({
  selector: 'app-gardien-menu',
  templateUrl: './gardien-menu.component.html',
  styleUrls: ['./gardien-menu.component.scss'],
  standalone: false
})
export class GardienMenuComponent {

  private auth = inject(GardienAuthService);
  private alertCtrl = inject(AlertController);
  private menuCtrl = inject(MenuController);

  readonly gardien$ = this.auth.gardien$;
  readonly nomComplet = nomComplet;

  readonly sections: { titre: string; entrees: EntreeMenu[] }[] = [
    {
      titre: 'Terrain',
      entrees: [
        { path: '/gardien/service', icon: 'finger-print-outline', label: 'Mon service' },
        { path: '/gardien/affectations', icon: 'business-outline', label: 'Mes affectations' },
        { path: '/gardien/incidents', icon: 'warning-outline', label: 'Incidents' }
      ]
    },
    {
      titre: 'Suivi',
      entrees: [
        { path: '/gardien/rapports', icon: 'document-text-outline', label: 'Rapports' },
        { path: '/gardien/historique', icon: 'time-outline', label: 'Historique' }
      ]
    },
    {
      titre: 'Compte',
      entrees: [
        { path: '/gardien/profil', icon: 'person-circle-outline', label: 'Mon profil' }
      ]
    }
  ];

  async deconnexion(): Promise<void> {
    await this.menuCtrl.close('gardien');
    const alerte = await this.alertCtrl.create({
      header: 'Se déconnecter ?',
      message: 'Les rappels de service programmés sur ce téléphone seront annulés.',
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
