import { Migration } from '@mikro-orm/migrations';

export class Migration20260724202732 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "doctor" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "retention_anonymized_at" timestamptz null, "name" text not null, "email" text not null, "email_lookup_hash" text not null, "department" text null, "organization_id" text not null, primary key ("id"));`);
    this.addSql(`create index "doctor_email_lookup_hash_index" on "doctor" ("email_lookup_hash");`);
    this.addSql(`alter table "doctor" add constraint "doctor_email_lookup_hash_unique" unique ("email_lookup_hash");`);
    this.addSql(`create index "doctor_organization_id_index" on "doctor" ("organization_id");`);

    this.addSql(`create table "access_key" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "retention_anonymized_at" timestamptz null, "key_hash" text not null, "expires_at" timestamptz not null, "last_used_at" timestamptz null, "revoked_at" timestamptz null, "doctor_id" uuid not null, "organization_id" text not null, primary key ("id"));`);
    this.addSql(`create index "access_key_key_hash_index" on "access_key" ("key_hash");`);
    this.addSql(`alter table "access_key" add constraint "access_key_key_hash_unique" unique ("key_hash");`);
    this.addSql(`create index "access_key_organization_id_index" on "access_key" ("organization_id");`);

    this.addSql(`create table "idea" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "retention_anonymized_at" timestamptz null, "title" text not null, "body" text not null, "status" text not null, "doctor_id" uuid not null, "organization_id" text not null, primary key ("id"));`);
    this.addSql(`create index "idea_organization_id_index" on "idea" ("organization_id");`);

    this.addSql(`create table "innovations_record" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "retention_anonymized_at" timestamptz null, "message" text not null, primary key ("id"));`);

    this.addSql(`create table "nda_acceptance" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "retention_anonymized_at" timestamptz null, "nda_version" text not null, "doctor_signed_at" timestamptz not null, "org_countersigned_at" timestamptz not null, "signer_name_snapshot" text not null, "signer_ip_address" text null, "doctor_id" uuid not null, "organization_id" text not null, primary key ("id"));`);
    this.addSql(`create index "nda_acceptance_nda_version_index" on "nda_acceptance" ("nda_version");`);
    this.addSql(`create index "nda_acceptance_organization_id_index" on "nda_acceptance" ("organization_id");`);

    this.addSql(`alter table "access_key" add constraint "access_key_doctor_id_foreign" foreign key ("doctor_id") references "doctor" ("id");`);

    this.addSql(`alter table "idea" add constraint "idea_doctor_id_foreign" foreign key ("doctor_id") references "doctor" ("id");`);
    this.addSql(`alter table "idea" add constraint "idea_status_check" check ("status" in ('submitted', 'under_review', 'accepted', 'declined'));`);

    this.addSql(`alter table "nda_acceptance" add constraint "nda_acceptance_doctor_id_foreign" foreign key ("doctor_id") references "doctor" ("id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "access_key" drop constraint "access_key_doctor_id_foreign";`);
    this.addSql(`alter table "idea" drop constraint "idea_doctor_id_foreign";`);
    this.addSql(`alter table "nda_acceptance" drop constraint "nda_acceptance_doctor_id_foreign";`);

    this.addSql(`drop table if exists "doctor" cascade;`);
    this.addSql(`drop table if exists "access_key" cascade;`);
    this.addSql(`drop table if exists "idea" cascade;`);
    this.addSql(`drop table if exists "innovations_record" cascade;`);
    this.addSql(`drop table if exists "nda_acceptance" cascade;`);
  }

}
