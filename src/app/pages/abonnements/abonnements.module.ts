import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { AbonnementsPage } from './abonnements.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: AbonnementsPage }])],
  declarations: [AbonnementsPage]
})
export class AbonnementsPageModule {}
