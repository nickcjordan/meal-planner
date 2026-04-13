export interface WeeklyAdItem {
  id: number;
  name: string;
  brand?: string;
  description?: string;
  price?: string;
  discount?: number;
  imageUrl?: string;
  validFrom: string;
  validTo: string;
}

export interface WeeklyAdFlyer {
  id: number;
  name: string;
  categories: string;
  validFrom: string;
  validTo: string;
}

export interface WeeklyAdData {
  flyerId: number;
  flyerName: string;
  merchantName: string;
  validFrom: string;
  validTo: string;
  items: WeeklyAdItem[];
  availableFlyers: WeeklyAdFlyer[];
}
