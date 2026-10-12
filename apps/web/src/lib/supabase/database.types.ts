
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"created_at": string,"entity_id": string | null,"entity_table": string,"id": string,"metadata": NonNullable<Json>,"reason": string | null
                  }
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_table": string,"id"?: string,"metadata"?: NonNullable<Json>,"reason"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_table"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"cargo_transfer_events": {
                  Row: {
                    "actor_user_id": string,"details": string | null,"event_type": string,"id": string,"latitude": number | null,"longitude": number | null,"occurred_at": string,"transfer_id": string
                  }
                  Insert: {
                    "actor_user_id": string,"details"?: string | null,"event_type": string,"id"?: string,"latitude"?: number | null,"longitude"?: number | null,"occurred_at"?: string,"transfer_id": string
                  }
                  Update: {
                    "actor_user_id"?: string,"details"?: string | null,"event_type"?: string,"id"?: string,"latitude"?: number | null,"longitude"?: number | null,"occurred_at"?: string,"transfer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cargo_transfer_events_transfer_id_fkey"
      columns: ["transfer_id"]
isOneToOne: false
      referencedRelation: "cargo_transfers"
      referencedColumns: ["id"]
    }
                  ]
                },"cargo_transfer_items": {
                  Row: {
                    "package_id": string,"transfer_id": string
                  }
                  Insert: {
                    "package_id": string,"transfer_id": string
                  }
                  Update: {
                    "package_id"?: string,"transfer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cargo_transfer_items_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "packages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cargo_transfer_items_transfer_id_fkey"
      columns: ["transfer_id"]
isOneToOne: false
      referencedRelation: "cargo_transfers"
      referencedColumns: ["id"]
    }
                  ]
                },"cargo_transfers": {
                  Row: {
                    "created_at": string,"destination_trip_id": string,"details": string,"id": string,"organization_id": string,"qr_expires_at": string | null,"qr_token_hash": string | null,"qr_used_at": string | null,"reason": string,"receiver_confirmed_at": string | null,"receiver_confirmed_by": string | null,"requested_at": string,"requested_by": string,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"source_confirmed_at": string | null,"source_confirmed_by": string | null,"source_trip_id": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"destination_trip_id": string,"details": string,"id"?: string,"organization_id": string,"qr_expires_at"?: string | null,"qr_token_hash"?: string | null,"qr_used_at"?: string | null,"reason": string,"receiver_confirmed_at"?: string | null,"receiver_confirmed_by"?: string | null,"requested_at"?: string,"requested_by": string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"source_confirmed_at"?: string | null,"source_confirmed_by"?: string | null,"source_trip_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"destination_trip_id"?: string,"details"?: string,"id"?: string,"organization_id"?: string,"qr_expires_at"?: string | null,"qr_token_hash"?: string | null,"qr_used_at"?: string | null,"reason"?: string,"receiver_confirmed_at"?: string | null,"receiver_confirmed_by"?: string | null,"requested_at"?: string,"requested_by"?: string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"source_confirmed_at"?: string | null,"source_confirmed_by"?: string | null,"source_trip_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cargo_transfers_destination_trip_id_fkey"
      columns: ["destination_trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cargo_transfers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cargo_transfers_source_trip_id_fkey"
      columns: ["source_trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "active": boolean,"contact_name": string | null,"created_at": string,"creation_request_fingerprint": string | null,"creation_request_id": string | null,"email": string | null,"id": string,"name": string,"organization_id": string,"phone": string | null,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"contact_name"?: string | null,"created_at"?: string,"creation_request_fingerprint"?: string | null,"creation_request_id"?: string | null,"email"?: string | null,"id"?: string,"name": string,"organization_id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"contact_name"?: string | null,"created_at"?: string,"creation_request_fingerprint"?: string | null,"creation_request_id"?: string | null,"email"?: string | null,"id"?: string,"name"?: string,"organization_id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_proofs": {
                  Row: {
                    "captured_at_device": string | null,"created_at": string,"id": string,"latitude": number | null,"location_accuracy_meters": number | null,"location_captured_at_device": string | null,"location_photo_path": string | null,"longitude": number | null,"package_id": string | null,"received_at_server": string,"recipient_name": string | null,"stop_id": string,"storage_path": string,"uploaded_by": string | null
                  }
                  Insert: {
                    "captured_at_device"?: string | null,"created_at"?: string,"id"?: string,"latitude"?: number | null,"location_accuracy_meters"?: number | null,"location_captured_at_device"?: string | null,"location_photo_path"?: string | null,"longitude"?: number | null,"package_id"?: string | null,"received_at_server"?: string,"recipient_name"?: string | null,"stop_id": string,"storage_path": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "captured_at_device"?: string | null,"created_at"?: string,"id"?: string,"latitude"?: number | null,"location_accuracy_meters"?: number | null,"location_captured_at_device"?: string | null,"location_photo_path"?: string | null,"longitude"?: number | null,"package_id"?: string | null,"received_at_server"?: string,"recipient_name"?: string | null,"stop_id"?: string,"storage_path"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "delivery_proofs_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "packages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_proofs_stop_id_fkey"
      columns: ["stop_id"]
isOneToOne: false
      referencedRelation: "trip_stops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_proofs_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"driver_documents": {
                  Row: {
                    "created_at": string,"document_type": string,"driver_id": string,"expires_at": string | null,"id": string,"review_status": string,"reviewed_at": string | null,"reviewed_by": string | null,"storage_path": string
                  }
                  Insert: {
                    "created_at"?: string,"document_type": string,"driver_id": string,"expires_at"?: string | null,"id"?: string,"review_status"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"storage_path": string
                  }
                  Update: {
                    "created_at"?: string,"document_type"?: string,"driver_id"?: string,"expires_at"?: string | null,"id"?: string,"review_status"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_documents_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_documents_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"drivers": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"created_at": string,"id": string,"notes": string | null,"organization_id": string,"pix_key": string | null,"profile_id": string | null,"status": Database["public"]['Enums']["driver_status"],"updated_at": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"id"?: string,"notes"?: string | null,"organization_id": string,"pix_key"?: string | null,"profile_id"?: string | null,"status"?: Database["public"]['Enums']["driver_status"],"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"id"?: string,"notes"?: string | null,"organization_id"?: string,"pix_key"?: string | null,"profile_id"?: string | null,"status"?: Database["public"]['Enums']["driver_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "drivers_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "drivers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "drivers_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"incidents": {
                  Row: {
                    "category": string,"created_at": string,"description": string,"id": string,"priority": string,"reported_by": string | null,"resolution": string | null,"resolved_at": string | null,"resolved_by": string | null,"stop_id": string | null,"trip_id": string
                  }
                  Insert: {
                    "category": string,"created_at"?: string,"description": string,"id"?: string,"priority"?: string,"reported_by"?: string | null,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"stop_id"?: string | null,"trip_id": string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"description"?: string,"id"?: string,"priority"?: string,"reported_by"?: string | null,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"stop_id"?: string | null,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "incidents_reported_by_fkey"
      columns: ["reported_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_stop_id_fkey"
      columns: ["stop_id"]
isOneToOne: false
      referencedRelation: "trip_stops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"order_stop_packages": {
                  Row: {
                    "created_at": string,"expected_action": string,"order_id": string,"order_stop_id": string,"package_id": string
                  }
                  Insert: {
                    "created_at"?: string,"expected_action": string,"order_id": string,"order_stop_id": string,"package_id": string
                  }
                  Update: {
                    "created_at"?: string,"expected_action"?: string,"order_id"?: string,"order_stop_id"?: string,"package_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_stop_packages_order_stop_id_order_id_fkey"
      columns: ["order_stop_id","order_id"]
isOneToOne: false
      referencedRelation: "order_stops"
      referencedColumns: ["id","order_id"]
    },{
      foreignKeyName: "order_stop_packages_package_id_order_id_fkey"
      columns: ["package_id","order_id"]
isOneToOne: false
      referencedRelation: "packages"
      referencedColumns: ["id","order_id"]
    }
                  ]
                },"order_stops": {
                  Row: {
                    "address_extra": string | null,"address_label": string,"address_line": string,"city": string | null,"contact_name": string | null,"contact_phone": string | null,"created_at": string,"district": string | null,"id": string,"instructions": string | null,"latitude": number | null,"longitude": number | null,"order_id": string,"postal_code": string | null,"state": string | null,"status": Database["public"]['Enums']["order_stop_status"],"stop_type": Database["public"]['Enums']["stop_type"],"updated_at": string
                  }
                  Insert: {
                    "address_extra"?: string | null,"address_label": string,"address_line": string,"city"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"district"?: string | null,"id"?: string,"instructions"?: string | null,"latitude"?: number | null,"longitude"?: number | null,"order_id": string,"postal_code"?: string | null,"state"?: string | null,"status"?: Database["public"]['Enums']["order_stop_status"],"stop_type": Database["public"]['Enums']["stop_type"],"updated_at"?: string
                  }
                  Update: {
                    "address_extra"?: string | null,"address_label"?: string,"address_line"?: string,"city"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"district"?: string | null,"id"?: string,"instructions"?: string | null,"latitude"?: number | null,"longitude"?: number | null,"order_id"?: string,"postal_code"?: string | null,"state"?: string | null,"status"?: Database["public"]['Enums']["order_stop_status"],"stop_type"?: Database["public"]['Enums']["stop_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_stops_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "client_id": string | null,"created_at": string,"created_by": string | null,"creation_request_fingerprint": string | null,"creation_request_id": string | null,"currency": string,"driver_payout": number | null,"external_reference": string | null,"freight_value": number,"id": string,"instructions": string | null,"order_number": number,"organization_id": string,"status": Database["public"]['Enums']["order_status"],"updated_at": string
                  }
                  Insert: {
                    "client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"creation_request_fingerprint"?: string | null,"creation_request_id"?: string | null,"currency"?: string,"driver_payout"?: number | null,"external_reference"?: string | null,"freight_value"?: number,"id"?: string,"instructions"?: string | null,"order_number"?: never,"organization_id": string,"status"?: Database["public"]['Enums']["order_status"],"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"creation_request_fingerprint"?: string | null,"creation_request_id"?: string | null,"currency"?: string,"driver_payout"?: number | null,"external_reference"?: string | null,"freight_value"?: number,"id"?: string,"instructions"?: string | null,"order_number"?: never,"organization_id"?: string,"status"?: Database["public"]['Enums']["order_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_member_roles": {
                  Row: {
                    "created_at": string,"granted_by": string | null,"organization_id": string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"granted_by"?: string | null,"organization_id": string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"granted_by"?: string | null,"organization_id"?: string,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_member_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_member_roles_organization_id_user_id_fkey"
      columns: ["organization_id","user_id"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["organization_id","user_id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "created_at": string,"organization_id": string,"status": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"organization_id": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"slug": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"slug": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"slug"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"packages": {
                  Row: {
                    "active_cargo_transfer_id": string | null,"created_at": string,"custodian_trip_id": string | null,"description": string | null,"id": string,"order_id": string,"package_code": string,"quantity": number,"status": Database["public"]['Enums']["package_status"],"updated_at": string,"weight_kg": number | null
                  }
                  Insert: {
                    "active_cargo_transfer_id"?: string | null,"created_at"?: string,"custodian_trip_id"?: string | null,"description"?: string | null,"id"?: string,"order_id": string,"package_code"?: string,"quantity"?: number,"status"?: Database["public"]['Enums']["package_status"],"updated_at"?: string,"weight_kg"?: number | null
                  }
                  Update: {
                    "active_cargo_transfer_id"?: string | null,"created_at"?: string,"custodian_trip_id"?: string | null,"description"?: string | null,"id"?: string,"order_id"?: string,"package_code"?: string,"quantity"?: number,"status"?: Database["public"]['Enums']["package_status"],"updated_at"?: string,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "packages_active_cargo_transfer_id_fkey"
      columns: ["active_cargo_transfer_id"]
isOneToOne: false
      referencedRelation: "cargo_transfers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "packages_custodian_trip_id_fkey"
      columns: ["custodian_trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "packages_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"full_name": string,"id": string,"phone": string | null,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"full_name": string,"id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"full_name"?: string,"id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stop_events": {
                  Row: {
                    "actor_user_id": string | null,"device_captured_at": string | null,"device_event_id": string,"event_type": string,"from_status": Database["public"]['Enums']["stop_status"] | null,"id": string,"latitude": number | null,"location_accuracy_meters": number | null,"longitude": number | null,"reason": string | null,"server_received_at": string,"stop_id": string,"to_status": Database["public"]['Enums']["stop_status"] | null
                  }
                  Insert: {
                    "actor_user_id"?: string | null,"device_captured_at"?: string | null,"device_event_id": string,"event_type": string,"from_status"?: Database["public"]['Enums']["stop_status"] | null,"id"?: string,"latitude"?: number | null,"location_accuracy_meters"?: number | null,"longitude"?: number | null,"reason"?: string | null,"server_received_at"?: string,"stop_id": string,"to_status"?: Database["public"]['Enums']["stop_status"] | null
                  }
                  Update: {
                    "actor_user_id"?: string | null,"device_captured_at"?: string | null,"device_event_id"?: string,"event_type"?: string,"from_status"?: Database["public"]['Enums']["stop_status"] | null,"id"?: string,"latitude"?: number | null,"location_accuracy_meters"?: number | null,"longitude"?: number | null,"reason"?: string | null,"server_received_at"?: string,"stop_id"?: string,"to_status"?: Database["public"]['Enums']["stop_status"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stop_events_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stop_events_stop_id_fkey"
      columns: ["stop_id"]
isOneToOne: false
      referencedRelation: "trip_stops"
      referencedColumns: ["id"]
    }
                  ]
                },"stop_orders": {
                  Row: {
                    "order_id": string,"stop_id": string
                  }
                  Insert: {
                    "order_id": string,"stop_id": string
                  }
                  Update: {
                    "order_id"?: string,"stop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stop_orders_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stop_orders_stop_id_fkey"
      columns: ["stop_id"]
isOneToOne: false
      referencedRelation: "trip_stops"
      referencedColumns: ["id"]
    }
                  ]
                },"stop_packages": {
                  Row: {
                    "expected_action": string,"package_id": string,"stop_id": string
                  }
                  Insert: {
                    "expected_action": string,"package_id": string,"stop_id": string
                  }
                  Update: {
                    "expected_action"?: string,"package_id"?: string,"stop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stop_packages_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "packages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stop_packages_stop_id_fkey"
      columns: ["stop_id"]
isOneToOne: false
      referencedRelation: "trip_stops"
      referencedColumns: ["id"]
    }
                  ]
                },"stop_status_transitions": {
                  Row: {
                    "from_status": Database["public"]['Enums']["stop_status"],"to_status": Database["public"]['Enums']["stop_status"]
                  }
                  Insert: {
                    "from_status": Database["public"]['Enums']["stop_status"],"to_status": Database["public"]['Enums']["stop_status"]
                  }
                  Update: {
                    "from_status"?: Database["public"]['Enums']["stop_status"],"to_status"?: Database["public"]['Enums']["stop_status"]
                  }
                  Relationships: [
                    
                  ]
                },"support_messages": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"sender_user_id": string,"thread_id": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"sender_user_id": string,"thread_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"sender_user_id"?: string,"thread_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_messages_sender_user_id_fkey"
      columns: ["sender_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_messages_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "support_threads"
      referencedColumns: ["id"]
    }
                  ]
                },"support_threads": {
                  Row: {
                    "close_reason": string | null,"closed_at": string | null,"closed_by_user_id": string | null,"created_at": string,"driver_id": string,"id": string,"organization_id": string,"status": string,"subject": string,"trip_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "close_reason"?: string | null,"closed_at"?: string | null,"closed_by_user_id"?: string | null,"created_at"?: string,"driver_id": string,"id"?: string,"organization_id": string,"status"?: string,"subject": string,"trip_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "close_reason"?: string | null,"closed_at"?: string | null,"closed_by_user_id"?: string | null,"created_at"?: string,"driver_id"?: string,"id"?: string,"organization_id"?: string,"status"?: string,"subject"?: string,"trip_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_threads_closed_by_user_id_fkey"
      columns: ["closed_by_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_threads_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_threads_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_threads_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"tracking_positions": {
                  Row: {
                    "accuracy_meters": number | null,"captured_at_device": string,"device_event_id": string,"driver_id": string,"id": string,"latitude": number,"longitude": number,"received_at_server": string,"trip_id": string
                  }
                  Insert: {
                    "accuracy_meters"?: number | null,"captured_at_device": string,"device_event_id": string,"driver_id": string,"id"?: string,"latitude": number,"longitude": number,"received_at_server"?: string,"trip_id": string
                  }
                  Update: {
                    "accuracy_meters"?: number | null,"captured_at_device"?: string,"device_event_id"?: string,"driver_id"?: string,"id"?: string,"latitude"?: number,"longitude"?: number,"received_at_server"?: string,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tracking_positions_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tracking_positions_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trip_stops": {
                  Row: {
                    "address_extra": string | null,"address_label": string,"address_line": string,"arrived_at": string | null,"attempt_number": number,"city": string | null,"completed_at": string | null,"contact_name": string | null,"contact_phone": string | null,"district": string | null,"failure_reason": string | null,"id": string,"instructions": string | null,"latitude": number | null,"longitude": number | null,"planned_at": string | null,"postal_code": string | null,"sequence_number": number,"source_order_stop_id": string | null,"state": string | null,"status": Database["public"]['Enums']["stop_status"],"stop_type": Database["public"]['Enums']["stop_type"],"trip_id": string
                  }
                  Insert: {
                    "address_extra"?: string | null,"address_label": string,"address_line": string,"arrived_at"?: string | null,"attempt_number"?: number,"city"?: string | null,"completed_at"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"district"?: string | null,"failure_reason"?: string | null,"id"?: string,"instructions"?: string | null,"latitude"?: number | null,"longitude"?: number | null,"planned_at"?: string | null,"postal_code"?: string | null,"sequence_number": number,"source_order_stop_id"?: string | null,"state"?: string | null,"status"?: Database["public"]['Enums']["stop_status"],"stop_type": Database["public"]['Enums']["stop_type"],"trip_id": string
                  }
                  Update: {
                    "address_extra"?: string | null,"address_label"?: string,"address_line"?: string,"arrived_at"?: string | null,"attempt_number"?: number,"city"?: string | null,"completed_at"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"district"?: string | null,"failure_reason"?: string | null,"id"?: string,"instructions"?: string | null,"latitude"?: number | null,"longitude"?: number | null,"planned_at"?: string | null,"postal_code"?: string | null,"sequence_number"?: number,"source_order_stop_id"?: string | null,"state"?: string | null,"status"?: Database["public"]['Enums']["stop_status"],"stop_type"?: Database["public"]['Enums']["stop_type"],"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_stops_source_order_stop_id_fkey"
      columns: ["source_order_stop_id"]
isOneToOne: false
      referencedRelation: "order_stops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trip_stops_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "assigned_by": string | null,"completed_at": string | null,"created_at": string,"dispatch_request_fingerprint": string | null,"dispatch_request_id": string | null,"driver_id": string,"id": string,"organization_id": string,"planned_start_at": string | null,"started_at": string | null,"status": Database["public"]['Enums']["trip_status"],"trip_number": number,"updated_at": string,"vehicle_id": string | null
                  }
                  Insert: {
                    "assigned_by"?: string | null,"completed_at"?: string | null,"created_at"?: string,"dispatch_request_fingerprint"?: string | null,"dispatch_request_id"?: string | null,"driver_id": string,"id"?: string,"organization_id": string,"planned_start_at"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["trip_status"],"trip_number"?: never,"updated_at"?: string,"vehicle_id"?: string | null
                  }
                  Update: {
                    "assigned_by"?: string | null,"completed_at"?: string | null,"created_at"?: string,"dispatch_request_fingerprint"?: string | null,"dispatch_request_id"?: string | null,"driver_id"?: string,"id"?: string,"organization_id"?: string,"planned_start_at"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["trip_status"],"trip_number"?: never,"updated_at"?: string,"vehicle_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "trips_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trips_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trips_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trips_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "created_at": string,"granted_by": string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"granted_by"?: string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"granted_by"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"vehicles": {
                  Row: {
                    "active": boolean,"capacity_description": string | null,"created_at": string,"creation_request_fingerprint": string | null,"creation_request_id": string | null,"id": string,"make_model": string | null,"organization_id": string,"plate": string,"updated_at": string,"vehicle_type": string
                  }
                  Insert: {
                    "active"?: boolean,"capacity_description"?: string | null,"created_at"?: string,"creation_request_fingerprint"?: string | null,"creation_request_id"?: string | null,"id"?: string,"make_model"?: string | null,"organization_id": string,"plate": string,"updated_at"?: string,"vehicle_type"?: string
                  }
                  Update: {
                    "active"?: boolean,"capacity_description"?: string | null,"created_at"?: string,"creation_request_fingerprint"?: string | null,"creation_request_id"?: string | null,"id"?: string,"make_model"?: string | null,"organization_id"?: string,"plate"?: string,"updated_at"?: string,"vehicle_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicles_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_cargo_transfer":
{ Args: { "p_latitude"?: number,"p_longitude"?: number,"p_qr_token": string }; Returns: string
                           },
"accept_trip":
{ Args: { "p_trip_id": string }; Returns: Database["public"]['Enums']["trip_status"]
                           },
"add_order_stop_to_trip":
{ Args: { "p_order_stop_id": string,"p_trip_id": string }; Returns: string
                           },
"approve_cargo_transfer":
{ Args: { "p_transfer_id": string }; Returns: string
                           },
"can_access_client":
{ Args: { "_client_id": string }; Returns: boolean
                           },
"can_access_order":
{ Args: { "_order_id": string }; Returns: boolean
                           },
"can_access_stop":
{ Args: { "_stop_id": string }; Returns: boolean
                           },
"can_access_trip":
{ Args: { "_trip_id": string }; Returns: boolean
                           },
"close_support_thread":
{ Args: { "p_reason": string,"p_thread_id": string }; Returns: boolean
                           },
"confirm_cargo_handoff":
{ Args: { "p_latitude"?: number,"p_longitude"?: number,"p_transfer_id": string }; Returns: string
                           },
"create_client":
{ Args: { "p_contact_name"?: string,"p_email"?: string,"p_name": string,"p_phone"?: string,"p_request_id": string }; Returns: string
                           },
"create_order":
{ Args: { "p_client_id": string,"p_driver_payout"?: number,"p_external_reference"?: string,"p_freight_value"?: number,"p_instructions"?: string,"p_packages"?: Json }; Returns: string
                           },
"create_order_with_stops":
{ Args: { "p_client_id": string,"p_driver_payout"?: number,"p_external_reference"?: string,"p_freight_value"?: number,"p_instructions"?: string,"p_order_stops": Json,"p_packages": Json,"p_request_id": string }; Returns: string
                           },
"create_vehicle":
{ Args: { "p_capacity_description"?: string,"p_make_model"?: string,"p_plate": string,"p_request_id": string,"p_vehicle_type": string }; Returns: string
                           },
"current_driver_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_organization_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"dispatch_trip":
{ Args: { "p_driver_id": string,"p_planned_start_at": string,"p_stops": Json,"p_vehicle_id": string }; Returns: string
                           },
"dispatch_trip_from_order_stops":
{ Args: { "p_driver_id": string,"p_order_stop_ids": (string)[],"p_planned_start_at": string,"p_request_id": string,"p_vehicle_id": string }; Returns: string
                           },
"finalize_cargo_transfer":
{ Args: { "p_transfer_id": string }; Returns: undefined
                           },
"has_any_role":
{ Args: { "_roles": (Database["public"]['Enums']["app_role"])[] }; Returns: boolean
                           },
"has_org_role":
{ Args: { "_organization_id": string,"_roles": (Database["public"]['Enums']["app_role"])[] }; Returns: boolean
                           },
"is_organization_member":
{ Args: { "_organization_id": string }; Returns: boolean
                           },
"open_driver_support_thread":
{ Args: { "p_body": string,"p_subject": string,"p_trip_id": string }; Returns: string
                           },
"provision_invited_driver":
{ Args: { "p_actor_user_id": string,"p_organization_id": string,"p_user_id": string }; Returns: string
                           },
"provision_invited_staff":
{ Args: { "p_actor_user_id": string,"p_organization_id": string,"p_role": Database["public"]['Enums']["app_role"],"p_user_id": string }; Returns: undefined
                           },
"record_driver_position":
{ Args: { "p_accuracy_meters"?: number,"p_captured_at_device": string,"p_device_event_id": string,"p_latitude": number,"p_longitude": number,"p_trip_id": string }; Returns: string
                           },
"record_stop_event":
{ Args: { "p_device_captured_at"?: string,"p_device_event_id": string,"p_latitude"?: number,"p_location_accuracy_meters"?: number,"p_longitude"?: number,"p_reason"?: string,"p_stop_id": string,"p_to_status": Database["public"]['Enums']["stop_status"] }; Returns: Database["public"]['Enums']["stop_status"]
                           },
"refresh_order_status":
{ Args: { "p_order_id": string }; Returns: Database["public"]['Enums']["order_status"]
                           },
"register_delivery_proof":
{ Args: { "p_captured_at_device": string,"p_latitude": number,"p_location_accuracy_meters": number,"p_location_storage_path": string,"p_longitude": number,"p_package_id"?: string,"p_recipient_name": string,"p_stop_id": string,"p_storage_path": string }; Returns: string
                           } |
{ Args: { "p_captured_at_device": string,"p_latitude": number,"p_location_accuracy_meters": number,"p_location_captured_at_device": string,"p_location_storage_path": string,"p_longitude": number,"p_package_id"?: string,"p_recipient_name": string,"p_stop_id": string,"p_storage_path": string }; Returns: string
                           } |
{ Args: { "p_captured_at_device": string,"p_latitude": number,"p_location_accuracy_meters": number,"p_longitude": number,"p_package_id"?: string,"p_recipient_name": string,"p_stop_id": string,"p_storage_path": string }; Returns: string
                           },
"reject_cargo_transfer":
{ Args: { "p_note": string,"p_transfer_id": string }; Returns: undefined
                           },
"remove_pending_trip_stop":
{ Args: { "p_reason": string,"p_trip_id": string,"p_trip_stop_id": string }; Returns: string
                           },
"reorder_unstarted_trip_stops":
{ Args: { "p_ordered_stop_ids": (string)[],"p_reason": string,"p_trip_id": string }; Returns: undefined
                           },
"request_cargo_transfer":
{ Args: { "p_destination_trip_id": string,"p_details": string,"p_package_ids": (string)[],"p_reason": string,"p_source_trip_id": string }; Returns: string
                           },
"set_driver_status":
{ Args: { "p_driver_id": string,"p_new_status": Database["public"]['Enums']["driver_status"],"p_reason": string }; Returns: string
                           }
          }
          Enums: {
            "app_role": "admin"|"manager"|"dispatcher"|"support"|"driver"|"finance","driver_status": "draft"|"invited"|"pending_review"|"active"|"rejected"|"suspended"|"inactive","order_status": "draft"|"pending_dispatch"|"planned"|"in_progress"|"completed"|"exception"|"cancelled"|"partially_assigned","order_stop_status": "pending_dispatch"|"assigned"|"completed"|"exception"|"cancelled","package_status": "expected"|"picked_up"|"in_transit"|"delivered"|"returned"|"exception","stop_status": "pending"|"arrived"|"in_progress"|"completed"|"failed"|"skipped","stop_type": "pickup"|"delivery"|"return_to_base","trip_status": "draft"|"assigned"|"accepted"|"in_progress"|"completed"|"paused"|"cancelled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "app_role": ["admin", "manager", "dispatcher", "support", "driver", "finance"],"driver_status": ["draft", "invited", "pending_review", "active", "rejected", "suspended", "inactive"],"order_status": ["draft", "pending_dispatch", "planned", "in_progress", "completed", "exception", "cancelled", "partially_assigned"],"order_stop_status": ["pending_dispatch", "assigned", "completed", "exception", "cancelled"],"package_status": ["expected", "picked_up", "in_transit", "delivered", "returned", "exception"],"stop_status": ["pending", "arrived", "in_progress", "completed", "failed", "skipped"],"stop_type": ["pickup", "delivery", "return_to_base"],"trip_status": ["draft", "assigned", "accepted", "in_progress", "completed", "paused", "cancelled"]
          }
        }
} as const
