import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Geolocation, PermissionStatus } from '@capacitor/geolocation';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';

export interface PositionAppareil {
  lat: number;
  lng: number;
  // Précision annoncée par le GPS, en mètres
  precision: number;
}

// Localisation refusée : l'écran propose d'ouvrir les réglages
export class LocalisationRefusee extends Error {
  constructor() {
    super('Localisation refusée');
  }
}

// =====================================================
// POSITION GPS DU TELEPHONE (@capacitor/geolocation)
// Toujours facultative pour le propriétaire : placer sa propriété sur la carte,
// joindre une position à un incident.
// =====================================================

@Injectable({ providedIn: 'root' })
export class PositionService {

  // Demande l'autorisation si besoin puis lit une position fraîche.
  // LocalisationRefusee si le propriétaire refuse.
  async positionActuelle(): Promise<PositionAppareil> {
    let etat = await this.permission();
    if (etat === 'denied') throw new LocalisationRefusee();
    if (etat === 'prompt' || etat === 'prompt-with-rationale') {
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

  private async permission(): Promise<PermissionStatus['location']> {
    try {
      return (await Geolocation.checkPermissions()).location;
    } catch (error) {
      if (this.gpsDesactive(error)) throw new Error('Activez la localisation (GPS) de votre téléphone.');
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
      if (this.gpsDesactive(error)) throw new Error('Activez la localisation (GPS) de votre téléphone.');
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
}
