import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { dateLocale, lienTel } from '../../core/format';
import { versApiErreur } from '../../services/api-erreur';
import { ChatService } from '../../services/chat.service';
import {
  ChampsLocataire, MOT_DE_PASSE_LOCATAIRE_MIN, SousCompte, SousComptesService, StatutSousCompte, nomLocataire
} from '../../services/sous-comptes.service';

type Filtre = 'tous' | StatutSousCompte;

interface Groupe {
  id: string;
  nom: string;
  logements: SousCompte[];
}

// Sous-comptes locataires : un par logement de chaque propriété, gérés depuis le compte principal.
// Le propriétaire y inscrit ses locataires (nom, contact) et peut leur donner un accès à l'application
// (email + mot de passe) : le locataire discute alors par chat avec lui et avec les gardiens en service.
// ?propriete=<id> limite la liste à une propriété.
@Component({
  selector: 'app-locataires',
  templateUrl: './locataires.page.html',
  styleUrls: ['./locataires.page.scss'],
  standalone: false
})
export class LocatairesPage {

  private sousComptesService = inject(SousComptesService);
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);
  private chat = inject(ChatService);
  private router = inject(Router);

  readonly date = dateLocale;
  readonly lienTel = lienTel;
  readonly nom = nomLocataire;
  readonly motDePasseMin = MOT_DE_PASSE_LOCATAIRE_MIN;

  sousComptes: SousCompte[] = [];
  filtre: Filtre = 'tous';
  propriete = '';

  isLoading = false;
  charge = false;
  errorMessage = '';
  messageSucces = '';

  // Formulaire d'inscription / modification du locataire
  enEdition: SousCompte | null = null;
  champs: ChampsLocataire = this.champsVides();
  enregistrement = false;
  erreurFormulaire = '';
  afficherMotDePasse = false;
  // Logement dont la discussion avec le locataire est en cours d'ouverture
  ouvertureChat = '';

  ionViewWillEnter(): void {
    this.propriete = this.route.snapshot.queryParamMap.get('propriete') ?? '';
    this.charger();
  }

  async charger(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const res = await this.sousComptesService.mesSousComptes(this.propriete ? { propriete: this.propriete } : {});
      this.sousComptes = res.sousComptes;
      this.charge = true;
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.errorMessage = erreur.message;
    } finally {
      this.isLoading = false;
    }
  }

  async actualiser(event: CustomEvent): Promise<void> {
    await this.charger();
    (event.target as HTMLIonRefresherElement).complete();
  }

  onFiltre(event: CustomEvent): void {
    this.filtre = event.detail.value as Filtre;
  }

  get occupes(): number {
    return this.sousComptes.filter(s => s.statut === 'occupe').length;
  }

  get titre(): string {
    return this.propriete && this.sousComptes[0]?.propriete ? this.sousComptes[0].propriete.nomReference : 'Mes locataires';
  }

  // Logements regroupés par propriété, filtrés par statut
  get groupes(): Groupe[] {
    const groupes = new Map<string, Groupe>();
    for (const s of this.sousComptes) {
      if (this.filtre !== 'tous' && s.statut !== this.filtre) continue;
      const id = s.propriete?._id ?? 'aucune';
      if (!groupes.has(id)) groupes.set(id, { id, nom: s.propriete?.nomReference ?? 'Propriété', logements: [] });
      groupes.get(id)!.logements.push(s);
    }
    return [...groupes.values()];
  }

  ouvrir(sousCompte: SousCompte): void {
    this.messageSucces = '';
    this.erreurFormulaire = '';
    this.champs = {
      libelle: sousCompte.libelle,
      nom: sousCompte.nom ?? '',
      postnom: sousCompte.postnom ?? '',
      prenom: sousCompte.prenom ?? '',
      telephone: sousCompte.telephone ?? '',
      dateEntree: sousCompte.dateEntree ? sousCompte.dateEntree.slice(0, 10) : '',
      email: sousCompte.locataire?.email ?? '',
      password: ''
    };
    this.afficherMotDePasse = false;
    this.enEdition = sousCompte;
  }

  fermer(): void {
    if (!this.enregistrement) this.enEdition = null;
  }

  async enregistrer(): Promise<void> {
    const sousCompte = this.enEdition;
    if (!sousCompte || this.enregistrement) return;
    if (!this.champs.nom.trim()) {
      this.erreurFormulaire = 'Le nom du locataire est obligatoire.';
      return;
    }
    const email = this.champs.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.erreurFormulaire = 'Adresse email du locataire invalide.';
      return;
    }
    if (email && !sousCompte.locataire && !this.champs.password) {
      this.erreurFormulaire = 'Choisissez un mot de passe pour que le locataire puisse se connecter.';
      return;
    }
    if (this.champs.password && this.champs.password.length < MOT_DE_PASSE_LOCATAIRE_MIN) {
      this.erreurFormulaire = `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_LOCATAIRE_MIN} caractères.`;
      return;
    }
    if (!email && sousCompte.locataire && !(await this.confirmerRetraitAcces(sousCompte))) return;

    this.enregistrement = true;
    this.erreurFormulaire = '';
    try {
      const misAJour = await this.sousComptesService.enregistrer(sousCompte._id, this.champs);
      this.remplacer(misAJour);
      this.messageSucces = `${misAJour.libelle} : locataire enregistré.`;
      this.enregistrement = false;
      this.enEdition = null;
    } catch (error) {
      this.erreurFormulaire = versApiErreur(error).message;
      this.enregistrement = false;
    }
  }

  // Ouvre (ou retrouve) la discussion privée avec le locataire
  async ecrire(sousCompte: SousCompte): Promise<void> {
    if (!sousCompte.locataire || this.ouvertureChat) return;
    this.ouvertureChat = sousCompte._id;
    this.errorMessage = '';
    try {
      const conversation = await this.chat.ouvrirDirecte({ id: sousCompte.locataire._id, modele: 'Locataire' });
      await this.router.navigate(['/proprietaire/messages', conversation._id]);
    } catch (error) {
      const erreur = versApiErreur(error);
      if (erreur.statut !== 401) this.errorMessage = erreur.message;
    } finally {
      this.ouvertureChat = '';
    }
  }

  // Email vidé : le locataire ne pourra plus se connecter
  private async confirmerRetraitAcces(sousCompte: SousCompte): Promise<boolean> {
    const alerte = await this.alertCtrl.create({
      header: 'Retirer l\'accès à l\'application ?',
      message: `${nomLocataire(sousCompte)} ne pourra plus se connecter ni vous écrire.`,
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        { text: 'Retirer l\'accès', role: 'confirm', cssClass: 'gd-alert-danger' }
      ]
    });
    await alerte.present();
    const { role } = await alerte.onDidDismiss();
    return role === 'confirm';
  }

  async liberer(sousCompte: SousCompte): Promise<void> {
    const alerte = await this.alertCtrl.create({
      header: `Libérer ${sousCompte.libelle} ?`,
      message: `${nomLocataire(sousCompte)} sera retiré(e) de ce logement${sousCompte.locataire ? ' et ne pourra plus se connecter' : ''}.`,
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        { text: 'Libérer', role: 'confirm', cssClass: 'gd-alert-danger' }
      ]
    });
    await alerte.present();
    const { role } = await alerte.onDidDismiss();
    if (role !== 'confirm') return;

    this.messageSucces = '';
    this.errorMessage = '';
    try {
      const misAJour = await this.sousComptesService.liberer(sousCompte._id);
      this.remplacer(misAJour);
      this.messageSucces = `${misAJour.libelle} est maintenant libre.`;
    } catch (error) {
      this.errorMessage = versApiErreur(error).message;
    }
  }

  private remplacer(sousCompte: SousCompte): void {
    this.sousComptes = this.sousComptes.map(s => (s._id === sousCompte._id ? { ...sousCompte, propriete: sousCompte.propriete ?? s.propriete } : s));
  }

  private champsVides(): ChampsLocataire {
    return { libelle: '', nom: '', postnom: '', prenom: '', telephone: '', dateEntree: '', email: '', password: '' };
  }
}
