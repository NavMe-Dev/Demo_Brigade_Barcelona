begin;
create schema brigade;
create schema brigade_private;
revoke all on schema brigade, brigade_private from public;
grant usage on schema brigade, brigade_private to anon, authenticated;
alter default privileges in schema brigade revoke execute on functions from public;
alter default privileges in schema brigade_private revoke execute on functions from public;

create table brigade.organizations (
  id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 1 and 150)
);
create table brigade.memberships (
  org_id uuid references brigade.organizations on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null check (role in ('editor','publisher','sales')),
  primary key (org_id,user_id)
);
create index memberships_user on brigade.memberships(user_id,org_id);
create table brigade.projects (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references brigade.organizations,
  slug text unique not null check (slug ~ '^[a-z0-9-]{1,80}$'), title text not null
);
create index projects_org on brigade.projects(org_id);
create function brigade_private.has_role(p uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from brigade.memberships m join brigade.projects t on t.org_id=m.org_id
    where t.id=p and m.user_id=(select auth.uid()) and m.role=any(roles))
$$;
grant execute on function brigade_private.has_role(uuid,text[]) to authenticated;
create table brigade.audit_logs (
  id bigint generated always as identity primary key, project_id uuid references brigade.projects,
  actor_id uuid, resource text not null, record_id uuid, action text not null, created_at timestamptz not null default now()
);
create index audit_project_time on brigade.audit_logs(project_id,created_at desc);
create function brigade_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;
begin
  if tg_op='DELETE' then r:=old; else r:=new; end if;
  insert into brigade.audit_logs(project_id,actor_id,resource,record_id,action)
  values(r.project_id,auth.uid(),tg_table_name,r.id,tg_op);
  return null;
end $$;

