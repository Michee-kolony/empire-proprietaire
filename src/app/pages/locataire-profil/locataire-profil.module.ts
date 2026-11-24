import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { LocataireProfilPage } from './locataire-profil.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: LocataireProfilPage }])],
  declarations: [LocataireProfilPage]
})
export class LocataireProfilPageModule {}
