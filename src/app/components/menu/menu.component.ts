import { Component, inject } from '@angular/core';
import { AlertController, MenuController } from '@ionic/angular';
import { nomComplet } from '../../core/format';
import { ChatService } from '../../services/chat.service';
import { ProprietaireAuthService, ROLES_PROPRIETAIRE, RoleProprietaire } from '../../services/proprietaire-auth.service';

interface EntreeMenu {
  path: string;
  icon: string;
  label: string;
  // Affiche le nombre de messages non lus
  badge?: boolean;
}

// Menu latéral du propriétaire : toutes les pages et la déconnexion
@Component({
  selector: 'app-menu',
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss'],
  standalone: false
})
export class MenuComponent {

  private auth = inject(ProprietaireAuthService);
  private alertCtrl = inject(AlertController);
  private menuCtrl = inject(MenuController);

  readonly proprietaire$ = this.auth.proprietaire$;
  readonly nonLus$ = inject(ChatService).nonLus$;
  readonly nomComplet = nomComplet;

  readonly sections: { titre: string; entrees: EntreeMenu[] }[] = [
    {
      titre: 'Sécurité',
      entrees: [
        { path: '/proprietaire/accueil', icon: 'home-outline', label: 'Accueil' },
        { path: '/proprietaire/carte', icon: 'map-outline', label: 'Carte des gardiens' },
        { path: '/proprietaire/incidents', icon: 'warning-outline', label: 'Incidents' },
        { path: '/proprietaire/messages', icon: 'chatbubbles-outline', label: 'Messages', badge: true },
        { path: '/proprietaire/rapports', icon: 'document-text-outline', label: 'Rapports des gardiens' }
      ]
    },
    {
      titre: 'Patrimoine',
      entrees: [
        { path: '/proprietaire/proprietes', icon: 'business-outline', label: 'Mes propriétés' },
        { path: '/proprietaire/abonnements', icon: 'card-outline', label: 'Abonnements & paiements' }
      ]
    },
    {
      titre: 'Compte',
      entrees: [
        { path: '/proprietaire/profil', icon: 'person-circle-outline', label: 'Mon profil' }
      ]
    }
  ];

  role(role: RoleProprietaire): string {
    return ROLES_PROPRIETAIRE[role] ?? 'Propriétaire';
  }

  async deconnexion(): Promise<void> {
    await this.menuCtrl.close('proprietaire');
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
