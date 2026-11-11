// The business date is the calendar date on this computer's clock (India: IST),
// not the UTC date, so entries made between midnight and 05:30 IST carry today's
// date and never fall into the previous day or financial year.
export function localBusinessDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
