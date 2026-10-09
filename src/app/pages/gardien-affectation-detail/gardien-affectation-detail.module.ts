import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { GardienShellModule } from '../../components/gardien-shell/gardien-shell.module';
import { GardienAffectationDetailPageRoutingModule } from './gardien-affectation-detail-routing.module';
import { GardienAffectationDetailPage } from './gardien-affectation-detail.page';

@NgModule({
  imports: [CommonModule, IonicModule, GardienShellModule, GardienAffectationDetailPageRoutingModule],
  declarations: [GardienAffectationDetailPage]
})
export class GardienAffectationDetailPageModule {}
