import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GardienProfilPage } from './gardien-profil.page';

const routes: Routes = [{ path: '', component: GardienProfilPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GardienProfilPageRoutingModule {}