create table brigade.buildings (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  
   unique(project_id,code), unique(project_id,id)
);
create table brigade.wings (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  
  building_id uuid not null, foreign key (project_id,building_id) references brigade.buildings(project_id,id),
   unique(project_id,code), unique(project_id,id)
);
create index wings_building_id on brigade.wings(project_id,building_id);
create table brigade.floors (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  level integer not null check (level between -20 and 200),
  wing_id uuid not null, foreign key (project_id,wing_id) references brigade.wings(project_id,id),
  unique(wing_id,level), unique(project_id,code), unique(project_id,id)
);
create index floors_wing_id on brigade.floors(project_id,wing_id);
create table brigade.apartment_types (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  bedrooms integer not null check (bedrooms between 1 and 20), has_study boolean not null default false, total_sba_sqft numeric not null check (total_sba_sqft>0), total_carpet_area_sqft numeric not null check (total_carpet_area_sqft>0 and total_carpet_area_sqft<=total_sba_sqft),
  wing_id uuid not null, foreign key (project_id,wing_id) references brigade.wings(project_id,id),
   unique(project_id,code), unique(project_id,id)
);
create index apartment_types_wing_id on brigade.apartment_types(project_id,wing_id);
create table brigade.apartment_units (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  
  floor_id uuid not null, foreign key (project_id,floor_id) references brigade.floors(project_id,id),
  apartment_type_id uuid not null, foreign key (project_id,apartment_type_id) references brigade.apartment_types(project_id,id),
  check(evidence='verified'), unique(project_id,code), unique(project_id,id)
);
create index apartment_units_floor_id on brigade.apartment_units(project_id,floor_id);
create index apartment_units_apartment_type_id on brigade.apartment_units(project_id,apartment_type_id);
create table brigade.rooms (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  dimensions text, destination jsonb check (destination is null or (jsonb_typeof(destination)='array' and jsonb_array_length(destination)=3)),
  apartment_type_id uuid not null, foreign key (project_id,apartment_type_id) references brigade.apartment_types(project_id,id),
   unique(project_id,code), unique(project_id,id)
);
create index rooms_apartment_type_id on brigade.rooms(project_id,apartment_type_id);
create table brigade.scene_assets (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  object_path text not null unique check (split_part(object_path,'/',1)=project_id::text and object_path ~ '^[a-f0-9-]+/[a-f0-9-]+[.](glb|png|webp|jpg|ktx2)$'),
   unique(project_id,code), unique(project_id,id)
);
create table brigade.architectural_models (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  
  asset_id uuid not null, foreign key (project_id,asset_id) references brigade.scene_assets(project_id,id),
   unique(project_id,code), unique(project_id,id)
);
create index architectural_models_asset_id on brigade.architectural_models(project_id,asset_id);
create table brigade.floor_plans (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  
  asset_id uuid not null, foreign key (project_id,asset_id) references brigade.scene_assets(project_id,id),
  apartment_type_id uuid not null, foreign key (project_id,apartment_type_id) references brigade.apartment_types(project_id,id),
   unique(project_id,code), unique(project_id,id)
);
create index floor_plans_asset_id on brigade.floor_plans(project_id,asset_id);
create index floor_plans_apartment_type_id on brigade.floor_plans(project_id,apartment_type_id);
create table brigade.camera_viewpoints (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  position jsonb not null check (jsonb_typeof(position)='array' and jsonb_array_length(position)=3 and jsonb_path_match(position,'$[0].type() == "number" && $[1].type() == "number" && $[2].type() == "number"')), target jsonb not null check (jsonb_typeof(target)='array' and jsonb_array_length(target)=3 and jsonb_path_match(target,'$[0].type() == "number" && $[1].type() == "number" && $[2].type() == "number"')),
   unique(project_id,code), unique(project_id,id)
);
create table brigade.camera_paths (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  waypoints jsonb not null check (jsonb_typeof(waypoints)='array' and jsonb_array_length(waypoints) between 2 and 256),
   unique(project_id,code), unique(project_id,id)
);
create table brigade.amenities (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  description text not null default '',
   unique(project_id,code), unique(project_id,id)
);
create table brigade.geographic_references (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180), attribution text not null,
   unique(project_id,code), unique(project_id,id)
);
create table brigade.inventory (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  availability text not null check(availability in ('available','held','sold','withdrawn')), verified_at timestamptz not null,
  unit_id uuid not null, foreign key (project_id,unit_id) references brigade.apartment_units(project_id,id),
  unique(unit_id),check(evidence='verified'), unique(project_id,code), unique(project_id,id)
);
create index inventory_unit_id on brigade.inventory(project_id,unit_id);
create table brigade.pricing (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  code text not null check(length(trim(code)) between 1 and 100),
  title text not null check(length(trim(title)) between 1 and 160),
  evidence text not null check(evidence in ('verified','illustrative')),
  source_ref text not null check(length(trim(source_ref)) between 1 and 500),
  amount numeric(16,2) not null check(amount>0), currency text not null check(currency ~ '^[A-Z]{3}$'), verified_at timestamptz not null,
  unit_id uuid not null, foreign key (project_id,unit_id) references brigade.apartment_units(project_id,id),
  unique(unit_id),check(evidence='verified'), unique(project_id,code), unique(project_id,id)
);
create index pricing_unit_id on brigade.pricing(project_id,unit_id);

-- Composite keys maintain the wing match even when parent records are edited concurrently.
alter table brigade.apartment_types add unique (project_id,id,wing_id);
alter table brigade.floors add unique (project_id,id,wing_id);
alter table brigade.apartment_units add column wing_id uuid not null,
  add foreign key (project_id,floor_id,wing_id) references brigade.floors(project_id,id,wing_id),
  add foreign key (project_id,apartment_type_id,wing_id) references brigade.apartment_types(project_id,id,wing_id);
create function brigade_private.unit_wing_check() returns trigger language plpgsql set search_path='' as $$
begin
  select wing_id into strict new.wing_id from brigade.floors where project_id=new.project_id and id=new.floor_id;
  return new;
end $$;
create trigger check_wing before insert or update on brigade.apartment_units for each row execute function brigade_private.unit_wing_check();

create table brigade.publication_versions (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  created_at timestamptz not null default now(), created_by uuid references auth.users,
  manifest jsonb not null, state text not null default 'preview' check(state in ('preview','published')),
  published_at timestamptz, approved_by uuid references auth.users,
  check ((state='published')=(published_at is not null and approved_by is not null))
);
create index releases_project_time on brigade.publication_versions(project_id,created_at desc);
create index releases_published on brigade.publication_versions(project_id,published_at desc) where state='published';

