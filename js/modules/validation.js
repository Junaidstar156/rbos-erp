const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const MOBILE_REGEX = /^\d{10}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_IN_TEXT_REGEX = /\b\d{6}\b/;
const INVOICE_PREFIX_REGEX = /^[A-Z0-9-]{2,8}$/;

export function isValidGstin(value) {
    return !value || GSTIN_REGEX.test(value);
}

export function isValidPan(value) {
    return !value || PAN_REGEX.test(value);
}

export function isValidMobile(value) {
    return MOBILE_REGEX.test(value);
}

export function isValidEmail(value) {
    return EMAIL_REGEX.test(value);
}

export function containsPinCode(value) {
    return PIN_IN_TEXT_REGEX.test(value);
}

export function isValidInvoicePrefix(value) {
    return INVOICE_PREFIX_REGEX.test(value);
}
