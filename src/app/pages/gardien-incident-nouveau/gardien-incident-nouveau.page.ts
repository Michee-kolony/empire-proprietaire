import { Component, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { adresse } from '../../core/format';
import { iconeIncident } from '../../core/incidents';
import { versApiErreur } from '../../services/api-erreur';
import { GardienAffectationsService } from '../../services/gardien-affectations.service';
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  GardienIncidentsService,
  OptionsIncident,
  PHOTOS_MAX,
  PHOTO_EXTENSIONS,
  PHOTO_TAILLE_MAX,
  PHOTO_TYPES,
  VIDEOS_MAX,
  VIDEO_EXTENSIONS,
  VIDEO_TAILLE_MAX,
  VIDEO_TYPES
} from '../../services/gardien-incidents.service';
import { GardienLocalisationService, LocalisationRefusee, PositionAppareil } from '../../services/gardien-localisation.service';

type EtatGps = 'recherche' | 'ok' | 'refusee' | 'indisponible';

interface ProprieteChoix {
  _id: string;
  nomReference: string;
  adresse: string;
}

interface Media {
  file: File;
  url: string;
}

interface RegleMedia {
  types: string[];
  extensions: string[];
  tailleMax: number;
  max: number;
  libelle: string;
  formats: string;
}

const REGLE_PHOTOS: RegleMedia = {
  types: PHOTO_TYPES,
  extensions: PHOTO_EXTENSIONS,
  tailleMax: PHOTO_TAILLE_MAX,
  max: PHOTOS_MAX,
  libelle: 'photo',
  formats: 'JPEG, PNG, WEBP ou AVIF'
};

const REGLE_VIDEOS: RegleMedia = {
  types: VIDEO_TYPES,
  extensions: VIDEO_EXTENSIONS,
  tailleMax: VIDEO_TAILLE_MAX,
  max: VIDEOS_MAX,
  libelle: 'vidéo',
  formats: 'MP4, MOV, WEBM ou 3GP'
};

// Type MIME déduit de l'extension quand le téléphone n'en fournit pas
const TYPE_PAR_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp'
};

// Signalement d'un incident : POST /api/incidents (multipart, photos / vidéos / GPS).
// En cas d'échec, toutes les saisies et les fichiers restent en place pour réessayer.
@Component({
  selector: 'app-gardien-incident-nouveau',
  templateUrl: './gardien-incident-nouveau.page.html',
  styleUrls: ['./gardien-incident-nouveau.page.scss'],
  standalone: false
})
export class GardienIncidentNouveauPage implements OnDestroy {

  private incidentsService = inject(GardienIncidentsService);
  private affectationsService = inject(GardienAffectationsService);
  private localisation = inject(GardienLocalisationService);
  private router = inject(Router);

  readonly icone = iconeIncident;
  readonly descriptionMin = DESCRIPTION_MIN;
  readonly descriptionMax = DESCRIPTION_MAX;
  readonly photosMax = PHOTOS_MAX;
  readonly videosMax = VIDEOS_MAX;
  readonly natif = Capacitor.isNativePlatform();

  // Chargement des listes (options + propriétés)
  options: OptionsIncident | null = null;
  proprietes: ProprieteChoix[] = [];
  isLoading = false;
  errorMessage = '';

  // Saisie
  type = '';
  gravite = '';
  proprieteId = '';
  description = '';
  momentPasse = false;
  // Date/heure locale 'AAAA-MM-JJTHH:mm' (ion-datetime)
  dateChoisie = '';
  dateMax = '';
  photos: Media[] = [];
  videos: Media[] = [];
  erreurFichiers = '';

  // Position GPS
  etatGps: EtatGps = 'recherche';
  position: PositionAppareil | null = null;
  private demandeGps = 0;

  // Envoi
  envoiEnCours = false;
  progression = 0;
  erreurEnvoi = '';

  ionViewWillEnter(): void {
    if (!this.options) this.charger();
    if (this.etatGps !== 'ok') this.localiser();
  }

  ngOnDestroy(): void {
    [...this.photos, ...this.videos].forEach(m => URL.revokeObjectURL(m.url));
  }

