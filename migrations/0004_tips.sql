-- A tip recorded at payment time (staff mark change as a tip instead of
-- handing it back). Split 50/50 between the waiter who served the order and
-- the kitchen team as a whole. Snapshots waiter_name / staff_name so the
-- record stays readable even if that staff member is later edited or
-- deleted.
create table if not exists tips (
  id serial primary key,
  user_id text not null,
  order_id integer not null,
  order_number integer not null,
  waiter_staff_id integer,
  waiter_name text not null,
  amount integer not null,
  waiter_share integer not null,
  kitchen_share integer not null,
  kitchen_recipient_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists tips_user_idx on tips (user_id, created_at);
create index if not exists tips_waiter_idx on tips (user_id, waiter_staff_id);

-- The kitchen half of a tip, split evenly among whoever was an active
-- "kitchen" staff member at the moment the tip was recorded (not
-- recalculated later), so headcount changes during the month don't distort
-- tips already earned.
create table if not exists tip_kitchen_splits (
  id serial primary key,
  tip_id integer not null references tips(id) on delete cascade,
  user_id text not null,
  staff_id integer not null,
  staff_name text not null,
  amount integer not null
);
create index if not exists tip_kitchen_splits_tip_idx on tip_kitchen_splits (tip_id);
create index if not exists tip_kitchen_splits_staff_idx on tip_kitchen_splits (user_id, staff_id);
