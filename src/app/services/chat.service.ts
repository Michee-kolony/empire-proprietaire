import { Injectable, NgZone, inject } from '@angular/core';
import { HttpClient, HttpEventType, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, debounceTime, filter, firstValueFrom, map, tap, timeout } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { ApiErreur, versApiErreur } from './api-erreur';
import { ProprietaireAuthService } from './proprietaire-auth.service';

const API_CHAT = `${environment.apiUrl}/chat`;
// Socket.IO écoute sur le même serveur que l'API, sans le préfixe /api
const URL_SOCKET = new URL(environment.apiUrl).origin;

// Envoi avec photos : délai d'attente long (connexion mobile lente)
const DELAI_ENVOI_MS = 5 * 60 * 1000;

// =====================================================
// MODELES (renvoyés par /api/chat, voir backend controllers/chat.js)
// =====================================================

export type ModeleChat = 'Gardien' | 'Proprietaire' | 'Administrateur' | 'Locataire';

export interface PersonneChat {
  id: string | null;
  modele: ModeleChat;
  nom: string;
  role: string;
  photo: string;
  matricule?: string;
  roleAffectation?: string;
}

export interface ContactChat extends PersonneChat {
  id: string;
  propriete?: { id: string; nomReference: string };
  // Locataire : libellé de son logement (ex : « Appartement 3 »)
  logement?: string;
}