create table brigade.consent_records (
  project_id uuid references brigade.projects, user_id uuid references auth.users on delete cascade,
  purpose text check(purpose in ('analytics','enquiry')), granted boolean not null,
  notice_version text not null, changed_at timestamptz not null default now(), primary key(project_id,user_id,purpose)
);
create table brigade.consent_history (
  id bigint generated always as identity primary key, project_id uuid not null references brigade.projects,
  user_id uuid not null references auth.users on delete cascade, purpose text not null,
  granted boolean not null, notice_version text not null, recorded_at timestamptz not null default clock_timestamp()
);
create index consent_history_project_user on brigade.consent_history(project_id,user_id,recorded_at desc);
create function brigade_private.record_consent() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into brigade.consent_history(project_id,user_id,purpose,granted,notice_version)
    values(new.project_id,new.user_id,new.purpose,new.granted,new.notice_version);
  return null;
end $$;
create trigger consent_audit after insert or update on brigade.consent_records
  for each row execute function brigade_private.record_consent();
create table brigade.analytics_events (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  user_id uuid not null references auth.users on delete cascade, event text not null
    check(event in ('tower_select','apartment_view','room_view','tour_complete','compare','enquiry_conversion')),
  subject text check(length(subject)<=100), created_at timestamptz not null default now()
);
create index analytics_user_time on brigade.analytics_events(project_id,user_id,created_at desc);
create index analytics_project_time on brigade.analytics_events(project_id,created_at desc);
create table brigade.enquiries (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects,
  user_id uuid not null references auth.users on delete cascade, name text not null check(length(trim(name)) between 1 and 100),
  email text not null check(length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  message text not null check(length(trim(message)) between 1 and 2000),
  created_at timestamptz not null default now(), notice_version text not null
);
create index enquiries_project_time on brigade.enquiries(project_id,created_at desc);
create index enquiries_user_time on brigade.enquiries(project_id,user_id,created_at desc);
create table brigade.saved_apartments (
  project_id uuid not null, user_id uuid not null default auth.uid() references auth.users on delete cascade,
  apartment_type_id uuid not null, foreign key(project_id,apartment_type_id) references brigade.apartment_types(project_id,id),
  primary key(user_id,project_id,apartment_type_id)
);
create table brigade.comparison_sessions (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references brigade.projects, user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(), unique(id,project_id,user_id)
);
create table brigade.comparison_items (
  session_id uuid, project_id uuid, user_id uuid not null default auth.uid(), apartment_type_id uuid,
  foreign key(session_id,project_id,user_id) references brigade.comparison_sessions(id,project_id,user_id) on delete cascade,
  foreign key(project_id,apartment_type_id) references brigade.apartment_types(project_id,id),
  primary key(session_id,project_id,apartment_type_id)
);
create index comparison_owner on brigade.comparison_sessions(project_id,user_id);
create index comparison_item_owner on brigade.comparison_items(project_id,user_id);
alter table brigade.organizations enable row level security;
alter table brigade.memberships enable row level security;
alter table brigade.projects enable row level security;
create policy self_membership on brigade.memberships for select to authenticated using(user_id=(select auth.uid()));
create policy own_org on brigade.organizations for select to authenticated using (id in(select org_id from brigade.memberships));
create policy own_projects on brigade.projects for select to authenticated using (org_id in(select org_id from brigade.memberships));
grant select on brigade.organizations,brigade.memberships,brigade.projects to authenticated;

create function brigade_private.content_tables() returns text[] language sql immutable set search_path='' as $$ select array['buildings','wings','floors','apartment_types','apartment_units','rooms','scene_assets','architectural_models','floor_plans','camera_viewpoints','camera_paths','amenities','geographic_references','inventory','pricing']::text[] $$;
create function brigade_private.increment_revision() returns trigger language plpgsql set search_path='' as $$
begin
  if (old.project_id,old.id) is distinct from (new.project_id,new.id) then raise exception 'Record identity cannot change'; end if;
  new.revision:=old.revision+1;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array brigade_private.content_tables() loop
    execute format('alter table brigade.%I add column revision bigint not null default 1',t);
    execute format('create trigger bump before update on brigade.%I for each row execute function brigade_private.increment_revision()',t);
    execute format('alter table brigade.%I enable row level security',t);
    execute format('grant select,insert,update,delete on brigade.%I to authenticated',t);
    execute format('create policy team_read on brigade.%I for select to authenticated using(brigade_private.has_role(project_id,array[''editor'',''publisher'',''sales'']))',t);
    execute format('create policy edit_draft on brigade.%I for all to authenticated using(brigade_private.has_role(project_id,array[''editor'',''publisher''])) with check(brigade_private.has_role(project_id,array[''editor'',''publisher'']))',t);
    execute format('create trigger audit after insert or update or delete on brigade.%I for each row execute function brigade_private.audit_change()',t);
  end loop;
  foreach t in array array['publication_versions','audit_logs','analytics_events','enquiries','consent_records','consent_history'] loop
    execute format('alter table brigade.%I enable row level security',t);
    execute format('grant select on brigade.%I to authenticated',t);
    execute format('create policy staff_read on brigade.%I for select to authenticated using(brigade_private.has_role(project_id,%s))',t,
       case when t in('enquiries','consent_records','consent_history','analytics_events') then 'array[''sales'',''publisher'']' else 'array[''sales'',''publisher'',''editor'']' end);
  end loop;
  foreach t in array array['saved_apartments','comparison_sessions','comparison_items'] loop
    execute format('alter table brigade.%I enable row level security',t);
    execute format('grant select,insert,delete on brigade.%I to authenticated',t);
    execute format('create policy own_data on brigade.%I for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
  end loop;
end $$;
create trigger release_audit after insert or update on brigade.publication_versions for each row execute function brigade_private.audit_change();

create function brigade_private.valid_vector(point jsonb) returns boolean language sql immutable set search_path='' as $$
  select case when jsonb_typeof(point)='array' then jsonb_array_length(point)=3 and
    not exists(select 1 from jsonb_array_elements(point) n where jsonb_typeof(n)<>'number') else false end
$$;
create function brigade_private.valid_path(points jsonb) returns boolean language sql immutable set search_path='' as $$
  select case when jsonb_typeof(points)='array' then not exists(
    select 1 from jsonb_array_elements(points) p where not brigade_private.valid_vector(p)
  ) else false end
$$;
grant execute on function brigade_private.valid_vector(jsonb),brigade_private.valid_path(jsonb) to authenticated;
alter table brigade.rooms add check (destination is null or brigade_private.valid_vector(destination));
alter table brigade.camera_paths add check (brigade_private.valid_path(waypoints));
alter table brigade.pricing add check(verified_at <= now());
alter table brigade.inventory add check(verified_at <= now());

-- Actor-bound release operations. Owner privileges are confined to the unexposed schema.
create function brigade_private.freeze_content(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t text; rows jsonb; snapshot jsonb:='{}';
begin
  foreach t in array brigade_private.content_tables() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r)-''project_id'' order by code),''[]'') from brigade.%I r where project_id=$1',t)
    into rows using p_project;
    snapshot:=jsonb_set(snapshot,array[t],rows);
  end loop;
  return snapshot;
