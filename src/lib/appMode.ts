// One codebase, two Firebase Hosting sites (same project, same logins and data):
//   stock -> lotikipi-1-stock-production.web.app  (npm run build)
//   sales -> lotikipi-sales.web.app               (npm run build:sales, uses .env.sales)
export const APP_MODE: "stock" | "sales" = import.meta.env.VITE_APP_MODE === "sales" ? "sales" : "stock";
export const IS_SALES_APP = APP_MODE === "sales";
export const APP_NAME = IS_SALES_APP ? "Lotikipi Sales" : "Lotikipi Water";
