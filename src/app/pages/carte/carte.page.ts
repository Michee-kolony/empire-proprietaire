import { Component, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import {
  ACTUALISATION_CARTE_MS, RAYON_ZONE_METRES, depuisLabel, distanceLabel, distanceMetres, gardienHorsZone, gardienVisible
} from '../../core/carte';
import { lienTel, nomComplet } from '../../core/format';
import { iconeIncident } from '../../core/incidents';
import { horaireLabel } from '../../services/affectations.service';
import { versApiErreur } from '../../services/api-erreur';
import { GardienEnPoste, GardiensService } from '../../services/gardiens.service';
import { Incident, IncidentsService, positionIncident } from '../../services/incidents.service';
import { Propriete, ProprietesService, aCoordonnees } from '../../services/proprietes.service';
import { CarteGardiensComponent, GardienCarte, IncidentCarte, ProprieteCarte } from '../../components/carte/carte-gardiens.component';

interface LigneGardien {
  poste: GardienEnPoste;
  // Propriété de référence (la plus proche parmi celles où il est affecté)
  propriete: Propriete | null;
  distance: number | null;
  position: { lat: number; lng: number } | null;
}

// Carte des gardiens : les propriétés du propriétaire et UNIQUEMENT les gardiens
// actuellement affectés à ces propriétés (affectations « en cours »), avec leur dernière position.
@Component({
  selector: 'app-carte',
  templateUrl: './carte.page.html',
  styleUrls: ['./carte.page.scss'],
  standalone: false
})
export class CartePage {

  private proprietesService = inject(ProprietesService);
  private gardiensService = inject(GardiensService);
  private route = inject(ActivatedRoute);
  private toasts = inject(ToastController);
  private incidentsService = inject(IncidentsService);
  private router = inject(Router);

  @ViewChild(CarteGardiensComponent) private carte?: CarteGardiensComponent;

  readonly nomComplet = nomComplet;
  readonly lienTel = lienTel;
  readonly distanceLabel = distanceLabel;
  readonly depuis = depuisLabel;
  readonly horaire = horaireLabel;
  readonly rayon = RAYON_ZONE_METRES;
  readonly iconeIncident = iconeIncident;

  proprietes: Propriete[] = [];
  postes: GardienEnPoste[] = [];
  // Incidents non résolus de toutes les propriétés
  incidents: Incident[] = [];
  // 'toutes' ou l'id d'une propriété
  filtre = 'toutes';
  selection: string | null = null;

  // Données dérivées, recalculées après chaque chargement ou changement de filtre
  proprietesCarte: ProprieteCarte[] = [];
  gardiensCarte: GardienCarte[] = [];
  incidentsCarte: IncidentCarte[] = [];
  incidentsVisibles: Incident[] = [];
  lignes: LigneGardien[] = [];
  sansPosition: Propriete[] = [];

  charge = false;
  isLoading = false;
  errorMessage = '';
  derniereMiseAJour: Date | null = null;

  private minuterie: ReturnType<typeof setInterval> | undefined;
  // Dernier statut connu de chaque gardien, pour signaler les prises et fins de service
  private statuts = new Map<string, string>();
  // Incidents déjà connus, pour signaler les nouveaux
  private incidentsConnus = new Set<string>();

  ionViewWillEnter(): void {
    const propriete = this.route.snapshot.queryParamMap.get('propriete');
    const gardien = this.route.snapshot.queryParamMap.get('gardien');
    if (propriete) this.filtre = propriete;
    if (gardien) this.selection = gardien;
    this.charger();
  }

  ionViewDidEnter(): void {
    clearInterval(this.minuterie);
    this.minuterie = setInterval(() => void this.actualiserPositions(), ACTUALISATION_CARTE_MS);
  }

  ionViewWillLeave(): void {
    clearInterval(this.minuterie);
  }

  async charger(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.proprietes = await this.proprietesService.mesProprietes();
      if (this.filtre !== 'toutes' && !this.proprietes.some(p => p._id === this.filtre)) this.filtre = 'toutes';
      const [postes, incidents] = await Promise.all([
        this.gardiensService.enPoste(this.proprietes.map(p => p._id)),
        this.incidentsService.incidentsActifs().catch(() => this.incidents)
      ]);
      this.postes = postes;
      this.incidents = incidents;
      this.memoriserStatuts();
      this.incidentsConnus = new Set(incidents.map(i => i._id));
      this.derniereMiseAJour = new Date();
      this.charge = true;
      this.calculer();
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.errorMessage = erreur.message;
    } finally {
      this.isLoading = false;
    }
  }

  // Actualisation silencieuse des gardiens et de leurs positions (sans recharger les propriétés)
  async actualiserPositions(): Promise<void> {
    if (!this.charge || this.isLoading) return;
    try {
      const [postes, incidents] = await Promise.all([
        this.gardiensService.enPoste(this.proprietes.map(p => p._id)),
        this.incidentsService.incidentsActifs().catch(() => this.incidents)
      ]);
      this.postes = postes;
      this.incidents = incidents;
      this.signalerChangements();
      this.signalerIncidents();
      this.derniereMiseAJour = new Date();
      this.calculer();
    } catch {
      // On garde les dernières positions connues ; nouvel essai au prochain tour
    }
  }

  private memoriserStatuts(): void {
    this.statuts = new Map(this.postes.map(p => [p.gardien._id, p.gardien.statut]));
  }

  // Prévient le propriétaire quand un gardien prend ou termine son service
  private signalerChangements(): void {
    for (const { gardien } of this.postes) {
      const avant = this.statuts.get(gardien._id);
      if (avant === undefined || avant === gardien.statut) continue;
      const debut = gardien.statut === 'en service';
      void this.toasts.create({
        message: `${nomComplet(gardien)} ${debut ? 'vient de prendre son service' : 'a terminé son service'}`,
        icon: debut ? 'shield-checkmark' : 'log-out-outline',
        color: debut ? 'success' : 'medium',
        position: 'top',
        duration: 4000
      }).then(t => t.present());
    }
    this.memoriserStatuts();
  }

  // Alerte pour chaque incident signalé depuis la dernière actualisation
  private signalerIncidents(): void {
    for (const incident of this.incidents) {
      if (this.incidentsConnus.has(incident._id)) continue;
      void this.toasts.create({
        message: `Incident signalé : ${incident.typeLibelle}${incident.propriete ? ' — ' + incident.propriete.nomReference : ''}`,
        icon: 'warning',
        color: 'danger',
        position: 'top',
        duration: 6000,
        buttons: [{ text: 'Voir', handler: () => this.ouvrirIncident(incident._id) }]
      }).then(t => t.present());
    }
    this.incidentsConnus = new Set(this.incidents.map(i => i._id));
  }

  ouvrirIncident(id: string): void {
    this.router.navigate(['/proprietaire/incidents', id]);
  }

  async actualiser(event: CustomEvent): Promise<void> {
    await this.charger();
    (event.target as HTMLIonRefresherElement).complete();
  }

  choisirFiltre(id: string): void {
    this.filtre = id;
    this.selection = null;
    this.calculer();
  }

  choisirGardien(id: string): void {
    this.selection = this.selection === id ? null : id;
    const ligne = this.lignes.find(l => l.poste.gardien._id === id);
    if (this.selection && ligne?.position && this.gardiensCarte.some(g => g.id === id)) {
      this.carte?.centrerSur(ligne.position.lat, ligne.position.lng);
    }
  }

  recentrer(): void {
    this.selection = null;
    this.carte?.recentrer();
  }

  get ligneSelectionnee(): LigneGardien | null {
    return this.lignes.find(l => l.poste.gardien._id === this.selection) ?? null;
  }

  get nombreEnService(): number {
    return this.lignes.filter(l => l.poste.gardien.statut === 'en service').length;
  }

  // Affectation du gardien sur la propriété de référence (horaires)
  affectationDe(ligne: LigneGardien) {
    return ligne.poste.affectations.find(a => a.propriete?._id === ligne.propriete?._id) ?? ligne.poste.affectations[0];
  }

  surSite(ligne: LigneGardien): boolean {
    return ligne.distance !== null && ligne.distance <= RAYON_ZONE_METRES;
  }

  private calculer(): void {
    const visibles = this.filtre === 'toutes' ? this.proprietes : this.proprietes.filter(p => p._id === this.filtre);
    const idsVisibles = new Set(visibles.map(p => p._id));

    this.proprietesCarte = visibles
      .filter(p => aCoordonnees(p.coordonnees))
      .map(p => ({ id: p._id, nom: p.nomReference, lat: p.coordonnees.lat as number, lng: p.coordonnees.lng as number }));
    this.sansPosition = visibles.filter(p => !aCoordonnees(p.coordonnees));

    // Seuls les gardiens affectés aux propriétés affichées
    this.lignes = this.postes
      .filter(poste => poste.proprieteIds.some(id => idsVisibles.has(id)))
      .map(poste => this.ligne(poste, visibles))
      .sort((a, b) => Number(b.poste.gardien.statut === 'en service') - Number(a.poste.gardien.statut === 'en service')
        || nomComplet(a.poste.gardien).localeCompare(nomComplet(b.poste.gardien)));

    // Sur la carte : uniquement les gardiens en service (ils disparaissent dès leur pointage de départ)
    this.gardiensCarte = this.lignes
      .filter(l => gardienVisible(l.poste.gardien.statut, l.position))
      .map(l => ({
        id: l.poste.gardien._id,
        nom: nomComplet(l.poste.gardien),
        photo: l.poste.gardien.photoProfil,
        enService: true,
        horsZone: gardienHorsZone(l.position, this.proprietesCarte),
        lat: l.position!.lat,
        lng: l.position!.lng
      }));

    this.incidentsVisibles = this.incidents.filter(i => i.propriete && idsVisibles.has(i.propriete._id));
    this.incidentsCarte = this.incidentsVisibles
      .map(i => ({ incident: i, position: positionIncident(i) }))
      .filter(({ position }) => position !== null)
      .map(({ incident, position }) => ({
        id: incident._id,
        titre: `${incident.typeLibelle} (${incident.graviteLibelle})`,
        gravite: incident.gravite,
        icone: iconeIncident(incident.type),
        lat: position!.lat,
        lng: position!.lng
      }));

    if (this.selection && !this.lignes.some(l => l.poste.gardien._id === this.selection)) this.selection = null;
  }

  private ligne(poste: GardienEnPoste, visibles: Propriete[]): LigneGardien {
    const c = poste.gardien.coordonnees;
    const position = c && c.lat !== null && c.lng !== null ? { lat: c.lat, lng: c.lng } : null;
    const siennes = visibles.filter(p => poste.proprieteIds.includes(p._id));

    let propriete: Propriete | null = siennes[0] ?? null;
    let distance: number | null = null;
    if (position) {
      for (const p of siennes) {
        if (!aCoordonnees(p.coordonnees)) continue;
        const d = distanceMetres(position, p.coordonnees);
        if (distance === null || d < distance) {
          distance = d;
          propriete = p;
        }
      }
    }
    return { poste, propriete, distance, position };
  }
}