end $$;

create function brigade_private.make_preview(p_project uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not brigade_private.has_role(p_project,array['editor','publisher']) then raise insufficient_privilege; end if;
  perform 1 from brigade.projects where id=p_project for update;
  insert into brigade.publication_versions(project_id,created_by,manifest)
    values(p_project,auth.uid(),brigade_private.freeze_content(p_project)) returning id into result;
  return result;
end $$;

create function brigade_private.publish(p_project uuid,p_version uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare candidate brigade.publication_versions;
begin
  if not brigade_private.has_role(p_project,array['publisher']) then raise insufficient_privilege; end if;
  perform 1 from brigade.projects where id=p_project for update;
  select * into strict candidate from brigade.publication_versions where id=p_version and project_id=p_project for update;
  if candidate.state='published' then return candidate.id; end if;
  if candidate.manifest<>brigade_private.freeze_content(p_project) then raise exception 'Draft changed. Create and review a new preview.'; end if;
  if exists(
    select 1 from jsonb_array_elements(candidate.manifest->'scene_assets') a
    where not exists(select 1 from storage.objects o where o.bucket_id='brigade-studio-assets' and o.name=a->>'object_path')
  ) then raise exception 'A referenced asset is missing from storage'; end if;
  update brigade.publication_versions set state='published',approved_by=auth.uid(),published_at=clock_timestamp() where id=candidate.id;
  return candidate.id;
end $$;

create function brigade_private.live(p_project uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',id,'project_id',project_id,'created_at',published_at,'manifest',manifest)
  from brigade.publication_versions where project_id=p_project and state='published' order by published_at desc limit 1
$$;

create function brigade.create_preview(p_project uuid) returns uuid language sql security invoker set search_path='' as $$ select brigade_private.make_preview(p_project) $$;
create function brigade.approve_and_publish(p_project uuid,p_version uuid) returns uuid language sql security invoker set search_path='' as $$ select brigade_private.publish(p_project,p_version) $$;
create function brigade.current_release(p_project uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select brigade_private.live(p_project) $$;
grant execute on function brigade_private.make_preview(uuid), brigade_private.publish(uuid,uuid),brigade.create_preview(uuid),brigade.approve_and_publish(uuid,uuid) to authenticated;
grant execute on function brigade_private.live(uuid),brigade.current_release(uuid) to anon,authenticated;

create function brigade.engagement_summary(p_project uuid)
returns table(event text,total bigint) language sql stable security invoker set search_path='' as $$
  select e.event,count(*) from brigade.analytics_events e
  where e.project_id=p_project and e.created_at>=now()-interval '30 days' group by e.event
$$;
grant execute on function brigade.engagement_summary(uuid) to authenticated;

create function brigade_private.released_design(p uuid,d uuid) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((brigade_private.live(p)->'manifest'->'apartment_types') @>
    jsonb_build_array(jsonb_build_object('id',d)),false)
$$;
grant execute on function brigade_private.released_design(uuid,uuid) to authenticated;
create policy saved_public_design on brigade.saved_apartments as restrictive for insert to authenticated
with check(brigade_private.released_design(project_id,apartment_type_id));
create policy comparison_public_project on brigade.comparison_sessions as restrictive for insert to authenticated
with check(brigade_private.live(project_id) is not null);
create policy comparison_public_design on brigade.comparison_items as restrictive for insert to authenticated
with check(brigade_private.released_design(project_id,apartment_type_id));

create function brigade_private.allow_buyer(p_project uuid) returns void language plpgsql set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from brigade.publication_versions where project_id=p_project and state='published')
  then raise insufficient_privilege; end if;
  -- Serialize per visitor and project for consent changes, retries and submission limits.
  perform pg_advisory_xact_lock(hashtextextended(p_project::text || auth.uid()::text,0));
end $$;
create function brigade_private.consent(p_project uuid,p_purpose text,p_granted boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform brigade_private.allow_buyer(p_project);
  insert into brigade.consent_records(project_id,user_id,purpose,granted,notice_version)
  values(p_project,auth.uid(),p_purpose,p_granted,'buyer-v1') on conflict(project_id,user_id,purpose)
  do update set granted=excluded.granted,notice_version=excluded.notice_version,changed_at=now();
end $$;
create function brigade.analytics_consent(p_project uuid,p_granted boolean) returns void
language sql security invoker set search_path='' as $$ select brigade_private.consent(p_project,'analytics',p_granted) $$;
grant execute on function brigade_private.consent(uuid,text,boolean),brigade.analytics_consent(uuid,boolean) to authenticated;

create function brigade_private.track(p_project uuid,p_event text,p_subject text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform brigade_private.allow_buyer(p_project);
  if p_event='enquiry_conversion' then raise exception 'Conversion is recorded during enquiry submission'; end if;
  if not exists(select 1 from brigade.consent_records where project_id=p_project and user_id=auth.uid() and purpose='analytics' and granted)
  then raise insufficient_privilege; end if;
  if (select count(*) from brigade.analytics_events where project_id=p_project and user_id=auth.uid() and created_at>now()-interval '1 minute')>=60
  then raise exception 'Event limit reached'; end if;
  insert into brigade.analytics_events(project_id,user_id,event,subject) values(p_project,auth.uid(),p_event,p_subject);
end $$;
create function brigade.track_experience(p_project uuid,p_event text,p_subject text) returns void
language sql security invoker set search_path='' as $$ select brigade_private.track(p_project,p_event,p_subject) $$;
grant execute on function brigade_private.track(uuid,text,text),brigade.track_experience(uuid,text,text) to authenticated;

create function brigade_private.submit(p_project uuid,p_request uuid,p_name text,p_email text,p_message text,p_consent boolean) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if p_consent is distinct from true then raise exception 'Contact consent is required'; end if;
  perform brigade_private.allow_buyer(p_project);
  if exists(select 1 from brigade.enquiries where id=p_request and project_id=p_project and user_id=auth.uid()) then return p_request; end if;
  if (select count(*) from brigade.enquiries where project_id=p_project and user_id=auth.uid() and created_at>now()-interval '1 hour')>=3
  then raise exception 'Enquiry limit reached'; end if;
  perform brigade_private.consent(p_project,'enquiry',true);
  insert into brigade.enquiries(id,project_id,user_id,name,email,message,notice_version)
  values(p_request,p_project,auth.uid(),trim(p_name),lower(trim(p_email)),trim(p_message),'buyer-v1');
  if exists(select 1 from brigade.consent_records where project_id=p_project and user_id=auth.uid() and purpose='analytics' and granted)
  then insert into brigade.analytics_events(project_id,user_id,event) values(p_project,auth.uid(),'enquiry_conversion'); end if;
  return p_request;
end $$;
create function brigade.submit_enquiry(p_project uuid,p_request uuid,p_name text,p_email text,p_message text,p_consent boolean) returns uuid
language sql security invoker set search_path='' as $$ select brigade_private.submit(p_project,p_request,p_name,p_email,p_message,p_consent) $$;
grant execute on function brigade_private.submit(uuid,uuid,text,text,text,boolean),brigade.submit_enquiry(uuid,uuid,text,text,text,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('brigade-studio-assets','brigade-studio-assets',false,33554432,array['model/gltf-binary','image/png','image/webp','image/jpeg','image/ktx2']);
create function brigade_private.object_project(path text) returns uuid language plpgsql immutable set search_path='' as $$
begin
  return split_part(path,'/',1)::uuid;
exception when invalid_text_representation then return null;
end $$;
create function brigade_private.published_asset(path text) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((brigade_private.live(brigade_private.object_project(path))->'manifest'->'scene_assets') @>
    jsonb_build_array(jsonb_build_object('object_path',path)),false)
$$;
grant execute on function brigade_private.object_project(text) to authenticated;
grant execute on function brigade_private.published_asset(text) to anon,authenticated;
create policy brigade_asset_upload on storage.objects for insert to authenticated with check(
  bucket_id='brigade-studio-assets' and name ~ '^[a-f0-9-]+/[a-f0-9-]+[.](glb|png|webp|jpg|ktx2)$'
  and brigade_private.has_role(brigade_private.object_project(name),array['editor','publisher']));
create policy brigade_asset_team_read on storage.objects for select to authenticated using(
  bucket_id='brigade-studio-assets' and brigade_private.has_role(brigade_private.object_project(name),array['editor','publisher','sales']));
create policy brigade_asset_published_read on storage.objects for select to anon,authenticated using(
  bucket_id='brigade-studio-assets' and brigade_private.published_asset(name));

-- Failed metadata writes can clean up newly uploaded, unreferenced files.
create function brigade_private.unreferenced_asset(path text) returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from brigade.scene_assets where object_path=path)
    and not exists(select 1 from brigade.publication_versions
      where project_id=brigade_private.object_project(path) and manifest->'scene_assets' @>
        jsonb_build_array(jsonb_build_object('object_path',path)))
$$;
grant execute on function brigade_private.unreferenced_asset(text) to authenticated;
create policy brigade_asset_orphan_cleanup on storage.objects for delete to authenticated using(
  bucket_id='brigade-studio-assets' and brigade_private.has_role(brigade_private.object_project(name),array['editor','publisher'])
  and brigade_private.unreferenced_asset(name));

-- PostgreSQL grants function execution to PUBLIC by default, including on managed installations
-- with customized defaults. Close all implicit function grants, then retain explicit role grants.
revoke all on all functions in schema brigade,brigade_private from public;
commit;
