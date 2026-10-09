import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { AccueilPage } from './accueil.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: AccueilPage }])],
  declarations: [AccueilPage]
})
export class AccueilPageModule {}
