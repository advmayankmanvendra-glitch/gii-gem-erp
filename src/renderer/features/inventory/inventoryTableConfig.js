export function inventoryTableConfig(view, data = {}) {
  const money = "money";
  const configs = {
    inventory_dashboard: {
      title: "Inventory Dashboard",
      rows: data.dashboard || [],
      columns: [
        { key: "metric", label: "Metric" },
        { key: "value", label: "Value" },
        { key: "note", label: "Basis" }
      ]
    },
    stock_summary: {
      title: "Stock Summary",
      rows: data.stockSummary || [],
      columns: [
        { key: "item_name", label: "Item" },
        { key: "warehouse_name", label: "Warehouse" },
        { key: "closing_quantity", label: "Closing Qty" },
        { key: "weighted_rate", label: "Weighted Rate", type: money },
        { key: "stock_value", label: "Stock Value", type: money },
        { key: "reorder_level", label: "Reorder" },
        { key: "minimum_stock_level", label: "Min" },
        { key: "maximum_stock_level", label: "Max" }
      ]
    },
    stock_ledger: {
      title: "Stock Ledger",
      rows: data.stockLedger || [],
      columns: [
        { key: "transaction_date", label: "Date" },
        { key: "item_name", label: "Item" },
        { key: "warehouse_name", label: "Warehouse" },
        { key: "transaction_type", label: "Type" },
        { key: "document_number", label: "Document" },
        { key: "inward_quantity", label: "Inward" },
        { key: "outward_quantity", label: "Outward" },
        { key: "balance_quantity", label: "Balance" },
        { key: "rate", label: "Rate", type: money },
        { key: "value", label: "Value", type: money },
        { key: "order_number", label: "Order" },
        { key: "voucher_drill", label: "Vchr", type: "drill_voucher" },
        { key: "source_drill", label: "Src", type: "drill_source" }
      ]
    },
    stock_movement: {
      title: "Stock Movement Report",
      rows: data.stockMovement || [],
      columns: [
        { key: "item_name", label: "Item" },
        { key: "warehouse_name", label: "Warehouse" },
        { key: "transaction_type", label: "Type" },
        { key: "documents", label: "Documents" },
        { key: "inward_quantity", label: "Inward" },
        { key: "outward_quantity", label: "Outward" },
        { key: "movement_value", label: "Movement Value", type: money }
      ]
    },
    stock_reservations: {
      title: "Stock Reservations",
      rows: data.reservations || [],
      columns: [
        { key: "order_number", label: "Order" },
        { key: "item_name", label: "Item" },
        { key: "warehouse_name", label: "Warehouse" },
        { key: "reserved_quantity", label: "Reserved" },
        { key: "issued_quantity", label: "Issued" },
        { key: "balance_reserved", label: "Balance" },
        { key: "status", label: "Status" },
        { key: "updated_at", label: "Updated" },
        { key: "actions", label: "Order", type: "nav_action", actionView: "supply_orders", actionSection: "entry", actionLabel: "Order" }
      ]
    },
    procurement_requirements: {
      title: "Procurement Requirement Report",
      rows: data.procurementRequirements || [],
      columns: [
        { key: "order_number", label: "Order" },
        { key: "item_name", label: "Item" },
        { key: "warehouse_name", label: "Warehouse" },
        { key: "available_quantity", label: "Available" },
        { key: "reserved_quantity", label: "Reserved" },
        { key: "short_quantity", label: "Short" },
        { key: "procurement_required_quantity", label: "Procurement Required" },
        { key: "status", label: "Status" },
        { key: "actions", label: "Order", type: "nav_action", actionView: "supply_orders", actionSection: "entry", actionLabel: "Order" }
      ]
    },
    grn_report: {
      title: "Goods Receipt Notes",
      rows: data.goodsReceipts || [],
      columns: [
        { key: "grn_number", label: "GRN" },
        { key: "grn_date", label: "Date" },
        { key: "supplier_name", label: "Supplier" },
        { key: "warehouse_name", label: "Warehouse" },
        { key: "accepted_quantity", label: "Accepted Qty" },
        { key: "receipt_value", label: "Value", type: money },
        { key: "status", label: "Status" },
        { key: "actions", label: "Order", type: "nav_action", actionView: "supply_orders", actionSection: "entry", actionLabel: "Order" }
      ]
    },
    delivery_challans: {
      title: "Delivery Challan Report",
      rows: data.deliveryChallans || [],
      columns: [
        { key: "challan_number", label: "Challan" },
        { key: "dispatch_date", label: "Dispatch" },
        { key: "order_number", label: "Order" },
        { key: "department_name", label: "Department" },
        { key: "issued_quantity", label: "Quantity" },
        { key: "vehicle_details", label: "Vehicle" },
        { key: "status", label: "Status" },
        { key: "actions", label: "Order", type: "nav_action", actionView: "supply_orders", actionSection: "entry", actionLabel: "Order" }
      ]
    },
    warehouse_transfers: {
      title: "Warehouse Transfer Report",
      rows: data.warehouseTransfers || [],
      columns: [
        { key: "transfer_number", label: "Transfer" },
        { key: "transfer_date", label: "Date" },
        { key: "item_name", label: "Item" },
        { key: "from_warehouse", label: "From" },
        { key: "to_warehouse", label: "To" },
        { key: "quantity", label: "Qty" },
        { key: "transfer_value", label: "Value", type: money },
        { key: "status", label: "Status" }
      ]
    },
    cogs_report: {
      title: "COGS Report",
      rows: data.cogsReport || [],
      columns: [
        { key: "entry_date", label: "Date" },
        { key: "voucher_number", label: "Voucher" },
        { key: "source_module", label: "Source" },
        { key: "cogs_value", label: "COGS", type: money },
        { key: "narration", label: "Narration" },
        { key: "voucher_drill", label: "Vchr", type: "drill_voucher" }
      ]
    },
    reservation_ageing: {
      title: "Reservation Ageing Report",
      rows: data.reservationAgeing || [],
      columns: [
        { key: "order_number", label: "Order" },
        { key: "item_name", label: "Item" },
        { key: "warehouse_name", label: "Warehouse" },
        { key: "balance_reserved", label: "Balance Reserved" },
        { key: "short_quantity", label: "Short" },
        { key: "days_reserved", label: "Days" },
        { key: "status", label: "Status" },
        { key: "actions", label: "Order", type: "nav_action", actionView: "supply_orders", actionSection: "entry", actionLabel: "Order" }
      ]
    },
    inventory_movements: {
      title: "Inventory Register",
      rows: data.movements || [],
      columns: [
        { key: "movement_date", label: "Date" },
        { key: "movement_type", label: "Movement" },
        { key: "item_name", label: "Item" },
        { key: "from_warehouse", label: "From" },
        { key: "to_warehouse", label: "To" },
        { key: "quantity", label: "Quantity" },
        { key: "value", label: "Value", type: money },
        { key: "source_module", label: "Source" },
        { key: "voucher_number", label: "Voucher" },
        { key: "voucher_drill", label: "Vchr", type: "drill_voucher" }
      ]
    },
    low_stock: {
      title: "Low Stock",
      rows: data.lowStock || [],
      columns: [
        { key: "item_name", label: "Item" },
        { key: "warehouse_name", label: "Warehouse" },
        { key: "stock_status", label: "Stock Scope" },
        { key: "closing_quantity", label: "Closing Qty" },
        { key: "reorder_level", label: "Reorder Level" },
        { key: "minimum_stock_level", label: "Minimum" }
      ]
    },
    serial_register: {
      title: "Serial Register",
      rows: data.serialNumbers || [],
      columns: [
        { key: "item_name", label: "Item" },
        { key: "serial_number", label: "Serial" },
        { key: "status", label: "Status" },
        { key: "warehouse_name", label: "Warehouse" },
        { key: "order_number", label: "Order" },
        { key: "department_name", label: "Department" },
        { key: "warranty_expiry", label: "Warranty Expiry" }
      ]
    },
    batch_register: {
      title: "Batch Register",
      rows: data.batches || [],
      columns: [
        { key: "item_name", label: "Item" },
        { key: "batch_number", label: "Batch" },
        { key: "supplier_name", label: "Supplier" },
        { key: "warehouse_name", label: "Warehouse" },
        { key: "quantity", label: "Quantity" },
        { key: "balance_quantity", label: "Balance" },
        { key: "purchase_date", label: "Purchase Date" }
      ]
    },
    stock_valuation: {
      title: "Stock Valuation",
      rows: data.valuation || [],
      columns: [
        { key: "item_name", label: "Item" },
        { key: "warehouse_name", label: "Warehouse" },
        { key: "closing_quantity", label: "Qty" },
        { key: "weighted_rate", label: "Weighted Average", type: money },
        { key: "stock_value", label: "Stock Value", type: money },
        { key: "valuation_method", label: "Method" }
      ]
    },
    inventory_profitability: {
      title: "Item-wise Profitability",
      rows: data.itemProfitability || [],
      columns: [
        { key: "item_name", label: "Item" },
        { key: "order_number", label: "Order" },
        { key: "billing_value", label: "Billing Value", type: money },
        { key: "issued_stock_cost", label: "Issued Stock Cost", type: money },
        { key: "gross_margin", label: "Gross Margin", type: money }
      ]
    }
  };
  return configs[view] || configs.stock_summary;
}
