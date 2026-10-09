import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { ConversationsPage } from './conversations.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: ConversationsPage }])],
  declarations: [ConversationsPage]
})
export class ConversationsPageModule {}
