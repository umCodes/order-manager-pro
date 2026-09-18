export type ContactPerson = {
  contact_person_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  mobile: string;
  is_primary_contact: boolean;
};

export type ContactCustomField = {
  customfield_id?: string;
  field_id?: string;
  label?: string;
  value: string;
};

export type Contact = {
  contact_id: string;
  contact_name: string;
  company_name: string;
  outstanding_receivable_amount: number;
  contact_persons: ContactPerson[];
  phone: string;
  mobile: string;
  status: string;
  customer_sub_type?: string;
  custom_fields?: ContactCustomField[];
};
