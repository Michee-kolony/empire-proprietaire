import { Component, OnDestroy, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';
import { AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { adresse, dureeLabel, heureLocale, jourLabel, roleLabel } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import { FinEnAttente, GardienAuthService } from '../../services/gardien-auth.service';
import {
  GardienLocalisationService,
  LocalisationRefusee,
  PositionAppareil
} from '../../services/gardien-localisation.service';
import {
  GardienPresencesService,
  MonService,
  Presence,
  ProchainService,
  ReponsePointage
} from '../../services/gardien-presences.service';
import { GardienTrackingService } from '../../services/gardien-tracking.service';

// Au-delà, on propose de réessayer avant d'envoyer la position
const PRECISION_MAX_METRES = 100;

// « Mon service » (écran d'accueil) : pointage d'arrivée / de départ avec la position GPS.
// Le serveur trouve le service prévu et calcule retard, durée, distance et statut :
// l'écran se contente d'afficher et recharge après chaque action.
@Component({
  selector: 'app-gardien-service',
  templateUrl: './gardien-service.page.html',
  styleUrls: ['./gardien-service.page.scss'],
  standalone: false
})
export class GardienServicePage implements OnDestroy {

  private presences = inject(GardienPresencesService);
  private localisation = inject(GardienLocalisationService);
  private auth = inject(GardienAuthService);
  private tracking = inject(GardienTrackingService);
  private alertCtrl = inject(AlertController);

  readonly adresse = adresse;
  readonly heure = heureLocale;
  readonly jourLabel = jourLabel;
  readonly roleLabel = roleLabel;

  etat: MonService | null = null;
  isLoading = false;
  errorMessage = '';

  // Pointage en cours (boutons désactivés du clic jusqu'à la réponse du serveur)
  pointageEnCours = false;
  etape: '' | 'gps' | 'envoi' = '';
  messageSucces = '';

  dernierEnvoiPosition: Date | null = null;

  // Chrono d'affichage (temps écoulé depuis l'arrivée enregistrée par le serveur)
  maintenant = Date.now();
  private chrono?: ReturnType<typeof setInterval>;
  private resumeListener?: PluginListenerHandle;
  private abonnement?: Subscription;

  // Rechargé à chaque retour sur l'onglet et au retour de l'application au premier plan
  async ionViewWillEnter(): Promise<void> {
    this.abonnement = this.tracking.dernierEnvoi$.subscribe(d => (this.dernierEnvoiPosition = d));
    this.resumeListener = await App.addListener('resume', () => this.charger());
    await this.charger();
    await this.reprendreFinEnAttente();
  }

  ionViewWillLeave(): void {
    this.nettoyer();
  }

  ngOnDestroy(): void {
    this.nettoyer();
  }

  get enCours(): Presence | null {
    return this.etat?.serviceEnCours ?? null;
  }

  // Service affiché dans la carte « Commencer » : le premier qui n'a pas encore été pointé
  get aCommencer(): ProchainService | null {
    if (!this.etat?.peutCommencer) return null;
    return this.etat.prochainsServices.find(s => !s.effectue) ?? null;
  }

  // Liste « Prochains services » : tous sauf celui de la carte « Commencer »
  get autresServices(): ProchainService[] {
    const aCommencer = this.aCommencer;
    return (this.etat?.prochainsServices ?? []).filter(s => s !== aCommencer);
  }

  get libelleAction(): string {
    return this.etape === 'gps' ? 'Localisation en cours…' : 'Envoi…';
  }

  async charger(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.etat = await this.presences.monService();
      this.demarrerChrono();
    } catch (error) {
      this.afficherErreur(error);
    } finally {
      this.isLoading = false;
    }
  }

  async actualiser(event: CustomEvent): Promise<void> {
    await this.charger();
    (event.target as HTMLIonRefresherElement).complete();
  }

  // =====================================================
  // COMMENCER
  // =====================================================

  async commencer(): Promise<void> {
    if (this.pointageEnCours) return;
    this.debutPointage();
    try {
      await this.presences.exigerReseau();
      const position = await this.obtenirPosition();
      if (!position) return;

      this.etape = 'envoi';
      const res = await this.presences.commencer(position);
      this.messageSucces = res.message;
      await this.signalerHorsZone(res);
    } catch (error) {
      this.afficherErreur(error);
    } finally {
      await this.finPointage();
    }
  }

  // =====================================================
  // TERMINER
  // =====================================================

  async terminer(): Promise<void> {
    const service = this.enCours;
    if (this.pointageEnCours || !service) return;

    const confirmation = await this.confirmerFin(service);
    if (!confirmation.confirme) return;

    this.debutPointage();
    try {
      await this.presences.exigerReseau();
      const position = await this.obtenirPosition();
      if (!position) return;
      await this.envoyerFin(position, confirmation.commentaire);
    } catch (error) {
      this.afficherErreur(error);
    } finally {
      await this.finPointage();
    }
  }

  // Fin de service interrompue par un token expiré : relancée après la reconnexion
  private async reprendreFinEnAttente(): Promise<void> {
    const action: FinEnAttente | null = await this.auth.prendreFinEnAttente();
    if (!action || !this.enCours || this.pointageEnCours) return;

    this.debutPointage();
    this.messageSucces = 'Reprise de la fin de votre service…';
    try {
      const { lat, lng, precision, commentaire } = action;
      await this.envoyerFin({ lat, lng, precision }, commentaire);
    } catch (error) {
      this.afficherErreur(error);
    } finally {
      await this.finPointage();
    }
  }

  private async envoyerFin(position: PositionAppareil, commentaire?: string): Promise<void> {
    this.etape = 'envoi';
    // Mémorisée avant l'envoi : un 401 efface la session avant qu'on puisse réagir
    await this.auth.memoriserFinEnAttente({ ...position, commentaire });
    try {
      const res = await this.presences.terminer(position, commentaire);
      await this.auth.effacerFinEnAttente();
      this.messageSucces = `${res.message} — durée : ${dureeLabel(res.presence.dureeMinutes)}`;
      await this.signalerHorsZone(res);
    } catch (error) {
      if (versApiErreur(error).statut !== 401) await this.auth.effacerFinEnAttente();
      throw error;
    }
  }

  private async confirmerFin(service: Presence): Promise<{ confirme: boolean; commentaire?: string }> {
    const avantFin = Date.now() < new Date(service.finPrevue).getTime();
    const alerte = await this.alertCtrl.create({
      header: 'Terminer votre service maintenant ?',
      message: avantFin
        ? `Votre service est prévu jusqu'à ${heureLocale(service.finPrevue)} : un départ avant l'heure sera signalé.`
        : undefined,
      inputs: [{ name: 'commentaire', type: 'textarea', placeholder: 'Commentaire (facultatif)' }],
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        { text: 'Terminer', role: 'confirm', cssClass: 'gd-alert-danger' }
      ]
    });
    await alerte.present();
    const { role, data } = await alerte.onDidDismiss();
    const commentaire = String(data?.values?.commentaire ?? '').trim();
    return { confirme: role === 'confirm', commentaire: commentaire || undefined };
  }

  // =====================================================
  // POSITION GPS (obligatoire : jamais de pointage sans position)
  // =====================================================

  private async obtenirPosition(): Promise<PositionAppareil | null> {
    this.etape = 'gps';
    let position: PositionAppareil;
    try {
      position = await this.localisation.positionPourPointage();
    } catch (error) {
      if (error instanceof LocalisationRefusee) {
        await this.proposerReglages();
        return null;
      }
      throw error;
    }

    if (position.precision <= PRECISION_MAX_METRES) return position;

    const alerte = await this.alertCtrl.create({
      header: 'Position imprécise',
      message: `Votre position n'est précise qu'à ${position.precision} m près. `
        + 'Placez-vous à découvert pour une meilleure précision.',
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        { text: 'Continuer quand même', role: 'continuer' },
        { text: 'Réessayer', role: 'reessayer' }
      ]
    });
    await alerte.present();
    const { role } = await alerte.onDidDismiss();
    if (role === 'reessayer') return this.obtenirPosition();
    return role === 'continuer' ? position : null;
  }

  private async proposerReglages(): Promise<void> {
    const alerte = await this.alertCtrl.create({
      header: 'Localisation refusée',
      message: 'La localisation est obligatoire pour pointer. Autorisez-la dans les réglages du téléphone.',
      buttons: [
        { text: 'Fermer', role: 'cancel' },
        { text: 'Ouvrir les réglages', handler: () => { void this.localisation.ouvrirReglages(); } }
      ]
    });
    await alerte.present();
    await alerte.onDidDismiss();
  }

  private async signalerHorsZone(res: ReponsePointage): Promise<void> {
    const position = res.presence.heureDepart ? res.presence.positionDepart : res.presence.positionArrivee;
    if (!position?.horsZone) return;

    const alerte = await this.alertCtrl.create({
      header: 'Hors zone',
      message: position.distanceMetres !== null
        ? `Vous êtes à ${position.distanceMetres} m de la propriété, votre pointage est signalé.`
        : 'Vous êtes hors de la zone de la propriété, votre pointage est signalé.',
      buttons: ['OK']
    });
    await alerte.present();
  }

  // =====================================================
  // OUTILS
  // =====================================================

  private debutPointage(): void {
    this.pointageEnCours = true;
    this.errorMessage = '';
    this.messageSucces = '';
  }

  // Après chaque pointage : rechargement du service et du profil (statut mis à jour par le serveur)
  private async finPointage(): Promise<void> {
    this.etape = '';
    if (!this.auth.isLoggedIn) {
      this.pointageEnCours = false;
      return;
    }
    const erreur = this.errorMessage;
    await this.charger();
    if (erreur) this.errorMessage = erreur;
    this.pointageEnCours = false;
    this.auth.refreshGardien().catch(() => undefined);
  }

  private afficherErreur(error: unknown): void {
    const erreur = versApiErreur(error);
    // 401 : l'intercepteur a déjà renvoyé vers la connexion
    if (erreur.statut === 401) return;
    this.errorMessage = erreur.message;
  }

  // Temps écoulé depuis l'arrivée (affichage seulement ; la durée officielle vient du serveur)
  get chronoLabel(): string {
    const arrivee = this.enCours?.heureArrivee;
    if (!arrivee) return '';
    const secondes = Math.max(0, Math.floor((this.maintenant - new Date(arrivee).getTime()) / 1000));
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(Math.floor(secondes / 3600))}:${p(Math.floor((secondes % 3600) / 60))}:${p(secondes % 60)}`;
  }

  private demarrerChrono(): void {
    this.arreterChrono();
    if (!this.enCours) return;
    this.maintenant = Date.now();
    this.chrono = setInterval(() => (this.maintenant = Date.now()), 1000);
  }

  private arreterChrono(): void {
    if (this.chrono) {
      clearInterval(this.chrono);
      this.chrono = undefined;
    }
  }

  private nettoyer(): void {
    this.arreterChrono();
    void this.resumeListener?.remove();
    this.resumeListener = undefined;
    this.abonnement?.unsubscribe();
    this.abonnement = undefined;
  }
}
