import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { IncidentsPage } from './incidents.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: IncidentsPage }])],
  declarations: [IncidentsPage]
})
export class IncidentsPageModule {}
