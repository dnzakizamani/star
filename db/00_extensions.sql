-- 00_extensions.sql
-- Extensions required before the schema is created.
-- btree_gist : GiST operator classes for uuid/equality, needed by the
--              tutor no-overlap EXCLUDE constraint on lessons.
-- pgcrypto   : gen_random_uuid() and crypt()/gen_salt() for seeded passwords.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;
