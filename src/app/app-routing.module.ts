import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { locataireGuard, proprietaireGuard, visiteurGuard } from './guards/proprietaire.guard';

const routes: Routes = [
  // Démarrage : session stockée -> accueil, sinon connexion (voir proprietaireGuard)
  {
    path: '',
    redirectTo: 'proprietaire/accueil',
    pathMatch: 'full'
  },
  {
    path: 'login',
    canActivate: [visiteurGuard],
    loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule)
  },
  {
    path: 'proprietaire',
    canActivate: [proprietaireGuard],
    children: [
      { path: '', redirectTo: 'accueil', pathMatch: 'full' },
      {
        path: 'accueil',
        loadChildren: () => import('./pages/accueil/accueil.module').then(m => m.AccueilPageModule)
      },
      {
        path: 'carte',
        loadChildren: () => import('./pages/carte/carte.module').then(m => m.CartePageModule)
      },
      {
        path: 'proprietes',
        loadChildren: () => import('./pages/proprietes/proprietes.module').then(m => m.ProprietesPageModule)
      },
      {
        // Les propriétés sont créées et modifiées par l'administration (application admin)
        path: 'proprietes/:id',
        loadChildren: () => import('./pages/propriete-detail/propriete-detail.module').then(m => m.ProprieteDetailPageModule)
      },
      {
        // Sous-comptes locataires (un par logement) ; ?propriete=<id> pour une seule propriété
        path: 'locataires',
        loadChildren: () => import('./pages/locataires/locataires.module').then(m => m.LocatairesPageModule)
      },
      {
        path: 'gardiens/:id',
        loadChildren: () => import('./pages/gardien-detail/gardien-detail.module').then(m => m.GardienDetailPageModule)
      },
      {
        path: 'incidents',
        loadChildren: () => import('./pages/incidents/incidents.module').then(m => m.IncidentsPageModule)
      },
      {
        path: 'incidents/:id',
        loadChildren: () => import('./pages/incident-detail/incident-detail.module').then(m => m.IncidentDetailPageModule)
      },
      {
        path: 'messages',
        loadChildren: () => import('./pages/conversations/conversations.module').then(m => m.ConversationsPageModule)
      },
      {
        path: 'messages/:id',
        loadChildren: () => import('./pages/conversation/conversation.module').then(m => m.ConversationPageModule)
      },
      {
        path: 'rapports',
        loadChildren: () => import('./pages/rapports/rapports.module').then(m => m.RapportsPageModule)
      },
      {
        path: 'evaluations',
        loadChildren: () => import('./pages/evaluations/evaluations.module').then(m => m.EvaluationsPageModule)
      },
      {
        path: 'abonnements',
        loadChildren: () => import('./pages/abonnements/abonnements.module').then(m => m.AbonnementsPageModule)
      },
      {
        path: 'profil',
        loadChildren: () => import('./pages/profil/profil.module').then(m => m.ProfilPageModule)
      }
    ]
  },
  {
    // Espace du locataire (compte créé par son propriétaire) : son logement et le chat
    // avec son propriétaire et les gardiens en service sur la propriété
    path: 'locataire',
    canActivate: [locataireGuard],
    children: [
      { path: '', redirectTo: 'accueil', pathMatch: 'full' },
      {
        path: 'accueil',
        loadChildren: () => import('./pages/locataire-accueil/locataire-accueil.module').then(m => m.LocataireAccueilPageModule)
      },
      {
        path: 'messages',
        loadChildren: () => import('./pages/conversations/conversations.module').then(m => m.ConversationsPageModule)
      },
      {
        path: 'messages/:id',
        loadChildren: () => import('./pages/conversation/conversation.module').then(m => m.ConversationPageModule)
      },
      {
        path: 'profil',
        loadChildren: () => import('./pages/locataire-profil/locataire-profil.module').then(m => m.LocataireProfilPageModule)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
