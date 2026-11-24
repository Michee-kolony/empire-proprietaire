import { Component, ViewChild, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Subscription } from 'rxjs';
import { ShellComponent } from '../../components/shell/shell.component';
import { cleJour, heureMessage, jourMessage } from '../../core/chat';
import { versApiErreur } from '../../services/api-erreur';
import {
  CONTENU_MAX, ChatService, Conversation, MessageChat, PHOTOS_MAX, PHOTO_TAILLE_MAX, roleChat
} from '../../services/chat.service';

type Ligne =
  | { type: 'jour'; cle: string; libelle: string }
  // suite : même auteur que le message précédent, peu de temps après (nom non répété)
  | { type: 'message'; cle: string; message: MessageChat; moi: boolean; suite: boolean };

interface PhotoJointe {
  fichier: File;
  url: string;
}

// Messages regroupés sous le même nom s'ils se suivent à moins de 5 minutes
const ECART_SUITE_MS = 5 * 60 * 1000;
// « X écrit… » disparaît sans nouveau signal
const DUREE_ECRITURE_MS = 4000;
// Pas plus d'un signal « j'écris » toutes les 3 secondes
const INTERVALLE_SIGNAL_MS = 3000;
// Appui long sur une bulle : menu Copier / Modifier / Supprimer
const DUREE_APPUI_LONG_MS = 450;
// Couleur du nom de chaque auteur dans une discussion de groupe (comme WhatsApp)
const COULEURS_AUTEURS = ['#1f7aec', '#d4405c', '#008069', '#a35dd6', '#e2711d', '#06a3a3', '#c94f9b', '#5e8c1f'];

// Discussion : GET /api/chat/conversations/:id (+ /messages), envoi de texte et de photos,
// correction ou suppression de ses propres messages pendant le délai fixé par le serveur,
// mises à jour en temps réel (Socket.IO).
@Component({
  selector: 'app-conversation',
  templateUrl: './conversation.page.html',
  styleUrls: ['./conversation.page.scss'],
  standalone: false
})
export class ConversationPage {

  @ViewChild(ShellComponent) shell!: ShellComponent;

  private chat = inject(ChatService);
  private route = inject(ActivatedRoute);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly heure = heureMessage;
  readonly role = roleChat;
  readonly contenuMax = CONTENU_MAX;
  readonly routeMessages = this.chat.routeMessages;
  readonly photosMax = PHOTOS_MAX;

  id = '';
  conversation: Conversation | null = null;
  messages: MessageChat[] = [];
  lignes: Ligne[] = [];
  plusAnciens = false;
  chargementAnciens = false;

  isLoading = false;
  errorMessage = '';

  texte = '';
  photos: PhotoJointe[] = [];
  envoi = false;
  progression = 0;
  erreurEnvoi = '';

  photoOuverte: string | null = null;
  ecrivains = new Map<string, { nom: string; minuteur: ReturnType<typeof setTimeout> }>();

  private abonnements: Subscription[] = [];
  private dernierSignal = 0;
  private minuteurAppui: ReturnType<typeof setTimeout> | null = null;
  // L'appui long vient d'ouvrir le menu : le « clic » qui suit est ignoré
  private appuiLong = false;

  ionViewWillEnter(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.chat.conversationOuverte = this.id;
    this.ecouter();
    void this.charger();
  }

  ionViewWillLeave(): void {
    this.appuiFin();
    this.chat.conversationOuverte = null;
    this.abonnements.forEach(a => a.unsubscribe());
    this.abonnements = [];
    this.ecrivains.forEach(e => clearTimeout(e.minuteur));
    this.ecrivains.clear();
  }

  async charger(): Promise<void> {
    this.errorMessage = '';
    this.isLoading = true;
    try {
      const [conversation, page] = await Promise.all([this.chat.conversation(this.id), this.chat.messages(this.id)]);
      this.conversation = conversation;
      this.messages = page.messages;
      this.plusAnciens = page.plusAnciens;
      this.majLignes();
      this.defilerEnBas(0);
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.errorMessage = erreur.message;
    } finally {
      this.isLoading = false;
    }
  }

  async chargerPlusAnciens(): Promise<void> {
    if (this.chargementAnciens || !this.messages.length) return;
    this.chargementAnciens = true;
    try {
      const zone = await this.shell.contenu.getScrollElement();
      const hauteurAvant = zone.scrollHeight;
      const page = await this.chat.messages(this.id, this.messages[0].createdAt);
      this.messages = [...page.messages, ...this.messages];
      this.plusAnciens = page.plusAnciens;
      this.majLignes();
      // Garde à l'écran le message qui y était
      setTimeout(() => (zone.scrollTop += zone.scrollHeight - hauteurAvant));
    } catch (error) {
      await this.toast(versApiErreur(error).message);
    } finally {
      this.chargementAnciens = false;
    }
  }

  // =====================================================
  // AFFICHAGE
  // =====================================================

  get titre(): string {
    return this.conversation?.titre || 'Discussion';
  }

