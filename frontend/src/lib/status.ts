/** Formats a Zoho invoice status ("partially_paid") for display ("Partially Paid"). */
export function formatStatus(status: string): string {
  return status
    .split("_")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}
