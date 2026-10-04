/**
 * Customer route handlers: reads, customer-record writes, the contact-person
 * sub-resource, customer-level payments, and visits. Request-body validation for all
 * of them lives in ./payloads.
 */
export * from "./read.controller.js";
export * from "./write.controller.js";
export * from "./status.controller.js";
export * from "./contacts.controller.js";
export * from "./payments.controller.js";
export * from "./visits.controller.js";