export interface Conversation {
  _id: string;
  type: 'propriete' | 'directe';
  typeLibelle: string;
  propriete: { _id: string; nomReference: string; commune?: string; quartier?: string; photos?: string[] } | null;
  // Rempli pour une discussion privée uniquement
  participants: PersonneChat[];
  interlocuteur?: PersonneChat | null;
  // Détail d'une discussion de propriété : propriétaire, gardiens en service, administration
  membres?: PersonneChat[];
  dernierMessage: { contenu: string; auteurNom: string; date: string | null };
  titre: string;
  photo: string;
  acces: 'membre' | 'supervision';
  // false : discussion privée fermée (le gardien n'est plus en service chez vous), lecture seule
  peutEcrire: boolean;
  nonLus: number;
  // Dernière lecture de chaque membre (« Lu » dans une discussion privée)
  lectures?: { utilisateur: string; date: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface MessageChat {
  _id: string;
  conversation: string;
  auteur: string;
  auteurModele: ModeleChat;
  auteurNom: string;
  auteurRole: string;
  auteurPhoto: string;
  contenu: string;
  photos: string[];
  modifie: boolean;
  modifieLe: string | null;
  supprime: boolean;
  supprimeLe: string | null;
  modifiableJusqua: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageMessages {
  messages: MessageChat[];
  plusAnciens: boolean;
  delaiModificationMinutes: number;
}

// Événements temps réel
export interface EvenementMessage {
  conversation: string;
  message: MessageChat;
}

export interface EvenementLu {
  conversation: string;
  utilisateur: string;
  date: string;
}

export interface EvenementEcrit {
  conversation: string;
  utilisateur: { id: string; nom: string; modele: ModeleChat };
}

// Limites du backend (models/message.js, middleware/upload.js)
export const CONTENU_MAX = 4000;
export const PHOTOS_MAX = 5;
export const PHOTO_TAILLE_MAX = 20 * 1024 * 1024;

const ROLES: Record<string, string> = {
  GARDIEN: 'Gardien',
  PROPRIETAIRE: 'Propriétaire',
  GESTIONNAIRE: 'Gestionnaire',
  MANDATAIRE: 'Mandataire',
  LOCATAIRE: 'Locataire',
  ADMIN: 'Administration',
  SUPER_ADMIN: 'Administration'
};

export function roleChat(role: string | null | undefined): string {
  return ROLES[role ?? ''] ?? '';
}

@Injectable({ providedIn: 'root' })
export class ChatService {

  private http = inject(HttpClient);
  private auth = inject(ProprietaireAuthService);
  private zone = inject(NgZone);

  private socket: Socket | null = null;
  private tokenSocket: string | null = null;

  private nonLusSubject = new BehaviorSubject<number>(0);
  private recalculNonLus = new Subject<void>();

  readonly nonLus$ = this.nonLusSubject.asObservable();
  readonly nouveauMessage$ = new Subject<EvenementMessage>();
  readonly messageModifie$ = new Subject<EvenementMessage>();
  readonly messageSupprime$ = new Subject<EvenementMessage>();
  readonly lu$ = new Subject<EvenementLu>();
  readonly ecrit$ = new Subject<EvenementEcrit>();

  // Conversation affichée à l'écran : ses nouveaux messages ne comptent pas comme non lus
  conversationOuverte: string | null = null;

  constructor() {
    this.recalculNonLus.pipe(debounceTime(500)).subscribe(() => void this.rafraichirNonLus());
  }

  // Appelé au démarrage : connexion temps réel tant qu'un propriétaire ou un locataire est connecté
  demarrer(): void {
    this.auth.utilisateur$.subscribe(utilisateur => {
      if (utilisateur && this.auth.token) this.connecter(this.auth.token);
      else this.deconnecter();
    });
  }

  get monId(): string {
    return this.auth.monId;
  }

  // Liste des discussions de l'espace connecté (/proprietaire/messages ou /locataire/messages)
  get routeMessages(): string {
    return this.auth.espace === 'locataire' ? '/locataire/messages' : '/proprietaire/messages';
  }

  // =====================================================
  // REST : /api/chat
  // =====================================================

  // Personnes avec qui ouvrir une discussion privée (gardiens en service, administration)
  async contacts(): Promise<ContactChat[]> {
    const res = await this.requete(() =>
      this.http.get<{ success: boolean; contacts: ContactChat[] }>(`${API_CHAT}/contacts`)
    );
    return res.contacts;
  }

  // Mes conversations (celles de mes propriétés sont créées par le serveur)
  async conversations(): Promise<Conversation[]> {
    const res = await this.requete(() =>
      this.http.get<{ success: boolean; nonLus: number; conversations: Conversation[] }>(`${API_CHAT}/conversations`)
    );
    this.nonLusSubject.next(res.nonLus ?? 0);
    return res.conversations;
  }

  async ouvrirPropriete(propriete: string): Promise<Conversation> {
    return this.ouvrir({ propriete });
  }

  async ouvrirDirecte(contact: Pick<ContactChat, 'id' | 'modele'>): Promise<Conversation> {
    const modele = { Gardien: 'gardien', Proprietaire: 'proprietaire', Administrateur: 'admin', Locataire: 'locataire' }[contact.modele];
    return this.ouvrir({ destinataire: contact.id, destinataireModele: modele });
  }

  async conversation(id: string): Promise<Conversation> {
    const res = await this.requete(() =>
      this.http.get<{ success: boolean; conversation: Conversation }>(`${API_CHAT}/conversations/${id}`)
    );
    return res.conversation;
  }

  // Sans "avant" : derniers messages, et la conversation est marquée comme lue
  async messages(id: string, avant?: string): Promise<PageMessages> {
    let params = new HttpParams();
    if (avant) params = params.set('avant', avant);
    const res = await this.requete(() =>
      this.http.get<{ success: boolean } & PageMessages>(`${API_CHAT}/conversations/${id}/messages`, { params })
    );
    if (!avant) this.recalculNonLus.next();
    return { messages: res.messages, plusAnciens: res.plusAnciens, delaiModificationMinutes: res.delaiModificationMinutes };
  }

  // POST multipart : texte et/ou photos ; progression de 0 à 1
  async envoyer(id: string, contenu: string, photos: File[], progression?: (fraction: number) => void): Promise<MessageChat> {
    const form = new FormData();
    if (contenu.trim()) form.append('contenu', contenu.trim());
    photos.forEach(f => form.append('photos', f, f.name));

    const res = await this.requete(() =>
      this.http.post<{ success: boolean; message: MessageChat }>(`${API_CHAT}/conversations/${id}/messages`, form, {
        reportProgress: true,
        observe: 'events'
      }).pipe(
        timeout(DELAI_ENVOI_MS),
        tap(evenement => {
          if (evenement.type === HttpEventType.UploadProgress && evenement.total) {
            progression?.(evenement.loaded / evenement.total);
          }
        }),
        filter(evenement => evenement.type === HttpEventType.Response),
        map(evenement => evenement.body!)
      )
    );
    return res.message;
  }

  async marquerLu(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${API_CHAT}/conversations/${id}/lu`, {}));
      this.recalculNonLus.next();
    } catch {
      // Sans conséquence : la conversation sera marquée lue à la prochaine ouverture
    }
  }

  // Correction / suppression par l'auteur, dans le délai fixé par le serveur
  async modifier(messageId: string, contenu: string): Promise<MessageChat> {
    const res = await this.requete(() =>
      this.http.patch<{ success: boolean; message: MessageChat }>(`${API_CHAT}/messages/${messageId}`, { contenu })
    );
    return res.message;
  }

  async supprimer(messageId: string): Promise<void> {
    await this.requete(() => this.http.delete(`${API_CHAT}/messages/${messageId}`));
  }

  // « En train d'écrire » : relayé aux autres membres par le serveur
  signalerEcriture(conversation: string): void {
    this.socket?.emit('chat:ecrit', { conversation });
  }

  // Le message est-il encore modifiable par moi ?
  modifiable(message: MessageChat): boolean {
    return message.auteur === this.monId && !message.supprime && !!message.modifiableJusqua
      && Date.now() < new Date(message.modifiableJusqua).getTime();
  }

  async rafraichirNonLus(): Promise<void> {
    if (!this.auth.token) return;
    try {
      await this.conversations();
    } catch {
      // Compteur inchangé
    }
  }

  // =====================================================
  // TEMPS REEL (Socket.IO)
  // =====================================================

  private connecter(token: string): void {
    if (this.socket && this.tokenSocket === token) return;
    this.deconnecter();
    this.tokenSocket = token;

    // Hors zone Angular : les relances de connexion ne déclenchent pas la détection de changements
    this.socket = this.zone.runOutsideAngular(() =>
      io(URL_SOCKET, { auth: { token }, transports: ['websocket', 'polling'] })
    );

    const relayer = <T>(evenement: string, sujet: Subject<T>, apres?: (donnees: T) => void) => {
      this.socket!.on(evenement, (donnees: T) => this.zone.run(() => {
        sujet.next(donnees);
        apres?.(donnees);
      }));
    };

    relayer<EvenementMessage>('message:nouveau', this.nouveauMessage$, e => {
      if (e.message.auteur !== this.monId && e.conversation !== this.conversationOuverte) this.recalculNonLus.next();
    });
    relayer<EvenementMessage>('message:modifie', this.messageModifie$);
    relayer<EvenementMessage>('message:supprime', this.messageSupprime$, () => this.recalculNonLus.next());
    relayer<EvenementLu>('conversation:lu', this.lu$);
    relayer<EvenementEcrit>('chat:ecrit', this.ecrit$);

    // Connexion (ou reconnexion après une coupure) : messages reçus entre-temps
    this.socket.on('connect', () => this.recalculNonLus.next());
  }

  private deconnecter(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.tokenSocket = null;
    this.nonLusSubject.next(0);
  }

  private async ouvrir(corps: Record<string, string>): Promise<Conversation> {
    const res = await this.requete(() =>
      this.http.post<{ success: boolean; conversation: Conversation }>(`${API_CHAT}/conversations`, corps)
    );
    return res.conversation;
  }

  private async requete<T>(appel: () => Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(appel());
    } catch (error) {
      if ((error as Error)?.name === 'TimeoutError') {
        throw new ApiErreur('L\'envoi a pris trop de temps. Vérifiez votre connexion et réessayez.', 0);
      }
      throw versApiErreur(error);
    }
  }
}
