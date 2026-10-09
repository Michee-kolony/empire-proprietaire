import { Component, Input, ViewChild, inject } from '@angular/core';
import { IonContent, MenuController } from '@ionic/angular';
import { Observable } from 'rxjs';
import { ChatService } from '../../services/chat.service';

interface EntreeNav {
  path: string;
  icon: string;
  label: string;
  badge?: Observable<number>;
}

// Cadre commun des pages de l'espace propriétaire : en-tête, contenu, barre du bas
@Component({
  selector: 'app-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss'],
  standalone: false
})
export class ShellComponent {

  @Input() title = '';
  @Input() subtitle = '';
  // Écran de détail : flèche de retour vers cette page à la place du logo
  @Input() retour = '';
  // Photo affichée à côté du titre (ex : correspondant d'une discussion) ; absente si non fournie
  @Input() avatar?: string | null;
  @Input() avatarRepli: 'avatar' | 'propriete' = 'avatar';
  // Masque la barre du bas (la page fournit son propre pied avec l'attribut « shellPied »)
  @Input() sansNav = false;

  // Zone défilante, pour les pages qui doivent la piloter (ex : défiler en bas d'une discussion)
  @ViewChild(IonContent, { static: true }) contenu!: IonContent;

  private menuCtrl = inject(MenuController);
  private chat = inject(ChatService);

  navItems: EntreeNav[] = [
    { path: '/proprietaire/accueil', icon: 'home', label: 'Accueil' },
    { path: '/proprietaire/proprietes', icon: 'business', label: 'Propriétés' },
    { path: '/proprietaire/messages', icon: 'chatbubbles', label: 'Messages', badge: this.chat.nonLus$ },
    { path: '/proprietaire/carte', icon: 'map', label: 'Carte' },
    { path: '/proprietaire/incidents', icon: 'warning', label: 'Incidents' }
  ];

  ouvrirMenu(): void {
    void this.menuCtrl.open('proprietaire');
  }
}
