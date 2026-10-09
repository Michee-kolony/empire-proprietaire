import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, ViewChild, inject
} from '@angular/core';
import * as L from 'leaflet';
import { CENTRE_PAR_DEFAUT, RAYON_ZONE_METRES, TUILES_ATTRIBUTION, TUILES_OPTIONS, TUILES_URL, echapperHtml, urlCss } from '../../core/carte';

export interface ProprieteCarte {
  id: string;
  nom: string;
  lat: number;
  lng: number;
}

export interface GardienCarte {
  id: string;
  nom: string;
  photo: string;
  enService: boolean;
  // En service mais hors de la zone de 200 m de ses propriétés
  horsZone?: boolean;
  lat: number;
  lng: number;
}

export interface IncidentCarte {
  id: string;
  titre: string;
  gravite: string;
  icone: string;
  lat: number;
  lng: number;
}

const AVATAR_REPLI = 'assets/gardien/avatar.svg';

// Carte Leaflet du propriétaire : ses propriétés (avec la zone de présence de 200 m)
// et UNIQUEMENT les gardiens qui lui sont passés (ceux affectés à ses propriétés).
// Le cadrage n'est refait que si la liste des éléments change, pas à chaque
// actualisation des positions, pour ne pas gêner le propriétaire qui navigue sur la carte.
@Component({
  selector: 'app-carte-gardiens',
  template: '<div #carte class="pr-carte" [style.height]="hauteur"></div>',
  standalone: false
})
export class CarteGardiensComponent implements AfterViewInit, OnChanges, OnDestroy {

  @Input() proprietes: ProprieteCarte[] = [];
  @Input() gardiens: GardienCarte[] = [];
  // Incidents non résolus des propriétés affichées
  @Input() incidents: IncidentCarte[] = [];
  @Input() hauteur = '260px';
  // Gardien mis en avant (carte détaillée)
  @Input() selection: string | null = null;

  @Output() gardienClique = new EventEmitter<string>();
  @Output() proprieteCliquee = new EventEmitter<string>();
  @Output() incidentClique = new EventEmitter<string>();

  @ViewChild('carte', { static: true }) private conteneur!: ElementRef<HTMLDivElement>;

  private zone = inject(NgZone);
  private carte: L.Map | null = null;
  private couche = L.layerGroup();
  private observateur: ResizeObserver | null = null;
  private composition = '';

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.carte = L.map(this.conteneur.nativeElement, { zoomControl: true, attributionControl: false })
        .setView(CENTRE_PAR_DEFAUT, 12);
      L.tileLayer(TUILES_URL, { ...TUILES_OPTIONS, attribution: TUILES_ATTRIBUTION }).addTo(this.carte);
      this.couche.addTo(this.carte);

      // La carte est créée pendant l'animation d'entrée de la page Ionic : on recalcule
      // sa taille dès que son conteneur change de dimensions
      this.observateur = new ResizeObserver(() => this.carte?.invalidateSize());
      this.observateur.observe(this.conteneur.nativeElement);
      this.dessiner();
    });
  }

  ngOnChanges(): void {
    if (this.carte) this.zone.runOutsideAngular(() => this.dessiner());
  }

  ngOnDestroy(): void {
    this.observateur?.disconnect();
    this.carte?.remove();
    this.carte = null;
  }

  // Recadre la carte sur toutes les propriétés et tous les gardiens affichés
  recentrer(): void {
    this.zone.runOutsideAngular(() => this.cadrer());
  }

  // Centre la carte sur un gardien
  centrerSur(lat: number, lng: number): void {
    this.carte?.flyTo([lat, lng], Math.max(this.carte.getZoom(), 17), { duration: 0.6 });
  }

  private dessiner(): void {
    if (!this.carte) return;
    this.couche.clearLayers();

    for (const p of this.proprietes) {
      L.circle([p.lat, p.lng], {
        radius: RAYON_ZONE_METRES,
        color: '#D4AF37',
        weight: 2,
        dashArray: '6 6',
        fillColor: '#D4AF37',
        fillOpacity: 0.08,
        interactive: false
      }).addTo(this.couche);

      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: 'pr-pin',
          html: '<div class="pr-pin-propriete"><ion-icon name="home"></ion-icon></div>',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        }),
        zIndexOffset: 100
      })
        .bindTooltip(echapperHtml(p.nom), { direction: 'top', offset: [0, -20] })
        .on('click', () => this.zone.run(() => this.proprieteCliquee.emit(p.id)))
        .addTo(this.couche);
    }

    for (const g of this.gardiens) {
      const classes = ['pr-pin-gardien', g.enService ? 'on' : 'off', g.horsZone ? 'hors' : '', g.id === this.selection ? 'sel' : ''].join(' ');
      const fond = `background-image: url('${urlCss(g.photo || AVATAR_REPLI)}'), url('${AVATAR_REPLI}')`;
      L.marker([g.lat, g.lng], {
        icon: L.divIcon({
          className: 'pr-pin',
          html: `<div class="${classes}"><span style="${fond}"></span><i></i></div>`,
          iconSize: [48, 56],
          iconAnchor: [24, 56]
        }),
        zIndexOffset: g.id === this.selection ? 1000 : 500
      })
        .bindTooltip(echapperHtml(g.nom), { direction: 'top', offset: [0, -54] })
        .on('click', () => this.zone.run(() => this.gardienClique.emit(g.id)))
        .addTo(this.couche);
    }

    for (const i of this.incidents) {
      L.marker([i.lat, i.lng], {
        icon: L.divIcon({
          className: 'pr-pin',
          html: `<div class="pr-pin-incident g-${echapperHtml(i.gravite)}"><b></b><ion-icon name="${echapperHtml(i.icone)}"></ion-icon></div>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19]
        }),
        zIndexOffset: 2000
      })
        .bindTooltip(echapperHtml(i.titre), { direction: 'top', offset: [0, -20] })
        .on('click', () => this.zone.run(() => this.incidentClique.emit(i.id)))
        .addTo(this.couche);
    }

    // Un nouvel incident ou un gardien qui arrive / part recadre la carte
    const composition = [
      ...this.proprietes.map(p => p.id), ...this.gardiens.map(g => g.id), ...this.incidents.map(i => 'i:' + i.id)
    ].sort().join('|');
    if (composition !== this.composition) {
      this.composition = composition;
      this.cadrer();
    }
  }

  private cadrer(): void {
    if (!this.carte) return;
    const points: L.LatLngExpression[] = [
      ...this.proprietes.map(p => [p.lat, p.lng] as [number, number]),
      ...this.gardiens.map(g => [g.lat, g.lng] as [number, number]),
      ...this.incidents.map(i => [i.lat, i.lng] as [number, number])
    ];
    if (points.length === 0) {
      this.carte.setView(CENTRE_PAR_DEFAUT, 12);
    } else if (points.length === 1) {
      this.carte.setView(points[0], 17);
    } else {
      // La zone de 200 m reste visible autour des propriétés
      const limites = L.latLngBounds(points);
      this.proprietes.forEach(p => limites.extend(L.latLng(p.lat, p.lng).toBounds(RAYON_ZONE_METRES * 2)));
      this.carte.fitBounds(limites, { padding: [36, 36], maxZoom: 17 });
    }
  }
}
