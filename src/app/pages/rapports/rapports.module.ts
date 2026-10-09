import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { RapportsPage } from './rapports.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: RapportsPage }])],
  declarations: [RapportsPage]
})
export class RapportsPageModule {}
