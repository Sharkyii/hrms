import type { attendanceMethodValues, confidenceValues, attendanceStatusValues } from "../db/schema";

type Method = (typeof attendanceMethodValues)[number];
type Confidence = (typeof confidenceValues)[number];
type Status = (typeof attendanceStatusValues)[number];

export interface ScoreInput {
  method: Method;
  onOfficeNetwork?: boolean;
  withinGeofence?: boolean;
  hasLocation?: boolean;
  missingCounterpartPunch?: boolean; // e.g. punching out with no punch-in on record
}

export interface ScoreResult {
  confidence: Confidence;
  status: Status;
  flagReason: string | null;
}

// Maps directly to the doc's confidence table (section 4): High -> auto-approved,
// Medium -> auto-approved but shown in report, Low -> held for manager approval.
export function scoreAttendance(input: ScoreInput): ScoreResult {
  if (input.missingCounterpartPunch) {
    return { confidence: "low", status: "pending_manager", flagReason: "Missing punch-in/out pair" };
  }

  switch (input.method) {
    case "biometric":
    case "face_device":
    case "rfid_kiosk":
      return { confidence: "high", status: "auto_approved", flagReason: null };

    case "web_punch":
      if (input.onOfficeNetwork) {
        return { confidence: "high", status: "auto_approved", flagReason: null };
      }
      return { confidence: "low", status: "pending_manager", flagReason: "Web punch outside recognized office network" };

    case "mobile_app":
      if (!input.hasLocation) {
        return { confidence: "low", status: "pending_manager", flagReason: "Missing GPS location" };
      }
      if (input.withinGeofence) {
        return { confidence: "medium", status: "auto_approved", flagReason: null };
      }
      return { confidence: "low", status: "pending_manager", flagReason: "Outside geo-fence" };

    case "supervisor_roster":
    case "vendor_bulk_entry":
    case "gate_register":
    case "manager_confirmation":
      return { confidence: "medium", status: "auto_approved", flagReason: null };

    default:
      return { confidence: "low", status: "pending_manager", flagReason: "Unrecognized capture method" };
  }
}

// Haversine distance in meters — used to test a punch's lat/lng against an employee-type geofence radius.
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
