import { WorkCenterDoc, WorkOrderDoc } from "../src/reflow/types";

const WC1: WorkCenterDoc = {
  docId: "wc-extrusion-1",
  docType: "workCenter",
  data: {
    name: "Extrusion Line 1",
    shifts: [
      { dayOfWeek: 1, startHour: 8, endHour: 17 }, // Mon
      { dayOfWeek: 2, startHour: 8, endHour: 17 }, // Tue
      { dayOfWeek: 3, startHour: 8, endHour: 17 }, // Wed
      { dayOfWeek: 4, startHour: 8, endHour: 17 }, // Thu
      { dayOfWeek: 5, startHour: 8, endHour: 17 }, // Fri
    ],
    maintenanceWindows: [
      // Scenario 3 uses this
      { startDate: "2024-08-14T11:00:00Z", endDate: "2024-08-14T14:00:00Z", reason: "Line calibration" },
    ],
  },
};

const WC2: WorkCenterDoc = {
  docId: "wc-extrusion-2",
  docType: "workCenter",
  data: {
    name: "Extrusion Line 2",
    shifts: [
      { dayOfWeek: 1, startHour: 8, endHour: 17 },
      { dayOfWeek: 2, startHour: 8, endHour: 17 },
      { dayOfWeek: 3, startHour: 8, endHour: 17 },
      { dayOfWeek: 4, startHour: 8, endHour: 17 },
      { dayOfWeek: 5, startHour: 8, endHour: 17 },
    ],
    maintenanceWindows: [],
  },
};

export const workCenters: WorkCenterDoc[] = [WC1, WC2];

/**
 * Scenario 1: Delay cascade A -> B -> C on same WC.
 * We'll simulate a delay by giving A a later start than expected.
 */
export const scenario1_delayCascade: WorkOrderDoc[] = [
  {
    docId: "wo-A",
    docType: "workOrder",
    data: {
      workOrderNumber: "A",
      manufacturingOrderId: "mo-1",
      workCenterId: "wc-extrusion-1",
      startDate: "2024-08-12T08:00:00Z",
      endDate: "2024-08-12T10:00:00Z",
      durationMinutes: 120,
      isMaintenance: false,
      dependsOnWorkOrderIds: [],
    },
  },
  {
    docId: "wo-B",
    docType: "workOrder",
    data: {
      workOrderNumber: "B",
      manufacturingOrderId: "mo-1",
      workCenterId: "wc-extrusion-1",
      startDate: "2024-08-12T10:00:00Z",
      endDate: "2024-08-12T12:00:00Z",
      durationMinutes: 120,
      isMaintenance: false,
      dependsOnWorkOrderIds: ["wo-A"],
    },
  },
  {
    docId: "wo-C",
    docType: "workOrder",
    data: {
      workOrderNumber: "C",
      manufacturingOrderId: "mo-1",
      workCenterId: "wc-extrusion-1",
      startDate: "2024-08-12T12:00:00Z",
      endDate: "2024-08-12T15:00:00Z",
      durationMinutes: 180,
      isMaintenance: false,
      dependsOnWorkOrderIds: ["wo-B"],
    },
  },
];

/**
 * Scenario 2: Shift spanning
 * WO starts at 16:00, duration 120 => 60 mins on day1, then resumes next day 8:00-9:00
 */
export const scenario2_shiftSpan: WorkOrderDoc[] = [
  {
    docId: "wo-shift",
    docType: "workOrder",
    data: {
      workOrderNumber: "SHIFT-SPAN",
      manufacturingOrderId: "mo-2",
      workCenterId: "wc-extrusion-2",
      startDate: "2024-08-13T16:00:00Z",
      endDate: "2024-08-13T18:00:00Z", // original (invalid in reality), reflow will correct it
      durationMinutes: 120,
      isMaintenance: false,
      dependsOnWorkOrderIds: [],
    },
  },
];

/**
 * Scenario 3: Maintenance conflict + multi-parent deps + immovable maintenance WO
 * - maintenance window on WC1: Aug 14 11:00-14:00
 * - fixed maintenance WO blocks 09:30-10:30
 * - job needs 240 mins starting 10:00 => works 10:00-11:00 (60), pauses 11-14, resumes 14:00 for remaining 180 => ends 17:00
 * - child depends on two parents
 */
