import type { ItemKind, PaymentKind, StaffRole } from "@/lib/types";

export type SeedStaff = { name: string; role: StaffRole; pin: string; canClosePayments: boolean };
export type SeedTable = { name: string; zone: string; seats: number };
export type SeedCategory = { name: string; kind: ItemKind; items: SeedItem[] };
export type SeedItem = {
  name: string;
  description: string;
  price: number;
  isSpecial?: boolean;
  lowStock?: boolean;
  stockNote?: string;
  modifierNames?: string[];
};
export type SeedModifier = {
  name: string;
  required: boolean;
  options: { name: string; extraPrice: number }[];
};

export const SAMPLE_STAFF: SeedStaff[] = [
  { name: "Nakato Amina", role: "waiter", pin: "1111", canClosePayments: false },
  { name: "Okello Joseph", role: "waiter", pin: "2222", canClosePayments: true },
  { name: "Namuli Grace", role: "cashier", pin: "3333", canClosePayments: true },
  { name: "Kintu David", role: "manager", pin: "1234", canClosePayments: true },
  { name: "System Admin", role: "admin", pin: "9999", canClosePayments: true },
];

export const SAMPLE_TABLES: SeedTable[] = [
  { name: "T1", zone: "Dining", seats: 2 },
  { name: "T2", zone: "Dining", seats: 4 },
  { name: "T3", zone: "Dining", seats: 4 },
  { name: "T4", zone: "Dining", seats: 4 },
  { name: "T5", zone: "Dining", seats: 6 },
  { name: "T6", zone: "Dining", seats: 6 },
  { name: "T7", zone: "Dining", seats: 4 },
  { name: "T8", zone: "Dining", seats: 4 },
  { name: "T9", zone: "Patio", seats: 4 },
  { name: "T10", zone: "Patio", seats: 4 },
  { name: "T11", zone: "Patio", seats: 6 },
  { name: "T12", zone: "Patio", seats: 2 },
  { name: "Bar 1", zone: "Bar", seats: 2 },
  { name: "Bar 2", zone: "Bar", seats: 2 },
  { name: "Bar 3", zone: "Bar", seats: 2 },
  { name: "Bar 4", zone: "Bar", seats: 2 },
  { name: "Takeaway", zone: "Counter", seats: 1 },
];

export const SAMPLE_MODIFIERS: SeedModifier[] = [
  {
    name: "Cooking",
    required: true,
    options: [
      { name: "Rare", extraPrice: 0 },
      { name: "Medium rare", extraPrice: 0 },
      { name: "Medium", extraPrice: 0 },
      { name: "Medium well", extraPrice: 0 },
      { name: "Well done", extraPrice: 0 },
    ],
  },
  {
    name: "Size",
    required: false,
    options: [
      { name: "Regular", extraPrice: 0 },
      { name: "Large", extraPrice: 4000 },
    ],
  },
  {
    name: "Extras",
    required: false,
    options: [
      { name: "Extra sauce", extraPrice: 2000 },
      { name: "Extra cheese", extraPrice: 3000 },
      { name: "Extra meat", extraPrice: 8000 },
      { name: "Side of chips", extraPrice: 6000 },
    ],
  },
  {
    name: "Removals",
    required: false,
    options: [
      { name: "No onion", extraPrice: 0 },
      { name: "No tomato", extraPrice: 0 },
      { name: "No chilli", extraPrice: 0 },
      { name: "No peanuts", extraPrice: 0 },
    ],
  },
  {
    name: "Drink prep",
    required: false,
    options: [
      { name: "No ice", extraPrice: 0 },
      { name: "Extra ice", extraPrice: 0 },
      { name: "Lemon wedge", extraPrice: 0 },
      { name: "Mint", extraPrice: 0 },
    ],
  },
];

const GRILL = ["Cooking", "Extras", "Removals"];
const FOOD = ["Extras", "Removals"];
const DRINK = ["Size", "Drink prep"];
const SPIRIT = ["Drink prep"];

