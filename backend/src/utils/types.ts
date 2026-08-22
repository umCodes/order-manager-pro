export type ZohoInvoice = {
  invoice_id: string | number;
  ach_payment_initiated: boolean;
  invoice_number: string;
  is_pre_gst: boolean;
  place_of_supply: string;
  gst_no: string;
  gst_treatment: string;
  tax_treatment: string;
  cfdi_usage: string;
  vat_treatment: string;
  vat_reg_no: string;
  date: string;
  status: string;
  payment_terms: number;
  payment_terms_label: string;
  due_date: string;
  payment_expected_date: string;
  last_payment_date: string;
  reference_number: string;
  customer_id: string | number;
  customer_name: string;
  contact_persons: string[];
  currency_id: string | number;
  currency_code: string;
  exchange_rate: number;
  discount: number;
  is_discount_before_tax: boolean;
  discount_type: string;
  is_inclusive_tax: boolean;
  recurring_invoice_id: string;
  is_viewed_by_client: boolean;
  has_attachment: boolean;
  client_viewed_time: string;
  line_items: LineItem[];
  shipping_charge: number;
  adjustment: number;
  adjustment_description: string;
  sub_total: number;
  tax_total: number;
  total: number;
  taxes: Tax[];
  payment_reminder_enabled: boolean;
  payment_made: number;
  credits_applied: number;
  tax_amount_withheld: number;
  balance: number;
  write_off_amount: number;
  allow_partial_payments: boolean;
  price_precision: number;
  payment_options: PaymentOptions;
  is_emailed: boolean;
  reminders_sent: number;
  last_reminder_sent_date: string;
  billing_address: Address;
  shipping_address: Address;
  notes: string;
  terms: string;
  custom_fields: CustomField[];
  template_id: string | number;
  template_name: string;
  created_time: string;
  last_modified_time: string;
  attachment_name: string;
  can_send_in_mail: boolean;
  salesperson_id: string;
  salesperson_name: string;
  invoice_url: string;
};

export type LineItem = {
  line_item_id: string | number;
  item_id: string | number;
  project_id: string | number;
  project_name: string;
  item_type: string;
  product_type: string;
  time_entry_ids: string[];
  expense_id: string;
  expense_receipt_name: string;
  name: string;
  description: string;
  item_order: number;
  bcy_rate: number;
  rate: number;
  quantity: number;
  unit: string;
  discount_amount: number;
  discount: number;
  tax_id: string | number;
  tds_tax_id: string;
  tax_name: string;
  tax_type: string;
  tax_percentage: number;
  item_total: number;
  sat_item_key_code: string | number;
  unitkey_code: string;
};

export type Tax = {
  tax_name: string;
  tax_amount: number;
};

export type PaymentOptions = {
  payment_gateways: PaymentGateway[];
};

export type PaymentGateway = {
  configured: boolean;
  additional_field1: string;
  gateway_name: string;
};

export type Address = {
  address: string;
  city: string;
  state: string;
  zip: string | number;
  country: string;
  fax: string;
};

export type CustomField = {
  customfield_id: string | number;
  data_type: string;
  index: number;
  label: string;
  show_on_pdf: boolean;
  show_in_all_pdf: boolean;
  value: any;
};

export type Item = {
  item_id: string;
  name: string;
  item_name: string;
  unit: string;
  description: string;
  rate: number;
};
export type ItemWithQuantity = Item & {
  quantity: number;
};

export type PaymentInvoiceRef = {
  invoice_id: string | number;
  invoice_number: string;
  amount_applied: number;
};

export type CustomerPayment = {
  payment_id: string | number;
  amount: number;
  date: string;
  reference_number: string;
  invoices: PaymentInvoiceRef[];
};

export type OutstandingInvoice = {
  invoice_id: string | number;
  invoice_number: string;
  date: string;
  status: string;
  balance: number;
};

export type CustomerSummary = {
  customer_id: string | number;
  name: string;
  company_name: string;
  contact_name: string;
  customer_number: string;
  phone: string;
  outstanding_balance: number;
  outstanding_invoices: OutstandingInvoice[];
  payments: CustomerPayment[];
};


