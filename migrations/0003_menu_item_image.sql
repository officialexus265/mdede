-- Photo for a menu item (meal/beverage), shown on the item card and order picker.
-- Stores the secure_url returned by Cloudinary after upload (see
-- src/lib/server/cloudinary.server.ts / uploadMenuItemImage) — just a short
-- link, not the image itself.
alter table menu_items add column if not exists image_url text not null default '';
