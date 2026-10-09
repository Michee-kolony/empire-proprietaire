import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GardienHistoriquePage } from './gardien-historique.page';

const routes: Routes = [{ path: '', component: GardienHistoriquePage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GardienHistoriquePageRoutingModule {}
