import { Component, Input, inject } from '@angular/core';
import { MenuController } from '@ionic/angular';

@Component({
  selector: 'app-gardien-shell',
  templateUrl: './gardien-shell.component.html',
  styleUrls: ['./gardien-shell.component.scss'],
  standalone: false
})
export class GardienShellComponent {

  @Input() title = '';
  @Input() subtitle = '';
  // Écran de détail : flèche de retour vers cette page à la place du logo
  @Input() retour = '';

  private menuCtrl = inject(MenuController);

  // Barre du bas : actions de terrain ; le reste est dans le menu latéral
  navItems = [
    { path: '/gardien/service', icon: 'finger-print', label: 'Mon service' },
    { path: '/gardien/affectations', icon: 'business', label: 'Affectations' },
    { path: '/gardien/incidents', icon: 'warning', label: 'Incidents' }
  ];

  ouvrirMenu(): void {
    void this.menuCtrl.open('gardien');
  }
}
