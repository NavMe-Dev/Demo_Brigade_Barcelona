-- Optional local draft fixture. No release, inventory or pricing is created.
begin;
insert into brigade.organizations(id,name) values('63a0e538-6156-5be8-b090-90cf71b2f74b','Local design studio') on conflict(id) do nothing;
insert into brigade.projects(id,org_id,slug,title) values('1bbb1573-d697-5d9c-b882-4cae01e7150e','63a0e538-6156-5be8-b090-90cf71b2f74b','brigade-barcelona','Brigade Barcelona') on conflict(id) do nothing;
insert into brigade.buildings(id,project_id,code,title,evidence,source_ref) values('16b14475-09fb-52ac-b858-5210bc138131','1bbb1573-d697-5d9c-b882-4cae01e7150e','development','Brigade Barcelona','verified','Brochure, pages 3 and 26') on conflict(project_id,code) do nothing;
insert into brigade.wings(id,project_id,building_id,code,title,evidence,source_ref) values('57e3d756-1dc4-519d-a7b4-dc84d248b986','1bbb1573-d697-5d9c-b882-4cae01e7150e','16b14475-09fb-52ac-b858-5210bc138131','A','Wing A','verified','Brochure apartment schedules, pages 17–23') on conflict(project_id,code) do nothing;
insert into brigade.wings(id,project_id,building_id,code,title,evidence,source_ref) values('8e07f84d-5b3e-53ff-95fc-6e786fb9b0c6','1bbb1573-d697-5d9c-b882-4cae01e7150e','16b14475-09fb-52ac-b858-5210bc138131','B','Wing B','verified','Brochure apartment schedules, pages 17–23') on conflict(project_id,code) do nothing;
insert into brigade.apartment_types(project_id,wing_id,code,title,bedrooms,has_study,total_sba_sqft,total_carpet_area_sqft,evidence,source_ref) values
('1bbb1573-d697-5d9c-b882-4cae01e7150e','57e3d756-1dc4-519d-a7b4-dc84d248b986','A1','3 BHK + study',3,true,3351,2256,'verified','Brochure, page 17'),
('1bbb1573-d697-5d9c-b882-4cae01e7150e','57e3d756-1dc4-519d-a7b4-dc84d248b986','A2','3 BHK',3,false,3031,2036,'verified','Brochure, page 17'),
('1bbb1573-d697-5d9c-b882-4cae01e7150e','57e3d756-1dc4-519d-a7b4-dc84d248b986','A3','3 BHK',3,false,2790,1873,'verified','Brochure, page 18'),
('1bbb1573-d697-5d9c-b882-4cae01e7150e','57e3d756-1dc4-519d-a7b4-dc84d248b986','A4','3 BHK',3,false,2790,1873,'verified','Brochure, page 18'),
('1bbb1573-d697-5d9c-b882-4cae01e7150e','57e3d756-1dc4-519d-a7b4-dc84d248b986','A5','3 BHK',3,false,2790,1873,'verified','Brochure, page 19'),
('1bbb1573-d697-5d9c-b882-4cae01e7150e','57e3d756-1dc4-519d-a7b4-dc84d248b986','A6','3 BHK',3,false,2993,1997,'verified','Brochure, page 19'),
('1bbb1573-d697-5d9c-b882-4cae01e7150e','57e3d756-1dc4-519d-a7b4-dc84d248b986','A7','3 BHK + study',3,true,3313,2222,'verified','Brochure, page 20'),
('1bbb1573-d697-5d9c-b882-4cae01e7150e','8e07f84d-5b3e-53ff-95fc-6e786fb9b0c6','B8','3 BHK',3,false,2857,1920,'verified','Brochure, page 20'),
('1bbb1573-d697-5d9c-b882-4cae01e7150e','8e07f84d-5b3e-53ff-95fc-6e786fb9b0c6','B9','3 BHK',3,false,2857,1920,'verified','Brochure, page 21'),
('1bbb1573-d697-5d9c-b882-4cae01e7150e','8e07f84d-5b3e-53ff-95fc-6e786fb9b0c6','B10','4 BHK',4,false,3764,2547,'verified','Brochure, page 21'),
('1bbb1573-d697-5d9c-b882-4cae01e7150e','8e07f84d-5b3e-53ff-95fc-6e786fb9b0c6','B11','4 BHK',4,false,3764,2547,'verified','Brochure, page 22'),
('1bbb1573-d697-5d9c-b882-4cae01e7150e','8e07f84d-5b3e-53ff-95fc-6e786fb9b0c6','B12','3 BHK',3,false,3081,2072,'verified','Brochure, page 22'),
('1bbb1573-d697-5d9c-b882-4cae01e7150e','8e07f84d-5b3e-53ff-95fc-6e786fb9b0c6','B14','3 BHK',3,false,3091,2076,'verified','Brochure, page 23') on conflict(project_id,code) do nothing;
commit;
