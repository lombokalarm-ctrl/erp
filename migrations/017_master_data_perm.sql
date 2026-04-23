insert into permissions(code, description) values ('master_data:read', 'Akses Menu Master Data') on conflict do nothing;

-- Optionally, grant this to Admin role so it doesn't break for the admin
insert into role_permissions(role_id, permission_id)
select r.id, p.id
from roles r, permissions p
where r.name = 'Admin' and p.code = 'master_data:read'
on conflict do nothing;
