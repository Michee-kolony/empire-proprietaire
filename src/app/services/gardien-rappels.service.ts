import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';
import { AlertController } from '@ionic/angular';
import type { MonService, ProchainService } from './gardien-presences.service';

const CANAL = 'rappels-service';
const MINUTE = 60000;

// =====================================================
// RAPPELS (notifications locales programmées sur le téléphone)
// Reprogrammés après chaque chargement de /presences/mon-service,
// annulés à la déconnexion. Les ids sont stables (jour + affectation + type)
// pour qu'un rechargement remplace le rappel au lieu de le dupliquer.
// =====================================================

@Injectable({ providedIn: 'root' })
export class GardienRappelsService {

  private alertCtrl = inject(AlertController);

  private file: Promise<void> = Promise.resolve();
  private canalCree = false;
  private permissionRefusee = false;

  planifier(etat: MonService): Promise<void> {
    this.file = this.file.then(() => this.reprogrammer(etat)).catch(() => undefined);
    return this.file;
  }

  annulerTout(): Promise<void> {
    this.file = this.file.then(() => this.annulerEnAttente()).catch(() => undefined);
    return this.file;
  }

  private async reprogrammer(etat: MonService): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    const rappels = this.construire(etat);
    await this.annulerEnAttente();
    if (!rappels.length || !(await this.autorise())) return;

    await this.creerCanal();
    await LocalNotifications.schedule({ notifications: rappels });
  }

  private construire(etat: MonService): LocalNotificationSchema[] {
    const maintenant = Date.now();
    const rappels: LocalNotificationSchema[] = [];
    const ajouter = (cle: string, at: number, title: string, body: string) => {
      if (at > maintenant + 5000) {
        rappels.push({ id: this.idStable(cle), title, body, channelId: CANAL, schedule: { at: new Date(at), allowWhileIdle: true } });
      }
    };

    const enCours = etat.serviceEnCours;
    if (enCours) {
      ajouter(
        `${enCours.jourService}|${this.idAffectation(enCours.affectation)}|fin`,
        new Date(enCours.finPrevue).getTime(),
        'Fin de service',
        'N\'oubliez pas de terminer votre service'
      );
    }

    for (const service of etat.prochainsServices) {
      if (service.effectue) continue;
      const cle = `${service.jourService}|${this.idAffectation(service.affectation)}`;
      // Le service déjà commencé n'a plus besoin des rappels de début
      if (enCours && cle === `${enCours.jourService}|${this.idAffectation(enCours.affectation)}`) continue;

      const debut = new Date(service.debutPrevu).getTime();
      ajouter(
        `${cle}|avant`,
        debut - 30 * MINUTE,
        'Service dans 30 min',
        `Votre service à ${this.nomPropriete(service)} commence à ${this.heure(service.debutPrevu)}`
      );
      ajouter(
        `${cle}|retard`,
        debut + 10 * MINUTE,
        'Service non commencé',
        'Vous n\'avez pas encore commencé votre service'
      );
    }
    return rappels;
  }

  // Demande l'autorisation une seule fois, avec une explication en français
  private async autorise(): Promise<boolean> {
    let { display } = await LocalNotifications.checkPermissions();
    if (display === 'granted') return true;
    if (display === 'denied' || this.permissionRefusee) return false;

    await this.expliquer();
    ({ display } = await LocalNotifications.requestPermissions());
    this.permissionRefusee = display !== 'granted';
    return display === 'granted';
  }

  private async expliquer(): Promise<void> {
    const alerte = await this.alertCtrl.create({
      header: 'Rappels de service',
      message: 'Autorisez les notifications pour être prévenu 30 min avant chaque service, '
        + 'si vous n\'avez pas encore pointé votre arrivée, et à l\'heure de fin de votre service.',
      buttons: ['Continuer'],
      backdropDismiss: false
    });
    await alerte.present();
    await alerte.onDidDismiss();
  }

  private async creerCanal(): Promise<void> {
    if (this.canalCree || Capacitor.getPlatform() !== 'android') return;
    await LocalNotifications.createChannel({
      id: CANAL,
      name: 'Rappels de service',
      description: 'Début et fin de vos services de gardiennage',
      importance: 4,
      visibility: 1,
      vibration: true
    });
    this.canalCree = true;
  }

  private async annulerEnAttente(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const { notifications } = await LocalNotifications.getPending();
    if (notifications.length) {
      await LocalNotifications.cancel({ notifications: notifications.map(n => ({ id: n.id })) });
    }
  }

  // Entier 32 bits positif (exigé par Android) calculé à partir de la clé
  private idStable(cle: string): number {
    let hash = 0;
    for (let i = 0; i < cle.length; i++) {
      hash = (Math.imul(31, hash) + cle.charCodeAt(i)) | 0;
    }
    return (hash & 0x7fffffff) || 1;
  }

  private idAffectation(affectation: ProchainService['affectation'] | { _id: string } | null): string {
    if (!affectation) return '';
    return typeof affectation === 'string' ? affectation : affectation._id;
  }

  private nomPropriete(service: ProchainService): string {
    return service.propriete?.nomReference || 'votre propriété';
  }

  private heure(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }
}
