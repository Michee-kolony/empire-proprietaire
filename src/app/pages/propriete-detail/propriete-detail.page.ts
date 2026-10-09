import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { ACTUALISATION_CARTE_MS, depuisLabel, gardienHorsZone, gardienVisible } from '../../core/carte';
import { adresse, dateHeureLocale, dateLocale, lienTel, nomComplet } from '../../core/format';
import { iconeIncident } from '../../core/incidents';
import { Affectation, AffectationsService, StatutAffectation, horaireLabel, joursLabel } from '../../services/affectations.service';
import { versApiErreur } from '../../services/api-erreur';
import { ChatService } from '../../services/chat.service';
import { GardienEnPoste, GardiensService } from '../../services/gardiens.service';
import { Incident, IncidentsService, STATUTS_ACTIFS, positionIncident } from '../../services/incidents.service';
import {
  NIVEAUX_SECURITE, Propriete, ProprietesService, aCoordonnees, iconeType, joursRestants, libelleType
} from '../../services/proprietes.service';
import { GardienCarte, IncidentCarte, ProprieteCarte } from '../../components/carte/carte-gardiens.component';
import { Rapport, RapportsService, iconeRapport } from '../../services/rapports.service';

type OngletGardiens = 'en cours' | 'a venir' | 'historique';

// Détail d'une propriété : informations, abonnement, carte avec ses gardiens, affectations, incidents
@Component({
  selector: 'app-propriete-detail',
  templateUrl: './propriete-detail.page.html',
  styleUrls: ['./propriete-detail.page.scss'],
  standalone: false
})
export class ProprieteDetailPage {

  private proprietesService = inject(ProprietesService);
  private affectationsService = inject(AffectationsService);
  private gardiensService = inject(GardiensService);
  private incidentsService = inject(IncidentsService);
  private rapportsService = inject(RapportsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chat = inject(ChatService);
  private toastCtrl = inject(ToastController);

  readonly adresse = adresse;
  readonly date = dateLocale;
  readonly dateHeure = dateHeureLocale;
  readonly nomComplet = nomComplet;
  readonly lienTel = lienTel;
  readonly horaire = horaireLabel;
  readonly jours = joursLabel;
  readonly depuis = depuisLabel;
  readonly iconeType = iconeType;
  readonly iconeIncident = iconeIncident;
  readonly iconeRapport = iconeRapport;
  readonly libelleType = libelleType;

  propriete: Propriete | null = null;
  ouvertureChat = false;
  affectations: Affectation[] = [];
  postes: GardienEnPoste[] = [];
  incidents: Incident[] = [];
  rapports: Rapport[] = [];
  onglet: OngletGardiens = 'en cours';

  proprieteCarte: ProprieteCarte[] = [];
  gardiensCarte: GardienCarte[] = [];
  incidentsCarte: IncidentCarte[] = [];

  isLoading = false;
  errorMessage = '';
  messageSucces = '';
  photoOuverte: string | null = null;

  private id = '';
  private minuterie: ReturnType<typeof setInterval> | undefined;

  ionViewDidEnter(): void {
    clearInterval(this.minuterie);
    this.minuterie = setInterval(() => void this.actualiserGardiens(), ACTUALISATION_CARTE_MS);
  }

  ionViewWillLeave(): void {
    clearInterval(this.minuterie);
  }

  // Actualisation silencieuse des gardiens en poste (statut et position) pour la carte
  private async actualiserGardiens(): Promise<void> {
    if (this.isLoading || !this.propriete) return;
    try {
      const [postes, incidents] = await Promise.all([
        this.gardiensService.enPoste([this.id], this.affectations.filter(a => a.statut === 'en cours')),
        this.incidentsService.mesIncidents({ propriete: this.id }).catch(() => this.incidents)
      ]);
      this.postes = postes;
      this.incidents = incidents;
      this.calculerCarte();
    } catch {
      // Nouvel essai au prochain tour
    }
  }

  ionViewWillEnter(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    const message = this.route.snapshot.queryParamMap.get('message');
    if (message) {
      this.messageSucces = message;
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    } else {
      this.messageSucces = '';
    }
    this.propriete = this.proprietesService.enCache(this.id);
    this.calculerCarte();
    this.charger();
  }

  async charger(): Promise<void> {
    if (!this.id) return;
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const [propriete, affectations, incidents, rapports] = await Promise.all([
        this.proprietesService.propriete(this.id),
        this.affectationsService.historique(this.id),
        this.incidentsService.mesIncidents({ propriete: this.id }).catch(() => [] as Incident[]),
        this.rapportsService.mesRapports({ propriete: this.id }).catch(() => [] as Rapport[])
      ]);
      this.rapports = rapports;
      this.propriete = propriete;
      this.affectations = affectations;
      this.incidents = incidents;
      this.postes = await this.gardiensService.enPoste([this.id], affectations.filter(a => a.statut === 'en cours'));
      this.calculerCarte();
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.errorMessage = erreur.message;
      if (erreur.statut === 403 || erreur.statut === 404) this.propriete = null;
    } finally {
      this.isLoading = false;
    }
  }

  async actualiser(event: CustomEvent): Promise<void> {
    await this.charger();
    (event.target as HTMLIonRefresherElement).complete();
  }

  onOnglet(event: CustomEvent): void {
    this.onglet = event.detail.value as OngletGardiens;
  }

  get gardiensOnglet(): Affectation[] {
    if (this.onglet === 'historique') return this.affectations.filter(a => a.statut === 'expiree');
    return this.affectations
      .filter(a => a.statut === (this.onglet as StatutAffectation))
      .sort((a, b) => Number(b.role === 'principal') - Number(a.role === 'principal'));
  }

