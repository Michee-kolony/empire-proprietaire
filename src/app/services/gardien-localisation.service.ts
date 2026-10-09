import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Geolocation, PermissionStatus } from '@capacitor/geolocation';
import { AlertController } from '@ionic/angular';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';

export interface PositionAppareil {
  lat: number;
  lng: number;
  // Précision annoncée par le GPS, en mètres
  precision: number;
}

// Localisation refusée par le gardien : l'écran propose d'ouvrir les réglages
export class LocalisationRefusee extends Error {
  constructor() {
    super('La localisation est obligatoire pour pointer');
  }
}

// =====================================================
// POSITION GPS DU TELEPHONE (@capacitor/geolocation)
// Obligatoire pour pointer : aucun pointage n'est envoyé sans position.
// =====================================================

@Injectable({ providedIn: 'root' })
export class GardienLocalisationService {

  private alertCtrl = inject(AlertController);

  // Vérifie / demande l'autorisation puis lit une position fraîche (pas de cache)
  async positionPourPointage(): Promise<PositionAppareil> {
    await this.exigerPermission();
    return this.lirePosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  // Position pour le suivi pendant le service : jamais de demande d'autorisation ici
  async positionSiAutorisee(): Promise<PositionAppareil | null> {
    try {
      if ((await this.permission()) !== 'granted') return null;
      return await this.lirePosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    } catch {
      return null;
    }
  }

  // Position jointe à un incident (facultative) : demande l'autorisation sans
  // l'explication du pointage. LocalisationRefusee si le gardien refuse.
  async positionPourIncident(): Promise<PositionAppareil> {
    let etat = await this.permission();
    if (etat === 'denied') throw new LocalisationRefusee();
    if (etat === 'prompt') {
      try {
        etat = (await Geolocation.requestPermissions({ permissions: ['location'] })).location;
      } catch {
        // Navigateur : la demande se fait au moment de la lecture de la position
      }
      if (etat === 'denied') throw new LocalisationRefusee();
    }
    return this.lirePosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  async ouvrirReglages(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await NativeSettings.open({ optionAndroid: AndroidSettings.ApplicationDetails, optionIOS: IOSSettings.App });
  }

  private async exigerPermission(): Promise<void> {
    let etat = await this.permission();
    if (etat === 'granted') return;
    if (etat === 'denied') throw new LocalisationRefusee();

    await this.expliquer();
    try {
      const res = await Geolocation.requestPermissions({ permissions: ['location'] });
      etat = res.location;
    } catch {
      // Navigateur : la demande se fait au moment de la lecture de la position
      return;
    }
    if (etat !== 'granted') throw new LocalisationRefusee();
  }

  private async permission(): Promise<PermissionStatus['location']> {
    try {
      return (await Geolocation.checkPermissions()).location;
    } catch (error) {
      // Services de localisation du téléphone désactivés
      if (this.gpsDesactive(error)) throw new Error('Activez la localisation (GPS) de votre téléphone pour pointer.');
      return 'prompt';
    }
  }

  private async lirePosition(options: PositionOptions): Promise<PositionAppareil> {
    try {
      const pos = await Geolocation.getCurrentPosition(options);
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: Math.round(pos.coords.accuracy) };
    } catch (error) {
      const message = String((error as Error)?.message ?? error).toLowerCase();
      if (message.includes('denied') || (error as GeolocationPositionError)?.code === 1) throw new LocalisationRefusee();
      if (this.gpsDesactive(error)) throw new Error('Activez la localisation (GPS) de votre téléphone pour pointer.');
      if (message.includes('timeout') || (error as GeolocationPositionError)?.code === 3) {
        throw new Error('Position introuvable : placez-vous à découvert et réessayez.');
      }
      throw new Error('Impossible de déterminer votre position, réessayez.');
    }
  }

  private gpsDesactive(error: unknown): boolean {
    const message = String((error as Error)?.message ?? error).toLowerCase();
    return message.includes('location services') || message.includes('disabled');
  }

  private async expliquer(): Promise<void> {
    const alerte = await this.alertCtrl.create({
      header: 'Localisation',
      message: 'Votre position GPS est enregistrée au moment où vous commencez et terminez votre service, '
        + 'pour vérifier votre présence sur la propriété. Elle est aussi envoyée toutes les 5 minutes '
        + 'pendant le service, uniquement quand l\'application est ouverte.',
      buttons: ['Continuer'],
      backdropDismiss: false
    });
    await alerte.present();
    await alerte.onDidDismiss();
  }
}
