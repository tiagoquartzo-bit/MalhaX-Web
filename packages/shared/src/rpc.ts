import type { StopStatus, StopType } from "./index";

export type CreateOrderPackage = {
  description?: string | null;
  /** Cada item representa um volume físico individual. */
  quantity?: 1;
  weight_kg?: number | null;
};

export type OrderStopDraft = {
  stop_type: StopType;
  address_label: string;
  address_line: string;
  address_extra?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  instructions?: string | null;
  /** Índices baseados em 1 para os volumes de p_packages. */
  package_indexes: number[];
};

export type CreateOrderWithStopsArgs = {
  p_request_id: string;
  p_client_id: string;
  p_packages: CreateOrderPackage[];
  p_order_stops: OrderStopDraft[];
  p_external_reference?: string | null;
  p_instructions?: string | null;
  p_freight_value?: number | null;
  p_driver_payout?: number | null;
};

export type DispatchTripFromOrderStopsArgs = {
  p_request_id: string;
  p_driver_id: string;
  p_vehicle_id: string | null;
  p_planned_start_at: string | null;
  /** A ordem do array define a sequência da viagem. */
  p_order_stop_ids: string[];
};

export type AcceptTripArgs = { p_trip_id: string };

export type RecordStopEventArgs = {
  p_stop_id: string;
  /** UUID persistido durante retries da mesma ação. */
  p_device_event_id: string;
  p_to_status: StopStatus;
  p_reason?: string | null;
  p_device_captured_at?: string | null;
  p_latitude?: number | null;
  p_longitude?: number | null;
  p_location_accuracy_meters?: number | null;
};

export type RegisterDeliveryProofArgs = {
  p_stop_id: string;
  p_storage_path: string;
  p_recipient_name: string;
  p_captured_at_device: string;
  p_latitude: number;
  p_longitude: number;
  p_location_accuracy_meters: number;
  /** Null indica evidência que cobre a parada inteira. */
  p_package_id?: string | null;
};

export type SetDriverStatusArgs = {
  p_driver_id: string;
  p_new_status: "active" | "suspended" | "inactive" | "rejected";
  p_reason: string;
};