  async charger(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const [options, affectations] = await Promise.all([
        this.incidentsService.options(),
        this.affectationsService.mesAffectations('en cours')
      ]);
      this.options = options;

      // Une même propriété peut apparaître dans plusieurs affectations
      const parId = new Map<string, ProprieteChoix>();
      for (const a of affectations) {
        if (a.propriete && !parId.has(a.propriete._id)) {
          parId.set(a.propriete._id, { _id: a.propriete._id, nomReference: a.propriete.nomReference, adresse: adresse(a.propriete) });
        }
      }
      this.proprietes = [...parId.values()];
      if (this.proprietes.length === 1) this.proprieteId = this.proprietes[0]._id;
      else if (!this.proprietes.some(p => p._id === this.proprieteId)) this.proprieteId = '';
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.errorMessage = erreur.message;
    } finally {
      this.isLoading = false;
    }
  }

  // =====================================================
  // TYPE / GRAVITE
  // =====================================================

  choisirType(valeur: string): void {
    if (this.envoiEnCours) return;
    this.type = valeur;
    const parDefaut = this.options?.graviteParDefaut[valeur];
    if (parDefaut) this.gravite = parDefaut;
  }

  choisirGravite(valeur: string): void {
    if (!this.envoiEnCours) this.gravite = valeur;
  }

  onPropriete(event: CustomEvent): void {
    this.proprieteId = String(event.detail.value ?? '');
  }

  onDescription(event: CustomEvent): void {
    this.description = String(event.detail.value ?? '');
  }

  // =====================================================
  // DATE / HEURE
  // =====================================================

  onMoment(event: CustomEvent): void {
    this.momentPasse = event.detail.value === 'passe';
    if (this.momentPasse) {
      this.dateMax = this.dateLocaleIso(new Date());
      if (!this.dateChoisie) this.dateChoisie = this.dateMax;
    }
  }

  onDate(event: CustomEvent): void {
    const valeur = event.detail.value;
    this.dateChoisie = String(Array.isArray(valeur) ? valeur[0] : valeur ?? '').slice(0, 16);
  }

  // Date → 'AAAA-MM-JJTHH:mm' en heure locale
  private dateLocaleIso(date: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
  }

  // =====================================================
  // POSITION GPS (facultative)
  // =====================================================

  async localiser(): Promise<void> {
    const demande = ++this.demandeGps;
    this.etatGps = 'recherche';
    try {
      const position = await this.localisation.positionPourIncident();
      if (demande !== this.demandeGps) return;
      this.position = position;
      this.etatGps = 'ok';
    } catch (error) {
      if (demande !== this.demandeGps) return;
      this.position = null;
      this.etatGps = error instanceof LocalisationRefusee ? 'refusee' : 'indisponible';
    }
  }

  ouvrirReglages(): void {
    void this.localisation.ouvrirReglages();
  }

  // =====================================================
  // PHOTOS / VIDEOS
  // =====================================================

  onPhotos(event: Event): void {
    this.ajouterMedias(event, this.photos, REGLE_PHOTOS);
  }

  onVideos(event: Event): void {
    this.ajouterMedias(event, this.videos, REGLE_VIDEOS);
  }

  retirerPhoto(index: number): void {
    this.retirer(this.photos, index);
  }

  retirerVideo(index: number): void {
    this.retirer(this.videos, index);
  }

  taille(octets: number): string {
    return octets >= 1024 * 1024
      ? `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
      : `${Math.max(1, Math.round(octets / 1024))} Ko`;
  }

  private ajouterMedias(event: Event, liste: Media[], regle: RegleMedia): void {
    const input = event.target as HTMLInputElement;
    const fichiers = Array.from(input.files ?? []);
    // Permet de choisir à nouveau le même fichier
    input.value = '';
    this.erreurFichiers = '';

    const refus: string[] = [];
    for (const brut of fichiers) {
      if (liste.length >= regle.max) {
        refus.push(`${regle.max} ${regle.libelle}s maximum.`);
        break;
      }
      const file = this.normaliser(brut, regle);
      if (!file) {
        refus.push(`« ${brut.name} » : format non accepté (${regle.formats}).`);
      } else if (file.size > regle.tailleMax) {
        refus.push(`« ${brut.name} » : ${this.taille(file.size)}, maximum ${this.taille(regle.tailleMax)} par ${regle.libelle}.`);
      } else {
        liste.push({ file, url: URL.createObjectURL(file) });
      }
    }
    this.erreurFichiers = refus.join(' ');
  }

  // Fichier au bon format (type MIME complété depuis l'extension si besoin), sinon null
  private normaliser(file: File, regle: RegleMedia): File | null {
    if (regle.types.includes(file.type)) return file;
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (!regle.extensions.includes(extension)) return null;
    return new File([file], file.name, { type: TYPE_PAR_EXTENSION[extension], lastModified: file.lastModified });
  }

  private retirer(liste: Media[], index: number): void {
    if (this.envoiEnCours) return;
    const [media] = liste.splice(index, 1);
    if (media) URL.revokeObjectURL(media.url);
    this.erreurFichiers = '';
  }

  // Contrôle final avant l'envoi (formats, nombre, tailles)
  private erreurMedias(): string {
    if (this.photos.length > PHOTOS_MAX) return `${PHOTOS_MAX} photos maximum.`;
    if (this.videos.length > VIDEOS_MAX) return `${VIDEOS_MAX} vidéos maximum.`;
    if (this.photos.some(m => m.file.size > PHOTO_TAILLE_MAX)) return `Une photo dépasse ${this.taille(PHOTO_TAILLE_MAX)}.`;
    if (this.videos.some(m => m.file.size > VIDEO_TAILLE_MAX)) return `Une vidéo dépasse ${this.taille(VIDEO_TAILLE_MAX)}.`;
    return '';
  }

  // =====================================================
  // ENVOI
  // =====================================================

  get longueurDescription(): number {
    return this.description.trim().length;
  }

  get peutEnvoyer(): boolean {
    return !!this.options
      && !!this.type
      && this.proprietes.length > 0
      && !!this.proprieteId
      && this.longueurDescription >= DESCRIPTION_MIN
      && this.longueurDescription <= DESCRIPTION_MAX
      && (!this.momentPasse || !!this.dateChoisie)
      && !this.envoiEnCours;
  }

  get progressionPourcent(): number {
    return Math.round(this.progression * 100);
  }

  async envoyer(): Promise<void> {
    if (!this.peutEnvoyer) return;
    this.erreurEnvoi = '';

    const erreurMedias = this.erreurMedias();
    if (erreurMedias) {
      this.erreurEnvoi = erreurMedias;
      return;
    }

    let dateIncident: string | undefined;
    if (this.momentPasse) {
      const date = new Date(this.dateChoisie);
      if (isNaN(date.getTime())) {
        this.erreurEnvoi = 'Date de l\'incident invalide.';
        return;
      }
      if (date.getTime() > Date.now()) {
        this.erreurEnvoi = 'La date de l\'incident ne peut pas être dans le futur.';
        return;
      }
      dateIncident = date.toISOString();
    }

    this.envoiEnCours = true;
    this.progression = 0;
    try {
      const res = await this.incidentsService.signaler({
        type: this.type,
        description: this.description,
        dateIncident,
        position: this.etatGps === 'ok' ? this.position : null,
        gravite: this.gravite || undefined,
        propriete: this.proprieteId || undefined,
        photos: this.photos.map(m => m.file),
        videos: this.videos.map(m => m.file)
      }, fraction => (this.progression = fraction));

      // Saisie effacée seulement après la confirmation du serveur
      this.reinitialiser();
      await this.router.navigate(['/gardien/incidents', res.incident._id], {
        queryParams: { signale: 1 },
        replaceUrl: true
      });
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.erreurEnvoi = erreur.message;
    } finally {
      this.envoiEnCours = false;
    }
  }

  private reinitialiser(): void {
    [...this.photos, ...this.videos].forEach(m => URL.revokeObjectURL(m.url));
    this.photos = [];
    this.videos = [];
    this.type = '';
    this.gravite = '';
    this.description = '';
    this.momentPasse = false;
    this.dateChoisie = '';
    this.erreurFichiers = '';
    this.erreurEnvoi = '';
    this.progression = 0;
    // Position relue à la prochaine ouverture du formulaire
    this.etatGps = 'recherche';
    this.position = null;
    if (this.proprietes.length !== 1) this.proprieteId = '';
  }
}
