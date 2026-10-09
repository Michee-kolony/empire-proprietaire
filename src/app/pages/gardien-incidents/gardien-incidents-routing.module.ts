import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GardienIncidentsPage } from './gardien-incidents.page';

const routes: Routes = [{ path: '', component: GardienIncidentsPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GardienIncidentsPageRoutingModule {}
