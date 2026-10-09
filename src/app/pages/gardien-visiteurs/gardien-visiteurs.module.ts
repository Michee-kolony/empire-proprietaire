import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { GardienShellModule } from '../../components/gardien-shell/gardien-shell.module';
import { GardienVisiteursPageRoutingModule } from './gardien-visiteurs-routing.module';
import { GardienVisiteursPage } from './gardien-visiteurs.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, GardienShellModule, GardienVisiteursPageRoutingModule],
  declarations: [GardienVisiteursPage]
})
export class GardienVisiteursPageModule {}