  get sousTitre(): string {
    const c = this.conversation;
    if (!c) return '';
    // Discussion de groupe : les membres, comme sous le nom d'un groupe WhatsApp
    if (c.type === 'propriete') {
      const noms = (c.membres ?? []).map(m => (m.modele === 'Administrateur' ? 'Administration' : m.nom.split(' ')[0]));
      return noms.length ? noms.join(', ') : 'Discussion de la propriété';
    }
    return this.role(c.interlocuteur?.role) || c.typeLibelle;
  }

  get ecrit(): string {
    const noms = [...this.ecrivains.values()].map(e => e.nom.split(' ')[0]);
    if (!noms.length) return '';
    return noms.length === 1 ? `${noms[0]} écrit…` : `${noms.join(', ')} écrivent…`;
  }

  // Discussion privée : mon message a-t-il été lu par l'autre personne ?
  lu(message: MessageChat): boolean {
    const c = this.conversation;
    if (c?.type !== 'directe' || !c.lectures) return false;
    return c.lectures.some(l => l.utilisateur !== this.chat.monId && new Date(l.date) >= new Date(message.createdAt));
  }

  couleur(auteur: string): string {
    let somme = 0;
    for (const c of auteur) somme = (somme * 31 + c.charCodeAt(0)) % 9973;
    return COULEURS_AUTEURS[somme % COULEURS_AUTEURS.length];
  }

  modifiable(message: MessageChat): boolean {
    return this.chat.modifiable(message);
  }

  suivreLigne(_: number, ligne: Ligne): string {
    return ligne.cle;
  }

  private majLignes(): void {
    const lignes: Ligne[] = [];
    let jour = '';
    let precedent: MessageChat | null = null;
    for (const m of this.messages) {
      const cle = cleJour(m.createdAt);
      if (cle !== jour) {
        jour = cle;
        precedent = null;
        lignes.push({ type: 'jour', cle: `jour-${cle}`, libelle: jourMessage(m.createdAt) });
      }
      const suite = !!precedent && precedent.auteur === m.auteur
        && new Date(m.createdAt).getTime() - new Date(precedent.createdAt).getTime() < ECART_SUITE_MS;
      lignes.push({ type: 'message', cle: m._id, message: m, moi: m.auteur === this.chat.monId, suite });
      precedent = m;
    }
    this.lignes = lignes;
  }

  private defilerEnBas(duree = 300): void {
    setTimeout(() => void this.shell?.contenu.scrollToBottom(duree), 50);
  }

  // =====================================================
  // TEMPS REEL
  // =====================================================

  private ecouter(): void {
    const ici = <T extends { conversation: string }>(e: T) => e.conversation === this.id;

    this.abonnements.push(
      this.chat.nouveauMessage$.subscribe(e => {
        if (!ici(e)) return;
        this.retirerEcrivain(e.message.auteur);
        if (this.ajouter(e.message) && e.message.auteur !== this.chat.monId) {
          void this.chat.marquerLu(this.id);
        }
      }),
      this.chat.messageModifie$.subscribe(e => ici(e) && this.remplacer(e.message)),
      this.chat.messageSupprime$.subscribe(e => ici(e) && this.remplacer(e.message)),
      this.chat.lu$.subscribe(e => {
        if (!ici(e) || !this.conversation) return;
        const autres = (this.conversation.lectures ?? []).filter(l => l.utilisateur !== e.utilisateur);
        this.conversation = { ...this.conversation, lectures: [...autres, { utilisateur: e.utilisateur, date: e.date }] };
      }),
      this.chat.ecrit$.subscribe(e => {
        if (!ici(e) || e.utilisateur.id === this.chat.monId) return;
        this.retirerEcrivain(e.utilisateur.id);
        this.ecrivains.set(e.utilisateur.id, {
          nom: e.utilisateur.nom,
          minuteur: setTimeout(() => this.retirerEcrivain(e.utilisateur.id), DUREE_ECRITURE_MS)
        });
      })
    );
  }

  // false si le message était déjà affiché (réponse de l'envoi et événement temps réel)
  private ajouter(message: MessageChat): boolean {
    if (this.messages.some(m => m._id === message._id)) return false;
    this.messages = [...this.messages, message];
    this.majLignes();
    this.defilerEnBas();
    return true;
  }

  private remplacer(message: MessageChat): void {
    this.messages = this.messages.map(m => (m._id === message._id ? message : m));
    this.majLignes();
  }

  private retirerEcrivain(id: string): void {
    const ecrivain = this.ecrivains.get(id);
    if (!ecrivain) return;
    clearTimeout(ecrivain.minuteur);
    this.ecrivains.delete(id);
  }

  // =====================================================
  // ENVOI
  // =====================================================

  get peutEnvoyer(): boolean {
    return !this.envoi && (this.texte.trim().length > 0 || this.photos.length > 0) && this.texte.length <= CONTENU_MAX;
  }

  saisie(): void {
    this.erreurEnvoi = '';
    if (Date.now() - this.dernierSignal > INTERVALLE_SIGNAL_MS && this.texte.trim()) {
      this.dernierSignal = Date.now();
      this.chat.signalerEcriture(this.id);
    }
  }

  onPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const fichiers = Array.from(input.files ?? []);
    input.value = '';
    this.erreurEnvoi = '';

    for (const fichier of fichiers) {
      if (this.photos.length >= PHOTOS_MAX) {
        this.erreurEnvoi = `${PHOTOS_MAX} photos maximum par message.`;
        break;
      }
      if (!fichier.type.startsWith('image/') || fichier.type === 'image/gif') {
        this.erreurEnvoi = `« ${fichier.name} » n'est pas une photo acceptée.`;
        continue;
      }
      if (fichier.size > PHOTO_TAILLE_MAX) {
        this.erreurEnvoi = `« ${fichier.name} » dépasse 20 Mo.`;
        continue;
      }
      this.photos.push({ fichier, url: URL.createObjectURL(fichier) });
    }
  }

  retirerPhoto(photo: PhotoJointe): void {
    URL.revokeObjectURL(photo.url);
    this.photos = this.photos.filter(p => p !== photo);
  }

  async envoyer(): Promise<void> {
    if (!this.peutEnvoyer) return;
    this.envoi = true;
    this.progression = 0;
    this.erreurEnvoi = '';
    try {
      const message = await this.chat.envoyer(this.id, this.texte, this.photos.map(p => p.fichier), f => (this.progression = f));
      this.texte = '';
      this.photos.forEach(p => URL.revokeObjectURL(p.url));
      this.photos = [];
      this.ajouter(message);
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.erreurEnvoi = erreur.message;
      // Discussion fermée entre-temps : on passe en lecture seule
      if (erreur.statut === 403 && this.conversation) this.conversation = { ...this.conversation, peutEcrire: false };
    } finally {
      this.envoi = false;
    }
  }

  // =====================================================
  // CORRECTION / SUPPRESSION D'UN MESSAGE
  // =====================================================

  appuiDebut(message: MessageChat): void {
    this.appuiFin();
    this.appuiLong = false;
    this.minuteurAppui = setTimeout(() => {
      this.minuteurAppui = null;
      this.appuiLong = true;
      void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
      void this.actions(message);
    }, DUREE_APPUI_LONG_MS);
  }

  appuiFin(): void {
    if (this.minuteurAppui) clearTimeout(this.minuteurAppui);
    this.minuteurAppui = null;
  }

  ouvrirPhoto(url: string): void {
    if (this.appuiLong) {
      this.appuiLong = false;
      return;
    }
    this.photoOuverte = url;
  }

  async actions(message: MessageChat): Promise<void> {
    if (message.supprime) return;
    const boutons: { text: string; icon?: string; role?: string; handler?: () => void }[] = [];
    if (message.contenu) boutons.push({ text: 'Copier', icon: 'copy-outline', handler: () => void this.copier(message) });
    if (this.modifiable(message)) {
      if (message.contenu) boutons.push({ text: 'Modifier', icon: 'create-outline', handler: () => void this.modifier(message) });
      boutons.push({ text: 'Supprimer pour tous', icon: 'trash-outline', role: 'destructive', handler: () => void this.supprimer(message) });
    }
    if (!boutons.length) return;
    const feuille = await this.actionSheetCtrl.create({
      header: `${message.auteur === this.chat.monId ? 'Vous' : message.auteurNom} · ${this.heure(message.createdAt)}`,
      buttons: [...boutons, { text: 'Annuler', role: 'cancel' }]
    });
    await feuille.present();
  }

  private async copier(message: MessageChat): Promise<void> {
    try {
      await navigator.clipboard.writeText(message.contenu);
      await this.toast('Message copié');
    } catch {
      await this.toast('Copie impossible sur cet appareil');
    }
  }

  private async modifier(message: MessageChat): Promise<void> {
    const alerte = await this.alertCtrl.create({
      header: 'Modifier le message',
      inputs: [{ name: 'contenu', type: 'textarea', value: message.contenu, attributes: { maxlength: CONTENU_MAX, rows: 4 } }],
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        { text: 'Enregistrer', role: 'confirm' }
      ]
    });
    await alerte.present();
    const { role, data } = await alerte.onDidDismiss();
    const contenu = String(data?.values?.contenu ?? '').trim();
    if (role !== 'confirm' || contenu === message.contenu) return;
    try {
      this.remplacer(await this.chat.modifier(message._id, contenu));
    } catch (error) {
      await this.toast(versApiErreur(error).message);
    }
  }

  private async supprimer(message: MessageChat): Promise<void> {
    const alerte = await this.alertCtrl.create({
      header: 'Supprimer ce message ?',
      message: 'Il disparaîtra pour tous les participants.',
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        { text: 'Supprimer', role: 'confirm', cssClass: 'gd-alert-danger' }
      ]
    });
    await alerte.present();
    const { role } = await alerte.onDidDismiss();
    if (role !== 'confirm') return;
    try {
      await this.chat.supprimer(message._id);
      this.remplacer({ ...message, supprime: true, contenu: '', photos: [] });
    } catch (error) {
      await this.toast(versApiErreur(error).message);
    }
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2000, position: 'top' });
    await toast.present();
  }
}
