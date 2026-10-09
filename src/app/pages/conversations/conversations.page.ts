import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, merge } from 'rxjs';
import { dateConversation } from '../../core/chat';
import { versApiErreur } from '../../services/api-erreur';
import { ChatService, ContactChat, Conversation, roleChat } from '../../services/chat.service';

type Filtre = 'toutes' | 'non-lues' | 'propriete' | 'directe';

// Messagerie du propriétaire : GET /api/chat/conversations
// - une discussion par propriété (vous, vos gardiens en service et l'administration), créée par le serveur
// - des discussions privées avec un gardien en service chez vous ou avec l'administration
@Component({
  selector: 'app-conversations',
  templateUrl: './conversations.page.html',
  styleUrls: ['./conversations.page.scss'],
  standalone: false
})
export class ConversationsPage {

  private chat = inject(ChatService);
  private router = inject(Router);

  readonly date = dateConversation;
  readonly role = roleChat;
  readonly filtres: { valeur: Filtre; libelle: string }[] = [
    { valeur: 'toutes', libelle: 'Toutes' },
    { valeur: 'non-lues', libelle: 'Non lues' },
    { valeur: 'propriete', libelle: 'Propriétés' },
    { valeur: 'directe', libelle: 'Privées' }
  ];

  conversations: Conversation[] = [];
  recherche = '';
  filtre: Filtre = 'toutes';
  charge = false;
  isLoading = false;
  errorMessage = '';

  // Nouvelle discussion privée
  choixOuvert = false;
  contacts: ContactChat[] = [];
  contactsCharges = false;
  contactsErreur = '';
  ouverture = '';

  private abonnement: Subscription | null = null;
  private rechargement: ReturnType<typeof setTimeout> | null = null;

  ionViewWillEnter(): void {
    this.charger();
    // Nouveau message, correction ou suppression : l'aperçu et les non lus changent
    this.abonnement = merge(this.chat.nouveauMessage$, this.chat.messageModifie$, this.chat.messageSupprime$)
      .subscribe(() => this.rechargerBientot());
  }

  ionViewWillLeave(): void {
    this.abonnement?.unsubscribe();
    this.abonnement = null;
    if (this.rechargement) clearTimeout(this.rechargement);
  }

  async charger(): Promise<void> {
    this.errorMessage = '';
    this.isLoading = true;
    try {
      this.conversations = await this.chat.conversations();
      this.charge = true;
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

  // Liste unique triée par dernier message (ordre du serveur), comme WhatsApp
  get conversationsFiltrees(): Conversation[] {
    const q = normaliser(this.recherche);
    return this.conversations.filter(c =>
      (this.filtre === 'toutes' || (this.filtre === 'non-lues' ? c.nonLus > 0 : c.type === this.filtre)) &&
      (!q || normaliser(`${c.titre} ${c.dernierMessage?.contenu ?? ''}`).includes(q))
    );
  }

  get nombreNonLues(): number {
    return this.conversations.filter(c => c.nonLus > 0).length;
  }

  // Groupe : « Jean : message » ; discussion privée : le message seul
  apercu(c: Conversation): string {
    if (!c.dernierMessage?.date) {
      return c.type === 'propriete' ? 'Vous, vos gardiens et l\'administration' : (this.role(c.interlocuteur?.role) || 'Aucun message');
    }
    const auteur = c.dernierMessage.auteurNom?.split(' ')[0];
    return auteur && c.type === 'propriete' ? `${auteur} : ${c.dernierMessage.contenu}` : c.dernierMessage.contenu;
  }

  // =====================================================
  // NOUVELLE DISCUSSION PRIVEE
  // =====================================================

  async nouvelleDiscussion(): Promise<void> {
    this.choixOuvert = true;
    this.contactsErreur = '';
    try {
      this.contacts = await this.chat.contacts();
      this.contactsCharges = true;
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.contactsErreur = erreur.message;
    }
  }

  get gardiens(): ContactChat[] {
    return this.contacts.filter(c => c.modele === 'Gardien');
  }

  get administration(): ContactChat[] {
    return this.contacts.filter(c => c.modele === 'Administrateur');
  }

  async ouvrirContact(contact: ContactChat): Promise<void> {
    if (this.ouverture) return;
    this.ouverture = contact.id;
    this.contactsErreur = '';
    try {
      const conversation = await this.chat.ouvrirDirecte(contact);
      this.choixOuvert = false;
      await this.router.navigate(['/proprietaire/messages', conversation._id]);
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.contactsErreur = erreur.message;
    } finally {
      this.ouverture = '';
    }
  }

  private rechargerBientot(): void {
    if (this.rechargement) clearTimeout(this.rechargement);
    this.rechargement = setTimeout(() => void this.charger(), 400);
  }
}

function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
