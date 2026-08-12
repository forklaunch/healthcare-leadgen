import { Migration } from '@mikro-orm/migrations';

export class Migration20260812184038 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "idea" add "roi_score" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "idea" drop column "roi_score";`);
  }

}
