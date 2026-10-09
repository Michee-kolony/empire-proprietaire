import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GardienRapportsPage } from './gardien-rapports.page';

const routes: Routes = [{ path: '', component: GardienRapportsPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GardienRapportsPageRoutingModule {}
