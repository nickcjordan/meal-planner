export type EntityType =
  | "RECIPE"
  | "TAG"
  | "SESSION"
  | "WEEK"
  | "MEAL"
  | "FEEDBACK"
  | "HISTORY"
  | "SHOPLIST"
  | "GROCERYLIST"
  | "PANTRY"
  | "STAPLE"
  | "PREFERENCE"
  | "INVENTORY"
  | "MEMBER"
  | "ADAPTATION"
  | "HEBCONFIG";

export interface DynamoDBRecord {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  entityType: EntityType;
}
