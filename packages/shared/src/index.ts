export const STOP_TYPES = ["pickup", "delivery", "return_to_base"] as const;
export type StopType = (typeof STOP_TYPES)[number];

export const STOP_STATUSES = [
  "pending",
  "arrived",
  "in_progress",
  "completed",
  "failed",
  "skipped",
] as const;
export type StopStatus = (typeof STOP_STATUSES)[number];

export const TRIP_STATUSES = [
  "draft",
  "assigned",
  "accepted",
  "in_progress",
  "completed",
  "paused",
  "cancelled",
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export type Coordinates = Readonly<{
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
}>;
export * from "./rpc";