export const SAMPLE_CATEGORIES: SeedCategory[] = [
  {
    name: "Starters",
    kind: "food",
    items: [
      { name: "Samosas (3)", description: "Crisp pastry, spiced beef or vegetable", price: 8000, modifierNames: FOOD },
      { name: "Chicken wings", description: "Sticky chilli or lemon pepper", price: 16000, modifierNames: FOOD },
      { name: "Rolex", description: "Chapati, egg, cabbage, tomato", price: 10000, modifierNames: FOOD },
      { name: "Avocado salad", description: "Garden greens, lime, sesame", price: 14000, modifierNames: FOOD },
      { name: "Soup of the day", description: "Ask the kitchen", price: 12000, isSpecial: true, modifierNames: FOOD },
    ],
  },
  {
    name: "Main Courses",
    kind: "food",
    items: [
      { name: "Chicken luwombo", description: "Steamed groundnut stew in banana leaf", price: 28000, modifierNames: FOOD },
      { name: "Beef stew & matooke", description: "Slow beef, steamed banana", price: 30000, modifierNames: FOOD },
      { name: "Grilled tilapia", description: "Whole fish, kachumbari, chips", price: 32000, modifierNames: FOOD },
      { name: "Pilau rice & stew", description: "Spiced rice, choice of beef or chicken", price: 24000, modifierNames: FOOD },
      { name: "Goat luwombo", description: "Sunday classic, peanut sauce", price: 34000, isSpecial: true, modifierNames: FOOD },
      { name: "Vegetable curry", description: "Coconut, garden vegetables, rice", price: 22000, modifierNames: FOOD },
    ],
  },
  {
    name: "Grills",
    kind: "food",
    items: [
      { name: "Nyama choma", description: "Charcoal goat, kachumbari, ugali", price: 36000, modifierNames: GRILL },
      { name: "Mixed grill", description: "Beef, chicken, sausage, chips", price: 42000, modifierNames: GRILL },
      { name: "Chicken skewers", description: "Three sticks, peanut dip", price: 26000, modifierNames: GRILL },
      { name: "Pork ribs", description: "Half rack, house glaze", price: 38000, modifierNames: GRILL },
      { name: "Beef fillet", description: "200g, butter sauce", price: 40000, modifierNames: GRILL },
    ],
  },
  {
    name: "Desserts",
    kind: "food",
    items: [
      { name: "Mandazi & honey", description: "Warm doughnuts, cinnamon", price: 8000 },
      { name: "Passion mousse", description: "Local passion fruit", price: 12000 },
      { name: "Vanilla ice cream", description: "Two scoops", price: 10000 },
    ],
  },
  {
    name: "Soft Drinks",
    kind: "drink",
    items: [
      { name: "Coca-Cola", description: "330ml", price: 4000, modifierNames: DRINK },
      { name: "Sprite", description: "330ml", price: 4000, modifierNames: DRINK },
      { name: "Stoney Ginger", description: "330ml", price: 4000, modifierNames: DRINK },
      { name: "Still water", description: "500ml", price: 3000, modifierNames: DRINK },
      { name: "Passion juice", description: "Fresh pressed", price: 8000, isSpecial: true, modifierNames: DRINK },
      { name: "Mango juice", description: "Fresh pressed", price: 8000, modifierNames: DRINK, lowStock: true, stockNote: "Last crate" },
    ],
  },
  {
    name: "Beers",
    kind: "drink",
    items: [
      { name: "Nile Special", description: "500ml", price: 8000, modifierNames: DRINK },
      { name: "Club Pilsner", description: "500ml", price: 8000, modifierNames: DRINK },
      { name: "Bell Lager", description: "500ml", price: 8000, modifierNames: DRINK },
      { name: "Guinness", description: "500ml", price: 10000, modifierNames: DRINK },
      { name: "White Cap", description: "500ml", price: 9000, modifierNames: DRINK, lowStock: true, stockNote: "6 left" },
    ],
  },
  {
    name: "Wines",
    kind: "drink",
    items: [
      { name: "House red (glass)", description: "South African blend", price: 14000, modifierNames: DRINK },
      { name: "House white (glass)", description: "Crisp Chenin", price: 14000, modifierNames: DRINK },
      { name: "Sparkling (glass)", description: "Brut", price: 18000, modifierNames: DRINK },
    ],
  },
  {
    name: "Spirits",
    kind: "drink",
    items: [
      { name: "Uganda Waragi", description: "Single / mixer extra", price: 8000, modifierNames: SPIRIT },
      { name: "Jameson", description: "Single", price: 16000, modifierNames: SPIRIT },
      { name: "Smirnoff Vodka", description: "Single", price: 12000, modifierNames: SPIRIT },
      { name: "Gordon's Gin", description: "Single", price: 14000, modifierNames: SPIRIT },
    ],
  },
  {
    name: "Cocktails",
    kind: "drink",
    items: [
      { name: "Dawa", description: "Vodka, honey, lime, ginger", price: 18000, modifierNames: DRINK },
      { name: "Passion mojito", description: "Rum, mint, passion", price: 18000, modifierNames: DRINK },
      { name: "Rum punch", description: "Dark rum, pineapple, spice", price: 18000, modifierNames: DRINK },
      { name: "Virgin dawa", description: "Honey, lime, ginger — no alcohol", price: 10000, modifierNames: DRINK },
    ],
  },
];

export const SAMPLE_PAYMENTS: { name: string; kind: PaymentKind }[] = [
  { name: "Cash", kind: "cash" },
  { name: "Mobile Money", kind: "mobile" },
  { name: "Visa / Mastercard", kind: "card" },
  { name: "Bank Transfer", kind: "transfer" },
  { name: "Other", kind: "other" },
];