export const scenario3_maintenanceAndMultiparent: WorkOrderDoc[] = [
  // immovable maintenance work order
  {
    docId: "wo-maint-fixed",
    docType: "workOrder",
    data: {
      workOrderNumber: "MAINT-FIXED",
      manufacturingOrderId: "mo-3",
      workCenterId: "wc-extrusion-1",
      startDate: "2024-08-14T09:30:00Z",
      endDate: "2024-08-14T10:30:00Z",
      durationMinutes: 60,
      isMaintenance: true, // cannot move
      dependsOnWorkOrderIds: [],
    },
  },
  // parent 1
  {
    docId: "wo-P1",
    docType: "workOrder",
    data: {
      workOrderNumber: "P1",
      manufacturingOrderId: "mo-3",
      workCenterId: "wc-extrusion-1",
      startDate: "2024-08-14T08:00:00Z",
      endDate: "2024-08-14T09:00:00Z",
      durationMinutes: 60,
      isMaintenance: false,
      dependsOnWorkOrderIds: [],
    },
  },
  // parent 2 (same wc; will avoid MAINT-FIXED)
  {
    docId: "wo-P2",
    docType: "workOrder",
    data: {
      workOrderNumber: "P2",
      manufacturingOrderId: "mo-3",
      workCenterId: "wc-extrusion-1",
      startDate: "2024-08-14T09:00:00Z",
      endDate: "2024-08-14T10:00:00Z",
      durationMinutes: 60,
      isMaintenance: false,
      dependsOnWorkOrderIds: [],
    },
  },
  // long job (will cross maintenance window)
  {
    docId: "wo-LONG",
    docType: "workOrder",
    data: {
      workOrderNumber: "LONG",
      manufacturingOrderId: "mo-3",
      workCenterId: "wc-extrusion-1",
      startDate: "2024-08-14T10:00:00Z",
      endDate: "2024-08-14T14:00:00Z",
      durationMinutes: 240,
      isMaintenance: false,
      dependsOnWorkOrderIds: ["wo-P1"], // depends on P1
    },
  },
  // child depends on BOTH P2 and LONG
  {
    docId: "wo-CHILD",
    docType: "workOrder",
    data: {
      workOrderNumber: "CHILD",
      manufacturingOrderId: "mo-3",
      workCenterId: "wc-extrusion-1",
      startDate: "2024-08-14T15:00:00Z",
      endDate: "2024-08-14T16:00:00Z",
      durationMinutes: 60,
      isMaintenance: false,
      dependsOnWorkOrderIds: ["wo-P2", "wo-LONG"],
    },
  },
];

/**
 * Scenario 4: Work Center Conflict Resolution
 *
 * Multiple work orders are initially scheduled to overlap on the same work center.
 * The scheduler must enforce the "single work order per work center" constraint.
 *
 * Expected behavior:
 * - Only one job can run at a time on the work center
 * - Subsequent jobs will be shifted forward to the earliest available slot
 * - Shift boundaries must still be respected
 *
 * This scenario demonstrates the scheduler's ability to resolve resource conflicts
 * without dependency relationships between work orders.
 */
export const scenario4_workCenterConflict: WorkOrderDoc[] = [
  {
    docId: "wo-X1",
    docType: "workOrder",
    data: {
      workOrderNumber: "X1",
      manufacturingOrderId: "mo-4",
      workCenterId: "wc-extrusion-2",
      startDate: "2024-08-15T08:00:00Z",
      endDate: "2024-08-15T10:00:00Z",
      durationMinutes: 120,
      isMaintenance: false,
      dependsOnWorkOrderIds: [],
    },
  },
  {
    docId: "wo-X2",
    docType: "workOrder",
    data: {
      workOrderNumber: "X2",
      manufacturingOrderId: "mo-4",
      workCenterId: "wc-extrusion-2",
      startDate: "2024-08-15T09:00:00Z",
      endDate: "2024-08-15T11:00:00Z",
      durationMinutes: 120,
      isMaintenance: false,
      dependsOnWorkOrderIds: [],
    },
  },
  {
    docId: "wo-X3",
    docType: "workOrder",
    data: {
      workOrderNumber: "X3",
      manufacturingOrderId: "mo-4",
      workCenterId: "wc-extrusion-2",
      startDate: "2024-08-15T09:30:00Z",
      endDate: "2024-08-15T10:30:00Z",
      durationMinutes: 60,
      isMaintenance: false,
      dependsOnWorkOrderIds: [],
    },
  },
];