  compte(statut: StatutAffectation): number {
    return this.affectations.filter(a => a.statut === statut).length;
  }

  poste(gardienId: string | undefined): GardienEnPoste | null {
    return this.postes.find(p => p.gardien._id === gardienId) ?? null;
  }

  get aPosition(): boolean {
    return aCoordonnees(this.propriete?.coordonnees);
  }

  get niveauSecurite(): string {
    return NIVEAUX_SECURITE.find(n => n.valeur === this.propriete?.niveauSecurite)?.libelle ?? '—';
  }

  get equipements(): { icone: string; libelle: string; actif: boolean }[] {
    const p = this.propriete;
    if (!p) return [];
    return [
      { icone: 'grid-outline', libelle: 'Clôture', actif: p.cloture },
      { icone: 'enter-outline', libelle: 'Portail', actif: p.portail },
      { icone: 'car-outline', libelle: 'Garage', actif: p.garage },
      { icone: 'videocam-outline', libelle: p.cameras && p.nombreCameras ? `${p.nombreCameras} caméra${p.nombreCameras > 1 ? 's' : ''}` : 'Caméras', actif: p.cameras },
      { icone: 'notifications-outline', libelle: 'Alarme', actif: p.alarme },
      { icone: 'bulb-outline', libelle: 'Éclairage de sécurité', actif: p.eclairageSecurite },
      { icone: 'chatbox-ellipses-outline', libelle: 'Interphone', actif: p.interphone }
    ];
  }

  get caracteristiques(): { libelle: string; valeur: string }[] {
    const p = this.propriete;
    if (!p) return [];
    const lignes: [string, string | number | null][] = [
      ['N° de parcelle', p.numeroParcelle],
      ['Bâtiments', p.nombreBatiments],
      ['Niveaux', p.nombreNiveaux],
      ['Chambres', p.nombreChambres],
      ['Portes d\'accès', p.nombrePortesAcces],
      ['Véhicules', p.nombreVehicules]
    ];
    return lignes
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([libelle, v]) => ({ libelle, valeur: String(v) }));
  }

  get abonnement(): { classe: string; titre: string; detail: string } {
    const p = this.propriete;
    if (!p || p.statutAbonnement === 'aucun') {
      return { classe: 'aucun', titre: 'Aucun abonnement', detail: 'Contactez Empire Security pour souscrire un abonnement de gardiennage.' };
    }
    if (p.statutAbonnement === 'expire') {
      return { classe: 'expire', titre: 'Abonnement expiré', detail: `Expiré le ${dateLocale(p.dateExpirationAbonnement)}. Renouvelez-le auprès d'Empire Security.` };
    }
    const jours = joursRestants(p) ?? 0;
    return {
      classe: jours <= 15 ? 'bientot' : 'actif',
      titre: 'Abonnement actif',
      detail: `Du ${dateLocale(p.dateDebutAbonnement)} au ${dateLocale(p.dateExpirationAbonnement)} · ${jours} jour${jours > 1 ? 's' : ''} restant${jours > 1 ? 's' : ''}`
    };
  }

  nomFichier(url: string): string {
    const nom = decodeURIComponent(url.split('/').pop() ?? 'Document');
    return nom.replace(/^\d+-[0-9a-f-]{36}/i, 'Document');
  }

  estPdf(url: string): boolean {
    return url.toLowerCase().endsWith('.pdf');
  }

  // Carte : la propriété et UNIQUEMENT ses gardiens en poste
  private calculerCarte(): void {
    const p = this.propriete;
    this.proprieteCarte = p && aCoordonnees(p.coordonnees)
      ? [{ id: p._id, nom: p.nomReference, lat: p.coordonnees.lat, lng: p.coordonnees.lng }]
      : [];
    this.gardiensCarte = this.postes
      .filter(g => gardienVisible(g.gardien.statut, g.gardien.coordonnees))
      .map(g => ({
        id: g.gardien._id,
        nom: nomComplet(g.gardien),
        photo: g.gardien.photoProfil,
        enService: true,
        horsZone: gardienHorsZone(g.gardien.coordonnees, this.proprieteCarte),
        lat: g.gardien.coordonnees!.lat as number,
        lng: g.gardien.coordonnees!.lng as number
      }));
    this.incidentsCarte = this.incidents
      .filter(i => STATUTS_ACTIFS.includes(i.statut))
      .map(i => ({ incident: i, position: positionIncident(i) ?? (p && aCoordonnees(p.coordonnees) ? { lat: p.coordonnees.lat, lng: p.coordonnees.lng } : null) }))
      .filter(({ position }) => position !== null)
      .map(({ incident, position }) => ({
        id: incident._id,
        titre: `${incident.typeLibelle} (${incident.graviteLibelle})`,
        gravite: incident.gravite,
        icone: iconeIncident(incident.type),
        lat: position!.lat as number,
        lng: position!.lng as number
      }));
  }

  // Discussion de la propriété : vous, les gardiens en service et l'administration
  async discussion(): Promise<void> {
    if (this.ouvertureChat) return;
    this.ouvertureChat = true;
    try {
      const conversation = await this.chat.ouvrirPropriete(this.id);
      await this.router.navigate(['/proprietaire/messages', conversation._id]);
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) await (await this.toastCtrl.create({ message: erreur.message, duration: 3000, position: 'top' })).present();
    } finally {
      this.ouvertureChat = false;
    }
  }

  ouvrirIncident(id: string): void {
    this.router.navigate(['/proprietaire/incidents', id]);
  }

  ouvrirGardienSurCarte(id: string): void {
    this.router.navigate(['/proprietaire/carte'], { queryParams: { propriete: this.id, gardien: id } });
  }
}
