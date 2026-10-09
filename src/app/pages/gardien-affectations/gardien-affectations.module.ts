import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { GardienShellModule } from '../../components/gardien-shell/gardien-shell.module';
import { GardienAffectationsPageRoutingModule } from './gardien-affectations-routing.module';
import { GardienAffectationsPage } from './gardien-affectations.page';

@NgModule({
  imports: [CommonModule, IonicModule, GardienShellModule, GardienAffectationsPageRoutingModule],
  declarations: [GardienAffectationsPage]
})
export class GardienAffectationsPageModule {}
