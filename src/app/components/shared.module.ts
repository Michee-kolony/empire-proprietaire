import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { CarteGardiensComponent } from './carte/carte-gardiens.component';
import { ImageRepliDirective } from './image-repli.directive';
import { MenuComponent } from './menu/menu.component';
import { ShellComponent } from './shell/shell.component';

const PARTAGES = [ShellComponent, MenuComponent, ImageRepliDirective, CarteGardiensComponent];

// Composants communs à toutes les pages de l'espace propriétaire
@NgModule({
  declarations: PARTAGES,
  imports: [CommonModule, FormsModule, RouterModule, IonicModule],
  exports: [...PARTAGES, CommonModule, FormsModule, IonicModule]
})
export class SharedModule {}
