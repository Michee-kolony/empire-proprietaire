import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { GardienShellModule } from '../../components/gardien-shell/gardien-shell.module';
import { GardienProfilPageRoutingModule } from './gardien-profil-routing.module';
import { GardienProfilPage } from './gardien-profil.page';

@NgModule({
  imports: [CommonModule, IonicModule, GardienShellModule, GardienProfilPageRoutingModule],
  declarations: [GardienProfilPage]
})
export class GardienProfilPageModule {}
