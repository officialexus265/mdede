-- M'dede Restaurant POS schema (Variation B — paper + desktop hybrid)
-- One restaurant per authenticated owner (user_id). Staff PINs are operational login.

create table if not exists restaurants (
  user_id text primary key,
  name text not null,
  address text not null default '',
  phone text not null default '',
  currency text not null default 'MWK',
  timezone text not null default 'Africa/Blantyre',
  tax_rate integer not null default 18,
  service_charge integer not null default 0,
  receipt_header text not null default '',
  receipt_footer text not null default 'Thank you for dining with us.',
  kitchen_printer text not null default 'browser',
  receipt_printer text not null default 'browser',
  next_order_number integer not null default 1,
  setup_complete boolean not null default false,
  sample_seeded boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists staff (
  id serial primary key,
  user_id text not null,
  name text not null,
  role text not null,
  pin_hash text not null,
  active boolean not null default true,
  can_close_payments boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists staff_user_id_idx on staff (user_id);
create unique index if not exists staff_pin_unique on staff (user_id, pin_hash);

create table if not exists staff_sessions (
  token text primary key,
  user_id text not null,
  staff_id integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists staff_sessions_user_idx on staff_sessions (user_id, staff_id);

create table if not exists dining_tables (
  id serial primary key,
  user_id text not null,
  name text not null,
  zone text not null default 'Dining',
  seats integer not null default 4,
  sort_order integer not null default 0,
  active boolean not null default true
);
create index if not exists dining_tables_user_idx on dining_tables (user_id);

create table if not exists categories (
  id serial primary key,
  user_id text not null,
  name text not null,
  kind text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);
create index if not exists categories_user_idx on categories (user_id);

create table if not exists menu_items (
  id serial primary key,
  user_id text not null,
  category_id integer not null,
  name text not null,
  description text not null default '',
  price integer not null,
  available boolean not null default true,
  sold_out boolean not null default false,
  is_special boolean not null default false,
  low_stock boolean not null default false,
  stock_note text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists menu_items_user_idx on menu_items (user_id);
create index if not exists menu_items_category_idx on menu_items (category_id);

create table if not exists modifiers (
  id serial primary key,
  user_id text not null,
  name text not null,
  required boolean not null default false,
  active boolean not null default true
);
create index if not exists modifiers_user_idx on modifiers (user_id);

create table if not exists modifier_options (
  id serial primary key,
  user_id text not null,
  modifier_id integer not null,
  name text not null,
  extra_price integer not null default 0,
  sort_order integer not null default 0
);
create index if not exists modifier_options_mod_idx on modifier_options (modifier_id);

create table if not exists item_modifiers (
  user_id text not null,
  item_id integer not null,
  modifier_id integer not null,
  primary key (item_id, modifier_id)
);

create table if not exists payment_methods (
  id serial primary key,
  user_id text not null,
  name text not null,
  kind text not null,
  active boolean not null default true,
  sort_order integer not null default 0
);
create index if not exists payment_methods_user_idx on payment_methods (user_id);

create table if not exists shifts (
  id serial primary key,
  user_id text not null,
  opened_by_staff_id integer,
  opened_by_name text not null default '',
  closed_by_staff_id integer,
  closed_by_name text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  declared_cash integer,
  notes text not null default '',
  status text not null default 'open'
);
create index if not exists shifts_user_idx on shifts (user_id, status);

create table if not exists orders (
  id serial primary key,
  user_id text not null,
  order_number integer not null,
  table_id integer,
  table_name text not null,
  waiter_staff_id integer,
  waiter_name text not null,
  status text not null default 'open',
  notes text not null default '',
  discount_type text,
  discount_value integer not null default 0,
  discount_reason text not null default '',
  discount_by text not null default '',
  tax_rate integer not null default 0,
  service_charge integer not null default 0,
  subtotal integer not null default 0,
  discount_amount integer not null default 0,
  tax_amount integer not null default 0,
  service_amount integer not null default 0,
  total integer not null default 0,
  shift_id integer,
  entered_at timestamptz not null default now(),
  paid_at timestamptz,
  kitchen_printed_at timestamptz,
  kitchen_print_count integer not null default 0,
  void_reason text not null default '',
  voided_by text not null default '',
  voided_at timestamptz
);
create index if not exists orders_user_idx on orders (user_id);
create index if not exists orders_status_idx on orders (user_id, status);
create unique index if not exists orders_number_unique on orders (user_id, order_number);
create index if not exists orders_table_idx on orders (user_id, table_id, status);

create table if not exists order_items (
  id serial primary key,
  user_id text not null,
  order_id integer not null,
  menu_item_id integer,
  name text not null,
  category_name text not null default '',
  kind text not null default 'food',
  quantity integer not null,
  unit_price integer not null,
  notes text not null default '',
  kitchen_sent boolean not null default false,
  voided boolean not null default false,
  void_reason text not null default '',
  voided_by text not null default '',
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_user_idx on order_items (user_id);

create table if not exists order_item_modifiers (
  id serial primary key,
  user_id text not null,
  order_item_id integer not null,
  name text not null,
  extra_price integer not null default 0
);
create index if not exists order_item_mods_item_idx on order_item_modifiers (order_item_id);

create table if not exists payments (
  id serial primary key,
  user_id text not null,
  order_id integer not null,
  method_id integer,
  method_name text not null,
  method_kind text not null default 'other',
  amount integer not null,
  tendered integer not null default 0,
  change_amount integer not null default 0,
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists payments_order_idx on payments (order_id);
create index if not exists payments_user_idx on payments (user_id);

create table if not exists order_events (
  id serial primary key,
  user_id text not null,
  order_id integer not null,
  event_type text not null,
  detail text not null default '',
  staff_id integer,
  staff_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on order_events (order_id);
