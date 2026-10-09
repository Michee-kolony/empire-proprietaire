import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { ProfilPage } from './profil.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: ProfilPage }])],
  declarations: [ProfilPage]
})
export class ProfilPageModule {}
