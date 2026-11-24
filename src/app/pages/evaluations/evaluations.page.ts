import { Component, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { dateHeureLocale, nomComplet } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import { Propriete, ProprietesService } from '../../services/proprietes.service';
import { AffectationsService } from '../../services/affectations.service';
import { Evaluation, EvaluationsService, derniersMois, moisLabel } from '../../services/evaluations.service';

// Un gardien affecté à une propriété : couple évaluable par le propriétaire
interface CoupleEvaluable {
  gardienId: string;
  gardienNom: string;
  gardienPhoto: string;
  proprieteId: string;
  proprieteNom: string;
}

// Une évaluation « des deux côtés » pour un (gardien, propriété, mois)
interface Fiche {
  cle: string;
  periode: string;
  gardien: Evaluation['gardien'];
  propriete: Evaluation['propriete'];
  proprietaire: Evaluation | null; // évaluation écrite par le propriétaire
  autoGardien: Evaluation | null;  // auto-évaluation du gardien
}

// Évaluations mensuelles des gardiens sur les propriétés du propriétaire.
// Le propriétaire rédige son appréciation du mois ; il voit aussi l'auto-évaluation du gardien.
@Component({
  selector: 'app-evaluations',
  templateUrl: './evaluations.page.html',
  styleUrls: ['./evaluations.page.scss'],
  standalone: false
})
export class EvaluationsPage {

  private evaluationsService = inject(EvaluationsService);
  private proprietesService = inject(ProprietesService);
  private affectationsService = inject(AffectationsService);
  private toastCtrl = inject(ToastController);

  readonly dateHeure = dateHeureLocale;
  readonly nomComplet = nomComplet;
  readonly moisLabel = moisLabel;
  readonly mois = derniersMois(6);

  fiches: Fiche[] = [];
  couples: CoupleEvaluable[] = [];
  periodeCourante = this.mois[0]?.valeur ?? '';

  charge = false;
  isLoading = false;
  errorMessage = '';

  // Mois affiché dans la liste ('' = tous)
  periodeFiltre = '';

  // Formulaire de rédaction
  formulaireOuvert = false;
  enregistrement = false;
  formulaire: { propriete: string; gardien: string; periode: string; commentaire: string } =
    { propriete: '', gardien: '', periode: this.periodeCourante, commentaire: '' };

  ionViewWillEnter(): void {
    this.charger();
    this.chargerCouples();
  }

  async charger(): Promise<void> {
    this.errorMessage = '';
    this.isLoading = true;
    try {
      const { evaluations, periodeCourante } = await this.evaluationsService.mesEvaluations(
        this.periodeFiltre ? { periode: this.periodeFiltre } : {}
      );
      this.periodeCourante = periodeCourante || this.periodeCourante;
      if (!this.formulaire.commentaire) this.formulaire.periode = this.periodeCourante;
      this.fiches = this.grouper(evaluations);
      this.charge = true;
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.errorMessage = erreur.message;
    } finally {
      this.isLoading = false;
    }
  }

  // Couples gardien + propriété que le propriétaire peut évaluer (affectations en cours)
  private async chargerCouples(): Promise<void> {
    try {
      const proprietes: Propriete[] = await this.proprietesService.mesProprietes();
      const affectations = await this.affectationsService.enCoursDe(proprietes.map(p => p._id));
      const vus = new Set<string>();
      const couples: CoupleEvaluable[] = [];
      for (const a of affectations) {
        if (!a.gardien || !a.propriete) continue;
        const cle = `${a.gardien._id}|${a.propriete._id}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        couples.push({
          gardienId: a.gardien._id,
          gardienNom: nomComplet(a.gardien) || a.gardien.matricule,
          gardienPhoto: a.gardien.photoProfil,
          proprieteId: a.propriete._id,
          proprieteNom: a.propriete.nomReference
        });
      }
      this.couples = couples;
    } catch {
      this.couples = [];
    }
  }

  private grouper(evaluations: Evaluation[]): Fiche[] {
    const fiches = new Map<string, Fiche>();
    for (const e of evaluations) {
      if (!e.gardien || !e.propriete) continue;
      const cle = `${e.gardien._id}|${e.propriete._id}|${e.periode}`;
      let fiche = fiches.get(cle);
      if (!fiche) {
        fiche = { cle, periode: e.periode, gardien: e.gardien, propriete: e.propriete, proprietaire: null, autoGardien: null };
        fiches.set(cle, fiche);
      }
      if (e.auteurModele === 'Gardien') fiche.autoGardien = e;
      else fiche.proprietaire = e;
    }
    return [...fiches.values()].sort((a, b) => b.periode.localeCompare(a.periode));
  }

  changerMois(event: CustomEvent): void {
    this.periodeFiltre = String(event.detail.value ?? '');
    this.charger();
  }

  async actualiser(event: CustomEvent): Promise<void> {
    await Promise.all([this.charger(), this.chargerCouples()]);
    (event.target as HTMLIonRefresherElement).complete();
  }

  // Pré-remplit le formulaire pour corriger une évaluation existante du propriétaire
  modifier(fiche: Fiche): void {
    this.formulaire = {
      propriete: fiche.propriete!._id,
      gardien: fiche.gardien!._id,
      periode: fiche.periode,
      commentaire: fiche.proprietaire?.commentaire ?? ''
    };
    this.formulaireOuvert = true;
  }

  get gardiensDuSite(): CoupleEvaluable[] {
    if (!this.formulaire.propriete) return this.couples;
    return this.couples.filter(c => c.proprieteId === this.formulaire.propriete);
  }

  champ(cle: 'propriete' | 'gardien' | 'periode' | 'commentaire', event: CustomEvent): void {
    this.formulaire = { ...this.formulaire, [cle]: String(event.detail.value ?? '') };
    // Changer de propriété remet à zéro le gardien s'il n'y est pas affecté
    if (cle === 'propriete' && !this.gardiensDuSite.some(c => c.gardienId === this.formulaire.gardien)) {
      this.formulaire.gardien = '';
    }
  }

  get proprietesFormulaire(): { id: string; nom: string }[] {
    const vus = new Map<string, string>();
    for (const c of this.couples) if (!vus.has(c.proprieteId)) vus.set(c.proprieteId, c.proprieteNom);
    return [...vus.entries()].map(([id, nom]) => ({ id, nom }));
  }

  get peutEnregistrer(): boolean {
    return Boolean(this.formulaire.propriete && this.formulaire.gardien && this.formulaire.periode
      && this.formulaire.commentaire.trim().length >= 2);
  }

  async enregistrer(): Promise<void> {
    if (!this.peutEnregistrer || this.enregistrement) return;
    this.enregistrement = true;
    try {
      await this.evaluationsService.enregistrer({
        gardien: this.formulaire.gardien,
        propriete: this.formulaire.propriete,
        periode: this.formulaire.periode,
        commentaire: this.formulaire.commentaire.trim()
      });
      await this.toast('Évaluation enregistrée');
      this.formulaire = { propriete: '', gardien: '', periode: this.periodeCourante, commentaire: '' };
      this.formulaireOuvert = false;
      await this.charger();
    } catch (error) {
      await this.toast(versApiErreur(error).message, 'danger');
    } finally {
      this.enregistrement = false;
    }
  }

  private async toast(message: string, couleur: 'success' | 'danger' = 'success'): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color: couleur, position: 'bottom' });
    await toast.present();
  }
}
