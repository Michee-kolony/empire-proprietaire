import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { EvaluationsPage } from './evaluations.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: EvaluationsPage }])],
  declarations: [EvaluationsPage]
})
export class EvaluationsPageModule {}
