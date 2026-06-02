export const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: n >= 100 ? 0 : 2,
  }).format(n);

export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100 ? 0 : 2,
  }).format(n);

export const num = (n: number) => new Intl.NumberFormat("en-GB").format(Math.round(n));

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

export const roasX = (n: number) => `${n.toFixed(2)}×`;

// "30 May" style short date
export const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
