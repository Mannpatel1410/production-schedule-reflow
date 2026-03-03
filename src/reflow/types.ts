export type DocType = "workOrder" | "workCenter" | "manufacturingOrder";

export interface BaseDoc<TData> {
  docId: string;
  docType: DocType;
  data: TData;
}

export type ISODateString = string;

export interface WorkOrderData {
  workOrderNumber: string;
  manufacturingOrderId: string;
  workCenterId: string;

  startDate: ISODateString;
  endDate: ISODateString;
  durationMinutes: number;

  isMaintenance: boolean;
  dependsOnWorkOrderIds: string[];
}

export interface WorkOrderDoc extends BaseDoc<WorkOrderData> {
  docType: "workOrder";
}

export interface Shift {
  dayOfWeek: number; // 0-6 Sunday=0
  startHour: number; // 0-23
  endHour: number;   // 0-23 (end is exclusive-ish; we treat as boundary)
}

export interface MaintenanceWindow {
  startDate: ISODateString;
  endDate: ISODateString;
  reason?: string;
}

export interface WorkCenterData {
  name: string;
  shifts: Shift[];
  maintenanceWindows: MaintenanceWindow[];
}

export interface WorkCenterDoc extends BaseDoc<WorkCenterData> {
  docType: "workCenter";
}

export interface ManufacturingOrderData {
  manufacturingOrderNumber: string;
  itemId: string;
  quantity: number;
  dueDate: ISODateString;
}

export interface ManufacturingOrderDoc extends BaseDoc<ManufacturingOrderData> {
  docType: "manufacturingOrder";
}

export interface ReflowInput {
  workOrders: WorkOrderDoc[];
  workCenters: WorkCenterDoc[];
  manufacturingOrders?: ManufacturingOrderDoc[];
}

export type ChangeReason =
  | "dependency"
  | "workCenterConflict"
  | "shiftBoundary"
  | "maintenanceWindow";

export interface WorkOrderChange {
  workOrderId: string;
  workOrderNumber: string;
  oldStartDate: ISODateString;
  oldEndDate: ISODateString;
  newStartDate: ISODateString;
  newEndDate: ISODateString;
  deltaMinutes: number; // newEnd - oldEnd (elapsed minutes)
  reasons: ChangeReason[];
  why: string;
}

export interface ReflowResult {
  updatedWorkOrders: WorkOrderDoc[];
  changes: WorkOrderChange[];
  explanation: string;
}