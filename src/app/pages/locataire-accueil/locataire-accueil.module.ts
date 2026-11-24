import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { LocataireAccueilPage } from './locataire-accueil.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: LocataireAccueilPage }])],
  declarations: [LocataireAccueilPage]
})
export class LocataireAccueilPageModule {}
