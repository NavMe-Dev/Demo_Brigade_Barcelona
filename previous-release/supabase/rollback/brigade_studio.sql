-- Destructive rollback for an explicitly selected, backed-up database.
-- Empty and remove brigade-studio-assets through the Storage API before executing.
begin;
drop policy brigade_asset_orphan_cleanup on storage.objects;
drop policy brigade_asset_upload on storage.objects;
drop policy brigade_asset_team_read on storage.objects;
drop policy brigade_asset_published_read on storage.objects;
do $$ begin
  if exists(select 1 from storage.buckets where id='brigade-studio-assets') then
    raise exception 'Remove brigade-studio-assets with the Storage API before rolling back';
  end if;
end $$;
drop schema brigade cascade;
drop schema brigade_private cascade;
commit;
