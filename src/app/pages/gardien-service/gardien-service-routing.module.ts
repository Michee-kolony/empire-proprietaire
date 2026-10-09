import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GardienServicePage } from './gardien-service.page';

const routes: Routes = [{ path: '', component: GardienServicePage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GardienServicePageRoutingModule {}
