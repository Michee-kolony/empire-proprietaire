import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { GardienShellComponent } from './gardien-shell.component';
import { ImageRepliDirective } from './image-repli.directive';
import { GardienMenuComponent } from '../gardien-menu/gardien-menu.component';

@NgModule({
  declarations: [GardienShellComponent, GardienMenuComponent, ImageRepliDirective],
  imports: [CommonModule, RouterModule, IonicModule],
  exports: [GardienShellComponent, GardienMenuComponent, ImageRepliDirective]
})
export class GardienShellModule {}
