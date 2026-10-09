import { Component, OnInit } from '@angular/core';
import { GardienDataService, Visiteur } from '../../services/gardien-data.service';

@Component({
  selector: 'app-gardien-visiteurs',
  templateUrl: './gardien-visiteurs.page.html',
  styleUrls: ['./gardien-visiteurs.page.scss'],
  standalone: false
})
export class GardienVisiteursPage implements OnInit {

  visiteurs: Visiteur[] = [];
  formulaireOuvert = false;
  errorMessage = '';
  photoPreview: string | null = null;
  recherche = '';

  form = {
    nom: '',
    motif: '',
    personneVisitee: ''
  };

  constructor(private data: GardienDataService) {}

  ngOnInit(): void {
    this.data.visiteurs$.subscribe(list => (this.visiteurs = list));
  }

  presents(): number {
    return this.visiteurs.filter(v => v.statut === 'present').length;
  }

  visiteursFiltres(): Visiteur[] {
    const terme = this.recherche.trim().toLowerCase();
    if (!terme) return this.visiteurs;

    return this.visiteurs.filter(v =>
      v.nom.toLowerCase().includes(terme) ||
      v.motif.toLowerCase().includes(terme) ||
      v.personneVisitee.toLowerCase().includes(terme)
    );
  }

  ouvrirFormulaire(): void {
    this.formulaireOuvert = true;
    this.errorMessage = '';
  }

  annuler(): void {
    this.formulaireOuvert = false;
    this.form = { nom: '', motif: '', personneVisitee: '' };
    this.photoPreview = null;
    this.errorMessage = '';
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => (this.photoPreview = reader.result as string);
    reader.readAsDataURL(file);
  }

  removePhoto(): void {
    this.photoPreview = null;
  }

  enregistrer(): void {
    if (!this.form.nom.trim()) {
      this.errorMessage = 'Veuillez indiquer le nom du visiteur.';
      return;
    }

    if (!this.photoPreview) {
      this.errorMessage = 'La photo du visiteur est obligatoire avant son entrée sur la propriété.';
      return;
    }

    const now = new Date();

    this.data.enregistrerVisiteur({
      nom: this.form.nom.trim(),
      photo: this.photoPreview,
      motif: this.form.motif.trim() || 'Non précisé',
      personneVisitee: this.form.personneVisitee.trim() || 'Non précisé',
      date: "Aujourd'hui",
      heureEntree: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
    });

    this.annuler();
  }

  enregistrerSortie(id: number): void {
    this.data.enregistrerSortieVisiteur(id);
  }
}
