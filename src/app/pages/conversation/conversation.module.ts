import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { ConversationPage } from './conversation.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: ConversationPage }])],
  declarations: [ConversationPage]
})
export class ConversationPageModule {}
